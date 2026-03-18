import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '../supabaseClient';
import { logEvent } from '../lib/logEvent';

export default function StudentDashboard() {
  // --- State Management ---
  const [studentId, setStudentId] = useState('');
  const [isRegistered, setIsRegistered] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [message, setMessage] = useState('');
  const [manualId, setManualId] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [scanHistory, setScanHistory] = useState([]);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [fullHistory, setFullHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [pendingScan, setPendingScan] = useState(null);
  const scannerRef = useRef(null);
  const manualInputRef = useRef(null);

  // --- Helper: Success Feedback (Vibration & Audio) ---
  const triggerSuccessFeedback = () => {
    if ("vibrate" in navigator) {
      navigator.vibrate([100, 50, 100]);
    }

    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.1);

      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.2);
    } catch (e) {
      console.warn("Audio feedback failed", e);
    }
  };

  // --- Helper: Local Scan History ---
  const addToScanHistory = (eventId) => {
    const newScan = {
      eventId,
      timestamp: Date.now(),
      date: new Date().toLocaleString()
    };

    setScanHistory(prev => {
      const updated = [newScan, ...prev].slice(0, 10);
      localStorage.setItem('qsams_scan_history', JSON.stringify(updated));
      return updated;
    });
  };

  // --- Handler: Load Full Attendance History ---
  const loadFullHistory = async () => {
    if (isLoadingHistory) return;
    setIsLoadingHistory(true);
    setMessage('');

    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('event_id, created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setFullHistory(data || []);
      setShowFullHistory(true);
    } catch (error) {
      setMessage('Failed to load attendance history. Please try again.');
      logEvent('load_student_history_error', 'Failed to load student attendance history', {
        student_id: studentId,
        error_message: error.message,
      });
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // --- Effects: Initialization & Focus ---
  useEffect(() => {
    const savedId = localStorage.getItem('qsams_student_id');
    if (savedId) {
      setStudentId(savedId);
      setIsRegistered(true);
    }

    const savedHistory = localStorage.getItem('qsams_scan_history');
    if (savedHistory) {
      try {
        setScanHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.warn('Failed to parse scan history:', e);
      }
    }

    const params = new URLSearchParams(window.location.search);
    const scanParam = params.get('scan');
    if (scanParam) {
      setPendingScan(scanParam);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (isRegistered && pendingScan && studentId) {
      processScan(pendingScan);
      setPendingScan(null);
    }
  }, [isRegistered, pendingScan, studentId]);

  useEffect(() => {
    if (showManual && manualInputRef.current) {
      manualInputRef.current.focus();
    }
  }, [showManual]);

  // --- Effect: QR Scanner Lifecycle ---
  useEffect(() => {
    let html5QrCode = null;

    if (isScanning) {
      const startCamera = async () => {
        try {
          await new Promise(resolve => setTimeout(resolve, 200));

          const element = document.getElementById("reader");
          if (!element) {
            console.error("Scanner element not found");
            return;
          }

          html5QrCode = new Html5Qrcode("reader");
          scannerRef.current = html5QrCode;

          await html5QrCode.start(
            { facingMode: "environment" },
            {
              fps: 10,
              qrbox: { width: 250, height: 250 },
              aspectRatio: 1.0
            },
            async (decodedText) => {
              if (scannerRef.current) {
                try {
                  await scannerRef.current.stop();
                } catch (e) {
                  console.warn("Stop failed", e);
                }
                scannerRef.current = null;
              }
              setIsScanning(false);
              processScan(decodedText);
            }
          ).catch(err => {
            throw err;
          });
        } catch (err) {
          console.error("Scanner error:", err);
          setMessage("Camera blocked or failed.\nUse Manual Entry.");
          setIsScanning(false);
          logEvent('scanner_error', 'Camera blocked or failed to start', {
            error_message: err?.message ?? null,
          });
        }
      };

      startCamera();
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => { });
        scannerRef.current = null;
      }
    };
  }, [isScanning]);

  // --- Handlers: Registration & Logout ---
  const handleRegister = async (e) => {
    e.preventDefault();
    const cleanId = studentId.trim();
    if (cleanId.length < 8) {
      setMessage("Invalid ID. It must be at least 8 characters long.");
      return;
    }

    setIsLoading(true);
    setMessage('');

    // Validate student ID against Supabase students table
    const { data, error } = await supabase
      .from('students')
      .select('student_id')
      .eq('student_id', cleanId)
      .single();

    setIsLoading(false);

    if (error || !data) {
      setMessage("Student ID not valid. Please check your ID and try again.");
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

  // --- Handlers: Scanner Controls ---
  const startScanner = () => {
    setIsScanning(true);
    setMessage('');
  };

  const cancelScanner = () => {
    setIsScanning(false);
  };

  // --- Handler: QR Code Processing ---
  const processScan = async (decodedText) => {
    let token = decodedText;
    try {
      if (decodedText.startsWith("http://") || decodedText.startsWith("https://")) {
        const url = new URL(decodedText);
        const scanParam = url.searchParams.get("scan");
        if (scanParam) {
          token = scanParam;
        }
      }
    } catch (e) {
      // Ignored
    }

    const parts = token.split('|');
    const scannedEventId = parts[0];

    // Check timestamp expiry
    if (parts.length >= 2) {
      const qrTimestamp = parseInt(parts[1], 10);
      const currentTime = Date.now();
      if ((currentTime - qrTimestamp) > 35000) {
        setMessage("QR Code Expired! Please scan the newest one on the screen.");
        return;
      }
    }

    // Verify QR nonce against the database (Fix #5 - anti-forgery)
    if (parts.length >= 3) {
      const scannedNonce = parts[2];
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('current_token')
        .eq('event_id', scannedEventId)
        .single();

      if (eventError || !eventData) {
        setMessage(`Event "${scannedEventId}" not found.`);
        return;
      }

      if (eventData.current_token !== scannedNonce) {
        setMessage("QR Code expired! Please scan the newest one on the screen.");
        return;
      }
    }

    submitAttendance(scannedEventId);
  };

  // --- Handler: Manual Entry Submission ---
  const handleManualSubmit = async () => {
    if (!manualId.trim()) return;
    const cleanCode = manualId.trim().toUpperCase();
    setManualId('');
    
    setIsLoading(true);
    setMessage('');

    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .select('event_id')
      .eq('current_token', cleanCode)
      .single();

    if (eventError || !eventData) {
      setIsLoading(false);
      setMessage("Invalid or expired Event Code.");
      return;
    }

    submitAttendance(eventData.event_id);
  };

  // --- Handler: Database Attendance Submission ---
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
      logEvent('attendance_error', 'Attendance insert failed', {
        event_id: cleanEventId,
        student_id: studentId,
        error_message: error.message,
        error_code: error.code,
      });
    } else {
      triggerSuccessFeedback();
      addToScanHistory(cleanEventId);
      setMessage(`Success! Attendance logged for ${cleanEventId}.`);
      logEvent('attendance_success', 'Attendance logged', {
        event_id: cleanEventId,
        student_id: studentId,
      });
      setTimeout(() => setMessage(''), 4000);
    }
  };

  // --- Helper: Message Rendering ---
  const renderMessageWithLineBreaks = (text) => {
    const parts = text.split('\n');
    return parts.map((line, idx) => (
      <span key={idx}>
        {line}
        {idx < parts.length - 1 && <br />}
      </span>
    ));
  };


  // --- UI View: Registration ---
  if (!isRegistered) {
    return (
      <div className="card student-card">
        <h2>Student Registration</h2>
        <p style={{ color: '#666', fontSize: '0.85rem', margin: '-15px 0 20px 0', textAlign: 'center' }}>
          Enter your Student ID to continue
        </p>
        <div className="manual-form">
          <div className="input-container">
            <input
              type="text"
              required
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
            />
            <label>Enter Student ID</label>
          </div>
          <button onClick={handleRegister} className="btn btn-primary">Save ID</button>
        </div>
        {isLoading ? (
          <div className="message-box" role="status" aria-live="polite">
            <span className="spinner" /> Validating...
          </div>
        ) : (
          message && (
            <div
              className="message-box"
              role="alert"
              aria-live="assertive"
              style={{ color: 'red', background: '#ffe6e6' }}
            >
              {message}
            </div>
          )
        )}
      </div>
    );
  }


  // --- UI View: Student Portal ---
  return (
    <div className="card student-card">
      {!isScanning ? (
        <>
          <div className="user-bar">
            <span>ID: {studentId}</span>
            <button onClick={handleLogout} className="logout-btn">Change ID</button>
          </div>

          <h2>Student Portal</h2>
          <div className="action-buttons">
            <button className="btn btn-primary" onClick={startScanner}>Open QR Scanner</button>
            <button className="btn btn-outline" onClick={() => setShowManual(!showManual)}>
              {showManual ? "Hide Manual" : "Manual Entry"}
            </button>
          </div>
          {showManual && (
            <div className="manual-form">
              <div className="input-container">
                <input
                  type="text"
                  required
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value.toUpperCase())}
                  ref={manualInputRef}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleManualSubmit();
                    }
                  }}
                />
                <label>Event Code</label>
              </div>
              <button className="btn btn-primary" onClick={handleManualSubmit}>Submit</button>
              <p style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px' }}>
                Ask your organizer for the Event Code.
              </p>
            </div>
          )}


          {/* Detailed History Display */}
          {showFullHistory && (
            <div className="full-history" style={{ marginTop: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ fontSize: '1.1rem', margin: 0, color: '#333' }}>📚 Complete Attendance History</h3>
                <button
                  className="btn btn-outline"
                  onClick={() => setShowFullHistory(false)}
                  style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                >
                  ✕ Close
                </button>
              </div>
              <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '8px', padding: '10px' }}>
                {fullHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
                    No attendance records found.
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: '0.9rem', color: '#666', marginBottom: '10px' }}>
                      Total events attended: <strong>{fullHistory.length}</strong>
                    </div>
                    {fullHistory.map((record, index) => (
                      <div key={record.event_id + index} style={{
                        padding: '10px',
                        marginBottom: '8px',
                        backgroundColor: '#fafafa',
                        borderRadius: '6px',
                        border: '1px solid #eee',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>{record.event_id}</div>
                          <div style={{ fontSize: '0.8rem', color: '#666' }}>
                            {new Date(record.created_at).toLocaleString([], {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            })}
                          </div>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#28a745', fontWeight: 'bold' }}>
                          ✓ Attended
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="message-box" role="status" aria-live="polite">
              <span className="spinner" /> Validating...
            </div>
          ) : (
            message && (
              <div className="message-box" role="status" aria-live="polite">
                {renderMessageWithLineBreaks(message)}
              </div>
            )
          )}

          {!showFullHistory && (
            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <button
                className="btn btn-outline"
                onClick={loadFullHistory}
                disabled={isLoadingHistory}
                style={{ fontSize: '0.85rem', padding: '8px 16px' }}
              >
                {isLoadingHistory ? 'Loading...' : '📚 View Complete Attendance History'}
              </button>
            </div>
          )}
        </>
      ) : (
        // --- UI View: QR Scanner ---
        <>
          <h2>Scan QR Code</h2>
          <p style={{ fontSize: '0.9rem', color: '#555', marginBottom: '10px' }}>
            Align the QR code inside the box to record your attendance.
          </p>
          <div
            id="reader"
            style={{
              width: '100%',
              maxWidth: '420px',
              margin: '0 auto',
              background: '#f8f8f8',
              borderRadius: '12px',
              overflow: 'hidden',
              border: '1px solid #ddd'
            }}
          ></div>
          <button
            className="btn btn-danger"
            onClick={cancelScanner}
            style={{ marginTop: '15px', width: '100%' }}
          >
            Cancel
          </button>
          {message && (
            <div
              className="message-box"
              style={{ marginTop: '10px' }}
              role="status"
              aria-live="polite"
            >
              {renderMessageWithLineBreaks(message)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
