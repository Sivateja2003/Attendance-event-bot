from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from auth import get_current_user
from database import get_db
from models import User

router = APIRouter(prefix="/api/me", tags=["me"])


@router.get("/profile")
def my_profile(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "phone": current_user.phone,
        "linkedin": current_user.linkedin,
        "occupation": current_user.occupation,
        "image_url": current_user.image_url,
        "registered_at": current_user.registered_at,
    }


@router.get("/events")
def my_events(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        text("""
            SELECT e.id, e.name, e.description, e.created_at, a.status
            FROM attendance a
            JOIN events e ON e.id = a.event_id
            WHERE a.user_id = :uid
            ORDER BY e.created_at DESC
        """),
        {"uid": current_user.id},
    ).fetchall()
    return [
        {
            "id": r.id,
            "name": r.name,
            "description": r.description,
            "created_at": r.created_at,
            "status": r.status,
        }
        for r in rows
    ]
