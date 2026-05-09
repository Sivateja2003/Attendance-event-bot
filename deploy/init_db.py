import sys
sys.path.insert(0, '/opt/face_auth/backend')

from dotenv import load_dotenv
load_dotenv('/opt/face_auth/backend/.env')

from database import engine, Base, DATABASE_URL
import models

print("Connecting to:", DATABASE_URL)

with engine.connect() as conn:
    print("Connection OK")

Base.metadata.create_all(bind=engine)
print("Tables created")

from sqlalchemy import text
from auth import hash_password

with engine.begin() as conn:
    conn.execute(
        text("INSERT INTO users (name, email, password_hash, role, registered_at) "
             "VALUES ('Admin', 'admin@gmail.com', :p, 'admin', CURRENT_TIMESTAMP) "
             "ON CONFLICT DO NOTHING"),
        {'p': hash_password('admin@1234')}
    )
print("Admin created")
print("Done!")
