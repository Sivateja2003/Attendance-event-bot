import os

import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy.orm import Session
from typing import Optional

from auth import create_access_token, get_current_user, hash_password, verify_password
from database import get_db
from face_service import UPLOAD_DIR, get_embedding, save_base64_image, save_upload_bytes
from models import Attendance, Event, User

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_auth_cookie(response: Response, user: User) -> dict:
    token = create_access_token(user.id, user.role)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=7 * 24 * 3600,
    )
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role}


@router.post("/login")
def login(
    response: Response,
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == email.strip()).first()
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return _set_auth_cookie(response, user)


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("access_token")
    return {"success": True}


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role,
    }


@router.post("/signup")
async def signup(
    response: Response,
    name: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
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

    existing = db.query(User).filter(User.email == email.strip()).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

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
        email=email.strip(),
        phone=phone.strip() if phone else None,
        linkedin=linkedin.strip() if linkedin else None,
        occupation=occupation.strip() if occupation else None,
        image_url=image_url,
        embedding=np.array(embedding, dtype=np.float32).tobytes(),
        password_hash=hash_password(password),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    if event_id is not None:
        db.add(Attendance(user_id=user.id, event_id=event_id, status="enrolled"))
        db.commit()

    return _set_auth_cookie(response, user)
