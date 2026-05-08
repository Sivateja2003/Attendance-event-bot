from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from database import get_db
from models import Event, Attendance, User
from face_service import UPLOAD_DIR
from auth import require_admin
import os

router = APIRouter(prefix="/api/events", tags=["events"])


class EventCreate(BaseModel):
    name: str
    description: str | None = None


@router.get("")
def list_events(db: Session = Depends(get_db)):
    events = db.query(Event).order_by(Event.created_at.desc()).all()
    return [
        {
            "id": e.id,
            "name": e.name,
            "description": e.description,
            "created_at": e.created_at,
        }
        for e in events
    ]


@router.post("", dependencies=[Depends(require_admin)])
def create_event(body: EventCreate, db: Session = Depends(get_db)):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Event name is required.")
    event = Event(name=name, description=body.description)
    db.add(event)
    db.commit()
    db.refresh(event)
    return {"id": event.id, "name": event.name, "description": event.description, "created_at": event.created_at}


@router.get("/{event_id}/users", dependencies=[Depends(require_admin)])
def event_users(event_id: int, db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT u.id, u.name, u.email, u.phone, u.linkedin, u.occupation,
               u.image_url, u.registered_at, a.status
        FROM attendance a
        JOIN users u ON u.id = a.user_id
        WHERE a.event_id = :eid AND u.role != 'admin'
        ORDER BY u.name
    """), {"eid": event_id}).fetchall()
    return [
        {
            "id": r.id, "name": r.name, "email": r.email, "phone": r.phone,
            "linkedin": r.linkedin, "occupation": r.occupation,
            "image_url": r.image_url, "registered_at": r.registered_at,
            "status": r.status,
        }
        for r in rows
    ]


@router.delete("/{event_id}", dependencies=[Depends(require_admin)])
def delete_event(event_id: int, db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")

    # Find users enrolled ONLY in this event — they have no records in any other event
    only_here = db.execute(text("""
        SELECT DISTINCT a.user_id FROM attendance a
        WHERE a.event_id = :eid
          AND a.user_id NOT IN (
              SELECT DISTINCT user_id FROM attendance
              WHERE (event_id != :eid OR event_id IS NULL)
                AND event_id IS NOT NULL
          )
          AND a.user_id NOT IN (
              SELECT DISTINCT user_id FROM attendance
              WHERE event_id IS NULL
          )
    """), {"eid": event_id}).fetchall()

    # Delete those users' photos and records
    users_deleted = 0
    for row in only_here:
        user = db.query(User).filter(User.id == row.user_id, User.role != "admin").first()
        if user:
            if user.image_url:
                filepath = os.path.join(UPLOAD_DIR, os.path.basename(user.image_url))
                if os.path.exists(filepath):
                    os.remove(filepath)
            db.delete(user)
            users_deleted += 1

    # Delete all attendance records for this event then the event itself
    attendance_deleted = db.query(Attendance).filter(Attendance.event_id == event_id).delete()
    db.delete(event)
    db.commit()
    return {"success": True, "attendance_deleted": attendance_deleted, "users_deleted": users_deleted}
