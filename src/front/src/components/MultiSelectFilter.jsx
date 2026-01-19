import React, { useState, useRef, useEffect } from "react";

// --- Компоненты SVG иконок ---
const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '4px' }}>
    <path d="M11 19C15.4183 19 19 15.4183 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M21 21L16.65 16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ClearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 18L18 6M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '6px' }}>
    <path d="M3 6H5M5 6H21M5 6V20C5 20.5304 5.21071 21.0391 5.58579 21.4142C5.96086 21.7893 6.46957 22 7 22H17C17.5304 22 18.0391 21.7893 18.4142 21.4142C18.7893 21.0391 19 20.5304 19 20V6M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M10 11V17M14 11V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
    setIsMobile(mobileRegex.test(userAgent));
  }, []);

  return isMobile;
}

export default function MultiSelectFilter({
  options = [],
  selectedValues = [],
  onChange,
  placeholder = "Выберите...",
  label = "",
  maxHeight = 200,
  width = "150px"
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const isMobile = useIsMobile();
  const [isInputFocused, setIsInputFocused] = useState(false);

  const setViewportScale = (scale) => {
    if (!isMobile) return;
    let viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      viewport = document.createElement('meta');
      viewport.name = 'viewport';
      document.head.appendChild(viewport);
    }
    viewport.setAttribute('content', `width=device-width, initial-scale=${scale}, maximum-scale=${scale}, user-scalable=no`);
  };

  const restoreOriginalViewport = () => {
    if (!isMobile) return;
    const originalContent = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
    let viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      viewport = document.createElement('meta');
      viewport.name = 'viewport';
      document.head.appendChild(viewport);
    }
    viewport.setAttribute('content', originalContent);
  };

  const handleInputFocus = () => {
    if (isMobile) {
      setIsInputFocused(true);
      setViewportScale(0.99);
    }
  };

  const handleInputBlur = () => {
    if (isMobile) {
      setIsInputFocused(false);
      restoreOriginalViewport();
    }
  };

  useEffect(() => {
    return () => {
      if (isInputFocused) {
        restoreOriginalViewport();
      }
    };
  }, [isInputFocused]);

  const filteredOptions = options.filter(opt =>
    opt.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleOption = (value) => {
    const newSelected = selectedValues.includes(value)
      ? selectedValues.filter(v => v !== value)
      : [...selectedValues, value];
    onChange(newSelected);
  };

  const clearSelection = () => {
    onChange([]);
  };

  const clearSearch = () => {
    setSearchTerm("");
  };

  const getDisplayText = () => {
    if (selectedValues.length === 0) return placeholder;
    if (selectedValues.length === 1) {
      const option = options.find(opt => opt.value === selectedValues[0]);
      return option ? option.label : placeholder;
    }
    return `${selectedValues.length} выбрано`;
  };

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm("");
        if (isInputFocused) {
            setIsInputFocused(false);
            restoreOriginalViewport();
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isInputFocused]);

  const handleTriggerClick = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setSearchTerm("");
    }
  };

  return (
    <div
      className="multi-select-filter"
      ref={dropdownRef}
      style={{
        position: 'relative',
        width: width,
        minWidth: width,
        maxWidth: width,
        boxSizing: 'border-box'
      }}
    >
      {label && <label style={{ color: 'white', display: 'block', marginBottom: '4px' }}>{label}</label>}

      <div
        className="multi-select-trigger"
        onClick={handleTriggerClick}
        style={{
          padding: '8px 12px',
          border: '1px solid #444',
          borderRadius: '4px',
          backgroundColor: '#1a1a1a',
          color: '#e0e0e0',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          boxSizing: 'border-box',
          overflow: 'hidden',
          height: '40px',
          minHeight: '40px'
        }}
      >
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          fontSize: '14px'
        }}>
          {getDisplayText()}
        </span>
        <span style={{
          marginLeft: '8px',
          flexShrink: 0,
          fontSize: '12px'
        }}>
          ▼
        </span>
      </div>

      {isOpen && (
        <div
          className="multi-select-dropdown"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1000,
            backgroundColor: '#1a1a1a',
            border: '1px solid #444',
            borderRadius: '4px',
            maxHeight: `${maxHeight}px`,
            overflowY: 'auto',
            marginTop: '2px',
            width: '100%',
            boxSizing: 'border-box',
            minWidth: width,
            maxWidth: width,
            fontSize: '14px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* --- НОВОЕ: Обёртка для поиска с позиционированием --- */}
          <div style={{ padding: '4px', backgroundColor: '#2a2a2a', borderBottom: '1px solid #444', position: 'relative', display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <SearchIcon />
                <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Поиск..."
                style={{
                    width: '100%',
                    padding: '4px 8px',
                    border: '1px solid #555',
                    borderRadius: '4px',
                    backgroundColor: '#1a1a1a',
                    color: '#e0e0e0',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                    outline: 'none',
                    borderLeft: 'none',
                    borderTopLeftRadius: 0,
                    borderBottomLeftRadius: 0,
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                />
            </div>
            {/* --- КНОПКА "×" ПОЗИЦИОНИРУЕТСЯ СПРАВА ВНУТРИ ПОЛЯ ВВОДА --- */}
            {searchTerm && (
              <button
                onClick={clearSearch}
                style={{
                  position: 'absolute',
                  right: '32px', // Смещение для учета иконки
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: '4px',
                  border: '1px solid #777',
                  borderRadius: '4px',
                  backgroundColor: '#3a3a3a',
                  color: '#e0e0e0',
                  cursor: 'pointer',
                  zIndex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ClearIcon />
              </button>
            )}
          </div>

          {/* --- Кнопка "Очистить всё" --- */}
          {selectedValues.length > 0 && (
            <div style={{ padding: '4px', backgroundColor: '#2a2a2a', borderBottom: '1px solid #444' }}>
              <button
                type="button"
                onClick={clearSelection}
                style={{
                  padding: '4px 8px',
                  border: '1px solid #777',
                  borderRadius: '4px',
                  backgroundColor: '#3a3a3a',
                  color: '#e0e0e0',
                  fontSize: '12px',
                  cursor: 'pointer',
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TrashIcon />
                Очистить всё
              </button>
            </div>
          )}

          {/* --- Список опций --- */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredOptions.length > 0 ? (
              filteredOptions.map(option => (
                <div
                  key={option.value}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: selectedValues.includes(option.value) ? '#bb86fc' : 'transparent',
                    borderBottom: '1px solid #3a3a3a',
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleOption(option.value)}
                >
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    margin: 0,
                    cursor: 'pointer',
                    width: '100%',
                    fontSize: '14px'
                  }}>
                    <input
                      type="checkbox"
                      checked={selectedValues.includes(option.value)}
                      onChange={() => {}}
                      style={{
                        marginRight: '8px',
                        cursor: 'pointer',
                        width: '16px',
                        height: '16px',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontSize: '14px'
                    }}>
                      {option.label}
                    </span>
                  </label>
                </div>
              ))
            ) : (
              <div style={{ padding: '8px 12px', color: '#888', fontStyle: 'italic', textAlign: 'center' }}>
                Ничего не найдено
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}