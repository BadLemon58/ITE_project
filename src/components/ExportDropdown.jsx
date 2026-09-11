import React, { useState, useRef, useEffect } from 'react';
import { DownloadIcon, ChevronDownIcon, PdfIcon, ExcelIcon, CsvIcon } from './Icons';
import './ExportDropdown.css';

export default function ExportDropdown({
  onExportPdf,
  onExportExcel,
  onExportCsv,
  isLoading = false,
  buttonText = 'Export',
  size = 'md',
  align = 'right',
  className = '',
  style = {},
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (handler) => {
    setIsOpen(false);
    if (handler && typeof handler === 'function') {
      handler();
    }
  };

  return (
    <div className={`export-dropdown-wrapper ${className}`} ref={dropdownRef} style={style}>
      <button
        type="button"
        className={`export-dropdown-btn size-${size}`}
        onClick={() => !isLoading && setIsOpen((prev) => !prev)}
        disabled={isLoading}
        aria-haspopup="true"
        aria-expanded={isOpen}
        title="Choose file format to export"
      >
        <DownloadIcon size={size === 'sm' ? 14 : 16} />
        <span>{isLoading ? 'Exporting…' : buttonText}</span>
        <ChevronDownIcon
          size={size === 'sm' ? 12 : 14}
          className={`export-dropdown-chevron ${isOpen ? 'open' : ''}`}
        />
      </button>

      {isOpen && (
        <div
          className={`export-dropdown-menu align-${align}`}
          role="menu"
          aria-label="Export file formats"
        >
          <div className="export-dropdown-header">Export Format</div>

          {onExportPdf && (
            <button
              type="button"
              className="export-dropdown-item pdf"
              onClick={() => handleSelect(onExportPdf)}
              role="menuitem"
            >
              <div className="export-item-badge">
                <PdfIcon size={18} />
              </div>
              <div className="export-item-content">
                <span className="export-item-title">PDF Document</span>
                <span className="export-item-desc">Printable official report (.pdf)</span>
              </div>
            </button>
          )}

          {onExportExcel && (
            <button
              type="button"
              className="export-dropdown-item excel"
              onClick={() => handleSelect(onExportExcel)}
              role="menuitem"
            >
              <div className="export-item-badge">
                <ExcelIcon size={18} />
              </div>
              <div className="export-item-content">
                <span className="export-item-title">Excel Spreadsheet</span>
                <span className="export-item-desc">Auto-fitted formatted table (.xlsx)</span>
              </div>
            </button>
          )}

          {onExportCsv && (
            <button
              type="button"
              className="export-dropdown-item csv"
              onClick={() => handleSelect(onExportCsv)}
              role="menuitem"
            >
              <div className="export-item-badge">
                <CsvIcon size={18} />
              </div>
              <div className="export-item-content">
                <span className="export-item-title">CSV Data File</span>
                <span className="export-item-desc">Standard comma-separated values (.csv)</span>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
