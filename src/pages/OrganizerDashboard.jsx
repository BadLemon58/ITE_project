import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';
import { logEvent } from '../lib/logEvent';
import { FullscreenIcon, BookOpenIcon, CloseIcon, TableIcon, UsersIcon } from '../components/Icons';
import ExportDropdown from '../components/ExportDropdown';
import StudentSpreadsheetModal from '../components/StudentSpreadsheetModal';

export default function OrganizerDashboard() {
  // --- Auth State ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');

  // --- UI & Session State ---
  const [isActive, setIsActive] = useState(false);
  const [secureToken, setSecureToken] = useState('');
  const [timeLeft, setTimeLeft] = useState(30);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [eventId, setEventId] = useState('');
  const [eventName, setEventName] = useState('');
  const [durationInput, setDurationInput] = useState('');
  const [sessionTimeLeft, setSessionTimeLeft] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState(null);
  const [sessionDurationMinutes, setSessionDurationMinutes] = useState(null);
  const [currentNonce, setCurrentNonce] = useState('');

  // --- Attendance & History State ---
  const [attendanceStats, setAttendanceStats] = useState({
    total: 0,
    recent: [],
    error: null,
  });
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [organizerMessage, setOrganizerMessage] = useState('');
  const [organizerMessageType, setOrganizerMessageType] = useState('info');
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pastEvents, setPastEvents] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [liveAttendance, setLiveAttendance] = useState([]);
  const [spreadsheetModal, setSpreadsheetModal] = useState({
    isOpen: false,
    eventId: '',
    eventName: '',
    data: [],
    isLoading: false,
  });

  // --- Storage Helpers ---
  const clearOrganizerSessionStorage = () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('qsams_organizer_event_id');
    localStorage.removeItem('qsams_organizer_event_name');
    localStorage.removeItem('qsams_organizer_session_start');
    localStorage.removeItem('qsams_organizer_session_duration_minutes');
  };

  // --- Utility Helpers ---
  const generateEventCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const array = new Uint8Array(5);
    crypto.getRandomValues(array);
    for (let i = 0; i < 5; i++) {
      code += chars[array[i] % chars.length];
    }
    return code;
  };

  const generateNonce = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let nonce = '';
    const array = new Uint8Array(6);
    crypto.getRandomValues(array);
    for (let i = 0; i < 6; i++) {
      nonce += chars[array[i] % chars.length];
    }
    return nonce;
  };

  const formatCSVField = (value) => {
    if (value === null || value === undefined) return '""';
    let strValue = String(value).trim();
    if (/^[=+\-@\t\r]/.test(strValue)) {
      strValue = "'" + strValue;
    }
    return `"${strValue.replace(/"/g, '""')}"`;
  };

  // --- Auth Handler (#1) ---
  const handleLogin = () => {
    if (passwordInput === 'admin') {
      setIsAuthenticated(true);
      setAuthError('');
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('qsams_organizer_auth', 'true');
      }
    } else {
      setAuthError('Incorrect password. Please try again.');
    }
  };

  // --- Effects: Auth Check ---
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const auth = sessionStorage.getItem('qsams_organizer_auth');
      if (auth === 'true') setIsAuthenticated(true);
    }
  }, []);

  // --- Effects: Layout & Initialization ---
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
    const savedEventName = localStorage.getItem('qsams_organizer_event_name');
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
    if (savedEventName) setEventName(savedEventName);
    setDurationInput(String(durationMinutes));
    setSessionTimeLeft(remainingSeconds);
    setSessionStartedAt(startedAt);
    setSessionDurationMinutes(durationMinutes);
    setIsActive(true);
  }, []);

  // --- Effect: Token Rotation & Session Timer ---
  useEffect(() => {
    let rotationInterval;
    let tickInterval;

    if (isActive && eventId) {
      const generateToken = async () => {
        const timestamp = Date.now();
        const nonce = generateNonce();
        setCurrentNonce(nonce);
        const tokenStr = `${eventId.trim()}|${timestamp}|${nonce}`;
        const currentOrigin = window.location.origin;
        // Store nonce in database for student-side verification
        await supabase
          .from('events')
          .update({ current_token: nonce })
          .eq('event_id', eventId.trim().toUpperCase());
        setSecureToken(`${currentOrigin}/?scan=${encodeURIComponent(tokenStr)}`);
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

  // --- Handlers: Session Management ---
  const handleStartSession = async () => {
    if (isStartingSession) return;

    const cleanEventName = eventName.trim();
    if (cleanEventName.length === 0) {
      setOrganizerMessageType('error');
      setOrganizerMessage('Please enter an Event Name before starting.');
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

    const generatedCode = generateEventCode();
    const startedAt = Date.now();
    const endTimeIso = new Date(startedAt + duration * 60000).toISOString();

    const { error } = await supabase
      .from('events')
      .upsert({
        event_id: generatedCode,
        event_name: cleanEventName,
        event_date: new Date().toISOString().split('T')[0],
        end_time: endTimeIso,
      }, { onConflict: 'event_id' });

    setIsStartingSession(false);

    if (error) {
      setOrganizerMessageType('error');
      setOrganizerMessage('Database error while saving the event. Please try again.');
      logEvent('session_start_error', 'Database error while saving event', {
        event_id: generatedCode,
        event_name: cleanEventName,
        duration_minutes: duration,
        error_message: error.message,
        error_code: error.code,
      });
      return;
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('qsams_organizer_event_id', generatedCode);
      localStorage.setItem('qsams_organizer_event_name', cleanEventName);
      localStorage.setItem('qsams_organizer_session_start', String(startedAt));
      localStorage.setItem('qsams_organizer_session_duration_minutes', String(duration));
    }

    setSessionStartedAt(startedAt);
    setSessionDurationMinutes(duration);
    setSessionTimeLeft(duration * 60);
    setIsActive(true);
    setEventId(generatedCode);
    setOrganizerMessageType('success');
    setOrganizerMessage(`Session started! Event Code: ${generatedCode}`);
    logEvent('session_start', 'Session started', {
      event_id: generatedCode,
      event_name: cleanEventName,
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

  // --- Effect: Real-time Attendance Updates ---
  useEffect(() => {
    if (!isActive || !eventId) return;
    let cancelled = false;

    const fetchStats = async () => {
      setIsLoadingStats(true);
      const cleanId = eventId.trim().toUpperCase();

      const { data, error, count } = await supabase
        .from('attendance')
        .select('id, student_id, created_at, students(full_name, program)', { count: 'exact' })
        .eq('event_id', cleanId)
        .order('created_at', { ascending: false });

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
        async (payload) => {
          if (cancelled) return;
          const newAttendance = payload.new;
          let studentInfo = null;
          if (newAttendance.student_id) {
            const { data: sData } = await supabase
              .from('students')
              .select('full_name, program')
              .eq('student_id', newAttendance.student_id)
              .maybeSingle();
            studentInfo = sData;
          }
          const recordWithStudent = {
            ...newAttendance,
            students: studentInfo,
          };
          setLiveAttendance((prev) => [recordWithStudent, ...prev]);
          setAttendanceStats((prev) => ({
            ...prev,
            total: prev.total + 1,
            recent: [recordWithStudent, ...prev.recent.slice(0, 2)],
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

  const openActiveStudentSheet = () => {
    setSpreadsheetModal({
      isOpen: true,
      eventId: eventId.trim().toUpperCase(),
      eventName: eventName || eventId.trim().toUpperCase(),
      data: liveAttendance,
      isLoading: isLoadingStats,
    });
  };

  const openPastEventSheet = async (event) => {
    const cleanTargetId = event.event_id.trim().toUpperCase();
    setSpreadsheetModal({
      isOpen: true,
      eventId: cleanTargetId,
      eventName: event.event_name || cleanTargetId,
      data: [],
      isLoading: true,
    });

    const { data } = await supabase
      .from('attendance')
      .select('id, student_id, created_at, students(full_name, program)')
      .eq('event_id', cleanTargetId)
      .order('created_at', { ascending: false });

    setSpreadsheetModal((prev) => ({
      ...prev,
      data: data || [],
      isLoading: false,
    }));
  };

  const formatTime = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // --- Handlers: Data Export & History ---
  const downloadPdfAttendance = async ({ eventName, eventId: code, eventDate, exportTime, data, filename }) => {
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    // Top Header Banner
    doc.setFillColor(0, 100, 0); // Notre Dame dark green
    doc.rect(0, 0, 210, 18, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text('QUICK STUDENT ATTENDANCE MONITORING SYSTEM (QSAMS)', 105, 12, { align: 'center' });

    // Subtitle & Report Info
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(20, 20, 20);
    doc.text(eventName ? eventName.toUpperCase() : 'EVENT ATTENDANCE REPORT', 14, 28);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(70, 70, 70);
    doc.text(`Event Code: ${code}    |    Date: ${eventDate}`, 14, 34);
    doc.text(`Total Attendance: ${data.length} student${data.length === 1 ? '' : 's'}    |    Exported: ${exportTime}`, 14, 39);

    // Prepare table rows
    const tableBody = data.map((row, idx) => {
      const scanTime = row.created_at
        ? new Date(row.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
          })
        : '—';
      const name = row.students?.full_name || '—';
      const program = row.students?.program || '—';
      return [
        idx + 1,
        row.student_id,
        name,
        program,
        scanTime,
        'Recorded',
      ];
    });

    autoTable(doc, {
      startY: 44,
      head: [['#', 'Student ID', 'Student Name', 'Program / Course', 'Scan Time', 'Status']],
      body: tableBody,
      theme: 'striped',
      headStyles: {
        fillColor: [0, 100, 0],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      styles: {
        fontSize: 8.5,
        cellPadding: 3,
        textColor: [30, 41, 59],
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 35 },
        4: { cellWidth: 26, halign: 'center' },
        5: { cellWidth: 22, halign: 'center', textColor: [22, 101, 52] },
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      didDrawPage: (dataHook) => {
        const str = `Page ${dataHook.pageNumber} of ${doc.internal.getNumberOfPages()}`;
        doc.setFontSize(8);
        doc.setTextColor(140, 140, 140);
        doc.text(str, 196, 287, { align: 'right' });
        doc.text('QSAMS — Automated QR Code Attendance System', 14, 287);
      },
    });

    doc.save(filename);
  };

  const downloadExcelAttendance = ({ eventName, eventId: code, eventDate, exportTime, data, filename }) => {
    const wb = XLSX.utils.book_new();

    const titleRow = ['QUICK STUDENT ATTENDANCE MONITORING SYSTEM (QSAMS)', '', '', '', '', ''];
    const subtitleRow = ['OFFICIAL ATTENDANCE REPORT', '', '', '', '', ''];
    const metaRow1 = ['Event Name:', '', eventName || 'N/A', '', 'Date:', eventDate];
    const metaRow2 = ['Event Code:', '', code, '', 'Total Scanned:', `${data.length} attendee${data.length === 1 ? '' : 's'}`];
    const metaRow3 = ['Exported At:', '', exportTime, '', 'System Status:', 'Verified'];
    const spacerRow = ['', '', '', '', '', ''];
    const headerRow = ['#', 'Student ID', 'Student Name', 'Program / Course', 'Scan Time', 'Status'];

    const rows = [
      titleRow,
      subtitleRow,
      metaRow1,
      metaRow2,
      metaRow3,
      spacerRow,
      headerRow,
    ];

    data.forEach((row, idx) => {
      const scanTime = row.created_at
        ? new Date(row.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
          })
        : '—';
      const name = row.students?.full_name || '—';
      const program = row.students?.program || '—';
      const status = 'Recorded';

      rows.push([
        idx + 1,
        row.student_id,
        name,
        program,
        scanTime,
        status,
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Merged headers across columns so Column A is never bloated!
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }, // Title A1:F1
      { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }, // Subtitle A2:F2
      { s: { r: 2, c: 0 }, e: { r: 2, c: 1 } }, // Event Name label A3:B3
      { s: { r: 2, c: 2 }, e: { r: 2, c: 3 } }, // Event Name value C3:D3
      { s: { r: 3, c: 0 }, e: { r: 3, c: 1 } }, // Event Code label A4:B4
      { s: { r: 3, c: 2 }, e: { r: 3, c: 3 } }, // Event Code value C4:D4
      { s: { r: 4, c: 0 }, e: { r: 4, c: 1 } }, // Exported At label A5:B5
      { s: { r: 4, c: 2 }, e: { r: 4, c: 3 } }, // Exported At value C5:D5
    ];

    // Explicit, auto-fitted column widths
    ws['!cols'] = [
      { wch: 6 },   // #
      { wch: 16 },  // Student ID
      { wch: 30 },  // Student Name
      { wch: 26 },  // Program / Course
      { wch: 18 },  // Scan Time
      { wch: 16 },  // Status
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadCSVAttendance = ({ eventName, eventId: code, eventDate, exportTime, data, filename }) => {
    let csvContent = "";
    // Table Column Headers as Row 1 so Column A (#) is never bloated in CSV
    csvContent += `#,Student ID,Student Name,Program / Course,Scan Time,Status\n`;

    data.forEach((row, idx) => {
      const scanTime = row.created_at
        ? new Date(row.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
          })
        : '—';
      const name = row.students?.full_name || '—';
      const program = row.students?.program || '—';
      const status = 'Recorded';

      csvContent += `${idx + 1},${formatCSVField(row.student_id)},${formatCSVField(name)},${formatCSVField(program)},${formatCSVField(scanTime)},${formatCSVField(status)}\n`;
    });

    // Summary block below data with leading comma so Column A stays strictly reserved for row numbers
    csvContent += `\n`;
    csvContent += `,"--- EVENT SUMMARY ---",,,,\n`;
    csvContent += `,"Event Name:",${formatCSVField(eventName || 'N/A')},,"Date:",${formatCSVField(eventDate)}\n`;
    csvContent += `,"Event Code:",${formatCSVField(code)},,"Total Scanned:",${formatCSVField(`${data.length} attendee${data.length === 1 ? '' : 's'}`)}\n`;
    csvContent += `,"Exported At:",${formatCSVField(exportTime)},,"System:",${formatCSVField("QSAMS")}\n`;

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportToPdf = async () => {
    if (isExporting || !eventId.trim()) return;
    setIsExporting(true);
    setOrganizerMessage('');

    const { data, error } = await supabase
      .from('attendance')
      .select('student_id, created_at, students(full_name, program)')
      .eq('event_id', eventId.trim().toUpperCase())
      .order('created_at', { ascending: true });

    if (error) {
      setIsExporting(false);
      setOrganizerMessageType('error');
      setOrganizerMessage('Unable to export PDF right now. Please try again.');
      return;
    }
    if (data.length === 0) {
      setIsExporting(false);
      setOrganizerMessageType('info');
      setOrganizerMessage('No attendance records found for this event yet.');
      return;
    }

    const exportDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const exportTime = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    const safeName = eventName ? `${eventName.trim().replace(/[^a-zA-Z0-9_-]/g, '_')}_` : '';
    try {
      await downloadPdfAttendance({
        eventName: eventName ? eventName.trim() : '',
        eventId: eventId.trim().toUpperCase(),
        eventDate: exportDate,
        exportTime,
        data,
        filename: `Attendance_${safeName}${eventId.trim()}.pdf`,
      });
      setOrganizerMessageType('success');
      setOrganizerMessage('PDF document downloaded successfully.');
      logEvent('export_pdf_success', 'PDF downloaded', {
        event_id: eventId.trim(),
        record_count: data.length,
      });
    } catch (err) {
      console.error('PDF export error', err);
      setOrganizerMessageType('error');
      setOrganizerMessage('Failed to generate PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const exportToExcel = async () => {
    if (isExporting || !eventId.trim()) return;
    setIsExporting(true);
    setOrganizerMessage('');

    const { data, error } = await supabase
      .from('attendance')
      .select('student_id, created_at, students(full_name, program)')
      .eq('event_id', eventId.trim().toUpperCase())
      .order('created_at', { ascending: true });

    if (error) {
      setIsExporting(false);
      setOrganizerMessageType('error');
      setOrganizerMessage('Unable to export Excel right now. Please try again.');
      return;
    }
    if (data.length === 0) {
      setIsExporting(false);
      setOrganizerMessageType('info');
      setOrganizerMessage('No attendance records found for this event yet.');
      return;
    }

    const exportDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const exportTime = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    const safeName = eventName ? `${eventName.trim().replace(/[^a-zA-Z0-9_-]/g, '_')}_` : '';
    try {
      downloadExcelAttendance({
        eventName: eventName ? eventName.trim() : '',
        eventId: eventId.trim().toUpperCase(),
        eventDate: exportDate,
        exportTime,
        data,
        filename: `Attendance_${safeName}${eventId.trim()}.xlsx`,
      });
      setOrganizerMessageType('success');
      setOrganizerMessage('Excel spreadsheet (.xlsx) downloaded successfully.');
      logEvent('export_excel_success', 'Excel downloaded', {
        event_id: eventId.trim(),
        record_count: data.length,
      });
    } catch (err) {
      console.error('Excel export error', err);
      setOrganizerMessageType('error');
      setOrganizerMessage('Failed to generate Excel file.');
    } finally {
      setIsExporting(false);
    }
  };

  const exportToCSV = async () => {
    if (isExporting || !eventId.trim()) return;
    setIsExporting(true);
    setOrganizerMessage('');

    const { data, error } = await supabase
      .from('attendance')
      .select('student_id, created_at, students(full_name, program)')
      .eq('event_id', eventId.trim().toUpperCase())
      .order('created_at', { ascending: true });

    if (error) {
      setIsExporting(false);
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
      setIsExporting(false);
      setOrganizerMessageType('info');
      setOrganizerMessage('No attendance records found for this event yet.');
      logEvent('export_csv_empty', 'No attendance records to export', {
        event_id: eventId.trim(),
      });
      return;
    }

    const exportDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const exportTime = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    const safeName = eventName ? `${eventName.trim().replace(/[^a-zA-Z0-9_-]/g, '_')}_` : '';
    try {
      downloadCSVAttendance({
        eventName: eventName ? eventName.trim() : '',
        eventId: eventId.trim().toUpperCase(),
        eventDate: exportDate,
        exportTime,
        data,
        filename: `Attendance_${safeName}${eventId.trim()}.csv`,
      });
      setIsExporting(false);
      setOrganizerMessageType('success');
      setOrganizerMessage('CSV file (.csv) downloaded successfully.');
      logEvent('export_csv_success', 'CSV downloaded', {
        event_id: eventId.trim(),
        record_count: data.length,
      });
    } catch (err) {
      console.error('CSV export error', err);
      setOrganizerMessageType('error');
      setOrganizerMessage('Failed to generate CSV file.');
      setIsExporting(false);
    }
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

  const exportEventPdf = async (targetEventId) => {
    setIsExporting(true);
    setOrganizerMessage('');

    const { data, error } = await supabase
      .from('attendance')
      .select('student_id, created_at, students(full_name, program)')
      .eq('event_id', targetEventId)
      .order('created_at', { ascending: true });

    if (error) {
      setIsExporting(false);
      setOrganizerMessageType('error');
      setOrganizerMessage('Unable to export PDF for this event.');
      return;
    }

    if (data.length === 0) {
      setIsExporting(false);
      setOrganizerMessageType('info');
      setOrganizerMessage('No attendance records found for this event.');
      return;
    }

    const matchedEvent = pastEvents.find((e) => e.event_id === targetEventId);
    const eventDateFormatted = matchedEvent?.event_date
      ? new Date(matchedEvent.event_date).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
    const exportTime = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    const safeName = matchedEvent?.event_name ? `${matchedEvent.event_name.trim().replace(/[^a-zA-Z0-9_-]/g, '_')}_` : '';
    try {
      await downloadPdfAttendance({
        eventName: matchedEvent?.event_name || '',
        eventId: targetEventId,
        eventDate: eventDateFormatted,
        exportTime,
        data,
        filename: `Attendance_${safeName}${targetEventId}.pdf`,
      });
      setOrganizerMessageType('success');
      setOrganizerMessage(`PDF document exported for event "${targetEventId}".`);
    } catch (err) {
      console.error('PDF export error', err);
      setOrganizerMessageType('error');
      setOrganizerMessage('Failed to generate PDF for this event.');
    } finally {
      setIsExporting(false);
    }
  };

  const exportEventExcel = async (targetEventId) => {
    setIsExporting(true);
    setOrganizerMessage('');

    const { data, error } = await supabase
      .from('attendance')
      .select('student_id, created_at, students(full_name, program)')
      .eq('event_id', targetEventId)
      .order('created_at', { ascending: true });

    if (error) {
      setIsExporting(false);
      setOrganizerMessageType('error');
      setOrganizerMessage('Unable to export Excel for this event.');
      return;
    }

    if (data.length === 0) {
      setIsExporting(false);
      setOrganizerMessageType('info');
      setOrganizerMessage('No attendance records found for this event.');
      return;
    }

    const matchedEvent = pastEvents.find((e) => e.event_id === targetEventId);
    const eventDateFormatted = matchedEvent?.event_date
      ? new Date(matchedEvent.event_date).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
    const exportTime = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    const safeName = matchedEvent?.event_name ? `${matchedEvent.event_name.trim().replace(/[^a-zA-Z0-9_-]/g, '_')}_` : '';
    try {
      downloadExcelAttendance({
        eventName: matchedEvent?.event_name || '',
        eventId: targetEventId,
        eventDate: eventDateFormatted,
        exportTime,
        data,
        filename: `Attendance_${safeName}${targetEventId}.xlsx`,
      });
      setIsExporting(false);
      setOrganizerMessageType('success');
      setOrganizerMessage(`Excel spreadsheet exported for event "${targetEventId}".`);
    } catch (err) {
      console.error('Excel export error', err);
      setOrganizerMessageType('error');
      setOrganizerMessage('Failed to export Excel for this event.');
      setIsExporting(false);
    }
  };

  const exportEventCSV = async (targetEventId) => {
    setIsExporting(true);
    setOrganizerMessage('');

    const { data, error } = await supabase
      .from('attendance')
      .select('student_id, created_at, students(full_name, program)')
      .eq('event_id', targetEventId)
      .order('created_at', { ascending: true });

    if (error) {
      setIsExporting(false);
      setOrganizerMessageType('error');
      setOrganizerMessage('Unable to export CSV for this event.');
      return;
    }

    if (data.length === 0) {
      setIsExporting(false);
      setOrganizerMessageType('info');
      setOrganizerMessage('No attendance records found for this event.');
      return;
    }

    const matchedEvent = pastEvents.find((e) => e.event_id === targetEventId);
    const eventDateFormatted = matchedEvent?.event_date
      ? new Date(matchedEvent.event_date).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
    const exportTime = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });

    const safeName = matchedEvent?.event_name ? `${matchedEvent.event_name.trim().replace(/[^a-zA-Z0-9_-]/g, '_')}_` : '';
    try {
      downloadCSVAttendance({
        eventName: matchedEvent?.event_name || '',
        eventId: targetEventId,
        eventDate: eventDateFormatted,
        exportTime,
        data,
        filename: `Attendance_${safeName}${targetEventId}.csv`,
      });
      setIsExporting(false);
      setOrganizerMessageType('success');
      setOrganizerMessage(`CSV exported for event "${targetEventId}".`);
    } catch (err) {
      console.error('CSV export error', err);
      setOrganizerMessageType('error');
      setOrganizerMessage('Failed to export CSV for this event.');
      setIsExporting(false);
    }
  };

  // --- UI View: Auth Gate (Fix #1) ---
  if (!isAuthenticated) {
    return (
      <div className="card organizer-card">
        <h2>Organizer Login</h2>
        <p style={{ color: '#666', fontSize: '0.85rem', margin: '-15px 0 20px 0', textAlign: 'center' }}>
          Enter the organizer password to continue
        </p>
        <div className="manual-form">
          <div className="input-container">
            <input
              type="password"
              required
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleLogin();
                }
              }}
            />
            <label>Password</label>
          </div>
          <button className="btn btn-primary" onClick={handleLogin}>
            Login
          </button>
        </div>
        {authError && (
          <div
            className="message-box"
            role="alert"
            aria-live="assertive"
            style={{ color: '#990000', backgroundColor: '#ffe6e6' }}
          >
            {authError}
          </div>
        )}
      </div>
    );
  }

  // --- UI View: Fullscreen Presentation ---
  if (isFullscreen && isActive) {
    if (isMobile) {
      return (
        <div className="fullscreen-overlay mobile-fullscreen">
          <button
            className="btn-close-fullscreen"
            style={{ fontSize: '1rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={() => {
              setIsFullscreen(false);
              if (sessionTimeLeft === 0) setIsActive(false);
            }}
          >
            <CloseIcon size={16} /> Exit
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
              {eventName || eventId.trim()}
            </h1>
            <p style={{ fontSize: '0.95rem', color: '#333', margin: 0 }}>
              Live Code: <strong>{currentNonce || 'Generating...'}</strong>
            </p>

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
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          onClick={() => {
            setIsFullscreen(false);
            if (sessionTimeLeft === 0) setIsActive(false);
          }}
        >
          <CloseIcon size={18} /> Exit Presentation
        </button>

        <h1 className="fullscreen-title">{eventName || eventId.trim()}</h1>
        <p style={{ fontSize: '1.5rem', color: '#333', margin: '0 0 10px 0' }}>
          Live Code: <strong>{currentNonce || 'Generating...'}</strong>
        </p>

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

  // --- UI View: Organizer Panel ---
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
          <div className="input-container">
            <input type="text" required
              value={eventName} onChange={(e) => setEventName(e.target.value)} />
            <label>Event Name</label>
          </div>
          <div className="input-container">
            <input type="number" required
              value={durationInput} onChange={(e) => setDurationInput(e.target.value)} />
            <label>Duration (minutes)</label>
          </div>
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
            {eventName && <><strong>{eventName}</strong> — </>}Live Code: <strong style={{color: '#cc0000'}}>{currentNonce || '...'}</strong> (ID: {eventId.trim()})
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
                  setEventName('');
                  setSessionStartedAt(null);
                  setSessionDurationMinutes(null);
                  setCurrentNonce('');
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

            {/* QR Display */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto', width: '160px' }}>
              <QRCodeSVG value={secureToken} size={160} level="H" />
              <button
                className="btn btn-outline"
                onClick={() => setIsFullscreen(true)}
                style={{
                  marginTop: '10px',
                  padding: '6px 12px',
                  fontSize: '0.85rem',
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <FullscreenIcon size={15} /> Fullscreen
              </button>

              <p style={{ backgroundColor: '#e0e0e0', color: '#000000', padding: '4px 8px', borderRadius: '6px', marginTop: '8px', marginBottom: 0, fontSize: '0.85rem' }}>
                Next update: <strong>{timeLeft}s</strong>
              </p>
            </div>

            {/* Session Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
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
                  setCurrentNonce('');
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
              <ExportDropdown
                onExportPdf={exportToPdf}
                onExportExcel={exportToExcel}
                onExportCsv={exportToCSV}
                isLoading={isExporting}
                buttonText="Export Attendance"
                size="md"
                align="right"
                className="full-width"
              />
            </div>

            {/* Stats Overview */}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <p style={{ margin: 0, fontWeight: 'bold', fontSize: '0.9rem' }}>
                  Attendance Overview
                </p>
                <button
                  className="btn btn-outline"
                  onClick={openActiveStudentSheet}
                  style={{ fontSize: '0.75rem', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  title="Open live attendance spreadsheet"
                >
                  <TableIcon size={12} /> View Attendance
                </button>
              </div>
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
                          <li key={row.student_id + idx} style={{ marginBottom: '2px' }}>
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

      {/* --- UI Section: History --- */}
      <div style={{ marginTop: '30px', borderTop: '1px solid #ddd', paddingTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#333', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BookOpenIcon size={18} /> Past Events History
          </h3>
          {!showHistory ? (
            <button
              className="btn btn-outline"
              onClick={loadPastEvents}
              disabled={isLoadingHistory}
              style={{ fontSize: '0.85rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {isLoadingHistory ? 'Loading...' : <><BookOpenIcon size={14} /> View History</>}
            </button>
          ) : (
            <button
              className="btn btn-outline"
              onClick={() => setShowHistory(false)}
              style={{ fontSize: '0.85rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <CloseIcon size={14} /> Hide History
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
                {pastEvents.map((event) => (
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
                        {event.event_name || event.event_id}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#666' }}>
                        Code: {event.event_id}
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
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-outline"
                          onClick={() => openPastEventSheet(event)}
                          style={{ fontSize: '0.75rem', padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          title="View attendee spreadsheet for this event"
                        >
                          <TableIcon size={12} /> View
                        </button>
                        <ExportDropdown
                          onExportPdf={() => exportEventPdf(event.event_id)}
                          onExportExcel={() => exportEventExcel(event.event_id)}
                          onExportCsv={() => exportEventCSV(event.event_id)}
                          isLoading={isExporting}
                          buttonText="Export"
                          size="sm"
                          align="right"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Student Spreadsheet Modal */}
      <StudentSpreadsheetModal
        isOpen={spreadsheetModal.isOpen}
        onClose={() => setSpreadsheetModal((prev) => ({ ...prev, isOpen: false }))}
        eventName={spreadsheetModal.eventName}
        eventId={spreadsheetModal.eventId}
        attendanceList={
          spreadsheetModal.eventId === eventId.trim().toUpperCase()
            ? liveAttendance
            : spreadsheetModal.data
        }
        isLoading={spreadsheetModal.isLoading}
        onRefresh={() => {
          if (spreadsheetModal.eventId === eventId.trim().toUpperCase()) {
            openActiveStudentSheet();
          } else {
            openPastEventSheet({ event_id: spreadsheetModal.eventId, event_name: spreadsheetModal.eventName });
          }
        }}
        onExportPdf={() => {
          if (spreadsheetModal.eventId === eventId.trim().toUpperCase()) {
            exportToPdf();
          } else {
            exportEventPdf(spreadsheetModal.eventId);
          }
        }}
        onExportExcel={() => {
          if (spreadsheetModal.eventId === eventId.trim().toUpperCase()) {
            exportToExcel();
          } else {
            exportEventExcel(spreadsheetModal.eventId);
          }
        }}
        onExportCsv={() => {
          if (spreadsheetModal.eventId === eventId.trim().toUpperCase()) {
            exportToCSV();
          } else {
            exportEventCSV(spreadsheetModal.eventId);
          }
        }}
      />

    </div>
  );
}
