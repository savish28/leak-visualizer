# **Leak Detection Dashboard Frontend**

This project is a React-based web application that serves as a minimal frontend interface to interact with the ONNX Binary Classifier API. It allows users to upload PNG spectrograms, send them to the backend API for inference, and visualize the real-time prediction results.

## **Features**

* **Image Upload:** Easily upload .png spectrogram files.  
* **Sensor ID Input:** Associate predictions with a specific sensor.  
* **Real-time Prediction Display:** Shows the latest prediction (leak or normal) along with its confidence, timestamp, sensor ID, and calculated severity.  
* **Prediction History Log:** Maintains a list of all past predictions, providing a historical overview.  
* **Prioritized Alerts:** Highlights "high" severity leak alerts with a distinct red border for immediate attention.  
* **Filtering:** Filter the prediction history by severity level ("All", "High", "Low", "None").  
* **Sorting:** Sort the prediction history by timestamp ("Newest First", "Oldest First") or by confidence for leak predictions ("Confidence High-Low", "Confidence Low-High").  
* **Responsive Design:** Adapts to different screen sizes using Tailwind CSS.

## **Project Structure**
```
my-leak-dashboard/  
├── public/                 \# Public assets (e.g., index.html)  
├── src/  
│   ├── App.js              \# Main React component for the dashboard  
│   ├── index.js            \# React entry point  
│   └── index.css           \# Global CSS and Tailwind directives  
├── package.json            \# Project dependencies and scripts  
├── tailwind.config.js      \# Tailwind CSS configuration  
└── postcss.config.js       \# PostCSS configuration for Tailwind
```
## **Setup**

### **Prerequisites**

* Node.js (LTS version recommended) and npm (Node Package Manager).  
* Your FastAPI backend API must be running (typically on http://localhost:8001).

### **Installation**

1. **Clone the repository** (if applicable) or create a new React project:  
   ```
   npx create-react-app my-leak-dashboard  
   cd my-leak-dashboard
   ```

2. Replace src/App.js:  
   Copy the content of the React Leak Detection Dashboard immersive document into your project's src/App.js file.  
3. Install Frontend Dependencies:  
   Install React-specific dependencies, including Tailwind CSS:  
   ```
   npm install  
   npm install \-D tailwindcss postcss autoprefixer
   ```

## **How to Run**

1. Ensure your FastAPI Backend is Running:  
   Open a separate terminal and start your FastAPI application as described in its README.md (e.g., uvicorn main:app \--reload \--host 0.0.0.0 \--port 8001). The React app is configured to connect to http://localhost:8001.  
2. Start the React Development Server:  
   In the root directory of your React project, run:  
   npm start

   This will compile your React application and open it in your default web browser, usually at http://localhost:3000.

## **Interaction with Backend**

The frontend interacts with the FastAPI backend via two main API endpoints:

* **POST /predict**:  
  * Used when you submit the form to upload a PNG image and a sensor ID.  
  * The frontend sends a multipart/form-data request.  
  * The backend processes the image, runs the ONNX model, and returns the prediction result (label, confidence, timestamp, sensor ID, severity).  
* **GET /prediction\_history**:  
  * Used to fetch the complete history of predictions when the dashboard loads and after each new prediction.  
  * The frontend sends a simple GET request.  
  * The backend returns a JSON array of all recorded predictions.

CORS (Cross-Origin Resource Sharing) is enabled on the FastAPI backend to allow communication from this frontend application.