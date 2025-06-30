import onnxruntime as ort
import numpy as np
from PIL import Image
import io
import os
import sys

from fastapi import HTTPException  # Used for raising HTTP errors in preprocessing

# --- Configuration ---
# Path where your ONNX model is located
ONNX_MODEL_PATH = "resnet18_binary_finetuned.onnx"  # Updated model path
# Expected input dimensions for your model: (BatchSize, Channels, Height, Width)
TARGET_IMAGE_SIZE = (224, 224)  # (Height, Width) for the image
# Labels corresponding to your model's output (e.g., index 0 maps to "Normal", index 1 to "Leak")
CLASS_LABELS = ["Normal", "Leak"]

# Global variable to hold the ONNX inference session
# This avoids reloading the model for every request, improving performance.
onnx_session = None


def load_onnx_session():
    """
    Loads the ONNX model into an ONNX Runtime InferenceSession.
    If the specified model path does not exist, the application will terminate.
    """
    global onnx_session
    if not os.path.exists(ONNX_MODEL_PATH):
        print(
            f"Error: ONNX model not found at '{ONNX_MODEL_PATH}'. Aborting startup.",
            file=sys.stderr,
        )
        sys.exit(1)  # Exit the application if the model is not found

    try:
        # Load the ONNX model with the CPU execution provider.
        # If 'onnxruntime-gpu' is installed and a compatible GPU is available,
        # you can try using `providers=['CUDAExecutionProvider']` for GPU acceleration.
        onnx_session = ort.InferenceSession(
            ONNX_MODEL_PATH, providers=["CPUExecutionProvider"]
        )
        print(f"ONNX model '{ONNX_MODEL_PATH}' loaded successfully.", file=sys.stderr)
    except Exception as e:
        print(f"Failed to load ONNX model '{ONNX_MODEL_PATH}': {e}", file=sys.stderr)
        sys.exit(1)  # Exit the application if the model cannot be loaded


def preprocess_image(
    image_bytes: bytes, target_size: tuple = TARGET_IMAGE_SIZE
) -> np.ndarray:
    """
    Loads an image from raw bytes, converts it to RGB format, resizes it to the
    target dimensions, normalizes pixel values to the [0, 1] range, and reshapes
    it into the NCHW (Batch, Channels, Height, Width) format required by the ONNX model.

    Args:
        image_bytes (bytes): The raw bytes of the image file (e.g., from an uploaded PNG).
        target_size (tuple): A tuple (height, width) indicating the desired dimensions
                             for the image after resizing. Defaults to TARGET_IMAGE_SIZE.

    Returns:
        np.ndarray: The preprocessed image as a NumPy array with shape [1, 3, H, W],
                    ready to be fed into the ONNX model.

    Raises:
        HTTPException: If the image bytes are invalid or cannot be loaded/processed.
    """
    try:
        image_stream = io.BytesIO(image_bytes)
        # Convert image to RGB format (3 channels)
        img = Image.open(image_stream).convert("RGB")
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"Invalid image format or unable to load image: {e}"
        )

    # Resize the image using LANCZOS filter for high-quality downsampling
    img = img.resize(target_size, Image.LANCZOS)
    # Convert PIL Image to NumPy array and ensure float32 data type
    img_array = np.array(img).astype(np.float32)

    # Normalize pixel values from [0, 255] to [0, 1]
    img_array = img_array / 255.0

    # Transpose the array from HWC (Height, Width, Channels) to CHW (Channels, Height, Width)
    # This is a common requirement for many deep learning models.
    img_array = np.transpose(img_array, (2, 0, 1))

    # Add a batch dimension at the beginning: (C, H, W) -> (1, C, H, W)
    input_tensor = np.expand_dims(img_array, axis=0)

    return input_tensor


def softmax(x: np.ndarray) -> np.ndarray:
    """
    Computes the softmax function on a given NumPy array.
    Used to convert raw model logits into probabilities that sum to 1.

    Args:
        x (np.ndarray): The input array of logits (e.g., shape [1, 2] for binary classification).

    Returns:
        np.ndarray: The array with softmax applied, representing probabilities.
    """
    e_x = np.exp(
        x - np.max(x, axis=-1, keepdims=True)
    )  # Subtract max for numerical stability
    return e_x / e_x.sum(axis=-1, keepdims=True)


def process_model_output(
    raw_output_logits: np.ndarray, is_debug: bool = False
) -> tuple[str, str]:
    """
    Processes the raw output (logits) from the ONNX model to determine the
    predicted class label and its confidence.

    Args:
        raw_output_logits (np.ndarray): The raw output array from the ONNX model.
                                        Expected shape: [1, 2] for binary classification.
        is_debug (bool): If True, prints detailed inference results to standard error.

    Returns:
        tuple[str, str]: A tuple containing:
                         - predicted_label (str): The human-readable label of the predicted class.
                         - confidence (str): The confidence score (probability) of the predicted class,
                                             formatted as a string with two decimal places.
    """
    # Apply softmax to convert logits into probabilities.
    # This step is crucial if your model's last layer does not include a softmax activation.
    probabilities = softmax(raw_output_logits)

    # Get the index of the class with the highest probability.
    # [0] is used to extract the single index from the batch dimension (batch size 1).
    predicted_class_idx = np.argmax(probabilities, axis=1)[0]

    # Get the confidence score for the predicted class.
    confidence_float = probabilities[0, predicted_class_idx]

    # Map the numerical class index to its human-readable label.
    predicted_label = CLASS_LABELS[predicted_class_idx]

    if is_debug:
        print("\n--- Inference Results ---", file=sys.stderr)
        print(f"Raw model output (logits): {raw_output_logits[0]}", file=sys.stderr)
        print(f"Probabilities: {probabilities[0]}", file=sys.stderr)
        print(f"Predicted Class: {predicted_label}", file=sys.stderr)
        print(f"Confidence: {confidence_float:.2f}", file=sys.stderr)
        print("-------------------------", file=sys.stderr)

    # Format confidence as a string with two decimal places.
    confidence_str_2_digits = f"{confidence_float:.2f}"

    return predicted_label, confidence_str_2_digits


def run_onnx_inference(input_tensor: np.ndarray) -> np.ndarray:
    """
    Executes the ONNX model inference using the preloaded ONNX session.

    Args:
        input_tensor (np.ndarray): The preprocessed image tensor ready for the model.

    Returns:
        np.ndarray: The raw output logits from the ONNX model.

    Raises:
        HTTPException: If the ONNX session is not loaded or inference fails.
    """
    if onnx_session is None:
        # This state indicates an internal server error; model should be loaded at startup.
        raise HTTPException(
            status_code=500,
            detail="Model not loaded. Server internal error during inference.",
        )

    try:
        # Get the input name from the loaded ONNX session.
        input_name = onnx_session.get_inputs()[0].name
        # Run inference: `None` requests all outputs; provide input as a dictionary.
        raw_output_logits = onnx_session.run(None, {input_name: input_tensor})[0]
        return raw_output_logits
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error during ONNX model inference: {e}"
        )


def model_inference(image_bytes: bytes, debug_mode: bool = False) -> tuple[str, str]:
    """
    Orchestrates the entire inference process for a given image:
    1. Preprocesses the image bytes.
    2. Runs the ONNX model inference.
    3. Processes and interprets the model's output.

    Args:
        image_bytes (bytes): The raw bytes of the input image (e.g., from a PNG file).
        debug_mode (bool): If True, enables debug prints from `process_model_output`.

    Returns:
        tuple[str, str]: A tuple containing the predicted class label (string) and
                         the confidence score (string formatted to two decimal places).

    Raises:
        HTTPException: If any step (preprocessing, inference, or output handling) fails.
    """
    # 1. Preprocess the image bytes into an input tensor
    input_tensor = preprocess_image(image_bytes)
    # preprocess_image raises HTTPException directly on failure, so no explicit check needed here.

    # 2. Run ONNX model inference to get raw logits
    raw_output_logits = run_onnx_inference(input_tensor)

    # 3. Validate the shape of the raw output logits
    # The model is expected to return [1, 2] for binary classification.
    if raw_output_logits.shape != (1, 2):
        print(
            f"Warning: Model raw output shape mismatch: Expected (1, 2) but got {raw_output_logits.shape}",
            file=sys.stderr,
        )
        # Attempt to reshape if it's just a flat array of 2 elements, otherwise raise error.
        if raw_output_logits.size == 2:
            raw_output_logits = raw_output_logits.reshape(1, 2)
        else:
            raise HTTPException(
                status_code=500,
                detail=f"Unexpected model output shape: {raw_output_logits.shape}",
            )

    # 4. Process and interpret the model's output logits
    predicted_label, confidence = process_model_output(
        raw_output_logits, is_debug=debug_mode
    )
    return predicted_label, confidence
