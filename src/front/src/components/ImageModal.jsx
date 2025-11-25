// ImageModal.jsx (опционально)
import React from 'react';

function ImageModal({ isOpen, onClose, imageUrl, altText = "Attachment" }) {
  if (!isOpen || !imageUrl) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose(); // Закрываем, если кликнули на задний фон (backdrop)
    }
  };

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick} style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)', // Полупрозрачный черный фон
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000, // Высокий z-index, чтобы быть поверх других элементов
    }}>
      <div className="modal-content" style={{
        position: 'relative', // Для позиционирования кнопки закрытия
        maxWidth: '90vw', // Максимальная ширина 90% от viewport
        maxHeight: '90vh', // Максимальная высота 90% от viewport
      }}>
        <img
          src={imageUrl}
          alt={altText}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain', // Изображение вписывается, сохраняя пропорции
            display: 'block', // Убираем лишнее пространство под изображением
          }}
          // Добавьте onClick, если нужно, чтобы клик по изображению тоже закрывал модальное окно
          // onClick={(e) => e.stopPropagation()} // Опционально: предотвращает всплытие клика на backdrop
        />
        <button
          className="close-modal-button" // Добавьте CSS класс для стилизации
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '10px', // Позиционируем сверху справа
            right: '10px',
            background: 'black',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '30px',
            height: '30px',
            cursor: 'pointer',
            fontSize: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          &times;
        </button>
      </div>
    </div>
  );
}

export default ImageModal;