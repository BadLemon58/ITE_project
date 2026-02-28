import { useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../supabaseClient';

export default function StudentDashboard() {
  const [isScanning, setIsScanning] = useState(false);
  const [message, setMessage] = useState('');
  const [manualId, setManualId] = useState('');
  const [showManual, setShowManual] = useState(false);
  
  // Use your real ID for testing
  const studentId = "2026-0001";

  const startScanner = async () => {
    setIsScanning(true);
    setMessage('');
    setShowManual(false);
    
    const html5QrCode = new Html5Qrcode("reader");

    try {
      // Get all cameras to ensure Brave "sees" the hardware
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        // Use the back camera (usually the last one in the list for Android)
        const cameraId = devices[devices.length - 1].id; 
        
        await html5QrCode.start(
          cameraId, 
          { fps: 10, qrbox: { width: 250, height: 250 } },
          async (decodedText) => {
            await html5QrCode.stop();
            setIsScanning(false);
            processScan(decodedText);
          }
        );
      } else {
        throw new Error("No cameras found.");
      }
    } catch (err) {
      console.error(err);
      setMessage("📸 Camera blocked or not found. Using Manual Entry.");
      setIsScanning(false);
      setShowManual(true);
    }
  };

  const processScan = async (decodedText) => {
    // The decodedText is expected as "EVENT_ID|TIMESTAMP"
    const parts = decodedText.split('|');
    if (parts.length !== 2) {
      setMessage("❌ Invalid QR format.");
      return;
    }

    const eventId = parts[0];
    const tokenTime = parseInt(parts[1]);
    const timeDifference = Date.now() - tokenTime;

    // 120,000ms = 2 minutes + 10s buffer
    if (timeDifference > 130000) {
      setMessage("❌ QR Code Expired! Get a fresh code from the Organizer.");
      return;
    }

    submitAttendance(eventId);
  };

  const submitAttendance = async (eventId) => {
    setMessage("⏳ Saving to Supabase...");

    const { error } = await supabase
      .from('attendance')
      .insert([{ event_id: eventId, student_id: studentId }]);

    if (error) {
      if (error.code === '23505') {
        setMessage("⚠️ Attendance already recorded for this event.");
      } else {
        setMessage(`❌ Error: ${error.message}`);
      }
    } else {
      setMessage(`✅ Success! Attendance logged for ${eventId}.`);
    }
  };

  return (
    <div className="card student-card">
      <h2>Student Portal</h2>
      <div className="student-info">
        <p>Student ID: <strong>{studentId}</strong></p>
      </div>

      {!isScanning && (
        <div className="action-buttons">
          <button className="btn btn-success" onClick={startScanner}>
            Open QR Scanner
          </button>
          <button className="btn btn-outline" onClick={() => setShowManual(!showManual)}>
            {showManual ? "Hide Manual Entry" : "Manual Event Entry"}
          </button>
        </div>
      )}

      {/* Manual Entry Form - Backup if Camera Fails */}
      {showManual && !isScanning && (
        <div className="manual-form">
          <input 
            type="text" 
            placeholder="Enter Event ID (e.g. EVT-101)" 
            value={manualId}
            onChange={(e) => setManualId(e.target.value.toUpperCase())}
            className="input-field"
          />
          <button className="btn btn-primary" onClick={() => submitAttendance(manualId)}>
            Submit ID
          </button>
        </div>
      )}

      {/* Camera Viewport */}
      <div id="reader" className={isScanning ? "scanner-active" : ""}></div>
      
      {message && <div className="message-box">{message}</div>}
    </div>
  );
}