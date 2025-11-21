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
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (value) => {
    const newSelected = selectedValues.includes(value)
      ? selectedValues.filter(v => v !== value)
      : [...selectedValues, value];
    
    onChange(newSelected);
  };

  const clearSelection = () => {
    onChange([]);
  };

  const getDisplayText = () => {
    if (selectedValues.length === 0) return placeholder;
    if (selectedValues.length === 1) {
      const option = options.find(opt => opt.value === selectedValues[0]);
      return option ? option.label : placeholder;
    }
    return `${selectedValues.length} выбрано`;
  };

  return (
    <div 
      className="multi-select-filter" 
      ref={dropdownRef} 
      style={{ 
        position: 'relative', 
        width: width,
        minWidth: width, // Фиксируем минимальную ширину
        maxWidth: width, // Фиксируем максимальную ширину
        boxSizing: 'border-box'
      }}
    >
      <div
        className="multi-select-trigger"
        onClick={() => setIsOpen(!isOpen)}
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
          height: '40px', // Фиксируем высоту
          minHeight: '40px' // Убедимся, что высота не уменьшается
        }}
      >
        <span style={{ 
          overflow: 'hidden', 
          textOverflow: 'ellipsis', 
          whiteSpace: 'nowrap',
          flex: 1,
          fontSize: '14px' // Фиксируем размер шрифта
        }}>
          {getDisplayText()}
        </span>
        <span style={{ 
          marginLeft: '8px',
          flexShrink: 0,
          fontSize: '12px' // Фиксируем размер шрифта для стрелки
        }}>▼</span>
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
            minWidth: width, // Сохраняем ширину такой же как у триггера
            maxWidth: width,
            fontSize: '14px' // Фиксируем размер шрифта в выпадающем списке
          }}
        >
          {selectedValues.length > 0 && (
            <div
              style={{
                padding: '8px',
                borderBottom: '1px solid #444',
                backgroundColor: '#2a2a2a',
                cursor: 'pointer',
                fontSize: '12px'
              }}
              onClick={clearSelection}
            >
              Очистить все
            </div>
          )}
          
          {options.map(option => (
            <div
              key={option.value}
              style={{
                padding: '8px 12px',
                backgroundColor: selectedValues.includes(option.value) ? '#3a3a3a' : 'transparent',
                borderBottom: '1px solid #3a3a3a',
                fontSize: '14px' // Фиксируем размер шрифта
              }}
            >
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                margin: 0, 
                cursor: 'pointer', 
                width: '100%',
                fontSize: '14px' // Фиксируем размер шрифта
              }}>
                <input
                  type="checkbox"
                  checked={selectedValues.includes(option.value)}
                  onChange={() => toggleOption(option.value)}
                  style={{ 
                    marginRight: '8px', 
                    cursor: 'pointer',
                    width: '16px', // Фиксируем размер чекбокса
                    height: '16px'
                  }}
                />
                <span style={{ 
                  flex: 1, 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis', 
                  whiteSpace: 'nowrap',
                  fontSize: '14px' // Фиксируем размер шрифта
                }}>
                  {option.label}
                </span>
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}