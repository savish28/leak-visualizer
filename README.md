# **Leak Detection System**

This project implements a real-time leak detection system for a pipe network, combining a Python FastAPI backend for AI inference with a React frontend for visualization and control. The system processes simulated spectrograms from multiple sensors to identify "leak" or "normal" conditions and provides a comprehensive dashboard for monitoring and analysis.

## **Demo Video**

A short demo video showcasing the dashboard in use will be attached here.


## **Functionality**

The application provides the following key capabilities:

* **Real-time Sensor Monitoring:** Simulates multiple independent sensors strategically placed on a pipe network (U-shaped/corner configuration). Each sensor continuously streams simulated spectrogram data to the backend.  
* **AI-Powered Inference:** The FastAPI backend utilizes an ONNX (Open Neural Network Exchange) deep learning model (e.g., a fine-tuned ResNet18) to classify incoming spectrograms as either "leak" or "normal."  
* **Status Visualization:** The frontend dashboard visually maps sensor locations onto a pipe schematic. Sensor status is color-coded (green for normal, red blinking for leak) for immediate visual alerts.  
* **Interactive Sensor Details:** Hovering over individual sensors on the schematic displays real-time prediction details, including confidence, severity, and timestamp.  
* **Manual Prediction:** Users can manually upload their own PNG spectrograms to the API for on-demand inference and observation of results.  
* **Comprehensive History Log:** All prediction results (from both simulated streams and manual uploads) are logged, showing timestamp, sensor ID, confidence, and severity.  
* **Alert Prioritization:** "Leak" predictions are assigned a severity level ("low" or "high") based on confidence thresholds. High-severity alerts are prominently highlighted in the history list.  
* **History Management:** The prediction history can be filtered by severity and sorted by timestamp or confidence, enabling efficient analysis of past events.

## **System Design**

The system is designed with a clear separation of concerns, comprising two primary services orchestrated by Docker Compose:

### **1\. Frontend (React Application)**

* **Technology:** Built with React.js, leveraging modern hooks for state management and functional components.  
* **Styling:** Utilizes Tailwind CSS for a utility-first approach to responsive and aesthetically pleasing UI.  
* **Interaction:** Provides the user interface for monitoring sensor status, viewing prediction history, and performing manual image uploads.  
* **Communication:** Communicates with the FastAPI backend via HTTP requests (POST for predictions, GET for history).  
* **Deployment:** Served by a Node.js development server within its Docker container during development.

### **2\. Backend (FastAPI Application)**

* **Technology:** Developed using FastAPI, a modern, fast (high-performance) web framework for building APIs with Python 3.7+.  
* **AI Inference:** Integrates onnxruntime to efficiently run the pre-trained ONNX deep learning model for spectrogram classification.  
* **Data Handling:** Accepts PNG image files and sensor metadata as input. Processes the model's raw output (logits), applies softmax, and determines the predicted class, confidence, and severity.  
* **History Management:** Maintains an in-memory log of all prediction results. For production environments, this would typically be replaced by a persistent database (e.g., PostgreSQL, MongoDB).  
* **API Endpoints:** Exposes well-defined RESTful API endpoints for prediction (/api/predict) and history retrieval (/api/prediction\_history).  
* **CORS:** Configured with CORS middleware to allow cross-origin requests from the frontend.  
* **Deployment:** Runs using uvicorn, an ASGI server, within its Docker container.

### **Data Flow**

1. **Sensor Simulation/Manual Upload:**  
   * **Simulated Sensors:** The React frontend's useEffect hooks simulate sensor data streaming by programmatically fetching pre-defined leak\_x.png or normal\_x.png images from its public/images directory. These images, along with a sensor\_id, are sent as multipart/form-data to the backend's /api/predict endpoint every 5 seconds.  
   * **Manual Upload:** Users can manually select a PNG image and enter a sensor\_id via a form, which then sends the data to the same /api/predict endpoint.  
2. **Backend Processing:**  
   * The FastAPI backend receives the image and sensor ID.  
   * The image is preprocessed (resized, normalized, converted to NCHW format).  
   * The preprocessed image is fed into the ONNX model via onnxruntime for inference, yielding raw output logits.  
   * These logits are converted to probabilities using a softmax function.  
   * The highest probability determines the prediction ("Leak" or "Normal"), and a severity ("low", "high", "none") is assigned based on confidence thresholds for "Leak" predictions.  
   * The full prediction result (timestamp, sensor ID, confidence, severity, prediction) is logged in an in-memory list (prediction\_history).  
3. **Frontend Visualization:**  
   * The backend's /api/predict endpoint responds with the prediction result. The frontend updates the "Latest Manual Prediction" display (if applicable) and immediately triggers a refresh of the entire "Prediction History" by calling /api/prediction\_history.  
   * The /api/prediction\_history endpoint returns the comprehensive log.  
   * The React dashboard renders the prediction\_history list, applying filters and sorting as per user selection.  
   * Sensor dots on the pipe schematic update their color and blinking status based on the latest prediction received for that specific sensor ID.

## **Prerequisites**

Before running the application, ensure you have the following installed:

* **Docker Desktop:** Includes Docker Engine and Docker Compose.  
  * [Download Docker Desktop](https://www.docker.com/products/docker-desktop)  
* **Git** (optional, for cloning this repository)

## **Running the Application with Docker Compose**

1. Navigate to the Root Directory:  
   Open your terminal and navigate to the root directory of your project (where docker-compose.yml is located).  
2. Build and Run Services:  
   Execute the following command to build the Docker images for both frontend and backend services and start them:  
   ```
   docker compose up \--build
   ```

   * The \--build flag ensures that Docker Compose builds the images from their respective Dockerfiles. This will take some time on the first run as it downloads base images, installs dependencies, and builds the React app.  
3. Access the Dashboard:  
   Once both services are up and running (you'll see Uvicorn and React dev server logs in your terminal), open your web browser and navigate to:  
   http://localhost:3000  
   Your React frontend will be displayed, and it will begin streaming simulated sensor data to the backend, updating the pipe schematic and prediction history in real-time.

## **Debugging Logs**

When running with Docker Compose, logs from both your frontend and backend services are streamed directly to your terminal. This is the primary way to observe the application's behavior and diagnose issues.

* Viewing Live Logs:  
  The docker compose up command displays live logs from all services. You can identify logs from a specific service by their prefix (e.g., frontend\_1 | or backend\_1 |).  
* Viewing Logs from a Stopped Container:  
  If your containers have stopped, you can view their past logs using: 
  ``` 
  docker compose logs \[service\_name\]
  ```

  Replace \[service\_name\] with frontend or backend to see logs for a specific service.  
* Attaching to a Running Container:  
  To attach to a running container's process and see its output live (without stopping it first), you can use:  
  ```
  docker attach \[container\_id\_or\_name\]
  ```

  Find the container ID/name using docker ps. Remember to detach gracefully (e.g., Ctrl+P then Ctrl+Q) to avoid stopping the container.  
* Backend Logs (FastAPI):  
  The main.py and model\_inference.py files print informational messages and errors to sys.stderr, which will appear in your Docker Compose logs. Pay attention to messages like:  
  * ONNX model 'resnet18\_binary\_finetuned.onnx' loaded successfully.  
  * Error: ONNX model not found... (if the model file is missing)  
  * Logged prediction: ... (confirming API calls are processed)  
  * Error during ONNX model inference: ...  
* Frontend Logs (React):  
  Any console.log(), console.error(), etc., from your React App.jsx will appear in the frontend service logs. Browser console logs will also be visible directly in your browser's developer tools.

## **API Endpoints**

The FastAPI backend exposes the following API endpoints (all prefixed with /api):

* **GET /api/health**: Basic health check.  
* **POST /api/predict**: Accepts PNG image and sensor\_id for inference.  
  * **Inputs:** file (PNG), sensor\_id (string)  
  * **Outputs:** prediction (string), confidence (float), timestamp (string), sensor\_id (string), severity (string)  
* **GET /api/prediction\_history**: Retrieves all logged prediction results.

You can access the interactive API documentation (Swagger UI) at http://localhost:8001/docs.