import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';

function App() {
  const [rotation, setRotation] = useState(0);
  const [deviceOrientation, setDeviceOrientation] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState('unknown'); // 'unknown', 'granted', 'denied', 'not-supported'
  const [lastHeading, setLastHeading] = useState(null);
  const [smoothedHeading, setSmoothedHeading] = useState(null);
  const [headingBuffer, setHeadingBuffer] = useState([]);
  const [location, setLocation] = useState(null);
  const [bearingToStore, setBearingToStore] = useState(0);
  const animationFrameRef = useRef(null);
  const pendingHeadingRef = useRef(null);
  const [calibrationOffset, setCalibrationOffset] = useState(0);
  const [isCalibrating, setIsCalibrating] = useState(false);
  
  // Store coordinates
  const storeCoords = {
    lat: 40.35200908978224,
    lng: -74.65258456329845
  };
  const [magneticDeclination, setMagneticDeclination] = useState(0);

  // Optimized smoothing function with useCallback
  const smoothHeading = useCallback((newHeading, previousSmoothed, buffer) => {
    // Simple but effective exponential smoothing
    if (previousSmoothed === null) {
      return { smoothed: newHeading, buffer: [newHeading] };
    }
    
    // Calculate shortest angular distance
    let diff = newHeading - previousSmoothed;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    
    // Adaptive smoothing based on movement speed
    const movementSpeed = Math.abs(diff);
    let smoothingFactor;
    
    if (movementSpeed > 30) {
      smoothingFactor = 0.7; // Very responsive for fast movements
    } else if (movementSpeed > 10) {
      smoothingFactor = 0.4; // Moderately responsive
    } else {
      smoothingFactor = 0.2; // Smooth for small movements
    }
    
    const smoothed = previousSmoothed + diff * smoothingFactor;
    const normalizedSmoothed = ((smoothed % 360) + 360) % 360;
    
    // Keep a small buffer for additional stability
    const newBuffer = [...buffer, newHeading].slice(-3);
    
    return { smoothed: normalizedSmoothed, buffer: newBuffer };
  }, []);
  
  // Throttled update function using requestAnimationFrame
  const updateOrientation = useCallback((heading) => {
    pendingHeadingRef.current = heading;
    
    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(() => {
        const latestHeading = pendingHeadingRef.current;
        if (latestHeading !== null) {
          setHeadingBuffer(currentBuffer => {
            setSmoothedHeading(currentSmoothed => {
              const result = smoothHeading(latestHeading, currentSmoothed, currentBuffer);
              setDeviceOrientation(result.smoothed);
              return result.smoothed;
            });
            const result = smoothHeading(latestHeading, smoothedHeading, currentBuffer);
            return result.buffer;
          });
        }
        animationFrameRef.current = null;
        pendingHeadingRef.current = null;
      });
    }
  }, [smoothHeading, smoothedHeading]);

  useEffect(() => {
    // Request high-precision location for bearing calculation
    if (navigator.geolocation) {
      const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      };
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const coords = {
            lat: latitude,
            lng: longitude
          };
          setLocation(coords);
          
          // Calculate magnetic declination for this location
          const declination = calculateMagneticDeclination(latitude, longitude);
          setMagneticDeclination(declination);
          
          // Calculate bearing to store
          const bearing = calculateBearing(coords.lat, coords.lng, storeCoords.lat, storeCoords.lng);
          setBearingToStore(bearing);
        },
        (error) => {
          console.log('Location access denied:', error);
          // Fallback to less precise location
          navigator.geolocation.getCurrentPosition(
            (position) => {
              const { latitude, longitude } = position.coords;
              const coords = {
                lat: latitude,
                lng: longitude
              };
              setLocation(coords);
              
              const declination = calculateMagneticDeclination(latitude, longitude);
              setMagneticDeclination(declination);
              
              const bearing = calculateBearing(coords.lat, coords.lng, storeCoords.lat, storeCoords.lng);
              setBearingToStore(bearing);
            },
            (fallbackError) => {
              console.log('Fallback location also failed:', fallbackError);
            }
          );
        },
        options
      );
    }

    // Set up device orientation tracking with improved smoothing
    const handleOrientation = (event) => {
      let heading = null;
      
      // iOS devices often provide webkitCompassHeading for better accuracy
      if (event.webkitCompassHeading !== undefined) {
        // webkitCompassHeading is more accurate on iOS
        heading = event.webkitCompassHeading;
      } else if (event.alpha !== null) {
        // For other devices, use alpha but adjust for iOS
        heading = event.alpha;
        // On iOS, alpha might need to be inverted
        if (navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')) {
          heading = 360 - heading;
        }
      }
      
      if (heading !== null) {
          // Apply calibration offset and magnetic declination
          const adjustedHeading = (heading + calibrationOffset + magneticDeclination + 360) % 360;
          updateOrientation(adjustedHeading);
          setLastHeading(adjustedHeading);
        }
    };

    // Check if device orientation is supported
    if (window.DeviceOrientationEvent) {
      // For iOS 13+ devices, request permission
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission()
          .then(response => {
            if (response === 'granted') {
              window.addEventListener('deviceorientation', handleOrientation);
              setPermissionStatus('granted');
            } else {
              setPermissionStatus('denied');
            }
          })
          .catch(() => setPermissionStatus('denied'));
      } else {
        // For other devices, start listening immediately
        window.addEventListener('deviceorientation', handleOrientation);
        setPermissionStatus('granted');
      }
    } else {
      setPermissionStatus('not-supported');
    }

    // Cleanup
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      // Cancel any pending animation frame
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [updateOrientation]);

  const calculateMagneticDeclination = (lat, lon) => {
    // Improved magnetic declination calculation using IGRF model approximation
    const year = new Date().getFullYear();
    const radLat = lat * Math.PI / 180;
    const radLon = lon * Math.PI / 180;
    
    // More accurate approximation based on location
    // This is still simplified - real applications should use NOAA or IGRF APIs
    let declination = 0;
    
    // North America approximation
    if (lat >= 25 && lat <= 70 && lon >= -170 && lon <= -50) {
      declination = -14.0 + (lat - 40) * 0.2 + (lon + 100) * 0.1;
    }
    // Europe approximation
    else if (lat >= 35 && lat <= 70 && lon >= -10 && lon <= 40) {
      declination = 2.0 + (lat - 50) * 0.15 + (lon - 15) * 0.05;
    }
    // General world approximation
    else {
      declination = Math.sin(radLat) * Math.cos(radLon) * 12 + Math.cos(radLat) * 3;
    }
    
    return declination;
  };
  
  // Calibration function
  const calibrateCompass = () => {
    if (lastHeading !== null && bearingToStore !== null) {
      setIsCalibrating(true);
      // Calculate the offset needed to align current heading with true bearing to store
      const currentBearing = (bearingToStore - lastHeading + 360) % 360;
      setCalibrationOffset(currentBearing);
      
      setTimeout(() => {
        setIsCalibrating(false);
      }, 2000);
    }
  };
  
  // Reset calibration
  const resetCalibration = () => {
    setCalibrationOffset(0);
  };

  // Calculate bearing from current location to store
  const calculateBearing = (lat1, lng1, lat2, lng2) => {
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    
    const y = Math.sin(dLng) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
    
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360; // Normalize to 0-360
  };

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1, lng1, lat2, lng2) => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in kilometers
  };



  const currentRotation = deviceOrientation !== null ? deviceOrientation : rotation;

  // Handle permission request for iOS devices
  const requestOrientationPermission = async () => {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission === 'granted') {
          setPermissionStatus('granted');
          // Start listening for orientation changes
          const handleOrientation = (event) => {
            let heading = null;
            
            // iOS devices often provide webkitCompassHeading for better accuracy
            if (event.webkitCompassHeading !== undefined) {
              heading = event.webkitCompassHeading;
            } else if (event.alpha !== null) {
              heading = event.alpha;
              // On iOS, alpha might need to be inverted
              if (navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')) {
                heading = 360 - heading;
              }
            }
            
            if (heading !== null) {
              // Apply calibration offset and magnetic declination
              const adjustedHeading = (heading + calibrationOffset + magneticDeclination + 360) % 360;
              updateOrientation(adjustedHeading);
              setLastHeading(adjustedHeading);
            }
          };
          window.addEventListener('deviceorientation', handleOrientation);
        } else {
          setPermissionStatus('denied');
        }
      } catch (error) {
        setPermissionStatus('denied');
      }
    }
  };

  return (
    <div className="compass-app">
      <div className="compass-container">
        <div 
          className="compass" 
          style={{
            transform: `rotate(${-currentRotation + bearingToStore}deg)`
          }}
          onClick={requestOrientationPermission}
        >
          {/* Directional tick marks */}
          <div className="compass-ring">
            {Array.from({ length: 8 }, (_, i) => {
              const isCardinal = i % 2 === 0; // N, E, S, W are at even indices
              const angle = i * 45;
              
              // Replace the north tick (0 degrees) with store direction arrow
              if (i === 0) {
                return (
                  <div
                    key={i}
                    className="store-arrow"
                    style={{ transform: `rotate(0deg)` }}
                  />
                );
              }
              
              return (
                <div
                  key={i}
                  className={`tick-mark ${isCardinal ? 'cardinal-tick' : 'intercardinal-tick'}`}
                  style={{ transform: `rotate(${angle}deg)` }}
                />
              );
            })}
          </div>

          {/* No cardinal direction labels for minimal design */}
          
          {/* Distance display in center */}
          {location && (
            <div className="center-distance">
              {Math.round(calculateDistance(location.lat, location.lng, storeCoords.lat, storeCoords.lng) * 1000)}m
            </div>
          )}
        </div>



        {/* Calibration Controls */}
        {location && permissionStatus === 'granted' && (
          <div className="calibration-controls">
            <button 
              onClick={calibrateCompass}
              disabled={isCalibrating}
              className={`calibrate-btn ${isCalibrating ? 'calibrating' : ''}`}
            >
              {isCalibrating ? '🔄 Calibrating...' : '🧭 Calibrate Compass'}
            </button>
            <button 
              onClick={resetCalibration}
              className="reset-btn"
            >
              ↻ Reset
            </button>
          </div>
        )}

        {/* Instructions */}
        <div className="instructions">
          {!location && (
            <div>
              <p><strong>Enable Location Services:</strong></p>
              <p>📱 iPhone: Go to Settings → Privacy & Security → Location Services → Safari (or your browser) → Allow "While Using App"</p>
              <p>Then refresh this page</p>
            </div>
          )}
          {location && permissionStatus === 'unknown' && (
            <p>Click compass to enable device orientation</p>
          )}
          {location && permissionStatus === 'denied' && (
            <p>Device orientation denied - compass won't rotate with device</p>
          )}
          {location && permissionStatus === 'granted' && (
            <div>
              <p>Compass active - rotate your device to see it move!</p>
              <p>📱 If compass doesn't point correctly, use the calibrate button above</p>
              <p>💡 For best accuracy: move your phone in a figure-8 motion, then calibrate</p>
            </div>
          )}
          {location && permissionStatus === 'not-supported' && (
            <p>Device orientation not supported on this device</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
