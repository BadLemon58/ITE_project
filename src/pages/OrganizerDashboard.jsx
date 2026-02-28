import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export default function OrganizerDashboard() {
  const [isActive, setIsActive] = useState(false);
  const [secureToken, setSecureToken] = useState('');
  const [timeLeft, setTimeLeft] = useState(120);
  const eventId = "EVT-101"; // Change this to your actual Event ID from Supabase

  useEffect(() => {
    let rotationInterval;
    let countdownInterval;

    if (isActive) {
      const generateToken = () => {
        const timestamp = Date.now();
        setSecureToken(`${eventId}|${timestamp}`);
        setTimeLeft(120);
      };
      
      generateToken();
      rotationInterval = setInterval(generateToken, 120000);
      countdownInterval = setInterval(() => {
        setTimeLeft((prev) => (prev > 0 ? prev - 1 : 120));
      }, 1000);
    }

    return () => {
      clearInterval(rotationInterval);
      clearInterval(countdownInterval);
    };
  }, [isActive]);

  return (
    <div className="card organizer-card">
      <h2>Organizer Panel</h2>
      <p>Active Event: <strong>{eventId}</strong></p>

      {!isActive ? (
        <button className="btn btn-primary" onClick={() => setIsActive(true)}>
          Start Secure Session
        </button>
      ) : (
        <>
          <button className="btn btn-danger" onClick={() => setIsActive(false)}>
            Stop Session
          </button>
          
          <div className="qr-container">
            <QRCodeSVG value={secureToken} size={250} level="H" />
            <div className="status-panel">
              <p>Next update in: <strong>{timeLeft}s</strong></p>
              <small className="token-text">{secureToken}</small>
            </div>
          </div>
        </>
      )}
    </div>
  );
}