from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import User, Attendance, Event
from face_service import get_embedding, save_upload_bytes, save_base64_image, UPLOAD_DIR
from auth import require_admin
import numpy as np
import os

router = APIRouter(prefix="/api/register", tags=["register"])


@router.post("", dependencies=[Depends(require_admin)])
async def register_user(
    name: str = Form(...),
    email: str = Form(None),
    phone: str = Form(None),
    linkedin: str = Form(None),
    occupation: str = Form(None),
    event_id: int = Form(None),
    image: UploadFile = File(None),
    image_base64: str = Form(None),
    db: Session = Depends(get_db),
):
    if not image and not image_base64:
        raise HTTPException(status_code=400, detail="Provide either image file or base64 image.")

    # Validate event if provided
    event_name = None
    if event_id is not None:
        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found.")
        event_name = event.name

    if image:
        file_bytes = await image.read()
        filepath, filename = save_upload_bytes(file_bytes, image.filename)
        image_url = f"/uploads/{filename}"
    else:
        filepath = save_base64_image(image_base64)
        image_url = f"/uploads/{os.path.basename(filepath)}"

    embedding = get_embedding(filepath)
    if embedding is None:
        if os.path.exists(filepath):
            os.remove(filepath)
        raise HTTPException(status_code=400, detail="No face detected. Use a clear, front-facing photo.")

    user = User(
        name=name.strip(),
        email=email.strip() if email else None,
        phone=phone.strip() if phone else None,
        linkedin=linkedin.strip() if linkedin else None,
        occupation=occupation.strip() if occupation else None,
        image_url=image_url,
        embedding=np.array(embedding, dtype=np.float32).tobytes(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Enroll the user in the selected event only (face scan will mark them as "present")
    if event_id is not None:
        db.add(Attendance(user_id=user.id, event_id=event_id, status="enrolled"))
        db.commit()

    return {
        "success": True,
        "user_id": user.id,
        "name": user.name,
        "event_name": event_name,
    }


@router.get("/users", dependencies=[Depends(require_admin)])
def list_users(db: Session = Depends(get_db)):
    users = db.query(User).filter(User.role != "admin").order_by(User.registered_at.desc()).all()
    return [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "phone": u.phone,
            "linkedin": u.linkedin,
            "occupation": u.occupation,
            "image_url": u.image_url,
            "registered_at": u.registered_at,
            "role": u.role,
        }
        for u in users
    ]


@router.delete("/users/{user_id}", dependencies=[Depends(require_admin)])
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.role == "admin":
        raise HTTPException(status_code=403, detail="Admin accounts cannot be deleted.")

    db.query(Attendance).filter(Attendance.user_id == user_id).delete()

    if user.image_url:
        filename = user.image_url.lstrip("/uploads/")
        filepath = os.path.join(UPLOAD_DIR, filename)
        if os.path.exists(filepath):
            os.remove(filepath)

    db.delete(user)
    db.commit()

    return {"success": True}
