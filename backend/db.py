import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Overridable so a deploy target with a persistent volume (e.g. Railway) can point
# this at the mounted volume's path instead of the container's ephemeral disk —
# without that, the database would silently reset on every redeploy.
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./travel_planner.db")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
