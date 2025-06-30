import React, { useState, useEffect, useCallback, useRef } from 'react';

// Tailwind CSS is loaded via CDN in the HTML wrapper for Canvas,
// so we don't need explicit imports here.

// --- Sensor Configuration ---
// Define sensor locations and IDs. Locations are relative to the pipe schematic.
// Using a "U-shaped" or corner pipe configuration.
const SENSOR_CONFIGS = [
  { id: 'sensor-pipe-A', name: 'Pipe Sensor A', location: { x: 50, y: 50 } }, // Top-left corner
  { id: 'sensor-pipe-B', name: 'Pipe Sensor B', location: { x: 50, y: 150 } }, // Middle of vertical segment
  { id: 'sensor-pipe-C', name: 'Pipe Sensor C', location: { x: 150, y: 150 } }, // End of horizontal segment
];

// --- Image Paths (relative to the public folder) ---
// IMPORTANT: Place these images in your public/images/ directory
const LEAK_IMAGE_PATHS = [
  '/images/leak_1.png',
  '/images/leak_2.png',
  '/images/leak_3.png',
];

const NORMAL_IMAGE_PATHS = [
  '/images/normal_1.png',
  '/images/normal_2.png',
  '/images/normal_3.png',
];


function App() {
  // Main state for the dashboard
  const [sensorStates, setSensorStates] = useState(() => {
    // Initialize each sensor's state
    const initialState = {};
    SENSOR_CONFIGS.forEach(config => {
      initialState[config.id] = {
        prediction: 'Unknown',
        confidence: 0,
        timestamp: null,
        sensor_id: config.id,
        severity: 'none',
        location: config.location,
        name: config.name,
      };
    });
    return initialState;
  });

  const [predictionHistory, setPredictionHistory] = useState([]);
  const [loading, setLoading] = useState(false); // For manual upload loading
  const [error, setError] = useState(null); // For manual upload errors

  // State for manual image upload functionality
  const [manualSelectedFile, setManualSelectedFile] = useState(null);
  const [manualSensorId, setManualSensorId] = useState('');
  const [manualLatestPrediction, setManualLatestPrediction] = useState(null);

  // --- New State for Stream Control ---
  const [isStreaming, setIsStreaming] = useState(true); // Default to true (streaming active on load)


  // State for filtering and sorting history
  const [filterSeverity, setFilterSeverity] = useState('All');
  const [sortOrder, setSortOrder] = useState('Newest First');

  // State for hover/click details on schematic sensors
  const [hoveredSensor, setHoveredSensor] = useState(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });

  // Base URL for your FastAPI backend
  const API_BASE_URL = 'http://localhost:8001'; // Ensure this matches your FastAPI server address

  // Function to fetch prediction history (used on load and after new predictions)
  const fetchPredictionHistory = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/prediction_history`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setPredictionHistory(data);
    } catch (e) {
      console.error("Failed to fetch prediction history:", e);
      setError("Failed to load history.");
    }
  }, [API_BASE_URL]);

  // --- Sensor Streaming Simulation ---
  const streamSensorData = useCallback(async (sensorConfig) => {
    // Randomly decide whether to send a 'leak' or 'normal' image
    const sendLeakImage = Math.random() > 0.5;
    const imagePaths = sendLeakImage ? LEAK_IMAGE_PATHS : NORMAL_IMAGE_PATHS;
    const randomImagePath = imagePaths[Math.floor(Math.random() * imagePaths.length)];

    try {
      // Fetch the actual image data from the public folder
      const imageResponse = await fetch(randomImagePath);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image from ${randomImagePath}: ${imageResponse.statusText}`);
      }
      const imageBlob = await imageResponse.blob();

      const formData = new FormData();
      formData.append('file', imageBlob, randomImagePath.split('/').pop()); // Use the actual filename
      formData.append('sensor_id', sensorConfig.id);

      const response = await fetch(`${API_BASE_URL}/predict`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Prediction failed for ${sensorConfig.id}: ${errorData.detail || response.statusText}`);
      }

      const data = await response.json();
      // Update sensor state based on actual backend prediction
      setSensorStates(prevStates => ({
        ...prevStates,
        [sensorConfig.id]: {
          ...data, // prediction, confidence, timestamp, sensor_id, severity
          location: sensorConfig.location,
          name: sensorConfig.name,
        },
      }));
      fetchPredictionHistory(); // Refresh history after each prediction
    } catch (e) {
      console.error("Error during simulated prediction:", e);
      setError(e.message || `An unknown error occurred for ${sensorConfig.id}.`);
      setSensorStates(prevStates => ({
        ...prevStates,
        [sensorConfig.id]: {
          ...prevStates[sensorConfig.id],
          prediction: 'Error', // Indicate an error state for the sensor dot
          severity: 'none',
          timestamp: new Date().toISOString(),
        },
      }));
    }
  }, [API_BASE_URL, fetchPredictionHistory]);

  // Initial fetch and continuous streaming effect
  useEffect(() => {
    fetchPredictionHistory(); // Fetch once on mount

    let intervals = [];
    if (isStreaming) { // Only start intervals if streaming is enabled
      intervals = SENSOR_CONFIGS.map(config => {
        // Run immediately first time
        streamSensorData(config);
        // Then every 5 seconds
        return setInterval(() => streamSensorData(config), 5000);
      });
    }


    // Cleanup function to clear intervals
    return () => {
      intervals.forEach(interval => clearInterval(interval));
    };
  }, [isStreaming, streamSensorData, fetchPredictionHistory]); // Add isStreaming to dependencies

  // Handle manual file selection
  const handleManualFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'image/png') {
      setManualSelectedFile(file);
      setError(null); // Clear previous errors
    } else {
      setManualSelectedFile(null);
      setError("Please select a valid PNG image file.");
    }
  };

  // Handle manual sensor ID input change
  const handleManualSensorIdChange = (event) => {
    setManualSensorId(event.target.value);
  };

  // Handle manual form submission for prediction
  const handleManualSubmit = async (event) => {
    event.preventDefault(); // Prevent default form submission

    if (!manualSelectedFile || !manualSensorId) {
      setError("Please select an image and enter a sensor ID for manual prediction.");
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', manualSelectedFile);
    formData.append('sensor_id', manualSensorId);

    try {
      const response = await fetch(`${API_BASE_URL}/predict`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Manual prediction failed: ${errorData.detail || response.statusText}`);
      }

      const data = await response.json();
      setManualLatestPrediction(data);
      // After a successful prediction, refresh the history list
      fetchPredictionHistory();
      // Clear inputs
      setManualSelectedFile(null);
      setManualSensorId('');
      // Clear file input visually
      document.getElementById('manual-file-upload').value = '';
    } catch (e) {
      console.error("Error during manual prediction:", e);
      setError(e.message || "An unknown error occurred during manual prediction.");
      setManualLatestPrediction(null);
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort history
  const filteredAndSortedHistory = [...predictionHistory] // Create a copy to sort
    .filter(item => {
      if (filterSeverity === 'All') return true;
      return item.severity === filterSeverity;
    })
    .sort((a, b) => {
      if (sortOrder === 'Newest First') {
        return new Date(b.timestamp) - new Date(a.timestamp);
      }
      if (sortOrder === 'Oldest First') {
        return new Date(a.timestamp) - new Date(b.timestamp);
      }

      const isALeak = a.prediction === 'Leak';
      const isBLeak = b.prediction === 'Leak';

      if (sortOrder === 'Confidence High-Low') {
        // Leaks come before Normals
        if (isALeak && !isBLeak) return -1;
        if (!isALeak && isBLeak) return 1;
        // If both are the same type (both Leak or both Normal), sort by confidence (High to Low)
        return b.confidence - a.confidence;
      }
      if (sortOrder === 'Confidence Low-High') {
        // Leaks come before Normals
        if (isALeak && !isBLeak) return -1;
        if (!isALeak && isBLeak) return 1;
        // If both are the same type (both Leak or both Normal), sort by confidence (Low to High)
        return a.confidence - b.confidence;
      }
      return 0; // Default: no change
    });


  // Component for displaying a single alert item in the history
  const AlertItem = ({ prediction }) => {
    const isLeak = prediction.prediction === 'Leak';
    const isHighSeverity = prediction.severity === 'high';

    // Apply Tailwind classes for styling, including conditional highlighting
    const cardClasses = `
      bg-white p-4 rounded-lg shadow-md mb-3 transition-all duration-300 ease-in-out
      ${isHighSeverity ? 'border-2 border-red-500 ring-4 ring-red-200' : 'border border-gray-200'}
    `;
    const headerClasses = `font-bold text-lg mb-2 ${isLeak ? 'text-red-600' : 'text-green-600'}`;
    const badgeClasses = `
      inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
      ${prediction.severity === 'high' ? 'bg-red-100 text-red-800' :
        prediction.severity === 'low' ? 'bg-yellow-100 text-yellow-800' :
          'bg-gray-100 text-gray-800'}
    `;

    return (
      <div className={cardClasses}>
        <div className="flex justify-between items-center mb-2">
          <h3 className={headerClasses}>{prediction.prediction}</h3>
          <span className={badgeClasses}>{prediction.severity.toUpperCase()} SEVERITY</span>
        </div>
        <p className="text-sm text-gray-700">
          <span className="font-semibold">Sensor ID:</span> {prediction.sensor_id}
        </p>
        <p className="text-sm text-gray-700">
          <span className="font-semibold">Confidence:</span> {(prediction.confidence * 100).toFixed(2)}%
        </p>
        <p className="text-xs text-gray-500 mt-1">
          <span className="font-semibold">Time:</span> {prediction.timestamp ? new Date(prediction.timestamp).toLocaleString() : 'N/A'}
        </p>
      </div>
    );
  };

  // Sensor Dot Component for the schematic
  const SensorDot = ({ sensorData }) => {
    const isLeak = sensorData.prediction === 'Leak';
    const isHighSeverity = sensorData.severity === 'high';
    const isError = sensorData.prediction === 'Error';

    const dotClasses = `
      absolute w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md cursor-pointer
      transition-colors duration-300
      ${isError ? 'bg-gray-500' : isLeak ? 'bg-red-500' : 'bg-green-500'}
      ${isLeak && 'animate-ping-once'}
    `;

    // Define ping animation (for blinking effect)
    // Using inline style or a <style jsx> block for CSS animations in Canvas React
    const blinkAnimation = `
      @keyframes ping-once {
        0%, 100% {
          transform: scale(1) translate(-50%, -50%);
          opacity: 1;
        }
        50% {
          transform: scale(1.2) translate(-50%, -50%);
          opacity: 0.8;
        }
      }
      .animate-ping-once {
        animation: ping-once 1.5s infinite ease-out;
      }
    `;

    return (
      <div
        className={dotClasses}
        style={{ left: sensorData.location.x, top: sensorData.location.y, transform: 'translate(-50%, -50%)' }}
        onMouseEnter={(e) => {
          setHoveredSensor(sensorData);
          setHoverPosition({ x: e.clientX, y: e.clientY });
        }}
        onMouseLeave={() => setHoveredSensor(null)}
      >
        {sensorData.name.slice(-1)} {/* Displays 'A', 'B', 'C' */}
        <style jsx>{blinkAnimation}</style>
      </div>
    );
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-200 p-6 font-inter">
      <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-xl overflow-hidden md:flex">

        {/* Left Section: Pipe Schematic & Manual Upload */}
        <div className="md:w-1/2 p-8 border-r border-gray-200 flex flex-col">
          <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">Leak Detection System Dashboard</h1>

          {/* Pipe Schematic Section */}
          <div className="mb-8 p-4 bg-gray-50 rounded-lg shadow-sm border border-gray-100 flex flex-col items-center flex-shrink-0">
            <h2 className="text-xl font-bold text-gray-700 mb-4 text-center">Live Sensor Status</h2>
            <div className="relative w-[300px] h-[200px] bg-gray-100 rounded-lg shadow-inner border border-gray-300 flex-shrink-0">
              {/* Horizontal Pipe Segment */}
              <div className="absolute left-[50px] top-[50px] w-[200px] h-12 bg-gray-400 rounded-lg shadow-md"></div>
              {/* Vertical Pipe Segment */}
              <div className="absolute left-[50px] top-[50px] w-12 h-[100px] bg-gray-400 rounded-lg shadow-md"></div>
              {/* Corner connection */}
              <div className="absolute left-[50px] top-[140px] w-[100px] h-12 bg-gray-400 rounded-lg shadow-md"></div>

              {/* Sensor Dots */}
              {Object.values(sensorStates).map(sensorData => (
                <SensorDot key={sensorData.sensor_id} sensorData={sensorData} />
              ))}

              {/* Sensor Details Popover on Hover */}
              {hoveredSensor && (
                <div
                  className="absolute bg-gray-800 text-white text-xs p-2 rounded-md shadow-lg z-50 transform -translate-x-1/2 -translate-y-full"
                  style={{ left: hoverPosition.x - window.scrollX, top: hoverPosition.y - window.scrollY - 10 }}
                >
                  <p><strong>ID:</strong> {hoveredSensor.sensor_id}</p>
                  <p><strong>Prediction:</strong> {hoveredSensor.prediction}</p>
                  <p><strong>Confidence:</strong> {(hoveredSensor.confidence * 100).toFixed(2)}%</p>
                  <p><strong>Severity:</strong> {hoveredSensor.severity.toUpperCase()}</p>
                  <p><strong>Time:</strong> {hoveredSensor.timestamp ? new Date(hoveredSensor.timestamp).toLocaleString() : 'N/A'}</p>
                </div>
              )}
            </div>
            <div className="mt-6 text-gray-600 text-sm text-center">
              <p>Sensors simulate streaming data every 5 seconds.</p>
              <p>Red blinking = Leak detected | Green = Normal</p>
            </div>
            {/* Start/Stop Stream Buttons */}
            <div className="mt-4 flex space-x-4">
              <button
                onClick={() => setIsStreaming(true)}
                disabled={isStreaming}
                className="flex-1 py-2 px-4 rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Start Stream
              </button>
              <button
                onClick={() => setIsStreaming(false)}
                disabled={!isStreaming}
                className="flex-1 py-2 px-4 rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Stop Stream
              </button>
            </div>
          </div>

          {/* Manual Upload Section */}
          <div className="pt-6 border-t border-gray-200 flex-grow">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Manual Prediction Upload</h2>

            {/* Upload Form */}
            <form onSubmit={handleManualSubmit} className="space-y-4 mb-6">
              <div>
                <label htmlFor="manual-sensor-id" className="block text-sm font-medium text-gray-700">Sensor ID</label>
                <input
                  type="text"
                  id="manual-sensor-id"
                  value={manualSensorId}
                  onChange={handleManualSensorIdChange}
                  placeholder="e.g., manual_sensor_X"
                  required
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="manual-file-upload" className="block text-sm font-medium text-gray-700">Upload PNG Image</label>
                <input
                  type="file"
                  id="manual-file-upload"
                  accept=".png"
                  onChange={handleManualFileChange}
                  required
                  className="mt-1 block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-full file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100"
                />
                {manualSelectedFile && (
                  <p className="mt-2 text-xs text-gray-500">Selected: {manualSelectedFile.name}</p>
                )}
              </div>
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                  <span className="block sm:inline">{error}</span>
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Predicting...' : 'Run Manual Prediction'}
              </button>
            </form>

            {/* Latest Manual Prediction Display */}
            <div className="mt-auto pt-6 border-t border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Latest Manual Prediction</h2>
              {manualLatestPrediction ? (
                <AlertItem prediction={manualLatestPrediction} />
              ) : (
                <p className="text-center text-gray-500">No manual prediction yet. Upload an image above!</p>
              )}
            </div>
          </div>
        </div>

        {/* Right Section: Prediction History */}
        <div className="md:w-1/2 p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Prediction History</h2>

          {/* Filter and Sort Controls */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <label htmlFor="filter-severity" className="text-sm font-medium text-gray-700 whitespace-nowrap">Filter by Severity:</label>
              <select
                id="filter-severity"
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="All">All</option>
                <option value="high">High</option>
                <option value="low">Low</option>
                <option value="none">None</option>
              </select>
            </div>
            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <label htmlFor="sort-order" className="text-sm font-medium text-gray-700 whitespace-nowrap">Sort By:</label>
              <select
                id="sort-order"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              >
                <option value="Newest First">Newest First</option>
                <option value="Oldest First">Oldest First</option>
                <option value="Confidence High-Low">Confidence (High-Low)</option>
                <option value="Confidence Low-High">Confidence (Low-High)</option>
              </select>
            </div>
          </div>

          {/* History List */}
          <div className="max-h-[700px] overflow-y-auto pr-2 custom-scrollbar"> {/* Increased max-height */}
            {filteredAndSortedHistory.length > 0 ? (
              filteredAndSortedHistory.map((prediction, index) => (
                <AlertItem key={index} prediction={prediction} />
              ))
            ) : (
              <p className="text-center text-gray-500">No history available. Waiting for sensor data...</p>
            )}
          </div>
        </div>
      </div>
      {/* Custom Scrollbar Styling (Inline for Canvas compatibility) */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
        /* Keyframes for blinking effect */
        @keyframes ping-once {
          0%, 100% {
            transform: scale(1) translate(-50%, -50%);
            opacity: 1;
          }
          50% {
            transform: scale(1.2) translate(-50%, -50%);
            opacity: 0.8;
          }
        }
        .animate-ping-once {
          animation: ping-once 1.5s infinite ease-out;
        }
      `}</style>
    </div>
  );
}

export default App;
