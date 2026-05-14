import csv
import io
import os
import re
import uuid

import requests
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import require_admin
from database import get_db
from image_storage import UPLOAD_DIR
from models import Attendance, Event, User

router = APIRouter(prefix="/api/import", tags=["import"])

_HEADERS = {"User-Agent": "Mozilla/5.0"}


def _csv_url(sheet_url: str) -> str:
    match = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", sheet_url)
    if not match:
        raise ValueError("Not a valid Google Sheets URL.")
    sid = match.group(1)
    gid_match = re.search(r"[#&?]gid=(\d+)", sheet_url)
    gid = f"&gid={gid_match.group(1)}" if gid_match else ""
    return f"https://docs.google.com/spreadsheets/d/{sid}/export?format=csv{gid}"


def _direct_url(url: str) -> str:
    """Convert Google Drive sharing link to a direct download URL."""
    m = re.search(r"/file/d/([a-zA-Z0-9-_]+)", url)
    if m:
        return f"https://drive.google.com/uc?export=download&id={m.group(1)}&confirm=t"
    m = re.search(r"[?&]id=([a-zA-Z0-9-_]+)", url)
    if m:
        return f"https://drive.google.com/uc?export=download&id={m.group(1)}&confirm=t"
    return url


def _fetch(url: str) -> requests.Response:
    r = requests.get(url, timeout=20, allow_redirects=True, headers=_HEADERS)
    r.raise_for_status()
    return r


class ImportRequest(BaseModel):
    sheet_url: str


@router.post("/google-sheet", dependencies=[Depends(require_admin)])
def import_from_sheet(body: ImportRequest, db: Session = Depends(get_db)):
    try:
        csv_url = _csv_url(body.sheet_url)
    except ValueError as e:
        return {"success": False, "error": str(e)}

    try:
        sheet_r = _fetch(csv_url)
    except Exception as e:
        return {"success": False, "error": f"Could not fetch sheet — make sure it is shared as 'Anyone with link can view': {e}"}

    reader = csv.DictReader(io.StringIO(sheet_r.text))

    raw_fields = reader.fieldnames or []
    norm = {k: k.strip().lower().replace(" ", "_") for k in raw_fields}

    event_cache: dict[str, int] = {}
    imported = 0
    errors: list[str] = []

    for raw_row in reader:
        row = {norm[k]: (v or "").strip() for k, v in raw_row.items() if k}

        name = row.get("name", "")
        if not name:
            continue

        event_name = row.get("event_name", row.get("event", ""))
        event_id = None
        if event_name:
            if event_name not in event_cache:
                ev = db.query(Event).filter(Event.name == event_name).first()
                if not ev:
                    ev = Event(name=event_name)
                    db.add(ev)
                    db.commit()
                    db.refresh(ev)
                event_cache[event_name] = ev.id
            event_id = event_cache[event_name]

        image_url = None
        photo_raw = row.get("photo", row.get("photo_url", row.get("image", "")))
        if photo_raw:
            try:
                photo_r = _fetch(_direct_url(photo_raw))
                filename = f"{uuid.uuid4().hex}.jpg"
                filepath = os.path.join(UPLOAD_DIR, filename)
                with open(filepath, "wb") as f:
                    f.write(photo_r.content)
                image_url = f"/uploads/{filename}"
            except Exception as e:
                errors.append(f"{name}: photo download failed — {e}")

        user = User(
            name=name,
            email=row.get("gmail", row.get("email", "")) or None,
            phone=row.get("phone_no", row.get("phone_number", row.get("phone", ""))) or None,
            linkedin=row.get("linkedin", "") or None,
            occupation=row.get("occupation", "") or None,
            description=row.get("description", "") or None,
            image_url=image_url,
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        if event_id is not None:
            db.add(Attendance(user_id=user.id, event_id=event_id, status="enrolled"))
            db.commit()

        imported += 1

    return {
        "success": True,
        "imported": imported,
        "skipped": len(errors),
        "events_created": list(event_cache.keys()),
        "errors": errors,
    }
