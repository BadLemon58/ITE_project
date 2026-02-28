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

  // Check if Student ID is already saved in the browser
  useEffect(() => {
    const savedId = localStorage.getItem('qsams_student_id');
    if (savedId) {
      setStudentId(savedId);
      setIsRegistered(true);
    }
  }, []);

  // Save ID to local storage so they don't have to type it again
  const handleRegister = (e) => {
    e.preventDefault();
    if (studentId.trim()) {
      localStorage.setItem('qsams_student_id', studentId);
      setIsRegistered(true);
      setMessage("✅ ID Saved! You can now scan events.");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('qsams_student_id');
    setIsRegistered(false);
    setStudentId('');
    setMessage("ID cleared from this device.");
  };

  const startScanner = async () => {
    setIsScanning(true);
    setMessage('');
    setShowManual(false);
    const html5QrCode = new Html5Qrcode("reader");

    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
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
      } else { throw new Error("No cameras"); }
    } catch (err) {
      setMessage("📸 Camera blocked. Use Manual Entry.");
      setIsScanning(false);
      setShowManual(true);
    }
  };

  const processScan = (decodedText) => {
    const parts = decodedText.split('|');
    if (parts.length !== 2) {
      setMessage("❌ Invalid QR format.");
      return;
    }
    const eventId = parts[0];
    const tokenTime = parseInt(parts[1]);
    if (Date.now() - tokenTime > 130000) {
      setMessage("❌ QR Code Expired!");
      return;
    }
    submitAttendance(eventId);
  };

  const submitAttendance = async (eventId) => {
    setMessage("⏳ Saving...");
    const { error } = await supabase
      .from('attendance')
      .insert([{ event_id: eventId, student_id: studentId }]);

    if (error) {
      error.code === '23505' ? setMessage("⚠️ Already recorded.") : setMessage(`❌ ${error.message}`);
    } else {
      setMessage(`✅ Success! Logged into ${eventId}.`);
    }
  };

  // UI for Registration (if not remembered)
  if (!isRegistered) {
    return (
      <div className="card student-card">
        <h2>Student Registration</h2>
        <p>Enter your ID once to be remembered on this device.</p>
        <form onSubmit={handleRegister} className="manual-form">
          <input 
            type="text" 
            placeholder="e.g. 2026-0001" 
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="input-field"
            required
          />
          <button type="submit" className="btn btn-primary">Save & Continue</button>
        </form>
      </div>
    );
  }

  // UI for Scanner (if remembered)
  return (
    <div className="card student-card">
      <div style={{display: 'flex', justifyContent: 'space-between', width: '100%'}}>
        <small>ID: {studentId}</small>
        <button onClick={handleLogout} style={{background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontSize: '10px'}}>Change ID</button>
      </div>
      <h2>Student Portal</h2>

      {!isScanning && (
        <div className="action-buttons">
          <button className="btn btn-success" onClick={startScanner}>Open QR Scanner</button>
          <button className="btn btn-outline" onClick={() => setShowManual(!showManual)}>
            {showManual ? "Hide Manual" : "Manual Entry"}
          </button>
        </div>
      )}

      {showManual && !isScanning && (
        <div className="manual-form">
          <input 
            type="text" 
            placeholder="Event ID" 
            value={manualId}
            onChange={(e) => setManualId(e.target.value.toUpperCase())}
            className="input-field"
          />
          <button className="btn btn-primary" onClick={() => submitAttendance(manualId)}>Submit</button>
        </div>
      )}

      <div id="reader"></div>
      {message && <div className="message-box">{message}</div>}
    </div>
  );
}