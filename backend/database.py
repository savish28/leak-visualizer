import os
import sys
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy import select

# --- Database Configuration ---
DATABASE_URL = "sqlite:///./data/app.db"
SPECTROGRAM_STORAGE_DIR = "./data/spectrograms"

os.makedirs(os.path.dirname(DATABASE_URL.replace("sqlite:///./", "")), exist_ok=True)
os.makedirs(SPECTROGRAM_STORAGE_DIR, exist_ok=True)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# --- Database Models ---
class Sensor(Base):
    __tablename__ = "sensors"
    id = Column(String, primary_key=True, index=True)
    location_description = Column(String, index=True)
    floor_reference = Column(String, index=True)
    x_coordinate = Column(Float)  # New column for X coordinate
    y_coordinate = Column(Float)  # New column for Y coordinate


class Prediction(Base):
    __tablename__ = "predictions"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    sensor_id = Column(String, index=True)
    timestamp = Column(DateTime, default=datetime.now)
    prediction = Column(String)
    confidence = Column(Float)
    severity = Column(String)
    spectrogram_path = Column(String)


# --- Initial Sensor Data (with coordinates and multiple floors) ---
SENSOR_CONFIGS_FOR_DB = [
    {
        "id": "sensor-pipe-A",
        "location_description": "Main Pipe Entry",
        "floor_reference": "Floor 1",
        "x_coordinate": 50.0,
        "y_coordinate": 50.0,
    },
    {
        "id": "sensor-pipe-B",
        "location_description": "Vertical Segment Mid",
        "floor_reference": "Floor 1",
        "x_coordinate": 50.0,
        "y_coordinate": 150.0,
    },
    {
        "id": "sensor-pipe-C",
        "location_description": "Horizontal Segment End",
        "floor_reference": "Floor 1",
        "x_coordinate": 150.0,
        "y_coordinate": 150.0,
    },
    {
        "id": "sensor-pipe-D",
        "location_description": "Secondary Line Junction",
        "floor_reference": "Floor 1",
        "x_coordinate": 250.0,
        "y_coordinate": 150.0,
    },
    {
        "id": "sensor-floor2-X",
        "location_description": "HVAC Unit, Floor 2",
        "floor_reference": "Floor 2",
        "x_coordinate": 100.0,
        "y_coordinate": 70.0,
    },
    {
        "id": "sensor-floor2-Y",
        "location_description": "Water Heater, Floor 2",
        "floor_reference": "Floor 2",
        "x_coordinate": 200.0,
        "y_coordinate": 120.0,
    },
    {
        "id": "sensor-floor2-Z",
        "location_description": "Utility Closet, Floor 2",
        "floor_reference": "Floor 2",
        "x_coordinate": 150.0,
        "y_coordinate": 20.0,
    },
]


# --- Database Utility ---
def get_db():
    """Dependency to get a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_db_tables():
    """Creates all database tables defined in Base."""
    Base.metadata.create_all(bind=engine)
    print("Database tables created or already exist.", file=sys.stderr)


def populate_initial_sensors(db: Session):
    """
    Populates the 'sensors' table with initial data if entries do not already exist.
    """
    print("Checking and populating initial sensors...", file=sys.stderr)
    try:
        for sensor_data in SENSOR_CONFIGS_FOR_DB:
            stmt = select(Sensor).where(Sensor.id == sensor_data["id"])
            existing_sensor = db.execute(stmt).scalar_one_or_none()
            if not existing_sensor:
                new_sensor = Sensor(
                    id=sensor_data["id"],
                    location_description=sensor_data["location_description"],
                    floor_reference=sensor_data["floor_reference"],
                    x_coordinate=sensor_data["x_coordinate"],  # Assign new coordinates
                    y_coordinate=sensor_data["y_coordinate"],  # Assign new coordinates
                )
                db.add(new_sensor)
                print(f"Added sensor: {new_sensor.id}", file=sys.stderr)
        db.commit()
        print("Initial sensors populated successfully.", file=sys.stderr)
    except Exception as e:
        print(f"Error populating initial sensors: {e}", file=sys.stderr)
        db.rollback()
        raise
