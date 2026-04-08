// src/components/useModal.jsx
import { createContext, useContext, useState, useCallback } from 'react';

const ModalContext = createContext(null);

const styles = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 99999,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '16px',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
  },
  modal: {
    background: '#1e1e2e',
    borderRadius: '18px',
    padding: '28px 24px 20px',
    maxWidth: '320px', width: '100%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
    border: '1px solid rgba(255,255,255,0.07)',
    fontFamily: "'SF Pro Display', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  message: {
    margin: '0 0 24px',
    fontSize: '15px',
    lineHeight: 1.6,
    color: '#c9d1d9',
    fontWeight: '400',
    letterSpacing: '0.01em',
  },
  buttons: {
    display: 'flex', gap: '10px', justifyContent: 'flex-end',
  },
  btnCancel: {
    padding: '10px 20px',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    background: 'rgba(255,255,255,0.06)',
    color: '#8b949e',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '0.01em',
  },
  btnOk: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #4f8ef7, #3b6fd4)',
    color: '#fff',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
    letterSpacing: '0.01em',
    boxShadow: '0 4px 14px rgba(79,142,247,0.35)',
  },
};

export function ModalProvider({ children }) {
  const [modal, setModal] = useState(null);

  const showAlert = useCallback((message) => {
    return new Promise((resolve) => {
      setModal({ type: 'alert', message, resolve });
    });
  }, []);

  const showConfirm = useCallback((message) => {
    return new Promise((resolve) => {
      setModal({ type: 'confirm', message, resolve });
    });
  }, []);

  const handleClose = (result) => {
    modal?.resolve(result);
    setModal(null);
  };

  return (
    <ModalContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {modal && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <p style={styles.message}>{modal.message}</p>
            <div style={styles.buttons}>
              {modal.type === 'confirm' && (
                <button onClick={() => handleClose(false)} style={styles.btnCancel}>
                  Отмена
                </button>
              )}
              <button onClick={() => handleClose(true)} style={styles.btnOk}>
                {modal.type === 'confirm' ? 'Подтвердить' : 'ОК'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}

export function useModal() {
  return useContext(ModalContext);
}