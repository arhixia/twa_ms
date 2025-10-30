import React from "react";
export default function Modal({ open, onClose, children, title }) {
    if (!open) return null;
    
    return (
    <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
        <div>{title}</div>
        <button className="close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        </div>
    </div>
    );
}