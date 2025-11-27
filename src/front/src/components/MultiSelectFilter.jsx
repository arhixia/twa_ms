// front/src/components/MultiSelectFilter.jsx
import React, { useState, useRef, useEffect } from "react";

export default function MultiSelectFilter({
  options = [],
  selectedValues = [],
  onChange,
  placeholder = "Выберите...",
  label = "",
  maxHeight = 200,
  width = "150px" // Фиксируем ширину по умолчанию
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const dropdownRef = useRef(null);

  // --- НОВОЕ: Фильтрация опций на основе searchTerm ---
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
        // --- НОВОЕ: Очищаем поисковый термин при закрытии ---
        setSearchTerm("");
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleTriggerClick = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setSearchTerm(""); // Очищаем при открытии
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
          <div style={{ padding: '4px', backgroundColor: '#2a2a2a', borderBottom: '1px solid #444', position: 'relative' }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="🔍 Поиск..."
              style={{
                width: '100%', // Полностью заполняет родителя
                padding: '4px 28px 4px 8px', // paddingLeft для текста, paddingRight для кнопки "×"
                border: '1px solid #555',
                borderRadius: '4px',
                backgroundColor: '#1a1a1a',
                color: '#e0e0e0',
                fontSize: '13px',
                boxSizing: 'border-box', // padding входит в width
              }}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
            {/* --- КНОПКА "×" ПОЗИЦИОНИРУЕТСЯ СПРАВА ВНУТРИ ПОЛЯ ВВОДА --- */}
            {searchTerm && (
              <button
                onClick={clearSearch}
                style={{
                  position: 'absolute',
                  right: '8px', // Расстояние от правого края родителя (div с position: relative)
                  top: '50%',
                  transform: 'translateY(-50%)', // Центрируем по вертикали
                  padding: '2px 6px',
                  border: '1px solid #777',
                  borderRadius: '4px',
                  backgroundColor: '#3a3a3a',
                  color: '#e0e0e0',
                  fontSize: '12px',
                  cursor: 'pointer',
                  zIndex: 1, // Поверх текста
                }}
              >
                ×
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
                }}
              >
                🗑 Очистить всё
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