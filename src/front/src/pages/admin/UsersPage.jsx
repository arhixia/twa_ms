// front/src/pages/admin/UsersPage.jsx
import React, { useState, useEffect } from 'react';
import { adminListUsers, adminCreateUser, adminChangeUserRole, adminDeactivateUser, adminActivateUser } from '../../api'; // <--- Убраны adminDeleteUser
import UserCard from '../../components/UserCard';

function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    login: '',
    password: '',
    name: '',
    lastname: '',
    role: 'montajnik',
    telegram_id: '',
  });

  const fetchUsers = async () => {
    try {
      const data = await adminListUsers();
      setUsers(data);
    } catch (err) {
      alert('Ошибка загрузки пользователей');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Убираем handleDelete

  const handleRoleChange = async (userId, newRole) => {
    try {
      const updated = await adminChangeUserRole(userId, newRole);
      setUsers(users.map(u => u.id === updated.id ? updated : u));
    } catch (err) {
      alert('Ошибка при изменении роли');
    }
  };

  // --- НОВАЯ ФУНКЦИЯ: Деактивировать пользователя ---
  const handleDeactivate = async (userId) => {
    if (!window.confirm("Вы уверены, что хотите деактивировать этого пользователя?")) return;
    try {
      const updated = await adminDeactivateUser(userId);
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
      alert(`Пользователь ${updated.name} ${updated.lastname} деактивирован.`);
    } catch (err) {
      console.error("Ошибка деактивации пользователя:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось деактивировать пользователя.";
      alert(`Ошибка: ${errorMsg}`);
    }
  };

  const handleActivate = async (userId) => {
    if (!window.confirm("Вы уверены, что хотите активировать этого пользователя?")) return;
    try {
      const updated = await adminActivateUser(userId);
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
      alert(`Пользователь ${updated.name} ${updated.lastname} активирован.`);
    } catch (err) {
      console.error("Ошибка активации пользователя:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось активировать пользователя.";
      alert(`Ошибка: ${errorMsg}`);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formData };
      if (payload.telegram_id === '') delete payload.telegram_id;
      const newUser = await adminCreateUser(payload);
      setUsers([...users, newUser]);
      setFormData({ login: '', password: '', name: '', lastname: '', role: 'montajnik', telegram_id: '' });
      setShowForm(false);
    } catch (err) {
      alert('Ошибка при создании пользователя');
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  if (loading) return <div className="empty">Загрузка...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Пользователи</h1>
        <button className="add-btn" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Отмена' : 'Добавить пользователя'}
        </button>
      </div>
      {showForm && (
        <form onSubmit={handleCreate} className="task-detail">
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
            <label className="dark-label">
              Роль
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="dark-select"
              >
                <option value="admin">admin</option>
                <option value="logist">logist</option>
                <option value="montajnik">montajnik</option>
                <option value="tech_supp">tech_supp</option>
              </select>
            </label>
          </div>
          <button type="submit" className="add-btn">Создать</button>
        </form>
      )}
      <div className="cards">
        {users.map(user => (
          <UserCard
            key={user.id}
            user={user}
            // onDelete={handleDelete} // <--- Убрано
            onEditRole={handleRoleChange}
            onDeactivate={handleDeactivate}
            onActivate={handleActivate}
          />
        ))}
      </div>
    </div>
  );
}

export default UsersPage;