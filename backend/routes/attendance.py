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

        scored = []
        for user in users:
            try:
                user_embedding = np.frombuffer(user.embedding, dtype=np.float32)
                dist = cosine_distance(embedding, user_embedding)
                scored.append((dist, user))
            except (TypeError, ValueError):
                continue

        if not scored:
            return {"status": "no_users_registered"}

        scored.sort(key=lambda x: x[0])
        distance, row = scored[0]

        # Margin check: only required for borderline matches (distance > CONFIDENCE_THRESHOLD).
        # When we're already confident (low distance), skip the margin check — a tight cluster
        # of distances is normal as the user base grows.
        MARGIN_THRESHOLD = 0.09
        if len(scored) > 1:
            second_distance = scored[1][0]
            margin = second_distance - distance
            print(f"[detect] best='{row.name}' d={distance:.4f} 2nd='{scored[1][1].name}' d2={second_distance:.4f} margin={margin:.4f}")
            if distance > CONFIDENCE_THRESHOLD and margin < MARGIN_THRESHOLD:
                return {"status": "not_registered", "distance": round(distance, 4)}
        else:
            print(f"[detect] best='{row.name}' distance={distance:.4f} (only user)")

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
                    "event_id": request.event_id,
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

        if not already_attended:
            ws_manager.broadcast({
                "type": "match",
                "event_id": request.event_id,
                "user": {
                    "name": row.name,
                    "email": row.email,
                    "phone": row.phone,
                    "linkedin": row.linkedin,
                    "occupation": row.occupation,
                    "image_url": row.image_url,
                    "already_attended": False,
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


@router.get("/search")
def search_participants(
    q: str,
    event_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    """AI-powered semantic search through checked-in participants."""
    if not q or not q.strip():
        return {"results": [], "query": ""}

    sql = """
        SELECT u.id, u.name, u.email, u.phone, u.linkedin, u.occupation, u.image_url, a.timestamp
        FROM attendance a
        JOIN users u ON u.id = a.user_id
        WHERE a.status = 'present'
          AND (u.role IS NULL OR u.role != 'admin')
    """
    params = {}
    if event_id is not None:
        sql += " AND a.event_id = :eid"
        params["eid"] = event_id
    sql += " ORDER BY a.timestamp DESC"

    rows = db.execute(text(sql), params).fetchall()
    if not rows:
        return {"results": [], "query": q.strip()}

    # Build compact attendee lines for the prompt
    attendee_map = {}
    lines = []
    for r in rows:
        linkedin_handle = ""
        if r.linkedin:
            parts = r.linkedin.rstrip("/").split("/")
            if "in" in parts:
                idx = parts.index("in")
                if idx + 1 < len(parts):
                    linkedin_handle = parts[idx + 1].replace("-", " ")
        email_domain = r.email.split("@")[-1] if r.email and "@" in r.email else ""
        attendee_map[r.id] = r
        lines.append(
            f'ID:{r.id} | Name: {r.name} | '
            f'Occupation: {r.occupation or "not provided"} | '
            f'LinkedIn handle: {linkedin_handle or "N/A"} | '
            f'Email domain: {email_domain or "N/A"}'
        )

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        # Fallback: simple substring match when API key is not configured
        q_lower = q.strip().lower()
        results = []
        for r in rows:
            blob = f"{r.name} {r.occupation or ''} {r.linkedin or ''} {r.email or ''}".lower()
            if q_lower in blob:
                results.append({
                    "id": r.id, "name": r.name, "email": r.email,
                    "phone": r.phone, "linkedin": r.linkedin,
                    "occupation": r.occupation, "image_url": r.image_url,
                    "checked_in_at": r.timestamp, "score": 70,
                    "reason": "Name or occupation contains the search term.",
                })
        return {"results": results, "query": q.strip()}

    try:
        import anthropic as _anthropic
        import json as _json

        client = _anthropic.Anthropic(api_key=api_key)

        prompt = (
            f'You are helping find people at an event. Search query: "{q.strip()}"\n\n'
            f'Attendees:\n' + "\n".join(lines) + "\n\n"
            'Identify which attendees are relevant to the search query.\n'
            'Clues to use:\n'
            '- occupation (may say "not provided" — skip if empty)\n'
            '- LinkedIn handle: extracted from their profile URL, hyphens replaced with spaces '
            '  (e.g. "john doe cyber security analyst" reveals their role)\n'
            '- email domain (e.g. google.com, research.mit.edu hints at field)\n\n'
            'Return ONLY a JSON array, sorted by relevance descending (no other text):\n'
            '[{"id": <number>, "score": <0-100>, "reason": "<one sentence>"}]\n\n'
            'Only include people with genuine relevance. Return [] if nobody matches.'
        )

        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
        )

        raw = response.content[0].text.strip()
        if "[" in raw:
            raw = raw[raw.index("["):raw.rindex("]") + 1]
        matches = _json.loads(raw)

    except Exception as e:
        print(f"[search] AI error: {e}")
        return {"results": [], "query": q.strip(), "error": "AI search unavailable"}

    results = []
    for m in matches:
        pid = m.get("id")
        if pid not in attendee_map:
            continue
        r = attendee_map[pid]
        results.append({
            "id": r.id, "name": r.name, "email": r.email,
            "phone": r.phone, "linkedin": r.linkedin,
            "occupation": r.occupation, "image_url": r.image_url,
            "checked_in_at": r.timestamp,
            "score": m.get("score", 50),
            "reason": m.get("reason", ""),
        })

    return {"results": results, "query": q.strip()}


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
