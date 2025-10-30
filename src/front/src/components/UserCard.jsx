// front/src/components/UserCard.jsx
import React from 'react';

export default function UserCard({ user, onDelete, onEditRole }) {
  const handleDelete = () => onDelete(user.id);

  const handleRoleChange = (e) => {
    const newRole = e.target.value;
    const confirmMsg = `Вы уверены, что хотите изменить роль пользователя ${user.name} ${user.lastname} на "${newRole}"?`;
    if (window.confirm(confirmMsg)) {
      onEditRole(user.id, newRole); // ✅ Передаём ID и новую роль
    } else {
      // Сбрасываем значение обратно
      e.target.value = user.role;
    }
  };

  return (
    <div className="task-card">
      <div className="task-row">
        <div className="task-title">{user.name} {user.lastname}</div>
        <div className="task-meta">{user.role}</div>
      </div>
      <div className="task-meta">
        Логин: {user.login}
      </div>
      <div className="task-meta">
        Telegram ID: {user.telegram_id || '—'}
      </div>
      <div className="task-meta">
        Активен: {user.is_active ? 'Да' : 'Нет'}
      </div>
      <div className="modal-actions">
        {/* Выпадающий список с подтверждением */}
        <select value={user.role} onChange={handleRoleChange} style={{ width: '140px' }}>
          <option value="admin">admin</option>
          <option value="logist">logist</option>
          <option value="montajnik">montajnik</option>
          <option value="tech_supp">tech_supp</option>
        </select>
        <button className="primary" style={{ backgroundColor: '#ef4444' }} onClick={handleDelete}>
          Удалить
        </button>
      </div>
    </div>
  );
}