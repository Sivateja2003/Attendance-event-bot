from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db
from models import Event, Attendance
from auth import require_admin

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


@router.delete("/{event_id}", dependencies=[Depends(require_admin)])
def delete_event(event_id: int, db: Session = Depends(get_db)):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found.")
    deleted = db.query(Attendance).filter(Attendance.event_id == event_id).delete()
    db.delete(event)
    db.commit()
    return {"success": True, "attendance_deleted": deleted}
