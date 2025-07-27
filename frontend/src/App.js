import React, { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [userLocation, setUserLocation] = useState(null);
  const [userHeading, setUserHeading] = useState(null);
  const [angle, setAngle] = useState(0);
  const [permissionStatus, setPermissionStatus] = useState('unknown');
  const [distance, setDistance] = useState(null);
  const [calibrationOffset, setCalibrationOffset] = useState(0);
  const [lastStableHeading, setLastStableHeading] = useState(null);
  const rotationRef = useRef(0);
  const compassRef = useRef(null);
  const stabilityCountRef = useRef(0);
  
  // Target coordinates - 234 Nassau St #5, Princeton, NJ 08542
  const targetCoords = {
    latitude: 40.35209091502681,
    longitude: -74.6525577253915
  };

  // Calculate bearing using the same logic as geolib
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

  // Smooth rotation function
  const rotateCompass = (newAngle) => {
    if (compassRef.current) {
      rotationRef.current = newAngle;
      compassRef.current.style.transform = `rotate(${newAngle}deg)`;
      compassRef.current.style.transition = 'transform 0.3s ease-out';
    }
  };

  // Request location permission and start watching
  useEffect(() => {
    const startLocationTracking = async () => {
      if (!navigator.geolocation) {
        setPermissionStatus('not-supported');
        return;
      }

      try {
        // Request high accuracy location
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          });
        });

        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        
        setUserLocation(coords);
        setDistance(calculateDistance(coords, targetCoords));
        setPermissionStatus('granted');

        // Start watching position changes
        navigator.geolocation.watchPosition(
          (position) => {
            const newCoords = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            };
            setUserLocation(newCoords);
            setDistance(calculateDistance(newCoords, targetCoords));
          },
          (error) => console.log('Location watch error:', error),
          {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 1000
          }
        );

      } catch (error) {
        console.log('Location permission denied:', error);
        setPermissionStatus('denied');
      }
    };

    startLocationTracking();
  }, []);

  // Start device orientation tracking
  useEffect(() => {
    const handleOrientation = (event) => {
      let heading = null;
      
      if (event.webkitCompassHeading !== undefined) {
        heading = event.webkitCompassHeading;
      } else if (event.alpha !== null) {
        heading = event.alpha;
        if (navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')) {
          heading = 360 - heading;
        }
      }
      
      if (heading !== null) {
        setUserHeading(heading);
      }
    };

    const requestPermissionAndStart = async () => {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
          const permission = await DeviceOrientationEvent.requestPermission();
          if (permission === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
          }
        } catch (error) {
          console.log('Orientation permission denied:', error);
        }
      } else {
        window.addEventListener('deviceorientation', handleOrientation);
      }
    };

    if (permissionStatus === 'granted') {
      requestPermissionAndStart();
    }

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [permissionStatus]);

  // Auto-calibration and compass rotation
  useEffect(() => {
    if (userLocation && userHeading !== null) {
      const bearing = getGreatCircleBearing(userLocation, targetCoords);
      
      // Auto-calibrate on first stable reading or after significant drift
      if (lastStableHeading === null) {
        // Initial calibration - set offset so compass points to target
        const initialOffset = bearing - userHeading;
        setCalibrationOffset(initialOffset);
        setLastStableHeading(userHeading);
        stabilityCountRef.current = 0;
      } else {
        // Check for stability and potential recalibration need
        const headingDiff = Math.abs(userHeading - lastStableHeading);
        
        if (headingDiff < 5) {
          // Heading is stable, increment stability counter
          stabilityCountRef.current += 1;
          
          // After 10 stable readings, check if recalibration is needed
          if (stabilityCountRef.current >= 10) {
            const currentAngleWithOffset = bearing - userHeading - calibrationOffset;
            const normalizedCurrentAngle = ((currentAngleWithOffset % 360) + 360) % 360;
            
            // If compass is significantly off (more than 15 degrees), recalibrate
            if (Math.abs(normalizedCurrentAngle) > 15 && Math.abs(normalizedCurrentAngle - 360) > 15) {
              const newOffset = bearing - userHeading;
              setCalibrationOffset(newOffset);
              console.log('Auto-recalibrated compass');
            }
            
            stabilityCountRef.current = 0;
          }
        } else {
          // Heading changed significantly, reset stability counter
          stabilityCountRef.current = 0;
          setLastStableHeading(userHeading);
        }
      }
      
      // Calculate compass angle with calibration offset
      let newAngle = bearing - userHeading - calibrationOffset;
      
      // Normalize angle difference for smooth rotation
      let delta = newAngle - angle;
      while (delta > 180 || delta < -180) {
        if (delta > 180) {
          newAngle -= 360;
        } else if (delta < -180) {
          newAngle += 360;
        }
        delta = newAngle - angle;
      }
      
      // Only update if change is significant (reduces jitter)
      if (Math.abs(delta) > 2) {
        setAngle(newAngle);
        rotateCompass(newAngle);
      }
    }
  }, [userHeading, userLocation, angle, calibrationOffset, lastStableHeading]);

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
          {distance && (
            <div className="center-distance">
              {distance}m
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="instructions">
          {permissionStatus === 'unknown' && (
            <p>Requesting location and orientation permissions...</p>
          )}
          {permissionStatus === 'denied' && (
            <div>
              <p><strong>Location access required</strong></p>
              <p>Please enable location services and refresh the page</p>
            </div>
          )}
          {permissionStatus === 'not-supported' && (
            <p>Device orientation not supported on this device</p>
          )}
          {permissionStatus === 'granted' && !userLocation && (
            <p>Getting your location...</p>
          )}
          {permissionStatus === 'granted' && userLocation && userHeading === null && (
            <div>
              <p>Location found! Now requesting compass access...</p>
              <button onClick={requestPermissions} className="permission-btn">
                Enable Compass
              </button>
            </div>
          )}
          {permissionStatus === 'granted' && userLocation && userHeading !== null && (
            <div>
              <p>🧭 Compass active and pointing to target!</p>
              <p>📍 Distance: {distance}m</p>
              <p>🎯 Follow the arrow to reach your destination</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
