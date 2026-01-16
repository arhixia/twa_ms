// ImageModal.jsx
import React, { useEffect, useRef } from 'react';

function ImageModal({ isOpen, onClose, attachments, currentIndex, onPrev, onNext }) {
  const modalRef = useRef(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  // --- Обработчик клавиатуры ---
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault(); // Предотвращаем прокрутку страницы
        onPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onNext();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onPrev, onNext, onClose]);

  // --- Обработчики свайпа ---
  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e) => {
    // Можно добавить визуальный эффект, если хотите
  };

  const handleTouchEnd = (e) => {
    touchEndX.current = e.touches[0].clientX;
    const diff = touchStartX.current - touchEndX.current;

    // Установите минимальное расстояние для срабатывания свайпа (например, 50px)
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        // Свайп влево -> следующее изображение
        onNext();
      } else {
        // Свайп вправо -> предыдущее изображение
        onPrev();
      }
    }
  };

  if (!isOpen || !Array.isArray(attachments) || attachments.length === 0 || currentIndex < 0 || currentIndex >= attachments.length) {
    return null;
  }

  const currentAttachment = attachments[currentIndex];
  const imageUrl = currentAttachment.presigned_url || require('@/api').getAttachmentUrl(currentAttachment.storage_key);
  const altText = `Attachment ${currentIndex + 1} of ${attachments.length}`;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose(); // Закрываем, если кликнули на задний фон (backdrop)
    }
  };

  // --- Рендер ---
  return (
    <div
      ref={modalRef} // Привязываем ref для обработки событий
      className="modal-backdrop"
      onClick={handleBackdropClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      {/* Кнопка "Назад" слева */}
      {attachments.length > 1 && (
        <button
          className="nav-button nav-button-prev"
          onClick={(e) => {
            e.stopPropagation(); // Останавливаем всплытие, чтобы не закрывать модальное окно
            onPrev();
          }}
          style={{
            position: 'absolute',
            left: '20px', // Отступ от левого края
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(0, 0, 0, 0.5)', // Полупрозрачный фон
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            cursor: 'pointer',
            fontSize: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001, // Выше чем контент, но ниже чем закрывающая кнопка
          }}
          aria-label="Previous image"
        >
          &lt;
        </button>
      )}

      <div
        className="modal-content"
        style={{
          position: 'relative',
          maxWidth: '90vw',
          maxHeight: '90vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src={imageUrl}
          alt={altText}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            display: 'block',
          }}
          onClick={(e) => e.stopPropagation()} // Опционально: предотвращает всплытие клика на backdrop
        />

        {/* Индикатор позиции (опционально) */}
        <div
          style={{
            position: 'absolute',
            top: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            color: 'white',
            fontSize: '14px',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            padding: '2px 8px',
            borderRadius: '10px',
          }}
        >
          {currentIndex + 1} / {attachments.length}
        </div>

        {/* Кнопка "Закрыть" */}
        <button
          className="close-modal-button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '10px',
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
            zIndex: 1002, // Самая высокая z-index
          }}
          aria-label="Close modal"
        >
          &times;
        </button>
      </div>

      {/* Кнопка "Вперед" справа */}
      {attachments.length > 1 && (
        <button
          className="nav-button nav-button-next"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          style={{
            position: 'absolute',
            right: '20px', // Отступ от правого края
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(0, 0, 0, 0.5)',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            cursor: 'pointer',
            fontSize: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
          }}
          aria-label="Next image"
        >
          &gt;
        </button>
      )}
    </div>
  );
}

export default ImageModal;
