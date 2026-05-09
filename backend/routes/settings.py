from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime
from database import get_db
from auth import require_admin
from models import AdminSettings
from notifications import send_registration_email

router = APIRouter(prefix="/api/settings", tags=["settings"])


class EmailSettingsBody(BaseModel):
    email_user: str | None = None
    email_password: str | None = None
    email_from: str | None = None


class TestEmailBody(BaseModel):
    to_email: str


@router.get("/email")
def get_email_settings(db: Session = Depends(get_db), current_user=Depends(require_admin)):
    s = db.query(AdminSettings).filter(AdminSettings.user_id == current_user.id).first()
    return {
        "email_user": s.email_user if s else None,
        "email_from": s.email_from if s else None,
        "has_password": bool(s and s.email_password),
    }


@router.put("/email")
def update_email_settings(body: EmailSettingsBody, db: Session = Depends(get_db), current_user=Depends(require_admin)):
    s = db.query(AdminSettings).filter(AdminSettings.user_id == current_user.id).first()
    if not s:
        s = AdminSettings(user_id=current_user.id)
        db.add(s)

    if body.email_user is not None:
        s.email_user = body.email_user.strip() or None
    if body.email_password is not None:
        s.email_password = body.email_password or None
    if body.email_from is not None:
        s.email_from = body.email_from.strip() or None

    s.updated_at = datetime.utcnow()
    db.commit()
    return {"success": True}


@router.post("/email/test")
def test_email(body: TestEmailBody, db: Session = Depends(get_db), current_user=Depends(require_admin)):
    s = db.query(AdminSettings).filter(AdminSettings.user_id == current_user.id).first()
    if not s or not s.email_user or not s.email_password:
        raise HTTPException(status_code=400, detail="Email not configured. Save your settings first.")

    try:
        send_registration_email(
            to_email=body.to_email,
            name="Test User",
            event_name="Test Event",
            display_url="https://example.com",
            email_user=s.email_user,
            email_password=s.email_password,
            email_from=s.email_from,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send test email: {e}")

    return {"success": True}
