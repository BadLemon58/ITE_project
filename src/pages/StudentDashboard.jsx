import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../supabaseClient';

export default function StudentDashboard() {
  const [studentId, setStudentId] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [message, setMessage] = useState('');
  const [manualId, setManualId] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const scannerRef = useRef(null);

  useEffect(() => {
    const savedId = localStorage.getItem('qsams_student_id');
    if (savedId) {
      setStudentId(savedId);
      setIsRegistered(true);
    }
  }, []);

  const handleRegister = (e) => {
    e.preventDefault();
    const cleanId = studentId.trim();
    if (cleanId.length < 8) {
      setMessage("Invalid ID. It must be at least 8 characters long.");
      return;
    }
    localStorage.setItem('qsams_student_id', cleanId);
    setIsRegistered(true);
    setMessage("");
  };

  const handleLogout = () => {
    localStorage.removeItem('qsams_student_id');
    setIsRegistered(false);
    setStudentId('');
  };

  const startScanner = async () => {
  setIsScanning(true);
  setMessage('');
  const html5QrCode = new Html5Qrcode("reader");
  scannerRef.current = html5QrCode;
  try {
    await html5QrCode.start(
      { facingMode: "environment" },
       { fps: 10, qrbox: { width: 200, height: 200 } },
      async (decodedText) => {
        await html5QrCode.stop();
        setIsScanning(false);
        processScan(decodedText);
      }
    );
  } catch (err) {
    setMessage("Camera blocked.\nUse Manual Entry.");
    setIsScanning(false);
  }
};

 const cancelScanner = async () => {
  try {
    if (scannerRef.current) {
      await scannerRef.current.stop();
      scannerRef.current = null;
    }
  } catch (err) {
    // ignore stop errors
  }
  setIsScanning(false);
  };

  const processScan = (decodedText) => {
    const parts = decodedText.split('|');
    const scannedEventId = parts[0];
    const previouslyScannedId = localStorage.getItem(`scanned_${scannedEventId}`);

    if (previouslyScannedId) {
      if (previouslyScannedId === studentId) {
        setMessage("You have already recorded \nyour attendance for this event!");
      } else {
        setMessage("This device has already been used by another student.");
      }
      return;
    }

    if (parts.length === 2) {
      const qrTimestamp = parseInt(parts[1], 10);
      const currentTime = Date.now();
      if ((currentTime - qrTimestamp) > 35000) {
        setMessage("QR Code Expired! \nPlease scan the newest one on the screen.");
        return;
      }
    }

    localStorage.setItem(`scanned_${scannedEventId}`, studentId);
    submitAttendance(scannedEventId);
  };

  const handleManualSubmit = () => {
    if (!manualId.trim()) return;
    const cleanEventId = manualId.trim().toUpperCase();
    const previouslyScannedId = localStorage.getItem(`scanned_${cleanEventId}`);

    if (previouslyScannedId) {
      if (previouslyScannedId === studentId) {
        setMessage("You have already recorded \nyour attendance for this event!");
      } else {
        setMessage("This device has already been\n used by another student.");
      }
      return;
    }

   localStorage.setItem(`scanned_${cleanEventId}`, studentId);
  setManualId('');  
  submitAttendance(cleanEventId);
  };

  const submitAttendance = async (rawEventId) => {
    const cleanEventId = rawEventId.trim().toUpperCase();
    setIsLoading(true);
    setMessage('');

    const { error } = await supabase
      .from('attendance')
      .insert([{ event_id: cleanEventId, student_id: studentId }]);

    setIsLoading(false);

    if (error) {
      if (error.code === '23503') {
        setMessage(`Event "${cleanEventId}" is not found.`);
      } else if (error.code === '23505') {
        setMessage("You have already scanned for this event.");
      } else {
        setMessage(`Error: ${error.message}`);
      }
    } else {
  setMessage(`Success! Attendance logged for ${cleanEventId}.`);
  setTimeout(() => setMessage(''), 4000); // clears after 4 seconds
  }
  };


  if (!isRegistered) {
    return (
      <div className="card student-card">
        <h2>Student Registration</h2>
        <p style={{ color: '#666', fontSize: '0.85rem', margin: '-15px 0 20px 0', textAlign: 'center' }}>
          Enter your Student ID to continue
        </p>
        <div className="manual-form">
          <input
            type="text"
            placeholder="Enter Student ID"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="input-field"
          />
          <button onClick={handleRegister} className="btn btn-primary">Save ID</button>
        </div>
        {isLoading ? (
          <div className="message-box"><span className="spinner" /> Validating...</div>
        ) : (
          message && <div className="message-box" style={{ color: 'red', background: '#ffe6e6' }}>{message}</div>
        )}
      </div>
    );
  }

    return (
    <div className="card student-card">
      <div className="user-bar">
        <span>ID: {studentId}</span>
        <button onClick={handleLogout} className="logout-btn">Change ID</button>
      </div>

      {isScanning ? (
        // Scanner mode - only show scanner and cancel
        <>
          <div id="reader"></div>
          <button 
            className="btn btn-danger" 
            onClick={cancelScanner}
            style={{ marginTop: '10px' }}>
            Cancel
          </button>
        </>
      ) : (
        // Normal mode - show all content
        <>
          <h2>Student Portal</h2>
          <div className="action-buttons">
            <button className="btn btn-primary" onClick={startScanner}>Open QR Scanner</button>
            <button className="btn btn-outline" onClick={() => setShowManual(!showManual)}>
              {showManual ? "Hide Manual" : "Manual Entry"}
            </button>
          </div>
          {showManual && (
            <div className="manual-form">
              <input type="text" placeholder="Event ID"
                value={manualId} onChange={(e) => setManualId(e.target.value.toUpperCase())}
                className="input-field" />
              <button className="btn btn-primary" onClick={handleManualSubmit}>Submit</button>
            </div>
          )}
          {isLoading ? (
            <div className="message-box"><span className="spinner" /> Validating...</div>
          ) : (
            message && <div className="message-box">{message}</div>
          )}
        </>
      )}
    </div>
  );
}
