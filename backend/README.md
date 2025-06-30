# **ONNX Binary Classifier API**

This project provides a FastAPI-based backend API for performing binary classification (e.g., "Leak" or "Normal") on uploaded PNG images using an ONNX (Open Neural Network Exchange) model. It logs all prediction results, including timestamps, sensor IDs, confidence scores, and severity levels.

## **Features**

* **Image Classification:** Classifies uploaded RGB PNG images into two categories (e.g., "Leak" and "Normal").  
* **ONNX Runtime:** Utilizes ONNX Runtime for efficient model inference.  
* **FastAPI Backend:** Provides a high-performance, easy-to-use API.  
* **Prediction History:** Logs all prediction results (both "Leak" and "Normal") with relevant metadata.  
* **Severity Determination:** Assigns a severity level ("low", "high", or "none") to "Leak" predictions based on confidence thresholds.  
* **Modular Design:** Code is split into main.py (FastAPI app) and model\_inference.py (core model logic) for better readability.  
* **Automatic Documentation:** FastAPI automatically generates interactive API documentation (Swagger UI).

## **Project Structure**

```
├── main.py                 \# FastAPI application definition and API endpoints  
├── model\_inference.py      \# Core logic for model loading, preprocessing, inference, and output processing  
└── resnet18\_binary\_finetuned.onnx \# Your ONNX model file (replace with your actual model)
```

## **Setup**

### **Prerequisites**
```
* Python 3.8+  
* pip (Python package installer)
```
### **Installation**

1. **Clone the repository** (if applicable) or create the project directory.  
2. **Navigate** into the project directory.  
3. **Create a virtual environment** (recommended):
```
   python \-m venv venv  
   source venv/bin/activate  \# On Windows: venv\\Scripts\\activate
```
4. **Install dependencies** from requirements.txt:  
```
   pip install \-r requirements.txt
```
5. Place your ONNX model:  
   Ensure your ONNX model file (resnet18\_binary\_finetuned.onnx) is located in the root of your project directory (the same directory as main.py and model\_inference.py).  
   Important: If the model file is not found at startup, the application will terminate, as there is no dummy model creation in this version.

## **How to Run**

1. **Start the FastAPI application:**  
```
   uvicorn main:app \--reload \--host 0.0.0.0 \--port 8000

   * main:app: Refers to the app object in main.py.  
   * \--reload: (Optional, for development) Automatically reloads the server on code changes.  
   * \--host 0.0.0.0: Makes the server accessible from other devices on your network.  
   * \--port 8000: Specifies the port for the server.
```

You should see output similar to this, indicating the server is running:INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)  
INFO:     FastAPI application startup: Loading ONNX model...  
ONNX model 'resnet18\_binary\_finetuned.onnx' loaded successfully.

## **API Endpoints**

Once the server is running, you can access the interactive API documentation (Swagger UI) at:  
http://localhost:8000/docs

### **1\. Health Check**

* **Endpoint:** GET /  
* **Description:** Basic health check to confirm the API is running.  
* **Response:**  
```
  {  
    "message": "ONNX Binary Classifier API is running. Go to /docs for interactive API documentation."  
  }
```
### **2\. Predict Leak/Normal from Image**

* **Endpoint:** POST /predict  
* **Description:** Upload a PNG image and a sensor ID to get a binary classification prediction (Leak/Normal) with confidence, timestamp, and severity.  
* **Parameters (Form Data):**  
  * file (File \- required): The PNG image file to be classified.  
  * sensor\_id (string \- required): A unique identifier for the sensor that captured the image.  
* **Response:**  
```
  {  
    "prediction": "leak",  
    "confidence": 0.94,  
    "timestamp": "2023-10-27T10:30:00.123456",  
    "sensor\_id": "sensor2",  
    "severity": "high"  
  }

  * prediction: "Normal" or "Leak".  
  * confidence: Probability of the predicted class (0.00 \- 1.00).  
  * timestamp: ISO formatted datetime of the prediction.  
  * sensor\_id: The ID of the sensor that provided the image.  
  * severity: "none", "low", or "high" based on leak confidence. (Thresholds are configured in main.py).
```
#### **Example curl Request:**

First, ensure you have a test\_image.png in your directory. If not, you can create a simple one:
```
from PIL import Image  
Image.new('RGB', (224, 224), color=(0, 0, 255)).save('test\_image.png') \# Creates a blue 224x224 PNG
```
Then, run the curl command:
```
curl \-X 'POST' \\  
  'http://localhost:8000/predict' \\  
  \-H 'accept: application/json' \\  
  \-H 'Content-Type: multipart/form-data' \\  
  \-F 'file=@test\_image.png;type=image/png' \\  
  \-F 'sensor\_id=sensorX\_123'
```
### **3\. Fetch All Prediction History**

* **Endpoint:** GET /prediction\_history  
* **Description:** Retrieves a log of all past prediction events (both "Leak" and "Normal").  
* Response:  
  A JSON array of prediction records:  
  ```
  \[  
    {  
      "timestamp": "2023-10-27T10:30:00.123456",  
      "sensor\_id": "sensor1",  
      "confidence": 0.98,  
      "severity": "none",  
      "prediction": "Normal"  
    },  
    {  
      "timestamp": "2023-10-27T10:31:05.789012",  
      "sensor\_id": "sensor2",  
      "confidence": 0.94,  
      "severity": "high",  
      "prediction": "Leak"  
    }  
    // ... more prediction records  
  \]
  ```

## **Development and Deployment**

* **Local Development:** Use uvicorn main:app \--reload for auto-reloading.  
* Production Deployment: For production, it's recommended to use a robust WSGI server like Gunicorn with Uvicorn workers.  
  Example: gunicorn \-w 4 \-k uvicorn.workers.UvicornWorker main:app \-b 0.0.0.0:8000 (Install gunicorn separately).  
* **Containerization:** The application can be easily containerized using Docker. A Dockerfile can be created to build an image for deployment.  
* **Scalability:** For high-traffic applications, consider deploying behind a reverse proxy (e.g., Nginx) and using Kubernetes or similar orchestration tools for horizontal scaling.