from fastapi import APIRouter, Cookie, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel
from auth import require_admin
from database import get_db
from models import Attendance, User
from face_service import get_embedding_from_array, b64_to_array, is_live_face
from typing import Optional
from datetime import datetime
import ws_manager
import numpy as np
import os

router = APIRouter(prefix="/api/attendance", tags=["attendance"])

CONFIDENCE_THRESHOLD = float(os.getenv("CONFIDENCE_THRESHOLD", "0.50"))
MATCH_THRESHOLD = float(os.getenv("MATCH_THRESHOLD", "0.70"))


class DetectRequest(BaseModel):
    image: str          # base64 data URL
    event_id: Optional[int] = None


def cosine_distance(a, b):
    """Compute cosine distance between two vectors (0 = identical, 2 = opposite)."""
    a = np.array(a, dtype=np.float64)
    b = np.array(b, dtype=np.float64)
    dot = np.dot(a, b)
    norm = np.linalg.norm(a) * np.linalg.norm(b)
    if norm == 0:
        return 2.0
    return 1.0 - dot / norm


@router.post("/detect")
def detect_face(request: DetectRequest, db: Session = Depends(get_db)):
    # Validate event if provided
    event_name = None
    if request.event_id is not None:
        event = db.execute(
            text("SELECT id, name FROM events WHERE id = :eid"),
            {"eid": request.event_id},
        ).fetchone()
        if not event:
            return {"status": "invalid_event"}
        event_name = event.name

    # Decode base64 directly to numpy array — no disk write
    img_array = b64_to_array(request.image)
    if img_array is None:
        return {"status": "no_face"}

    try:
        if not is_live_face(img_array):
            return {"status": "spoof_detected"}

        # Image is already a cropped face from the frontend, so skip detector
        embedding = get_embedding_from_array(img_array)
        if embedding is None:
            print("[detect] DeepFace could not extract embedding")
            return {"status": "no_face"}

        # Fetch all users and find the best match using cosine distance in Python
        users = db.execute(
            text("SELECT id, name, email, phone, linkedin, occupation, image_url, embedding, role FROM users WHERE embedding IS NOT NULL")
        ).fetchall()

        if not users:
            return {"status": "no_users_registered"}

        best_match = None
        best_distance = float("inf")

        for user in users:
            try:
                user_embedding = np.frombuffer(user.embedding, dtype=np.float32)
                dist = cosine_distance(embedding, user_embedding)
                if dist < best_distance:
                    best_distance = dist
                    best_match = user
            except (TypeError, ValueError):
                continue

        if best_match is None:
            return {"status": "no_users_registered"}

        row = best_match
        distance = best_distance

        print(f"[detect] best match: '{row.name}' distance={distance:.4f} confidence={CONFIDENCE_THRESHOLD} match={MATCH_THRESHOLD}")

        if distance > MATCH_THRESHOLD:
            return {"status": "not_registered", "distance": round(distance, 4)}

        if distance > CONFIDENCE_THRESHOLD:
            return {"status": "low_confidence", "distance": round(distance, 4)}

        # Event-specific enrollment check
        already_attended = False
        if request.event_id is not None:
            record = db.execute(
                text("SELECT id, status FROM attendance WHERE user_id = :uid AND event_id = :eid"),
                {"uid": row.id, "eid": request.event_id},
            ).fetchone()

            if record is None:
                # Face recognised but not enrolled for this event
                ws_manager.broadcast({
                    "type": "not_enrolled",
                    "user": {"name": row.name, "image_url": row.image_url},
                    "event_name": event_name,
                    "timestamp": datetime.utcnow().isoformat(),
                })
                return {
                    "status": "not_registered_for_event",
                    "user": {"name": row.name},
                    "distance": round(distance, 4),
                }

            if record.status == "present":
                already_attended = True
            else:
                # status = "enrolled" → first face scan, mark as present
                db.execute(
                    text("UPDATE attendance SET status='present', timestamp=:ts WHERE id=:aid"),
                    {"aid": record.id, "ts": datetime.utcnow()},
                )
                db.commit()
        else:
            # No event selected — fall back to per-day duplicate check
            existing = db.execute(
                text("SELECT id FROM attendance WHERE user_id = :uid AND event_id IS NULL AND DATE(timestamp) = CURRENT_DATE"),
                {"uid": row.id},
            ).fetchone()

            if existing:
                already_attended = True
            else:
                try:
                    db.add(Attendance(user_id=row.id, event_id=None, status="present"))
                    db.commit()
                except IntegrityError:
                    db.rollback()
                    already_attended = True

        ws_manager.broadcast({
            "type": "match",
            "user": {
                "name": row.name,
                "email": row.email,
                "phone": row.phone,
                "linkedin": row.linkedin,
                "occupation": row.occupation,
                "image_url": row.image_url,
                "already_attended": already_attended,
                "role": row.role,
            },
            "event_name": event_name,
            "timestamp": datetime.utcnow().isoformat(),
        })

        return {
            "status": "matched",
            "user": {
                "id": row.id,
                "name": row.name,
                "image_url": row.image_url,
                "already_attended": already_attended,
            },
            "distance": round(distance, 4),
        }
    except Exception as e:
        print(f"[detect] unexpected error: {e}")
        return {"status": "error"}


@router.get("/present")
def present_attendees(
    event_id: Optional[int] = None,
    access_token: Optional[str] = Cookie(default=None),
    db: Session = Depends(get_db),
):
    """Full profiles of everyone who has checked in (status=present) for an event."""
    # Determine caller role to decide whether to hide admin accounts
    caller_role = None
    if access_token:
        try:
            from auth import decode_token
            payload = decode_token(access_token)
            caller_role = payload.get("role")
        except Exception:
            pass

    query = """
        SELECT u.id, u.name, u.email, u.phone, u.linkedin, u.occupation,
               u.image_url, a.timestamp, e.name AS event_name
        FROM attendance a
        JOIN users u ON u.id = a.user_id
        LEFT JOIN events e ON e.id = a.event_id
        WHERE a.status = 'present'
    """
    params = {}
    if event_id is not None:
        query += " AND a.event_id = :eid"
        params["eid"] = event_id
    if caller_role != "admin":
        query += " AND (u.role IS NULL OR u.role != 'admin')"
    query += " ORDER BY a.timestamp DESC"

    rows = db.execute(text(query), params).fetchall()
    return [
        {
            "id": r.id,
            "name": r.name,
            "email": r.email,
            "phone": r.phone,
            "linkedin": r.linkedin,
            "occupation": r.occupation,
            "image_url": r.image_url,
            "checked_in_at": r.timestamp,
            "event_name": r.event_name,
        }
        for r in rows
    ]


@router.get("/logs", dependencies=[Depends(require_admin)])
def attendance_logs(event_id: Optional[int] = None, db: Session = Depends(get_db)):
    if event_id is not None:
        rows = db.execute(
            text("""
                SELECT a.id, u.name, u.image_url, a.status, a.timestamp, a.event_id, e.name AS event_name
                FROM attendance a
                JOIN users u ON u.id = a.user_id
                LEFT JOIN events e ON e.id = a.event_id
                WHERE a.event_id = :eid
                ORDER BY a.timestamp DESC
                LIMIT 200
            """),
            {"eid": event_id},
        ).fetchall()
    else:
        rows = db.execute(
            text("""
                SELECT a.id, u.name, u.image_url, a.status, a.timestamp, a.event_id, e.name AS event_name
                FROM attendance a
                JOIN users u ON u.id = a.user_id
                LEFT JOIN events e ON e.id = a.event_id
                ORDER BY a.timestamp DESC
                LIMIT 200
            """)
        ).fetchall()

    return [
        {
            "id": r.id,
            "name": r.name,
            "image_url": r.image_url,
            "status": r.status,
            "timestamp": r.timestamp,
            "event_id": r.event_id,
            "event_name": r.event_name,
        }
        for r in rows
    ]
