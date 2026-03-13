import React, { useEffect, useState } from 'react';
import './LoadingScreen.css';

const LoadingScreen = ({ onSlideUp, onFinish }) => {
  const [isSlidingUp, setIsSlidingUp] = useState(false);
  const [isMounted, setIsMounted] = useState(true);

  useEffect(() => {
    // Start sliding up after 3.5 seconds
    const slideTimer = setTimeout(() => {
      setIsSlidingUp(true);
      if (onSlideUp) onSlideUp();
      
      // Remove from DOM after the slide transition (0.8s)
      const finishTimer = setTimeout(() => {
        setIsMounted(false);
        if (onFinish) onFinish();
      }, 800);
      
      return () => clearTimeout(finishTimer);
    }, 3500);

    return () => clearTimeout(slideTimer);
  }, [onSlideUp, onFinish]);

  if (!isMounted) return null;

  return (
    <div className={`loading-screen-overlay ${isSlidingUp ? 'slide-up' : ''}`}>
      <div className="loader-wrapper" id="qsams-loader">
        <svg width="220" height="200" viewBox="0 0 220 200">
          <circle className="q-ring" cx="95" cy="95" r="60" fill="none" stroke="#064e3b" strokeWidth="24" />
          <g className="qr-code-group" fill="#064e3b">
            <rect x="138" y="125" width="13" height="13" fill="none" stroke="#064e3b" strokeWidth="2"/>
            <rect x="141.5" y="128.5" width="6" height="6" />
            <rect x="162" y="125" width="13" height="13" fill="none" stroke="#064e3b" strokeWidth="2"/>
            <rect x="165.5" y="128.5" width="6" height="6" />
            <rect x="138" y="149" width="13" height="13" fill="none" stroke="#064e3b" strokeWidth="2"/>
            <rect x="141.5" y="152.5" width="6" height="6" />
            <rect x="154" y="125" width="5" height="4" />
            <rect x="154" y="132" width="5" height="4" />
            <rect x="138" y="141" width="4" height="5" />
            <rect x="145" y="140" width="3" height="6" />
            <rect x="151" y="139" width="6" height="4" />
            <rect x="160" y="141" width="8" height="4" />
            <rect x="171" y="140" width="4" height="5" />
            <rect x="154" y="146" width="4" height="6" />
            <rect x="161" y="148" width="5" height="5" />
            <rect x="169" y="148" width="6" height="6" />
            <rect x="159" y="156" width="4" height="6" />
            <rect x="166" y="156" width="5" height="3" />
            <rect x="165" y="161" width="4" height="4" />
            <rect x="154" y="155" width="3" height="4" />
          </g>
          <path className="q-tail" d="M 105 105 L 165 165" stroke="#22c55e" strokeWidth="20" strokeLinecap="square" />
          <line className="q-tail" x1="125" y1="175" x2="195" y2="160" stroke="#22c55e" strokeWidth="4" />
        </svg>
        <div className="qsams-text">QSAMS</div>
      </div>
    </div>
  );
};

export default LoadingScreen;
