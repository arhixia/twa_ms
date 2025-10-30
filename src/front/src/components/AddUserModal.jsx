// front/src/pages/admin/components/AddUserModal.jsx
import React, { useState } from 'react';
import { adminCreateUser } from '../api';

function AddUserModal({ onClose, onAdd }) {
  const [formData, setFormData] = useState({
    login: '',
    password: '',
    name: '',
    lastname: '',
    role: 'montajnik',
    telegram_id: '',
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formData };
      if (payload.telegram_id === '') delete payload.telegram_id;
      const newUser = await adminCreateUser(payload);
      onAdd(newUser);
    } catch (err) {
      alert('Ошибка при создании пользователя');
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h3>Добавить пользователя</h3>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-grid">
            <label>
              Логин
              <input type="text" name="login" value={formData.login} onChange={handleChange} required />
            </label>
            <label>
              Пароль
              <input type="password" name="password" value={formData.password} onChange={handleChange} required />
            </label>
            <label>
              Имя
              <input type="text" name="name" value={formData.name} onChange={handleChange} required />
            </label>
            <label>
              Фамилия
              <input type="text" name="lastname" value={formData.lastname} onChange={handleChange} required />
            </label>
            <label>
              Роль
              <select name="role" value={formData.role} onChange={handleChange}>
                <option value="admin">admin</option>
                <option value="logist">logist</option>
                <option value="montajnik">montajnik</option>
                <option value="tech_supp">tech_supp</option>
              </select>
            </label>
            <label>
              Telegram ID
              <input type="number" name="telegram_id" value={formData.telegram_id} onChange={handleChange} />
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="primary">Создать</button>
            <button type="button" onClick={onClose}>Отмена</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddUserModal;