import { useState, useEffect } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../supabaseClient';

export default function StudentDashboard() {
  const [studentId, setStudentId] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [message, setMessage] = useState('');
  const [manualId, setManualId] = useState('');
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    const savedId = localStorage.getItem('qsams_student_id');
    if (savedId) {
      setStudentId(savedId);
      setIsRegistered(true);
    }
  }, []);

  const handleRegister = (e) => {
    e.preventDefault();
    if (studentId.trim()) {
      localStorage.setItem('qsams_student_id', studentId);
      setIsRegistered(true);
    }
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
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        const cameraId = devices[devices.length - 1].id; 
        await html5QrCode.start(cameraId, { fps: 10, qrbox: 250 },
          async (decodedText) => {
            await html5QrCode.stop();
            setIsScanning(false);
            processScan(decodedText);
          }
        );
      }
    } catch (err) {
      setMessage("📸 Camera blocked. Use Manual Entry.");
      setIsScanning(false);
      setShowManual(true);
    }
  };

  const processScan = (decodedText) => {
    const parts = decodedText.split('|');
    if (parts.length !== 2) return setMessage("❌ Invalid QR format.");
    submitAttendance(parts[0]);
  };

  const submitAttendance = async (eventId) => {
    setMessage("⏳ Validating with NDMC Database...");
    const { error } = await supabase
      .from('attendance')
      .insert([{ event_id: eventId, student_id: studentId }]);

    if (error) {
      // Logic to change the error message based on the problem
      if (error.code === '23503') {
        setMessage(`❌ Error: Event "${eventId}" does not exist.`);
      } else if (error.code === '23505') {
        setMessage("⚠️ You have already scanned for this event.");
      } else {
        setMessage(`❌ Error: ${error.message}`);
      }
    } else {
      setMessage(`✅ Success! Attendance logged for ${eventId}.`);
    }
  };

  if (!isRegistered) {
    return (
      <div className="card student-card">
        <h2>Student Registration</h2>
        <form onSubmit={handleRegister} className="manual-form">
          <input type="text" placeholder="Enter ID (e.g. 2026-0001)" 
            value={studentId} onChange={(e) => setStudentId(e.target.value)}
            className="input-field" required />
          <button type="submit" className="btn btn-primary">Save ID</button>
        </form>
      </div>
    );
  }

  return (
    <div className="card student-card">
      <div className="user-bar">
        <span>ID: {studentId}</span>
        <button onClick={handleLogout} className="logout-btn">Change ID</button>
      </div>
      <h2>Student Portal</h2>
      {!isScanning && (
        <div className="action-buttons">
          <button className="btn btn-primary" onClick={startScanner}>Open QR Scanner</button>
          <button className="btn btn-outline" onClick={() => setShowManual(!showManual)}>
            {showManual ? "Hide Manual" : "Manual Entry"}
          </button>
        </div>
      )}
      {showManual && !isScanning && (
        <div className="manual-form">
          <input type="text" placeholder="Event ID (e.g. EVT-101)" 
            value={manualId} onChange={(e) => setManualId(e.target.value.toUpperCase())}
            className="input-field" />
          <button className="btn btn-primary" onClick={() => submitAttendance(manualId)}>Submit</button>
        </div>
      )}
      <div id="reader"></div>
      {message && <div className="message-box">{message}</div>}
    </div>
  );
}