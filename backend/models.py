from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint, LargeBinary
from datetime import datetime
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    email = Column(String(255))
    phone = Column(String(50))
    linkedin = Column(String(255))
    occupation = Column(String(255))
    image_url = Column(String)
    embedding = Column(LargeBinary)  # np.float32 bytes, 128 floats * 4 bytes = 512 bytes
    registered_at = Column(DateTime, default=datetime.utcnow)
    password_hash = Column(String(255), nullable=True)
    role = Column(String(20), nullable=False, default="user")


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)


class Attendance(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    event_id = Column(Integer, ForeignKey("events.id"), nullable=True)
    status = Column(String(50), default="present")
    timestamp = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "event_id", name="uq_attendance_user_event"),
    )
