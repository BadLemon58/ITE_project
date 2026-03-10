import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../supabaseClient';
import { logEvent } from '../lib/logEvent';

export default function OrganizerDashboard() {
  const [isActive, setIsActive] = useState(false);
  const [secureToken, setSecureToken] = useState('');
  const [timeLeft, setTimeLeft] = useState(30); 
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [eventId, setEventId] = useState(''); 
  const [durationInput, setDurationInput] = useState('15'); 
  const [sessionTimeLeft, setSessionTimeLeft] = useState(0); 
  const [isMobile, setIsMobile] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState(null);
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(null);
  const [attendanceStats, setAttendanceStats] = useState({
    total: 0,
    recent: [],
    error: null,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [organizerMessage, setOrganizerMessage] = useState('');
  const [organizerMessageType, setOrganizerMessageType] = useState('info'); 
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pastEvents, setPastEvents] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

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

    setEventId(savedEventId.toUpperCase());
    setDurationInput(String(durationMinutes));
    setSessionTimeLeft(remainingSeconds);
    setSessionStartedAt(startedAt);
    setSessionDurationMinutes(durationMinutes);
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
    if (isStartingSession) return;
    
    const cleanEventId = eventId.trim().toUpperCase();
    if (cleanEventId.length === 0) {
      setOrganizerMessageType('error');
      setOrganizerMessage('Please enter an Event ID before starting.');
      return;
    }
    const duration = parseInt(durationInput, 10);
    if (isNaN(duration) || duration <= 0) {
      setOrganizerMessageType('error');
      setOrganizerMessage('Please enter a valid duration in minutes.');
      return;
    }

    setIsStartingSession(true);
    setOrganizerMessage('');

    const startedAt = Date.now();
    const endTimeIso = new Date(startedAt + duration * 60000).toISOString();

    const { error } = await supabase
      .from('events')
      .upsert({ 
          event_id: cleanEventId, 
          event_name: `Session: ${cleanEventId}`, 
          event_date: new Date().toISOString().split('T')[0],
          end_time: endTimeIso,
        }, { onConflict: 'event_id' });

    setIsStartingSession(false);

    if (error) {
      setOrganizerMessageType('error');
      setOrganizerMessage('Database error while saving the event. Please try again.');
      logEvent('session_start_error', 'Database error while saving event', {
        event_id: cleanEventId,
        duration_minutes: duration,
        error_message: error.message,
        error_code: error.code,
      });
      return;
    }

    if (typeof window !== 'undefined') {
      
      localStorage.setItem('qsams_organizer_event_id', cleanEventId);
      localStorage.setItem('qsams_organizer_session_start', String(startedAt));
      localStorage.setItem('qsams_organizer_session_duration_minutes', String(duration));
    }

    setSessionStartedAt(startedAt);
    setSessionDurationMinutes(duration);
    setSessionTimeLeft(duration * 60);
    setIsActive(true);
    setEventId(cleanEventId); 
    setOrganizerMessageType('success');
    setOrganizerMessage(`Session started for event "${cleanEventId}".`);
    logEvent('session_start', 'Session started', {
      event_id: cleanEventId,
      duration_minutes: duration,
      end_time: endTimeIso,
    });
  };

  const extendSession = (extraMinutes) => {
    if (!isActive || !eventId) return;

    setSessionDurationMinutes((prev) => {
      const base = prev != null ? prev : parseInt(durationInput, 10) || 0;
      const updated = base + extraMinutes;

      if (typeof window !== 'undefined') {
        localStorage.setItem(
          'qsams_organizer_session_duration_minutes',
          String(updated)
        );
      }

      return updated;
    });

    setSessionTimeLeft((prev) => prev + extraMinutes * 60);
  };

  const [liveAttendance, setLiveAttendance] = useState([]);

  
  useEffect(() => {
    if (!isActive || !eventId) return;
    let cancelled = false;

    const fetchStats = async () => {
      setIsLoadingStats(true);
      const cleanId = eventId.trim().toUpperCase();

      const { data, error, count } = await supabase
        .from('attendance')
        .select('student_id, created_at', { count: 'exact' })
        .eq('event_id', cleanId)
        .order('created_at', { ascending: false })
        .limit(50); 

      if (cancelled) return;

      if (error) {
        setAttendanceStats((prev) => ({
          ...prev,
          error: error.message || 'Unable to load attendance stats.',
        }));
      } else {
        setAttendanceStats({
          total: typeof count === 'number' ? count : (data ? data.length : 0),
          recent: data ? data.slice(0, 3) : [], 
          error: null,
        });
        setLiveAttendance(data || []); 
      }

      setIsLoadingStats(false);
    };

    fetchStats();

    
    const pollInterval = setInterval(() => {
      if (!cancelled) fetchStats();
    }, 5000);

    
    const channel = supabase
      .channel(`attendance_${eventId.trim().toUpperCase()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'attendance',
          filter: `event_id=eq.${eventId.trim().toUpperCase()}`,
        },
        (payload) => {
          if (cancelled) return;
          
          const newAttendance = payload.new;
          setLiveAttendance(prev => [newAttendance, ...prev]);
          setAttendanceStats(prev => ({
            ...prev,
            total: prev.total + 1,
            recent: [newAttendance, ...prev.recent.slice(0, 2)], 
          }));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [isActive, eventId]);

  const formatTime = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };
  
  const exportToCSV = async () => {
    if (isExportingCsv || !eventId.trim()) return;
    setIsExportingCsv(true);
    setOrganizerMessage('');

    const { data, error } = await supabase
      .from('attendance')
      .select('student_id, created_at')
      .eq('event_id', eventId.trim().toUpperCase());

    if (error) {
      setIsExportingCsv(false);
      setOrganizerMessageType('error');
      setOrganizerMessage('Unable to export CSV right now. Please try again.');
      logEvent('export_csv_error', 'Failed to export CSV', {
        event_id: eventId.trim(),
        error_message: error.message,
        error_code: error.code,
      });
      return;
    }
    if (data.length === 0) {
      setIsExportingCsv(false);
      setOrganizerMessageType('info');
      setOrganizerMessage('No attendance records found for this event yet.');
      logEvent('export_csv_empty', 'No attendance records to export', {
        event_id: eventId.trim(),
      });
      return;
    }

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

    setIsExportingCsv(false);
    setOrganizerMessageType('success');
    setOrganizerMessage('CSV downloaded successfully.');
    logEvent('export_csv_success', 'CSV downloaded', {
      event_id: eventId.trim(),
      record_count: data.length,
    });
  };

  const loadPastEvents = async () => {
    if (isLoadingHistory) return;
    setIsLoadingHistory(true);
    setOrganizerMessage('');

    try {
      
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('event_id, event_name, event_date, end_time')
        .order('event_date', { ascending: false })
        .limit(20);

      if (eventsError) throw eventsError;

      
      const eventsWithCounts = await Promise.all(
        eventsData.map(async (event) => {
          const { count, error: countError } = await supabase
            .from('attendance')
            .select('*', { count: 'exact', head: true })
            .eq('event_id', event.event_id);

          if (countError) {
            console.warn('Error getting count for event', event.event_id, countError);
            return { ...event, attendanceCount: 0 };
          }

          return { ...event, attendanceCount: count || 0 };
        })
      );

      setPastEvents(eventsWithCounts);
      setShowHistory(true);
    } catch (error) {
      setOrganizerMessageType('error');
      setOrganizerMessage('Failed to load past events. Please try again.');
      logEvent('load_history_error', 'Failed to load past events', {
        error_message: error.message,
      });
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const exportEventCSV = async (eventId) => {
    setIsExportingCsv(true);
    setOrganizerMessage('');

    const { data, error } = await supabase
      .from('attendance')
      .select('student_id, created_at')
      .eq('event_id', eventId);

    if (error) {
      setIsExportingCsv(false);
      setOrganizerMessageType('error');
      setOrganizerMessage('Unable to export CSV for this event.');
      return;
    }

    if (data.length === 0) {
      setIsExportingCsv(false);
      setOrganizerMessageType('info');
      setOrganizerMessage('No attendance records found for this event.');
      return;
    }

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

    setIsExportingCsv(false);
    setOrganizerMessageType('success');
    setOrganizerMessage(`CSV exported for event "${eventId}".`);
  };

  
  if (isFullscreen && isActive) {
    
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
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', margin: '0 auto', textAlign: 'center' }}>
                  <QRCodeSVG value={secureToken} size={260} level="H" />
                </div>
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
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', margin: '0 auto', textAlign: 'center' }}>
              <QRCodeSVG value={secureToken} size={450} level="H" />
            </div>
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

      {organizerMessage && (
        <div
          className="message-box"
          role="status"
          aria-live={organizerMessageType === 'error' ? 'assertive' : 'polite'}
          style={{
            marginBottom: '10px',
            backgroundColor:
              organizerMessageType === 'error'
                ? '#ffe6e6'
                : organizerMessageType === 'success'
                ? '#e6ffed'
                : '#e0e0e0',
            color:
              organizerMessageType === 'error'
                ? '#990000'
                : organizerMessageType === 'success'
                ? '#004d26'
                : '#000000',
          }}
        >
          {organizerMessage}
        </div>
      )}
      {!isActive ? (
        <div className="manual-form">
          <input type="text" placeholder="Event ID" className="input-field" 
            value={eventId} onChange={(e) => setEventId(e.target.value.toUpperCase())} />
          <input type="number" placeholder="Duration (minutes)" className="input-field" 
            value={durationInput} onChange={(e) => setDurationInput(e.target.value)} />
          <button
            className="btn btn-primary"
            onClick={handleStartSession}
            disabled={isStartingSession}
          >
            {isStartingSession ? 'Starting...' : 'Start Secure Session'}
          </button>
        </div>
      ) : (
        <>
          <p style={{ backgroundColor: '#e0e0e0', color: '#000000', padding: '4px 10px', borderRadius: '6px', display: 'inline-block', margin: '0 0 5px 0' }}>
            Active Event: <strong>{eventId.trim()}</strong>
          </p>
          <p style={{ color: '#cc0000', fontWeight: 'bold', fontSize: '1.1rem', margin: '0 0 6px 0' }}>
            Time Left: {formatTime(sessionTimeLeft)}
          </p>

          {sessionStartedAt && sessionDurationMinutes != null && (
            <div style={{ fontSize: '0.85rem', color: '#333', marginBottom: '10px' }}>
              <p style={{ margin: '0 0 2px 0' }}>
                Started:{' '}
                <strong>
                  {new Date(sessionStartedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </strong>
              </p>
              <p style={{ margin: '0 0 2px 0' }}>
                Ends:{' '}
                <strong>
                  {new Date(
                    sessionStartedAt + sessionDurationMinutes * 60000
                  ).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </strong>
              </p>
              <p style={{ margin: 0 }}>
                Total Duration:{' '}
                <strong>{sessionDurationMinutes} min</strong>
              </p>
            </div>
          )}

          {sessionTimeLeft === 0 && (
            <div
              style={{
                backgroundColor: '#ffe6e6',
                color: '#990000',
                padding: '8px 10px',
                borderRadius: '6px',
                marginBottom: '10px',
              }}
            >
              <strong>Session ended.</strong>{' '}
              <button
                className="btn btn-primary"
                style={{ marginLeft: '8px', padding: '4px 10px', fontSize: '0.8rem' }}
                onClick={() => {
                  clearOrganizerSessionStorage();
                  setIsActive(false);
                  setSessionTimeLeft(0);
                  setEventId('');
                  setSessionStartedAt(null);
                  setSessionDurationMinutes(null);
                  setAttendanceStats({
                    total: 0,
                    recent: [],
                    error: null,
                  });
                }}
              >
                Start New Session
              </button>
            </div>
          )}
          
         <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: '15px',
            alignItems: 'flex-start',
            width: '100%',
            flexWrap: 'wrap',
          }}
        >
  
          {}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto' }}>
            <QRCodeSVG value={secureToken} size={160} level="H" />
            <p style={{ backgroundColor: '#e0e0e0', color: '#000000', padding: '4px 8px', borderRadius: '6px', marginTop: '10px', fontSize: '0.85rem' }}>
              Next update: <strong>{timeLeft}s</strong>
            </p>
          </div>

          {}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
            <button className="btn btn-outline" onClick={() => setIsFullscreen(true)}>📺 Fullscreen</button>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                className="btn btn-outline"
                style={{ flex: '1 1 80px' }}
                onClick={() => extendSession(5)}
              >
                +5 min
              </button>
              <button
                className="btn btn-outline"
                style={{ flex: '1 1 80px' }}
                onClick={() => extendSession(10)}
              >
                +10 min
              </button>
            </div>
            <button className="btn btn-danger" onClick={() => {
                if (window.confirm("Are you sure you want to stop the session?")) {
                  const currentEventId = eventId.trim();
                  clearOrganizerSessionStorage();
                  setIsActive(false);
                  setSessionTimeLeft(0);
                  setSessionStartedAt(null);
                  setSessionDurationMinutes(null);
                  setAttendanceStats({
                    total: 0,
                    recent: [],
                    error: null,
                  });
                  setOrganizerMessageType('info');
                  setOrganizerMessage('Session stopped.');
                  logEvent('session_stop', 'Session stopped by organizer', {
                    event_id: currentEventId,
                  });
                }
              }}>Stop Session</button>
            <button
              className="btn btn-outline"
              onClick={exportToCSV}
              disabled={isExportingCsv}
            >
              {isExportingCsv ? 'Exporting…' : '📊 Export CSV'}
            </button>
          </div>

          {}
          <div
            style={{
              marginLeft: '10px',
              marginTop: '10px',
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid #ddd',
              backgroundColor: '#fafafa',
              flex: '1 1 220px',
              boxSizing: 'border-box',
            }}
          >
            <p style={{ margin: '0 0 4px 0', fontWeight: 'bold', fontSize: '0.9rem' }}>
              Attendance Overview
            </p>
            {isLoadingStats ? (
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#666' }}>Loading...</p>
            ) : attendanceStats.error ? (
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#b30000' }}>
                {attendanceStats.error}
              </p>
            ) : (
              <>
                <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem' }}>
                  Total scans:{' '}
                  <strong>{attendanceStats.total}</strong>
                </p>
                {attendanceStats.recent && attendanceStats.recent.length > 0 && (
                  <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                    <p style={{ margin: '0 0 2px 0', fontWeight: 'bold' }}>Last attendees:</p>
                    <ul style={{ margin: 0, paddingLeft: '16px' }}>
                      {attendanceStats.recent.map((row, idx) => (
                        <li key={idx} style={{ marginBottom: '2px' }}>
                          <span>{row.student_id}</span>{' '}
                          <span style={{ color: '#666' }}>
                            (
                            {new Date(row.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                            )
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>

        </div>

        
        </>
      )}

      {}
      <div style={{ marginTop: '30px', borderTop: '1px solid #ddd', paddingTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#333' }}>📚 Past Events History</h3>
          {!showHistory ? (
            <button
              className="btn btn-outline"
              onClick={loadPastEvents}
              disabled={isLoadingHistory}
              style={{ fontSize: '0.85rem', padding: '6px 12px' }}
            >
              {isLoadingHistory ? 'Loading...' : 'View History'}
            </button>
          ) : (
            <button
              className="btn btn-outline"
              onClick={() => setShowHistory(false)}
              style={{ fontSize: '0.85rem', padding: '6px 12px' }}
            >
              ✕ Hide History
            </button>
          )}
        </div>

        {showHistory && (
          <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '8px' }}>
            {pastEvents.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                No past events found.
              </div>
            ) : (
              <div style={{ padding: '10px' }}>
                {pastEvents.map((event, idx) => (
                  <div
                    key={event.event_id}
                    style={{
                      padding: '12px',
                      marginBottom: '8px',
                      backgroundColor: '#fafafa',
                      borderRadius: '6px',
                      border: '1px solid #eee',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '1rem', marginBottom: '4px' }}>
                        {event.event_id}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#666' }}>
                        {event.event_name && event.event_name !== `Session: ${event.event_id}` 
                          ? event.event_name 
                          : `Session: ${event.event_id}`}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#666' }}>
                        {new Date(event.event_date).toLocaleDateString()} • 
                        {event.end_time ? new Date(event.end_time).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : 'No end time'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#007bff', marginBottom: '4px' }}>
                        {event.attendanceCount} attendees
                      </div>
                      <button
                        className="btn btn-outline"
                        onClick={() => exportEventCSV(event.event_id)}
                        disabled={isExportingCsv}
                        style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                      >
                        📊 Export CSV
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

