import React, { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [userLocation, setUserLocation] = useState(null);
  const [deviceHeading, setDeviceHeading] = useState(0);
  const [bearingToTarget, setBearingToTarget] = useState(0);
  const [permissionStatus, setPermissionStatus] = useState('unknown');
  const [distance, setDistance] = useState(null);
  const compassRef = useRef(null);
  
  // Target coordinates - 234 Nassau St #5, Princeton, NJ 08542
  const targetCoords = {
    latitude: 40.35209091502681,
    longitude: -74.6525577253915
  };

  // Calculate great circle bearing (same as geolib)
  const getGreatCircleBearing = (start, end) => {
    const startLat = start.latitude * Math.PI / 180;
    const startLng = start.longitude * Math.PI / 180;
    const endLat = end.latitude * Math.PI / 180;
    const endLng = end.longitude * Math.PI / 180;
    
    const dLng = endLng - startLng;
    
    const y = Math.sin(dLng) * Math.cos(endLat);
    const x = Math.cos(startLat) * Math.sin(endLat) - Math.sin(startLat) * Math.cos(endLat) * Math.cos(dLng);
    
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  };

  // Calculate distance using Haversine formula
  const calculateDistance = (start, end) => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (end.latitude - start.latitude) * Math.PI / 180;
    const dLng = (end.longitude - start.longitude) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(start.latitude * Math.PI / 180) * Math.cos(end.latitude * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return Math.round(R * c);
  };

  // Get current location
  useEffect(() => {
    if (!navigator.geolocation) {
      setPermissionStatus('not-supported');
      return;
    }

    navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const newLocation = { latitude, longitude };
        setUserLocation(newLocation);
        setDistance(calculateDistance(newLocation, targetCoords));
        
        const bearing = getGreatCircleBearing(newLocation, targetCoords);
        setBearingToTarget(bearing);
        setPermissionStatus('granted');
      },
      (error) => {
        console.log('Location error:', error);
        setPermissionStatus('denied');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000
      }
    );
  }, []);

  // Get device orientation
  useEffect(() => {
    const handleOrientation = (event) => {
      let heading = null;
      
      // Try webkitCompassHeading first (iOS)
      if (event.webkitCompassHeading !== undefined) {
        heading = event.webkitCompassHeading;
      } else if (event.alpha !== null) {
        heading = event.alpha;
        // Adjust for iOS devices
        if (navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')) {
          heading = 360 - heading;
        }
      }
      
      if (typeof heading === 'number') {
        setDeviceHeading(heading);
      }
    };

    const requestPermissionAndStart = async () => {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const permission = await DeviceOrientationEvent.requestPermission();
          if (permission === 'granted') {
            window.addEventListener('deviceorientationabsolute', handleOrientation, true);
            window.addEventListener('deviceorientation', handleOrientation, true);
          }
        } catch (error) {
          console.log('Orientation permission denied:', error);
        }
      } else {
        window.addEventListener('deviceorientationabsolute', handleOrientation, true);
        window.addEventListener('deviceorientation', handleOrientation, true);
      }
    };

    if (permissionStatus === 'granted') {
      requestPermissionAndStart();
    }

    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation);
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [permissionStatus]);

  // Calculate rotation for compass arrow with smoothing
  const [smoothedRotation, setSmoothedRotation] = useState(0);
  
  useEffect(() => {
    if (userLocation && deviceHeading !== null && bearingToTarget !== null) {
      const targetRotation = (bearingToTarget - deviceHeading + 360) % 360;
      
      setSmoothedRotation(prevRotation => {
        // Calculate the shortest angular distance
        let diff = targetRotation - prevRotation;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        
        // Apply smoothing - only move a fraction of the difference
        const smoothingFactor = 0.15; // Adjust this value (0.1-0.3) for more/less smoothing
        const newRotation = (prevRotation + diff * smoothingFactor + 360) % 360;
        
        return newRotation;
      });
    }
  }, [userLocation, deviceHeading, bearingToTarget]);

  // Apply rotation to compass
  useEffect(() => {
    if (compassRef.current && userLocation) {
      compassRef.current.style.transform = `rotate(${smoothedRotation}deg)`;
      compassRef.current.style.transition = 'transform 0.2s ease-out';
    }
  }, [smoothedRotation, userLocation]);

  const requestPermissions = async () => {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission === 'granted') {
          setPermissionStatus('granted');
        }
      } catch (error) {
        console.log('Permission request failed:', error);
      }
    } else {
      setPermissionStatus('granted');
    }
  };

  return (
    <div className="compass-app">
      <div className="compass-container">
        <div className="compass" ref={compassRef}>
          {/* Compass ring with tick marks */}
          <div className="compass-ring">
            {Array.from({ length: 8 }, (_, i) => {
              const isCardinal = i % 2 === 0;
              const angle = i * 45;
              
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

          {/* Distance display */}
          <div className="center-distance">
            {distance ? `${distance}m` : 'Ready'}
          </div>
        </div>

        {/* Instructions */}
        <div className="instructions">
          {permissionStatus === 'unknown' && (
            <p>Requesting location permissions...</p>
          )}
          {permissionStatus === 'denied' && (
            <div>
              <p><strong>Location access required</strong></p>
              <p>Please enable location services and refresh the page</p>
            </div>
          )}
          {permissionStatus === 'not-supported' && (
            <p>Geolocation not supported on this device</p>
          )}
          {permissionStatus === 'granted' && !userLocation && (
            <p>Getting your location...</p>
          )}
          {permissionStatus === 'granted' && userLocation && (
            <div>
              <p>🧭 Compass active and pointing to target!</p>
              <p>📍 Distance: {distance}m</p>
              <p>🎯 Follow the arrow to reach your destination</p>
              <button onClick={requestPermissions} className="permission-btn">
                Enable Compass
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
