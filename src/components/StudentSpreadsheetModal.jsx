import React, { useState, useMemo, useEffect } from 'react';
import { CloseIcon, SearchIcon, RefreshIcon, CheckIcon, TableIcon } from './Icons';
import ExportDropdown from './ExportDropdown';
import './StudentSpreadsheetModal.css';

export default function StudentSpreadsheetModal({
  isOpen,
  onClose,
  eventName = '',
  eventId = '',
  attendanceList = [],
  isLoading = false,
  onRefresh,
  onExportPdf,
  onExportExcel,
  onExportCsv,
}) {
  const [searchTerm, setSearchTerm] = useState('');

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Filter attendance records by Student ID, Name, or Program
  const filteredList = useMemo(() => {
    if (!searchTerm.trim()) return attendanceList;
    const term = searchTerm.toLowerCase().trim();
    return attendanceList.filter((item) => {
      const id = String(item.student_id || '').toLowerCase();
      const name = String(item.students?.full_name || '').toLowerCase();
      const program = String(item.students?.program || '').toLowerCase();
      return id.includes(term) || name.includes(term) || program.includes(term);
    });
  }, [attendanceList, searchTerm]);

  if (!isOpen) return null;

  return (
    <div className="sheet-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="sheet-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="sheet-modal-header">
          <div className="sheet-header-title">
            <TableIcon size={20} style={{ color: '#006400' }} />
            <h3>
              {eventName ? `${eventName} — Attendance Sheet` : 'Live Attendance Sheet'}
            </h3>
            <span className="sheet-badge-count">
              {attendanceList.length} {attendanceList.length === 1 ? 'Student' : 'Students'}
            </span>
          </div>
          <button
            className="sheet-close-btn"
            onClick={onClose}
            title="Close Sheet (Esc)"
            aria-label="Close"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Toolbar Bar */}
        <div className="sheet-toolbar">
          <div className="sheet-search-box">
            <span className="sheet-search-icon">
              <SearchIcon size={15} />
            </span>
            <input
              type="text"
              className="sheet-search-input"
              placeholder="Search by ID, name, or program..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              autoFocus
            />
          </div>

          <div className="sheet-actions">
            {onRefresh && (
              <button
                className="sheet-action-btn"
                onClick={onRefresh}
                disabled={isLoading}
                title="Refresh attendance list"
              >
                <RefreshIcon size={14} /> Refresh
              </button>
            )}
            {(onExportPdf || onExportExcel || onExportCsv) && (
              <ExportDropdown
                onExportPdf={onExportPdf}
                onExportExcel={onExportExcel}
                onExportCsv={onExportCsv}
                isLoading={isLoading}
                buttonText="Export"
                size="sm"
                align="right"
              />
            )}
          </div>
        </div>

        {/* Spreadsheet Grid View */}
        <div className="sheet-table-container">
          {isLoading && attendanceList.length === 0 ? (
            <div className="sheet-empty-state">
              <p>Loading attendance data...</p>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="sheet-empty-state">
              {searchTerm ? (
                <p>No students match "<strong>{searchTerm}</strong>"</p>
              ) : (
                <>
                  <p><strong>No attendance records yet.</strong></p>
                  <p style={{ fontSize: '0.82rem' }}>
                    When students scan the QR code, their details will appear here automatically.
                  </p>
                </>
              )}
            </div>
          ) : (
            <table className="sheet-table">
              <thead>
                <tr>
                  <th className="col-num">#</th>
                  <th>Student ID</th>
                  <th>Student Name</th>
                  <th>Program / Course</th>
                  <th>Scan Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredList.map((record, index) => {
                  const studentName = record.students?.full_name || '—';
                  const program = record.students?.program || '—';
                  const scanTime = record.created_at
                    ? new Date(record.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })
                    : '—';

                  return (
                    <tr key={record.id || record.student_id + index}>
                      <td className="col-num">{index + 1}</td>
                      <td className="col-id">{record.student_id}</td>
                      <td className="col-name">{studentName}</td>
                      <td className="col-program">{program}</td>
                      <td className="col-time">{scanTime}</td>
                      <td>
                        <span className="status-tag">
                          <CheckIcon size={11} /> Recorded
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer Summary */}
        <div className="sheet-modal-footer">
          <span>Event Code: <strong>{eventId}</strong></span>
          <span>
            Showing <strong>{filteredList.length}</strong> of <strong>{attendanceList.length}</strong> {attendanceList.length === 1 ? 'attendee' : 'attendees'}
          </span>
        </div>
      </div>
    </div>
  );
}
