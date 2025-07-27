import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [rotation, setRotation] = useState(0);
  const [deviceOrientation, setDeviceOrientation] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState('unknown');
  const [location, setLocation] = useState(null);
  const [bearingToStore, setBearingToStore] = useState(0);
  
  // Store coordinates
  const storeCoords = {
    lat: 40.35200908978224,
    lng: -74.65258456329845
  };
  const [magneticDeclination, setMagneticDeclination] = useState(0);

  useEffect(() => {
    // Request location for bearing calculation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const coords = {
            lat: latitude,
            lng: longitude
          };
          setLocation(coords);
          
          // Calculate bearing to store
          const bearing = calculateBearing(coords.lat, coords.lng, storeCoords.lat, storeCoords.lng);
          setBearingToStore(bearing);
        },
        (error) => {
          console.log('Location access denied:', error);
        }
      );
    }

    // Set up device orientation tracking
    const handleOrientation = (event) => {
      if (event.alpha !== null) {
        // Use the compass heading directly
        const heading = event.alpha;
        setDeviceOrientation(heading);
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
    };
  }, []);

  const calculateMagneticDeclination = (lat, lon) => {
    // Simplified magnetic declination calculation
    // This is a basic approximation - in production, use a proper geomagnetic model
    const year = new Date().getFullYear();
    const radLat = lat * Math.PI / 180;
    const radLon = lon * Math.PI / 180;
    
    // Very simplified calculation (real calculation requires complex geomagnetic models)
    const declination = Math.sin(radLat) * Math.cos(radLon) * 15;
    return declination;
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
            if (event.alpha !== null) {
              setDeviceOrientation(event.alpha);
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



        {/* Instructions */}
        <div className="instructions">
          {!location && (
            <p>Enable location services to point to store location</p>
          )}
          {location && permissionStatus === 'unknown' && (
            <p>Click compass to enable device orientation</p>
          )}
          {location && permissionStatus === 'denied' && (
            <p>Device orientation denied - compass won't rotate with device</p>
          )}
          {location && permissionStatus === 'granted' && (
            <p>Compass active - rotate your device to see it move!</p>
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
