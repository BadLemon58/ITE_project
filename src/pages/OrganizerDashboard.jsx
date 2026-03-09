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
  const [isMobile, setIsMobile] = useState(false);

  const clearOrganizerSessionStorage = () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('qsams_organizer_event_id');
    localStorage.removeItem('qsams_organizer_session_start');
    localStorage.removeItem('qsams_organizer_session_duration_minutes');
  };

  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== 'undefined') {
        setIsMobile(window.innerWidth <= 768);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Restore active session if it exists and hasn't expired
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const savedEventId = localStorage.getItem('qsams_organizer_event_id');
    const startedAtStr = localStorage.getItem('qsams_organizer_session_start');
    const durationStr = localStorage.getItem('qsams_organizer_session_duration_minutes');

    if (!savedEventId || !startedAtStr || !durationStr) return;

    const durationMinutes = parseInt(durationStr, 10);
    const startedAt = parseInt(startedAtStr, 10);

    if (isNaN(durationMinutes) || isNaN(startedAt)) {
      clearOrganizerSessionStorage();
      return;
    }

    const totalSeconds = durationMinutes * 60;
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000);
    const remainingSeconds = totalSeconds - elapsedSeconds;

    if (remainingSeconds <= 0) {
      clearOrganizerSessionStorage();
      return;
    }

    setEventId(savedEventId);
    setDurationInput(String(durationMinutes));
    setSessionTimeLeft(remainingSeconds);
    setIsActive(true);
  }, []);

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
            clearOrganizerSessionStorage();
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

    const startedAt = Date.now();

    if (typeof window !== 'undefined') {
      localStorage.setItem('qsams_organizer_event_id', cleanEventId);
      localStorage.setItem('qsams_organizer_session_start', String(startedAt));
      localStorage.setItem('qsams_organizer_session_duration_minutes', String(duration));
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
    // Mobile-specific fullscreen layout
    if (isMobile) {
      return (
        <div className="fullscreen-overlay mobile-fullscreen">
          <button
            className="btn-close-fullscreen"
            style={{ fontSize: '1rem', padding: '6px 10px' }}
            onClick={() => {
              setIsFullscreen(false);
              if (sessionTimeLeft === 0) setIsActive(false);
            }}
          >
            ✖ Exit
          </button>

          <div
            style={{
              height: '100vh',
              width: '100vw',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              boxSizing: 'border-box',
              textAlign: 'center',
              gap: '16px',
            }}
          >
            <h1
              className="fullscreen-title"
              style={{ fontSize: '1.4rem', margin: 0, wordBreak: 'break-word' }}
            >
              Event: {eventId.trim()}
            </h1>

            {sessionTimeLeft > 0 ? (
              <>
                <h2
                  style={{
                    color: '#cc0000',
                    fontSize: '1.2rem',
                    margin: 0,
                  }}
                >
                  Session Ends In: {formatTime(sessionTimeLeft)}
                </h2>
                <QRCodeSVG value={secureToken} size={260} level="H" />
                <p
                  className="fullscreen-timer"
                  style={{ fontSize: '0.95rem', margin: 0 }}
                >
                  Next QR update in: <strong>{timeLeft}s</strong>
                </p>
              </>
            ) : (
              <div className="cutoff-container" style={{ padding: '0 8px' }}>
                <h2
                  style={{
                    color: '#cc0000',
                    fontSize: '1.6rem',
                    fontWeight: 800,
                    margin: '0 0 8px 0',
                  }}
                >
                  ATTENDANCE CUT-OFF
                </h2>
                <p style={{ fontSize: '1rem', color: '#000', margin: 0 }}>
                  The scanning period has ended.
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

    // Desktop / larger-screen fullscreen layout (original)
    return (
      <div className="fullscreen-overlay">
        <button
          className="btn-close-fullscreen"
          onClick={() => {
            setIsFullscreen(false);
            if (sessionTimeLeft === 0) setIsActive(false);
          }}
        >
          ✖ Exit Presentation
        </button>

        <h1 className="fullscreen-title">Event: {eventId.trim()}</h1>

        {sessionTimeLeft > 0 ? (
          <>
            <h2
              style={{
                color: '#cc0000',
                fontSize: '3rem',
                margin: '0 0 40px 0',
              }}
            >
              Session Ends In: {formatTime(sessionTimeLeft)}
            </h2>
            <QRCodeSVG value={secureToken} size={450} level="H" />
            <p className="fullscreen-timer">
              Next QR update in: <strong>{timeLeft}s</strong>
            </p>
          </>
        ) : (
          <div className="cutoff-container">
            <h2
              style={{
                color: '#cc0000',
                fontSize: '5rem',
                fontWeight: '800',
              }}
            >
              ATTENDANCE CUT-OFF
            </h2>
            <p style={{ fontSize: '2rem', color: '#000' }}>
              The scanning period has ended.
            </p>
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
            <button className="btn btn-danger" onClick={() => {
                if (window.confirm("Are you sure you want to stop the session?")) {
                  clearOrganizerSessionStorage();
                  setIsActive(false);
                }
              }}>Stop Session</button>
            <button className="btn btn-outline" onClick={exportToCSV}>📊 Export CSV</button>
          </div>

        </div>

        </>
      )}
    </div>
  );
}