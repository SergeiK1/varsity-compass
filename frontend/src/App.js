// App.js
import React, { useState, useRef, useEffect } from 'react';
import { getGreatCircleBearing, getDistance } from 'geolib';
import './App.css';

function App() {
  const [userLocation, setUserLocation] = useState(null);
  const [deviceHeading, setDeviceHeading] = useState(0);
  const [bearingToTarget, setBearingToTarget] = useState(0);
  const [distance, setDistance] = useState(null);
  const [permissionStatus, setPermissionStatus] = useState('unknown');
  const [smoothedRotation, setSmoothedRotation] = useState(0);
  const compassRef = useRef(null);
  const lastHeadingRef = useRef(null);

  // Target coords
  const TARGET = {
    latitude: 40.35209091502681,
    longitude: -74.6525577253915,
  };

  // Helpers
  const getScreenAngle = () =>
    (window.screen.orientation?.angle ?? window.orientation ?? 0);

  // 1️⃣ Watch Position
  useEffect(() => {
    if (!navigator.geolocation) {
      setPermissionStatus('not-supported');
      return;
    }

    navigator.geolocation.watchPosition(
      ({ coords }) => {
        const loc = { latitude: coords.latitude, longitude: coords.longitude };
        setUserLocation(loc);
        setDistance(getDistance(loc, TARGET));
        setBearingToTarget(getGreatCircleBearing(loc, TARGET));
        setPermissionStatus('granted');
      },
      () => setPermissionStatus('denied'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 }
    );
  }, []);

  // 2️⃣ Handle Device Orientation
  useEffect(() => {
    const handleOrientation = (e) => {
      // pick true‑north when available
      let raw = e.absolute === true
        ? e.alpha
        : e.webkitCompassHeading ?? null;
      if (raw == null) return;

      // compensate for display rotation
      const heading = (raw + getScreenAngle() + 360) % 360;

      // jitter threshold
      if (
        lastHeadingRef.current != null &&
        Math.abs(heading - lastHeadingRef.current) < 1
      ) {
        return;
      }
      lastHeadingRef.current = heading;
      setDeviceHeading(heading);
    };

    const initOrientation = async () => {
      if (DeviceOrientationEvent.requestPermission) {
        try {
          const perm = await DeviceOrientationEvent.requestPermission();
          if (perm !== 'granted') return;
        } catch {
          return;
        }
      }
      window.addEventListener('deviceorientationabsolute', handleOrientation, true);
      window.addEventListener('deviceorientation', handleOrientation, true);
    };

    if (permissionStatus === 'granted') initOrientation();
    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation);
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, [permissionStatus]);

  // 3️⃣ Smooth rotation toward target
  useEffect(() => {
    if (userLocation == null) return;
    const targetRot = (bearingToTarget - deviceHeading + 360) % 360;
    setSmoothedRotation((prev) => {
      let diff = targetRot - prev;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;
      return (prev + diff * 0.15 + 360) % 360;
    });
  }, [bearingToTarget, deviceHeading, userLocation]);

  // 4️⃣ Apply to DOM
  useEffect(() => {
    if (compassRef.current) {
      compassRef.current.style.transform = `rotate(${smoothedRotation}deg)`;
      compassRef.current.style.transition = 'transform 0.2s ease-out';
    }
  }, [smoothedRotation]);

  // Permission button for iOS
  const requestPermissions = async () => {
    if (DeviceOrientationEvent.requestPermission) {
      const perm = await DeviceOrientationEvent.requestPermission();
      if (perm === 'granted') setPermissionStatus('granted');
    } else {
      setPermissionStatus('granted');
    }
  };

  return (
    <div className="compass-app">
      <div className="compass-container">
        <div className="compass" ref={compassRef}>
          <div className="compass-ring">
            {Array.from({ length: 8 }).map((_, i) => {
              const angle = i * 45;
              const isCardinal = i % 2 === 0;
              return (
                <div
                  key={i}
                  className={`tick-mark ${isCardinal ? 'cardinal' : 'intercardinal'}`}
                  style={{ transform: `rotate(${angle}deg)` }}
                />
              );
            })}
            <div className="store-arrow" />{/* your arrow graphic */}
          </div>
          <div className="center-distance">
            {distance != null ? `${distance} m` : 'Ready'}
          </div>
        </div>

        <div className="instructions">
          {permissionStatus === 'unknown' && <p>Requesting location…</p>}
          {permissionStatus === 'denied' && <p>Location required. Refresh and enable.</p>}
          {permissionStatus === 'not-supported' && <p>Geolocation not supported.</p>}
          {permissionStatus === 'granted' && !userLocation && <p>Acquiring location…</p>}
          {permissionStatus === 'granted' && userLocation && (
            <>
              <p>🧭 Compass active!</p>
              <p>📍 {distance} m to target</p>
              <button onClick={requestPermissions} className="permission-btn">
                Enable Compass
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
