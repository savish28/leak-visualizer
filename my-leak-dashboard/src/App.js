import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Tailwind CSS is loaded via CDN in the HTML wrapper for Canvas,
// so we don't need explicit imports here.

// --- Image Paths (relative to the public folder) ---
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

// --- Floor Plan Image Mapping (Now used as background for individual floor sections) ---
const FLOOR_PLAN_IMAGES = {
  'Floor 1': 'https://placehold.co/300x200/FFFFFF/FFFFFF', // Plain white background
  'Floor 2': 'https://placehold.co/300x200/FFFFFF/FFFFFF', // Plain white background
  'Manual': 'https://placehold.co/300x200/FFFFFF/FFFFFF', // Plain white background
  'All': 'https://placehold.co/300x200/FFFFFF/FFFFFF', // Plain white background
  'N/A': 'https://placehold.co/300x200/FFFFFF/FFFFFF', // Plain white background
};

// --- Pipe Layouts for each Floor ---
// These are abstract pipe representations. For very real visuals, use SVGs or detailed background images.
const PIPE_LAYOUTS = {
  'Floor 1': (
    <>
      {/* Floor 1 Specific Pipe Layout: A more complex grid-like structure with diagonals */}
      <div className="absolute left-1/4 top-0 w-4 h-full bg-gray-600 rounded-full shadow-md"></div>
      <div className="absolute left-3/4 top-0 w-4 h-full bg-gray-600 rounded-full shadow-md"></div>
      <div className="absolute top-1/4 left-0 w-full h-4 bg-gray-600 rounded-full shadow-md"></div>
      <div className="absolute top-3/4 left-0 w-full h-4 bg-gray-600 rounded-full shadow-md"></div>
      {/* Diagonal pipes */}
      <div className="absolute left-[50px] top-[50px] w-4 h-20 bg-gray-600 rounded-full shadow-md transform rotate-45" style={{ transformOrigin: 'top left' }}></div>
      <div className="absolute right-[50px] bottom-[50px] w-4 h-20 bg-gray-600 rounded-full shadow-md transform rotate-45" style={{ transformOrigin: 'bottom right' }}></div>
    </>
  ),
  'Floor 2': (
    <>
      {/* Floor 2 Specific Pipe Layout: More intersecting and diagonal pipes */}
      <div className="absolute left-1/2 -translate-x-1/2 top-0 h-full w-4 bg-gray-600 rounded-full shadow-md"></div>
      <div className="absolute top-1/2 -translate-y-1/2 left-0 w-full h-4 bg-gray-600 rounded-full shadow-md"></div>
      {/* Diagonal pipes */}
      <div className="absolute left-[20px] top-[20px] w-4 h-40 bg-gray-600 rounded-full shadow-md transform rotate-30" style={{ transformOrigin: 'top left' }}></div>
      <div className="absolute right-[20px] top-[20px] w-4 h-40 bg-gray-600 rounded-full shadow-md transform -rotate-30" style={{ transformOrigin: 'top right' }}></div>
      <div className="absolute left-[100px] bottom-[20px] w-40 h-4 bg-gray-600 rounded-full shadow-md transform rotate-15" style={{ transformOrigin: 'bottom left' }}></div>
    </>
  ),
  'Manual': (
    <>
      {/* Manual Floor Specific Pipe Layout: A more winding, diagonal path */}
      <div className="absolute left-[30px] top-[30px] w-4 h-30 bg-gray-600 rounded-full shadow-md transform rotate-60" style={{ transformOrigin: 'top left' }}></div>
      <div className="absolute left-[80px] top-[100px] w-40 h-4 bg-gray-600 rounded-full shadow-md transform -rotate-15" style={{ transformOrigin: 'top left' }}></div>
      <div className="absolute right-[30px] bottom-[30px] w-4 h-30 bg-gray-600 rounded-full shadow-md transform -rotate-60" style={{ transformOrigin: 'bottom right' }}></div>
    </>
  ),
  // Default layout for 'All' or 'N/A' if specific floor not found
  'Default': (
    <>
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-4 bg-gray-600 rounded-full shadow-md"></div>
      <div className="absolute left-1/2 -translate-x-1/2 top-0 h-full w-4 bg-gray-600 rounded-full shadow-md"></div>
    </>
  )
};


function App() {
  // Main state for the dashboard
  const [sensorStates, setSensorStates] = useState({}); // Stores current status and full metadata of all sensors
  const [allSensors, setAllSensors] = useState([]); // Stores all sensor configurations fetched from backend
  const [availableFloors, setAvailableFloors] = useState(['All']); // Dynamically populated floors

  const [predictionHistory, setPredictionHistory] = useState([]); // Full history for the table
  const [loading, setLoading] = useState(false); // For manual upload loading
  const [error, setError] = useState(null); // For errors

  // State for manual image upload functionality
  const [manualSelectedFile, setManualSelectedFile] = useState(null);
  const [manualSensorId, setManualSensorId] = useState('');
  const [manualLatestPrediction, setManualLatestPrediction] = useState(null);

  // State for Stream Control - Changed to false by default
  const [isStreaming, setIsStreaming] = useState(false);

  // State for filtering and sorting history table
  const [filterSeverity, setFilterSeverity] = useState('All');
  const [sortOrder, setSortOrder] = useState('Newest First');

  // State for Floor Selection
  const [selectedFloor, setSelectedFloor] = useState('All');
  const [currentFloorPlanImage, setCurrentFloorPlanImage] = useState(FLOOR_PLAN_IMAGES['All']);

  // State for hover details on schematic sensors
  const [hoveredSensor, setHoveredSensor] = useState(null);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });

  // --- New states for Sensor Interaction Panel ---
  const [selectedSensorDetails, setSelectedSensorDetails] = useState(null);
  const [isDetailsPanelOpen, setIsDetailsPanelOpen] = useState(false);
  const [sensorSpecificHistory, setSensorSpecificHistory] = useState([]);


  // Base URL for your FastAPI backend
  const API_BASE_URL = 'http://localhost:8001';

  // --- Fetch Prediction History (for main table and updating sensor dots) ---
  const fetchPredictionHistory = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/prediction_history`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`HTTP error! status: ${response.status} - ${errorData.detail || response.statusText}`);
      }
      const data = await response.json();

      setSensorStates(prevStates => {
        const newStates = { ...prevStates };
        let manualFloorAdded = false;
        data.forEach(item => {
          if (newStates[item.sensor_id]) {
            newStates[item.sensor_id] = {
              ...newStates[item.sensor_id],
              prediction: item.prediction,
              confidence: item.confidence,
              timestamp: item.timestamp,
              severity: item.severity,
              spectrogram_path: item.spectrogram_path,
            };
          } else {
            newStates[item.sensor_id] = {
              id: item.sensor_id,
              sensor_id: item.sensor_id,
              name: item.sensor_id,
              location_description: item.location_description || "Manual Upload",
              floor_reference: item.floor_reference || "Manual",
              x_coordinate: item.x_coordinate || -1,
              y_coordinate: item.y_coordinate || -1,
              prediction: item.prediction,
              confidence: item.confidence,
              timestamp: item.timestamp,
              severity: item.severity,
              spectrogram_path: item.spectrogram_path,
            };
            if (item.floor_reference === "Manual") {
              manualFloorAdded = true;
            }
          }
        });
        if (manualFloorAdded) {
          setAvailableFloors(prevFloors => {
            if (!prevFloors.includes("Manual")) {
              return [...prevFloors, "Manual"].sort();
            }
            return prevFloors;
          });
        }
        return newStates;
      });
      setPredictionHistory(data);
    } catch (e) {
      console.error("Failed to fetch prediction history:", e);
      setError(e.message || "Failed to load history.");
    }
  }, [API_BASE_URL]);


  // --- Fetch All Sensors on Component Mount and Initialize States (runs once) ---
  useEffect(() => {
    const fetchAllSensors = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/sensors`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(`Failed to fetch sensors: ${response.status} - ${errorData.detail || response.statusText}`);
        }
        const data = await response.json();
        setAllSensors(data);

        const floors = ['All', ...new Set(data.map(s => s.floor_reference))];
        setAvailableFloors(floors.sort());

        const initialStates = {};
        data.forEach(sensor => {
          initialStates[sensor.id] = {
            ...sensor,
            prediction: 'Unknown',
            confidence: 0,
            timestamp: null,
            severity: 'none',
            name: sensor.id.replace('sensor-', '').replace('-', ' ').toUpperCase(),
          };
        });
        setSensorStates(initialStates);

      } catch (err) {
        console.error("Error fetching all sensors:", err);
        setError(err.message || "Failed to load sensor configurations.");
      }
    };

    fetchAllSensors();
  }, [API_BASE_URL]); // Empty dependency array means this runs only once on mount

  // --- Initial fetch of prediction history after allSensors is available ---
  useEffect(() => {
    if (allSensors.length > 0) { // Ensure sensors are loaded before fetching history
      fetchPredictionHistory();
    }
  }, [allSensors, fetchPredictionHistory]);


  // --- Sensor Streaming Simulation ---
  const streamSensorData = useCallback(async (sensorConfig) => {
    const sendLeakImage = Math.random() > 0.5;
    const imagePaths = sendLeakImage ? LEAK_IMAGE_PATHS : NORMAL_IMAGE_PATHS;
    const randomImagePath = imagePaths[Math.floor(Math.random() * imagePaths.length)];

    try {
      const imageResponse = await fetch(randomImagePath);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image from ${randomImagePath}: ${imageResponse.statusText}`);
      }
      const imageBlob = await imageResponse.blob();

      const formData = new FormData();
      formData.append('file', imageBlob, randomImagePath.split('/').pop());
      formData.append('sensor_id', sensorConfig.id);

      const response = await fetch(`${API_BASE_URL}/api/predict`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Prediction failed for ${sensorConfig.id}: ${errorData.detail || response.statusText}`);
      }

      fetchPredictionHistory(); // Refresh history and update sensorStates after each prediction
    } catch (e) {
      console.error("Error during simulated prediction:", e);
      setError(e.message || `An unknown error occurred for ${sensorConfig.id}.`);
      setSensorStates(prevStates => ({
        ...prevStates,
        [sensorConfig.id]: {
          ...prevStates[sensorConfig.id],
          prediction: 'Error',
          severity: 'none',
          timestamp: new Date().toISOString(),
        },
      }));
    }
  }, [API_BASE_URL, fetchPredictionHistory]);

  // Effect to manage streaming intervals
  useEffect(() => {
    if (allSensors.length === 0) {
      return;
    }

    let intervals = [];
    if (isStreaming) {
      intervals = allSensors.map(config => {
        streamSensorData(config); // Initial call for each sensor
        return setInterval(() => streamSensorData(config), 5000);
      });
    }

    return () => {
      intervals.forEach(interval => clearInterval(interval));
    };
  }, [isStreaming, streamSensorData, allSensors]);


  // --- Fetch Sensor Specific History for Graph ---
  useEffect(() => {
    if (selectedSensorDetails) {
      const fetchSensorHistory = async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/sensors/${selectedSensorDetails.id}/history`);
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Failed to fetch sensor history: ${errorData.detail || response.statusText}`);
          }
          const data = await response.json();
          setSensorSpecificHistory(data);
        } catch (err) {
          console.error("Error fetching sensor history:", err);
        }
      };
      fetchSensorHistory();
    } else {
      setSensorSpecificHistory([]);
    }
  }, [selectedSensorDetails, API_BASE_URL]);

  // Handle manual file selection
  const handleManualFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'image/png') {
      setManualSelectedFile(file);
      setError(null);
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
    event.preventDefault();

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
      const response = await fetch(`${API_BASE_URL}/api/predict`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Manual prediction failed: ${errorData.detail || response.statusText}`);
      }

      const data = await response.json();
      setManualLatestPrediction(data);
      fetchPredictionHistory(); // Refresh history and update sensorStates
      setManualSelectedFile(null);
      setManualSensorId('');
      document.getElementById('manual-file-upload').value = '';
    } catch (e) {
      console.error("Error during manual prediction:", e);
      setError(e.message || "An unknown error occurred during manual prediction.");
      setManualLatestPrediction(null);
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort history for the main table
  const filteredAndSortedHistory = [...predictionHistory]
    .filter(item => {
      if (selectedFloor !== 'All' && item.floor_reference !== selectedFloor) return false;
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
        if (isALeak && !isBLeak) return -1;
        if (!isALeak && isBLeak) return 1;
        return b.confidence - a.confidence;
      }
      if (sortOrder === 'Confidence Low-High') {
        if (isALeak && !isBLeak) return -1;
        if (!isALeak && isBLeak) return 1;
        return a.confidence - b.confidence;
      }
      return 0;
    });


  // Component for displaying a single alert item in the history table
  const AlertItem = ({ prediction }) => {
    const isLeak = prediction.prediction === 'Leak';

    const cardClasses = `
      bg-white p-4 rounded-lg shadow-md mb-3 transition-all duration-300 ease-in-out
      ${prediction.severity === 'high' ? 'border-2 border-red-500 ring-4 ring-red-200' : 'border border-gray-200'}
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
          <span className="font-semibold">Location:</span> {prediction.location_description || 'N/A'}
        </p>
        <p className="text-sm text-gray-700">
          <span className="font-semibold">Floor:</span> {prediction.floor_reference || 'N/A'}
        </p>
        <p className="text-sm text-gray-700">
          <span className="font-semibold">Confidence:</span> {(prediction.confidence * 100).toFixed(2)}%
        </p>
        <p className="text-xs text-gray-500 mt-1">
          <span className="font-semibold">Time:</span> {prediction.timestamp ? new Date(prediction.timestamp).toLocaleString() : 'N/A'}
        </p>
        {prediction.spectrogram_path && (
          <div className="mt-2 text-center">
            <img
              src={`${API_BASE_URL}/spectrograms/${prediction.spectrogram_path.split('/').pop()}`}
              alt={`Spectrogram for ${prediction.sensor_id}`}
              className="w-24 h-24 object-cover rounded-md mx-auto border border-gray-200"
              onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/100x100/A0A0A0/FFFFFF?text=Image+Error'; }}
            />
            <p className="text-xs text-gray-500 mt-1">Spectrogram</p>
          </div>
        )}
      </div>
    );
  };

  // Sensor Dot Component for the schematic
  const SensorDot = ({ sensorData }) => {
    const isLeak = sensorData.prediction === 'Leak';
    const isError = sensorData.prediction === 'Error';

    const dotClasses = `
      absolute w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md cursor-pointer
      transition-colors duration-300
      ${isError ? 'bg-gray-500' : isLeak ? 'bg-red-500' : 'bg-green-500'}
      ${isLeak && 'animate-ping-once'}
    `;

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

    // Only render if coordinates are valid (not -1 for manual/unknown sensors)
    if (sensorData.x_coordinate === -1 || sensorData.y_coordinate === -1) {
      return null;
    }

    return (
      <div
        className={dotClasses}
        style={{ left: sensorData.x_coordinate, top: sensorData.y_coordinate, transform: 'translate(-50%, -50%)' }}
        onMouseEnter={(e) => {
          setHoveredSensor(sensorData);
          const rect = e.currentTarget.getBoundingClientRect();
          setHoverPosition({ x: rect.left + rect.width / 2, y: rect.top });
        }}
        onMouseLeave={() => setHoveredSensor(null)}
        onClick={() => {
          setSelectedSensorDetails(sensorData);
          setIsDetailsPanelOpen(true);
        }}
      >
        {sensorData.name ? sensorData.name.slice(-1) : sensorData.id.slice(-1)} {/* Displays last char of name/id */}
        <style jsx>{blinkAnimation}</style>
      </div>
    );
  };

  // Effect to update the floor plan image when selectedFloor changes
  useEffect(() => {
    setCurrentFloorPlanImage(FLOOR_PLAN_IMAGES[selectedFloor] || FLOOR_PLAN_IMAGES['N/A']);
  }, [selectedFloor]);


  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-200 p-6 font-inter">
      <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-xl overflow-hidden md:flex">

        {/* Left Section: Pipe Schematic & Manual Upload */}
        <div className="md:w-1/2 p-8 border-r border-gray-200 flex flex-col">
          <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">Leak Detection System Dashboard</h1>

          {/* Floor Selector */}
          <div className="mb-6 text-center">
            <label htmlFor="floor-selector" className="block text-sm font-medium text-gray-700 mb-2">Select Floor:</label>
            <select
              id="floor-selector"
              value={selectedFloor}
              onChange={(e) => setSelectedFloor(e.target.value)}
              className="block w-full max-w-xs mx-auto px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            >
              {availableFloors.map(floor => (
                <option key={floor} value={floor}>{floor}</option>
              ))}
            </select>
          </div>

          {/* Pipe Schematic Section */}
          <div className="mb-8 p-4 bg-gray-50 rounded-lg shadow-sm border border-gray-100 flex flex-col items-center flex-shrink-0">
            <h2 className="text-xl font-bold text-gray-700 mb-4 text-center">Live Sensor Status</h2>

            {selectedFloor === 'All' ? (
              // Display all floor plans separately
              <div className="w-full space-y-8">
                {availableFloors.filter(floor => floor !== 'All' && floor !== 'N/A').map(floor => (
                  <div key={floor} className="p-4 bg-white rounded-lg shadow-md border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-700 mb-3 text-center">{floor}</h3>
                    <div className="relative w-[300px] h-[200px] bg-gray-100 rounded-lg shadow-inner border border-gray-300 mx-auto overflow-hidden">
                      {/* Floor Plan Background Image */}
                      <img
                        src={FLOOR_PLAN_IMAGES[floor] || FLOOR_PLAN_IMAGES['N/A']}
                        alt={`${floor} Floor Plan`}
                        className="absolute inset-0 w-full h-full object-cover opacity-70"
                      />
                      {/* Pipe Layout for individual floor */}
                      {PIPE_LAYOUTS[floor] || PIPE_LAYOUTS['Default']}


                      {/* Sensor Dots filtered for this specific floor */}
                      {Object.values(sensorStates)
                        .filter(sensorData => sensorData.floor_reference === floor)
                        .map(sensorData => (
                          <SensorDot key={sensorData.sensor_id} sensorData={sensorData} />
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Display single selected floor plan
              <div className="relative w-[300px] h-[200px] bg-gray-100 rounded-lg shadow-inner border border-gray-300 flex-shrink-0 overflow-hidden">
                {/* Floor Plan Background Image */}
                <img
                  src={currentFloorPlanImage}
                  alt={`${selectedFloor} Floor Plan`}
                  className="absolute inset-0 w-full h-full object-cover opacity-70"
                />
                {/* Pipe Layout for single floor */}
                {PIPE_LAYOUTS[selectedFloor] || PIPE_LAYOUTS['Default']}

                {/* Sensor Dots - Filtered by selectedFloor */}
                {Object.values(sensorStates)
                  .filter(sensorData => selectedFloor === 'All' || sensorData.floor_reference === selectedFloor)
                  .map(sensorData => (
                    <SensorDot key={sensorData.sensor_id} sensorData={sensorData} />
                  ))}
              </div>
            )}

            {/* Sensor Details Popover on Hover (moved outside conditional rendering for consistent behavior) */}
            {hoveredSensor && (
              <div
                className="fixed bg-gray-800 text-white text-xs p-2 rounded-md shadow-lg z-50 transform -translate-x-1/2 -translate-y-full"
                style={{ left: hoverPosition.x, top: hoverPosition.y - 10 }}
              >
                <p><strong>ID:</strong> {hoveredSensor.sensor_id}</p>
                <p><strong>Location:</strong> {hoveredSensor.location_description || 'N/A'}</p>
                <p><strong>Floor:</strong> {hoveredSensor.floor_reference || 'N/A'}</p>
                <p><strong>Prediction:</strong> {hoveredSensor.prediction}</p>
                <p><strong>Confidence:</strong> {(hoveredSensor.confidence * 100).toFixed(2)}%</p>
                <p><strong>Severity:</strong> {hoveredSensor.severity.toUpperCase()}</p>
                <p><strong>Time:</strong> {hoveredSensor.timestamp ? new Date(hoveredSensor.timestamp).toLocaleString() : 'N/A'}</p>
              </div>
            )}

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

          {/* History List - Removed max-h-[700px] */}
          <div className="overflow-y-auto pr-2 custom-scrollbar">
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

      {/* Sensor Details Modal/Panel */}
      {isDetailsPanelOpen && selectedSensorDetails && (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto relative">
            <button
              onClick={() => setIsDetailsPanelOpen(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 text-2xl font-bold"
            >
              &times;
            </button>
            <h2 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">
              Sensor Details: {selectedSensorDetails.name || selectedSensorDetails.id}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Most Recent Prediction & Metadata */}
              <div>
                <h3 className="text-xl font-semibold text-gray-700 mb-3">Most Recent Prediction</h3>
                {selectedSensorDetails.prediction !== 'Unknown' ? (
                  <div className="bg-blue-50 p-4 rounded-md border border-blue-200">
                    <p className="text-lg font-bold mb-1">Prediction: <span className={selectedSensorDetails.prediction === 'Leak' ? 'text-red-600' : 'text-green-600'}>{selectedSensorDetails.prediction}</span></p>
                    <p className="text-sm text-gray-700"><span className="font-semibold">Confidence:</span> {(selectedSensorDetails.confidence * 100).toFixed(2)}%</p>
                    <p className="text-sm text-gray-700"><span className="font-semibold">Severity:</span> {selectedSensorDetails.severity.toUpperCase()}</p>
                    <p className="text-sm text-gray-700"><span className="font-semibold">Timestamp:</span> {selectedSensorDetails.timestamp ? new Date(selectedSensorDetails.timestamp).toLocaleString() : 'N/A'}</p>
                    <p className="text-sm text-gray-700"><span className="font-semibold">Location:</span> {selectedSensorDetails.location_description || 'N/A'}</p>
                    <p className="text-sm text-gray-700"><span className="font-semibold">Floor:</span> {selectedSensorDetails.floor_reference || 'N/A'}</p>
                  </div>
                ) : (
                  <p className="text-gray-500">No recent prediction data available for this sensor.</p>
                )}

                {/* Spectrogram Display */}
                <h3 className="text-xl font-semibold text-gray-700 mt-6 mb-3">Spectrogram</h3>
                {selectedSensorDetails.spectrogram_path ? (
                  <div className="text-center">
                    <img
                      src={`${API_BASE_URL}/spectrograms/${selectedSensorDetails.spectrogram_path.split('/').pop()}`}
                      alt={`Spectrogram for ${selectedSensorDetails.id}`}
                      className="w-48 h-48 object-cover rounded-md mx-auto border border-gray-300 shadow-md"
                      onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/200x200/A0A0A0/FFFFFF?text=Image+Error'; }}
                    />
                    <p className="text-sm text-gray-500 mt-2">Latest Spectrogram</p>
                  </div>
                ) : (
                  <p className="text-gray-500">No spectrogram available for the latest prediction.</p>
                )}
              </div>

              {/* Confidence History Graph */}
              <div>
                <h3 className="text-xl font-semibold text-gray-700 mb-3">Confidence History</h3>
                {sensorSpecificHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart
                      data={sensorSpecificHistory.map(item => ({
                        ...item,
                        timestamp: new Date(item.timestamp).toLocaleTimeString(), // Format for X-axis
                        confidence_percent: item.confidence * 100, // Convert to percentage
                      }))}
                      margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="timestamp" />
                      <YAxis domain={[0, 100]} label={{ value: 'Confidence (%)', angle: -90, position: 'insideLeft' }} />
                      <Tooltip formatter={(value, name, props) => [`${value.toFixed(2)}%`, `Confidence (${props.payload.prediction})`]} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="confidence_percent"
                        stroke="#8884d8"
                        activeDot={{ r: 8 }}
                        name="Confidence"
                      />
                      {/* Optional: Add another line or dots for leak/normal distinction if desired */}
                      {/* <Line type="monotone" dataKey="prediction" stroke="#82ca9d" /> */}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-gray-500">No historical data available for this sensor.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

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
