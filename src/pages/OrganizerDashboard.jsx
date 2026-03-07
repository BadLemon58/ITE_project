import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../supabaseClient';

export default function OrganizerDashboard() {
  const [isActive, setIsActive] = useState(false);
  const [secureToken, setSecureToken] = useState('');
  const [timeLeft, setTimeLeft] = useState(30); 
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [eventId, setEventId] = useState(''); 
  const [durationInput, setDurationInput] = useState('15'); 
  const [sessionTimeLeft, setSessionTimeLeft] = useState(0); 

  useEffect(() => {
    let rotationInterval;
    let tickInterval;

    if (isActive && eventId) {
      const generateToken = () => {
        const timestamp = Date.now();
        setSecureToken(`${eventId.trim()}|${timestamp}`);
        setTimeLeft(30); 
      };
      
      generateToken();
      rotationInterval = setInterval(generateToken, 30000); 
      
      tickInterval = setInterval(() => {
        setTimeLeft((prev) => (prev > 0 ? prev - 1 : 30));
        
        setSessionTimeLeft((prevSession) => {
          if (prevSession <= 1) {
            clearInterval(rotationInterval); 
            return 0;
          }
          return prevSession - 1;
        });
      }, 1000);
    }

    return () => {
      clearInterval(rotationInterval);
      clearInterval(tickInterval);
    };
  }, [isActive, eventId]);

  const handleStartSession = async () => {
    const cleanEventId = eventId.trim();
    if (cleanEventId.length === 0) {
      alert("⚠️ Please enter an Event ID before starting.");
      return;
    }
    const duration = parseInt(durationInput, 10);
    if (isNaN(duration) || duration <= 0) {
      alert("⚠️ Please enter a valid duration in minutes.");
      return;
    }

    const { error } = await supabase
      .from('events')
      .upsert({ 
          event_id: cleanEventId, 
          event_name: `Session: ${cleanEventId}`, 
          event_date: new Date().toISOString().split('T')[0] 
        }, { onConflict: 'event_id' });

    if (error) {
      alert("❌ Database Error: " + error.message);
      return;
    }

    setSessionTimeLeft(duration * 60);
    setIsActive(true);
  };

  const formatTime = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };
  
  const exportToCSV = async () => {
    const { data, error } = await supabase
      .from('attendance')
      .select('student_id, created_at')
      .eq('event_id', eventId.trim());

    if (error) return alert("Error fetching data: " + error.message);
    if (data.length === 0) return alert("No records found.");

    let csvContent = "Student ID,Scan Time\n";
    data.forEach(row => {
      const time = new Date(row.created_at).toLocaleString();
      csvContent += `${row.student_id},"${time}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Attendance_${eventId}.csv`);
    link.click();
  };

  // --- FULLSCREEN VIEW ---
  if (isFullscreen && isActive) {
    return (
      <div className="fullscreen-overlay">
        <button className="btn-close-fullscreen" onClick={() => {
          setIsFullscreen(false);
          if (sessionTimeLeft === 0) setIsActive(false);
        }}> ✖ Exit Presentation </button>
        
        <h1 className="fullscreen-title">Event: {eventId.trim()}</h1>
        
        {sessionTimeLeft > 0 ? (
          <>
            <h2 style={{ color: '#cc0000', fontSize: '3rem', margin: '0 0 40px 0' }}>
              Session Ends In: {formatTime(sessionTimeLeft)}
            </h2>
            <QRCodeSVG value={secureToken} size={450} level="H" />
            <p className="fullscreen-timer">Next QR update in: <strong>{timeLeft}s</strong></p>
          </>
        ) : (
          <div className="cutoff-container">
            <h2 style={{ color: '#cc0000', fontSize: '5rem', fontWeight: '800' }}>ATTENDANCE CUT-OFF</h2>
            <p style={{ fontSize: '2rem', color: '#000' }}>The scanning period has ended.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card organizer-card">
      <h2>Organizer Panel</h2>
      {!isActive ? (
        <div className="manual-form">
          <input type="text" placeholder="Event ID" className="input-field" 
            value={eventId} onChange={(e) => setEventId(e.target.value.toUpperCase())} />
          <input type="number" placeholder="Duration (minutes)" className="input-field" 
            value={durationInput} onChange={(e) => setDurationInput(e.target.value)} />
          <button className="btn btn-primary" onClick={handleStartSession}>Start Secure Session</button>
        </div>
      ) : (
        <>
          <p style={{ backgroundColor: '#e0e0e0', color: '#000000', padding: '4px 10px', borderRadius: '6px', display: 'inline-block', margin: '0 0 5px 0' }}>
            Active Event: <strong>{eventId.trim()}</strong>
          </p>
          <p style={{ color: '#cc0000', fontWeight: 'bold', fontSize: '1.1rem', margin: '0 0 10px 0' }}>
            Time Left: {formatTime(sessionTimeLeft)}
          </p>
          
         <div style={{ display: 'flex', flexDirection: 'row', gap: '15px', alignItems: 'center', width: '100%' }}>
  
          {/* Left: QR Code */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto' }}>
            <QRCodeSVG value={secureToken} size={160} level="H" />
            <p style={{ backgroundColor: '#e0e0e0', color: '#000000', padding: '4px 8px', borderRadius: '6px', marginTop: '10px', fontSize: '0.85rem' }}>
              Next update: <strong>{timeLeft}s</strong>
            </p>
          </div>

          {/* Right: Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
            <button className="btn btn-outline" onClick={() => setIsFullscreen(true)}>📺 Fullscreen</button>
            <button className="btn btn-danger" onClick={() => setIsActive(false)}>Stop Session</button>
            <button className="btn btn-outline" onClick={exportToCSV}>📊 Export CSV</button>
          </div>

        </div>

        </>
      )}
    </div>
  );
}