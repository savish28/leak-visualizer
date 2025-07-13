import os
import sys
from datetime import datetime
import uuid  # For generating unique filenames for spectrograms
from contextlib import asynccontextmanager  # Import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session  # Import Session
from sqlalchemy import select  # Import select for modern SQLAlchemy queries

# Import functions and constants from model_inference module (corrected name)
from model_inference import load_onnx_session, model_inference

# Import database components and models from database module
from database import (
    get_db,
    create_db_tables,
    Sensor,
    Prediction,
    SPECTROGRAM_STORAGE_DIR,
    SENSOR_CONFIGS_FOR_DB,
    populate_initial_sensors,
)


# --- Lifespan Event Handler ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan event handler.
    Runs code on application startup and shutdown.
    It's responsible for:
    1. Loading the ONNX model.
    2. Creating database tables if they don't exist.
    3. Pre-populating sensor data in the database.
    """
    print("FastAPI application startup: Loading ONNX model...", file=sys.stderr)
    load_onnx_session()

    print("Creating database tables...", file=sys.stderr)
    create_db_tables()

    # Pre-populate sensors if they don't exist
    db = next(get_db())  # Get a session for startup tasks
    try:
        populate_initial_sensors(db)  # Call the new populate function
    finally:
        # Ensure the database session is always closed, even if populate_initial_sensors re-raises
        db.close()

    yield  # Application starts here

    # Code after yield runs on application shutdown
    print("FastAPI application shutdown: Cleaning up...", file=sys.stderr)
    # Add any shutdown logic here if needed (e.g., closing connections)


# --- FastAPI Application Definition ---
app = FastAPI(
    title="ONNX Binary Classifier API",
    description="API for inferring leak/normal classification from RGB PNG images using an ONNX model.",
    version="1.0.0",
    lifespan=lifespan,  # Use the new lifespan event handler
)

# --- CORS Configuration ---
origins = ["*"]  # Allowed all hosts as requested

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# --- END CORS Configuration ---

# --- Serve Spectrograms as Static Files ---
# This makes the spectrograms stored in SPECTROGRAM_STORAGE_DIR accessible via a URL.
# The URL path will be /spectrograms/{filename}
app.mount(
    "/spectrograms", StaticFiles(directory=SPECTROGRAM_STORAGE_DIR), name="spectrograms"
)


@app.get("/api/health", summary="Health Check")
async def read_root():
    """
    Provides a basic health check endpoint for the API.
    Returns a simple message indicating the API is running.
    """
    return {
        "message": "ONNX Binary Classifier API is running. Go to /docs for interactive API documentation."
    }


@app.get("/api/sensors", summary="Fetch All Sensors")
async def get_all_sensors(db: Session = Depends(get_db)):
    """
    Fetches details for all registered sensors, including their location and floor.
    """
    stmt = select(Sensor)
    sensors = db.execute(stmt).scalars().all()
    return [
        {
            "id": s.id,
            "location_description": s.location_description,
            "floor_reference": s.floor_reference,
            "x_coordinate": s.x_coordinate,
            "y_coordinate": s.y_coordinate,
        }
        for s in sensors
    ]


@app.post("/api/predict", summary="Predict Leak/Normal from Image", response_model=dict)
async def predict_image(
    file: UploadFile = File(
        ...,
        description="Upload a PNG image for classification (e.g., of a pipe or surface).",
    ),
    sensor_id: str = Form(
        ..., description="Unique identifier for the sensor capturing the image."
    ),
    db: Session = Depends(get_db),  # Inject database session
):
    """
    Accepts an uploaded PNG image file, processes it, runs it through the
    ONNX deep learning model, and returns a binary classification (Leak/Normal)
    with a confidence score, along with sensor information and severity.
    The prediction result is logged into the database.
    """
    if not file.content_type.startswith("image/png"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Only PNG image files are accepted.",
        )

    try:
        image_bytes = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to read uploaded image file: {e}"
        )

    # Perform the full model inference
    predicted_label, confidence_str = model_inference(image_bytes, debug_mode=True)
    confidence_float = float(confidence_str)

    # Determine severity based on leak confidence
    severity = "none"
    if predicted_label == "Leak":
        if confidence_float >= 0.80:
            severity = "high"
        elif confidence_float >= 0.50:
            severity = "low"

    current_timestamp = datetime.now()  # Use datetime object for database

    # --- Save Spectrogram and Log to Database ---
    spectrogram_filename = f"{sensor_id}_{uuid.uuid4()}.png"
    spectrogram_path = os.path.join(SPECTROGRAM_STORAGE_DIR, spectrogram_filename)

    try:
        # Ensure the directory exists (should be handled by database.py on startup, but good to be safe)
        os.makedirs(SPECTROGRAM_STORAGE_DIR, exist_ok=True)
        with open(spectrogram_path, "wb") as buffer:
            buffer.write(image_bytes)
        print(f"Spectrogram saved to: {spectrogram_path}", file=sys.stderr)
    except Exception as e:
        print(f"Error saving spectrogram file: {e}", file=sys.stderr)
        raise HTTPException(status_code=500, detail=f"Failed to save spectrogram: {e}")

    try:
        # Check if the sensor_id exists in the Sensor table
        stmt_sensor_check = select(Sensor).where(Sensor.id == sensor_id)
        existing_sensor = db.execute(stmt_sensor_check).scalar_one_or_none()
        if not existing_sensor:
            # If sensor_id is not present, add it as a basic entry with "Manual" floor
            print(
                f"Warning: Sensor ID '{sensor_id}' not found in database. Adding a placeholder entry.",
                file=sys.stderr,
            )
            new_sensor = Sensor(
                id=sensor_id,
                location_description="Manual Upload",
                floor_reference="Manual",
                x_coordinate=-1.0,
                y_coordinate=-1.0,
            )
            db.add(new_sensor)
            db.commit()  # Commit the new sensor before adding prediction
            db.refresh(new_sensor)

        # Log prediction to database
        db_prediction = Prediction(
            sensor_id=sensor_id,
            timestamp=current_timestamp,
            prediction=predicted_label,
            confidence=confidence_float,
            severity=severity,
            spectrogram_path=spectrogram_path,
        )
        db.add(db_prediction)
        db.commit()
        db.refresh(db_prediction)  # Refresh to get auto-generated ID if needed
        print(f"Prediction logged to DB: {db_prediction.id}", file=sys.stderr)
    except Exception as e:
        db.rollback()
        print(f"Error logging prediction to database: {e}", file=sys.stderr)
        raise HTTPException(
            status_code=500, detail=f"Failed to log prediction to database: {e}"
        )

    # Return the results as a JSON response (timestamp as ISO string)
    return {
        "prediction": predicted_label,
        "confidence": confidence_float,
        "timestamp": current_timestamp.isoformat(),
        "sensor_id": sensor_id,
        "severity": severity,
    }


@app.get("/api/prediction_history", summary="Fetch All Prediction History")
async def get_prediction_history(
    db: Session = Depends(get_db),
):  # Inject database session
    """
    Fetches a history of all recorded prediction events from the database,
    including both "Leak" and "Normal" predictions, along with sensor details.
    Raises an HTTPException if a prediction references a sensor_id that is not found.
    """
    # Use a JOIN to fetch predictions and their corresponding sensor details in one efficient query
    stmt = (
        select(Prediction, Sensor)
        .outerjoin(
            Sensor, Prediction.sensor_id == Sensor.id
        )  # Use outerjoin to include predictions even if sensor is missing
        .order_by(Prediction.timestamp.desc())
        .limit(50)  # Limit to the most recent 50 predictions
    )
    results = db.execute(stmt).all()

    history_data = []
    for p, s in results:
        if s is None:
            # If a prediction's sensor_id does not have a corresponding Sensor entry, raise an error
            # This fulfills the "raise error if sensor id not present when fetched" requirement.
            raise HTTPException(
                status_code=500,
                detail=f"Data inconsistency: Prediction ID {p.id} references non-existent Sensor ID '{p.sensor_id}'.",
            )
        history_data.append(
            {
                "id": p.id,
                "timestamp": p.timestamp.isoformat(),
                "sensor_id": p.sensor_id,
                "prediction": p.prediction,
                "confidence": p.confidence,
                "severity": p.severity,
                "spectrogram_path": p.spectrogram_path,
                "location_description": s.location_description,  # Directly from joined Sensor object
                "floor_reference": s.floor_reference,  # Directly from joined Sensor object
                "x_coordinate": s.x_coordinate,  # Include coordinates
                "y_coordinate": s.y_coordinate,  # Include coordinates
            }
        )
    return history_data


@app.get(
    "/api/sensors/{sensor_id}/latest_prediction",
    summary="Fetch Latest Prediction for a Sensor",
)
async def get_latest_prediction_for_sensor(
    sensor_id: str, db: Session = Depends(get_db)
):
    """
    Fetches the most recent prediction for a specific sensor, including its metadata and spectrogram path.
    """
    stmt = (
        select(Prediction, Sensor)
        .join(Sensor, Prediction.sensor_id == Sensor.id)
        .where(Prediction.sensor_id == sensor_id)
        .order_by(Prediction.timestamp.desc())
        .limit(1)
    )
    result = db.execute(stmt).first()

    if not result:
        raise HTTPException(
            status_code=404, detail=f"No predictions found for sensor ID '{sensor_id}'."
        )

    p, s = result

    return {
        "id": p.id,
        "timestamp": p.timestamp.isoformat(),
        "sensor_id": p.sensor_id,
        "prediction": p.prediction,
        "confidence": p.confidence,
        "severity": p.severity,
        "spectrogram_path": p.spectrogram_path,
        "location_description": s.location_description,
        "floor_reference": s.floor_reference,
        "x_coordinate": s.x_coordinate,
        "y_coordinate": s.y_coordinate,
    }


@app.get(
    "/api/sensors/{sensor_id}/history", summary="Fetch Prediction History for a Sensor"
)
async def get_sensor_prediction_history(sensor_id: str, db: Session = Depends(get_db)):
    """
    Fetches all prediction history for a specific sensor, including metadata.
    """
    stmt = (
        select(Prediction, Sensor)
        .join(Sensor, Prediction.sensor_id == Sensor.id)
        .where(Prediction.sensor_id == sensor_id)
        .order_by(
            Prediction.timestamp.asc()
        )  # Order by ascending for time-series graph
    )
    results = db.execute(stmt).all()

    history_data = []
    for p, s in results:
        history_data.append(
            {
                "id": p.id,
                "timestamp": p.timestamp.isoformat(),
                "sensor_id": p.sensor_id,
                "prediction": p.prediction,
                "confidence": p.confidence,
                "severity": p.severity,
                "spectrogram_path": p.spectrogram_path,
                "location_description": s.location_description,
                "floor_reference": s.floor_reference,
                "x_coordinate": s.x_coordinate,
                "y_coordinate": s.y_coordinate,
            }
        )
    return history_data


# This block allows running the FastAPI application directly using `python main.py`
if __name__ == "__main__":
    print(f"Current time: {os.environ.get('CURRENT_TIME', 'N/A')}", file=sys.stderr)
    print(
        f"Current location: {os.environ.get('CURRENT_LOCATION', 'N/A')}",
        file=sys.stderr,
    )
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
