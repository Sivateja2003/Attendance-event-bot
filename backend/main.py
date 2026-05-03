import asyncio
import json
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text, inspect
from database import engine, Base
from routes import register, attendance, events, import_sheet, auth as auth_routes, me as me_routes
import ws_manager
import os

Base.metadata.create_all(bind=engine)


def run_migrations():
    insp = inspect(engine)
    dialect = engine.dialect.name

    user_cols = {c["name"] for c in insp.get_columns("users")}
    att_cols = {c["name"] for c in insp.get_columns("attendance")}

    with engine.begin() as conn:
        for col, ddl in [
            ("email", "VARCHAR(255)"),
            ("phone", "VARCHAR(50)"),
            ("linkedin", "VARCHAR(255)"),
            ("occupation", "VARCHAR(255)"),
        ]:
            if col not in user_cols:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {ddl}"))

        if "event_id" not in att_cols:
            conn.execute(text(
                "ALTER TABLE attendance ADD COLUMN event_id INTEGER REFERENCES events(id)"
            ))

        # Partial unique index only supported natively on Postgres; SQLite uses the
        # UniqueConstraint declared on the Attendance model (created by create_all above).
        if dialect == "postgresql":
            conn.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_user_event
                ON attendance (user_id, event_id)
                WHERE event_id IS NOT NULL
            """))

        for col, ddl in [
            ("password_hash", "VARCHAR(255)"),
            ("role", "VARCHAR(20) DEFAULT 'user'"),
        ]:
            if col not in user_cols:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {ddl}"))

        # One-time migration: re-encode any legacy JSON-text embeddings to binary float32
        rows = conn.execute(
            text("SELECT id, embedding FROM users WHERE embedding IS NOT NULL")
        ).fetchall()
        for r in rows:
            val = r.embedding
            if isinstance(val, (bytes, bytearray, memoryview)):
                continue  # already binary
            if isinstance(val, str) and val.startswith("["):
                arr = np.array(json.loads(val), dtype=np.float32).tobytes()
                conn.execute(
                    text("UPDATE users SET embedding = :e WHERE id = :i"),
                    {"e": arr, "i": r.id},
                )


run_migrations()


def bootstrap_admin():
    admin_email = os.getenv("ADMIN_EMAIL")
    admin_password = os.getenv("ADMIN_PASSWORD")
    if not admin_email or not admin_password:
        return
    from auth import hash_password
    with engine.begin() as conn:
        existing = conn.execute(
            text("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
        ).fetchone()
        if existing:
            return
        conn.execute(
            text(
                "INSERT INTO users (name, email, password_hash, role, registered_at) "
                "VALUES (:n, :e, :p, 'admin', CURRENT_TIMESTAMP)"
            ),
            {"n": "Admin", "e": admin_email, "p": hash_password(admin_password)},
        )


bootstrap_admin()

app = FastAPI(title="Face Attendance System")


@app.on_event("startup")
async def startup():
    ws_manager.set_loop(asyncio.get_running_loop())


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

upload_dir = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

app.include_router(auth_routes.router)
app.include_router(me_routes.router)
app.include_router(register.router)
app.include_router(attendance.router)
app.include_router(events.router)
app.include_router(import_sheet.router)


@app.websocket("/ws/display")
async def display_ws(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep alive
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)


@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
