import os
import sys
from datetime import datetime  # Import datetime for timestamp
import asyncio  # Import asyncio for thread-safe list operations

from fastapi import (
    FastAPI,
    UploadFile,
    File,
    Form,
    HTTPException,
)  # Import Form for sensor_id
import uvicorn  # Required to run the FastAPI app

# Import functions and constants from the model_inference module
from model_inference import load_onnx_session, model_inference

# --- Global Storage for Prediction History ---
# Using an in-memory list for demonstration. For production, consider a database.
prediction_history = []  # Renamed from leak_history
# Use an asyncio Lock to ensure thread-safe access to the prediction_history list
prediction_history_lock = asyncio.Lock()  # Renamed from leak_history_lock


# --- FastAPI Application Definition ---
app = FastAPI(
    title="ONNX Binary Classifier API",
    description="API for inferring leak/normal classification from RGB PNG images using an ONNX model.",
    version="1.0.0",
)


@app.on_event("startup")
async def startup_event():
    """
    FastAPI event handler that runs when the application starts up.
    It's responsible for loading the ONNX model into memory once.
    """
    print("FastAPI application startup: Loading ONNX model...", file=sys.stderr)
    load_onnx_session()


@app.get("/", summary="Health Check")
async def read_root():
    """
    Provides a basic health check endpoint for the API.
    Returns a simple message indicating the API is running.
    """
    return {
        "message": "ONNX Binary Classifier API is running. Go to /docs for interactive API documentation."
    }


@app.post("/predict", summary="Predict Leak/Normal from Image", response_model=dict)
async def predict_image(
    file: UploadFile = File(
        ...,
        description="Upload a PNG image for classification (e.g., of a pipe or surface).",
    ),
    sensor_id: str = Form(
        ..., description="Unique identifier for the sensor capturing the image."
    ),
):
    """
    Accepts an uploaded PNG image file, processes it, runs it through the
    ONNX deep learning model, and returns a binary classification (Leak/Normal)
    with a confidence score, along with sensor information and severity.
    The prediction result (whether Leak or Normal) is logged to the prediction history.

    Parameters:
        file (UploadFile): The uploaded image file. Must be a PNG.
        sensor_id (str): A unique identifier for the sensor from which the image originated.

    Returns:
        dict: A dictionary containing:
              - "prediction" (str): The predicted class ("Normal" or "Leak").
              - "confidence" (float): The confidence score, formatted to two decimal places.
              - "timestamp" (str): The timestamp when the prediction was made (ISO format).
              - "sensor_id" (str): The ID of the sensor that provided the image.
              - "severity" (str): The determined severity ("low", "high", or "none")
                                  based on the confidence of a "Leak" prediction.

    Raises:
        HTTPException: If the file is not a PNG, cannot be read, or if inference fails.
    """
    # Validate that the uploaded file is a PNG image
    if not file.content_type.startswith("image/png"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Only PNG image files are accepted.",
        )

    try:
        # Read the content of the uploaded file as bytes
        image_bytes = await file.read()
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to read uploaded image file: {e}"
        )

    # Perform the full model inference and get the predicted label and confidence
    predicted_label, confidence_str = model_inference(image_bytes, debug_mode=True)
    confidence_float = float(confidence_str)  # Convert back to float for severity logic

    # Determine severity based on leak confidence
    severity = "none"
    if predicted_label == "Leak":
        # Define your severity thresholds here
        if confidence_float >= 0.80:  # Example threshold for high severity
            severity = "high"
        elif confidence_float >= 0.50:  # Example threshold for low severity
            severity = "low"
        else:  # If predicted leak but confidence is very low
            severity = "none"  # Or "uncertain", "very_low", etc.
    # If predicted_label is "Normal", severity remains "none"

    # Get current timestamp for the prediction
    current_timestamp = datetime.now().isoformat()

    # Log all prediction results (Leak or Normal)
    async with prediction_history_lock:  # Acquire lock before modifying the shared list
        prediction_history.append(
            {
                "timestamp": current_timestamp,
                "sensor_id": sensor_id,
                "confidence": confidence_float,
                "severity": severity,
                "prediction": predicted_label,  # Including prediction for completeness in history
            }
        )
    print(
        f"Logged prediction: {predicted_label} (Sensor {sensor_id}, Confidence {confidence_float:.2f}, Severity {severity})",
        file=sys.stderr,
    )

    # Return the results as a JSON response
    return {
        "prediction": predicted_label,
        "confidence": confidence_float,
        "timestamp": current_timestamp,
        "sensor_id": sensor_id,
        "severity": severity,
    }


@app.get(
    "/prediction_history", summary="Fetch All Prediction History"
)  # Renamed endpoint and summary
async def get_prediction_history():  # Renamed function
    """
    Fetches a history of all recorded prediction events, including both
    "Leak" and "Normal" predictions.

    Returns:
        list[dict]: A list of dictionaries, where each dictionary represents
                    a prediction event with its timestamp, sensor ID, confidence,
                    severity, and prediction.
    """
    async with prediction_history_lock:  # Acquire lock before accessing the shared list
        return list(
            prediction_history
        )  # Return a copy to prevent external modification
