import React, { useState, useEffect, useCallback } from 'react';

// Tailwind CSS is loaded via CDN in the HTML wrapper for Canvas,
// so we don't need explicit imports here.

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [sensorId, setSensorId] = useState('');
  const [latestPrediction, setLatestPrediction] = useState(null);
  const [predictionHistory, setPredictionHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // State for filtering and sorting
  const [filterSeverity, setFilterSeverity] = useState('All'); // 'All', 'low', 'high', 'none'
  const [sortOrder, setSortOrder] = useState('Newest First'); // 'Newest First', 'Oldest First', 'Confidence High-Low', 'Confidence Low-High'

  // Base URL for your FastAPI backend
  const API_BASE_URL = 'http://localhost:8001'; // Ensure this matches your FastAPI server address

  // Function to fetch prediction history
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

  // Fetch history on component mount
  useEffect(() => {
    fetchPredictionHistory();
  }, [fetchPredictionHistory]);

  // Handle file selection
  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'image/png') {
      setSelectedFile(file);
      setError(null); // Clear previous errors
    } else {
      setSelectedFile(null);
      setError("Please select a valid PNG image file.");
    }
  };

  // Handle sensor ID input change
  const handleSensorIdChange = (event) => {
    setSensorId(event.target.value);
  };

  // Handle form submission for prediction
  const handleSubmit = async (event) => {
    event.preventDefault(); // Prevent default form submission

    if (!selectedFile || !sensorId) {
      setError("Please select an image and enter a sensor ID.");
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('sensor_id', sensorId);

    try {
      const response = await fetch(`${API_BASE_URL}/predict`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Prediction failed: ${errorData.detail || response.statusText}`);
      }

      const data = await response.json();
      setLatestPrediction(data);
      // After a successful prediction, refresh the history list
      fetchPredictionHistory();
      // Clear inputs
      setSelectedFile(null);
      setSensorId('');
      // Clear file input visually
      document.getElementById('file-upload').value = '';
    } catch (e) {
      console.error("Error during prediction:", e);
      setError(e.message || "An unknown error occurred during prediction.");
      setLatestPrediction(null);
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
          <span className="font-semibold">Time:</span> {new Date(prediction.timestamp).toLocaleString()}
        </p>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 to-purple-200 p-6 font-inter">
      <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-xl overflow-hidden md:flex">

        {/* Prediction Input & Latest Result Section */}
        <div className="md:w-1/2 p-8 border-r border-gray-200 flex flex-col">
          <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">Leak Detection System Dashboard</h1>

          {/* Upload Form */}
          <form onSubmit={handleSubmit} className="space-y-4 mb-8">
            <div>
              <label htmlFor="sensor-id" className="block text-sm font-medium text-gray-700">Sensor ID</label>
              <input
                type="text"
                id="sensor-id"
                value={sensorId}
                onChange={handleSensorIdChange}
                placeholder="e.g., sensor_001"
                required
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700">Upload PNG Image</label>
              <input
                type="file"
                id="file-upload"
                accept=".png"
                onChange={handleFileChange}
                required
                className="mt-1 block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-full file:border-0
                  file:text-sm file:font-semibold
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100"
              />
              {selectedFile && (
                <p className="mt-2 text-xs text-gray-500">Selected: {selectedFile.name}</p>
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
              {loading ? 'Predicting...' : 'Run Prediction'}
            </button>
          </form>

          {/* Latest Prediction Display */}
          <div className="mt-auto pt-6 border-t border-gray-200">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">Latest Prediction</h2>
            {latestPrediction ? (
              <AlertItem prediction={latestPrediction} />
            ) : (
              <p className="text-center text-gray-500">No prediction yet. Upload an image to start!</p>
            )}
          </div>
        </div>

        {/* Prediction History Section */}
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
          <div className="max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {filteredAndSortedHistory.length > 0 ? (
              filteredAndSortedHistory.map((prediction, index) => (
                <AlertItem key={index} prediction={prediction} />
              ))
            ) : (
              <p className="text-center text-gray-500">No history available. Make a prediction!</p>
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
      `}</style>
    </div>
  );
}

export default App;
