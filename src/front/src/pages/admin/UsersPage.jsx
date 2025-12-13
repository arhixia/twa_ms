import React, { useState, useEffect } from 'react';
import { adminListUsers, adminCreateUser, adminChangeUserRole, adminDeactivateUser, adminActivateUser, adminUpdateUser } from '../../api';
import UserCard from '../../components/UserCard';

// Компонент модального окна редактирования
function EditUserModal({ user, onClose, onSave, roleDisplayNames }) {
  const [formData, setFormData] = useState({
    name: user.name,
    lastname: user.lastname,
    login: user.login,
    password: '', // Поле для нового пароля
    role: user.role,
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Подготовим payload, исключив пустой пароль
      const payload = { ...formData };
      if (!payload.password) {
        delete payload.password; // Не отправляем пустой пароль
      }
      const updatedUser = await adminUpdateUser(user.id, payload);
      onSave(updatedUser); // Вызываем onSave, который обновит список
      onClose();
      // Показываем алерт
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`✅ Пользователь ${updatedUser.name} ${updatedUser.lastname} обновлён.`);
      } else {
        alert(`✅ Пользователь ${updatedUser.name} ${updatedUser.lastname} обновлён.`);
      }
    } catch (err) {
      console.error("Ошибка обновления пользователя:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось обновить пользователя.";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`❌ Ошибка: ${errorMsg}`);
      } else {
        alert(`❌ Ошибка: ${errorMsg}`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h3>Редактировать пользователя #{user.id}</h3>
          <button className="add-btn" style={{ padding: '4px 8px' }} onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}> {/* Добавлен стиль для gap */}
            <label className="dark-label" style={{ margin: 0 }}> {/* Убран маргин */}
              Имя
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "4px",
                  border: "1px solid #444",
                  backgroundColor: "#1a1a1a",
                  color: "#e0e0e0",
                }}
              />
            </label>
            <label className="dark-label" style={{ margin: 0 }}> {/* Убран маргин */}
              Фамилия
              <input
                type="text"
                name="lastname"
                value={formData.lastname}
                onChange={handleChange}
                required
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "4px",
                  border: "1px solid #444",
                  backgroundColor: "#1a1a1a",
                  color: "#e0e0e0",
                }}
              />
            </label>
            <label className="dark-label" style={{ margin: 0 }}> {/* Убран маргин */}
              Логин
              <input
                type="text"
                name="login"
                value={formData.login}
                onChange={handleChange}
                required
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "4px",
                  border: "1px solid #444",
                  backgroundColor: "#1a1a1a",
                  color: "#e0e0e0",
                }}
              />
            </label>
            <label className="dark-label" style={{ margin: 0 }}> {/* Убран маргин */}
              Новый пароль (оставьте пустым, чтобы не менять)
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Введите новый пароль"
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "4px",
                  border: "1px solid #444",
                  backgroundColor: "#1a1a1a",
                  color: "#e0e0e0",
                }}
              />
            </label>
            <label className="dark-label" style={{ margin: 0 }}> {/* Убран маргин */}
              Роль
              <select
                name="role"
                value={formData.role}
                onChange={handleChange}
                className="dark-select"
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "4px",
                  border: "1px solid #444",
                  backgroundColor: "#1a1a1a",
                  color: "#e0e0e0",
                }}
              >
                <option value="admin">{roleDisplayNames.admin}</option>
                <option value="logist">{roleDisplayNames.logist}</option>
                <option value="montajnik">{roleDisplayNames.montajnik}</option>
                <option value="tech_supp">{roleDisplayNames.tech_supp}</option>
              </select>
            </label>
          </div>
          <div className="modal-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '15px' }}>
            <button type="button" className="add-btn" style={{ backgroundColor: '#6c757d' }} onClick={onClose}>Отмена</button>
            <button type="submit" className="add-btn" disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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

  // Маппинг ролей для отображения
  const roleDisplayNames = {
    admin: 'Администратор',
    logist: 'Логист',
    montajnik: 'Монтажник',
    tech_supp: 'Тех.специалист',
  };

  // Состояния для модального окна редактирования
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const fetchUsers = async () => {
    try {
      setLoading(true); // Показываем лоадер при перезагрузке
      const data = await adminListUsers();
      setUsers(data);
    } catch (err) {
      console.error("Ошибка загрузки пользователей:", err);
      const errorMsg = err.response?.data?.detail || "Ошибка загрузки пользователей.";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`❌ ${errorMsg}`);
      } else {
        alert(`❌ ${errorMsg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRoleChange = async (userId, newRole) => {
    try {
      const updated = await adminChangeUserRole(userId, newRole);
      setUsers(users.map(u => u.id === updated.id ? updated : u));
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`✅ Роль пользователя ${updated.name} ${updated.lastname} изменена на ${roleDisplayNames[updated.role]}.`);
      } else {
        alert(`✅ Роль пользователя ${updated.name} ${updated.lastname} изменена на ${roleDisplayNames[updated.role]}.`);
      }
    } catch (err) {
      console.error("Ошибка изменения роли:", err);
      const errorMsg = err.response?.data?.detail || "Ошибка при изменении роли.";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`❌ Ошибка: ${errorMsg}`);
      } else {
        alert(`❌ Ошибка: ${errorMsg}`);
      }
    }
  };

  const handleDeactivate = async (userId) => {
    if (!window.confirm("Вы уверены, что хотите деактивировать этого пользователя?")) return;
    try {
      const updated = await adminDeactivateUser(userId);
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`✅ Пользователь ${updated.name} ${updated.lastname} деактивирован.`);
      } else {
        alert(`✅ Пользователь ${updated.name} ${updated.lastname} деактивирован.`);
      }
      // Перезагрузка страницы
      fetchUsers();
    } catch (err) {
      console.error("Ошибка деактивации пользователя:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось деактивировать пользователя.";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`❌ Ошибка: ${errorMsg}`);
      } else {
        alert(`❌ Ошибка: ${errorMsg}`);
      }
    }
  };

  const handleActivate = async (userId) => {
    if (!window.confirm("Вы уверены, что хотите активировать этого пользователя?")) return;
    try {
      const updated = await adminActivateUser(userId);
      setUsers(prev => prev.map(u => u.id === updated.id ? updated : u));
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`✅ Пользователь ${updated.name} ${updated.lastname} активирован.`);
      } else {
        alert(`✅ Пользователь ${updated.name} ${updated.lastname} активирован.`);
      }
      // Перезагрузка страницы
      fetchUsers();
    } catch (err) {
      console.error("Ошибка активации пользователя:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось активировать пользователя.";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`❌ Ошибка: ${errorMsg}`);
      } else {
        alert(`❌ Ошибка: ${errorMsg}`);
      }
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
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`✅ Пользователь ${newUser.name} ${newUser.lastname} создан.`);
      } else {
        alert(`✅ Пользователь ${newUser.name} ${newUser.lastname} создан.`);
      }
    } catch (err) {
      console.error("Ошибка создания пользователя:", err);
      const errorMsg = err.response?.data?.detail || "Ошибка при создании пользователя.";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`❌ Ошибка: ${errorMsg}`);
      } else {
        alert(`❌ Ошибка: ${errorMsg}`);
      }
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Функция открытия модального окна редактирования
  const openEditUserModal = (user) => {
    setEditingUser(user);
    setShowEditModal(true);
  };

  // Функция сохранения обновлённого пользователя
  const handleUserSave = (updatedUser) => {
    // Обновляем список локально
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
    setShowEditModal(false);
    setEditingUser(null);
    // fetchUsers(); // Убрана, так как локальное обновление быстрее
  };

  // Функция закрытия модального окна редактирования
  const closeEditUserModal = () => {
    setShowEditModal(false);
    setEditingUser(null);
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
                <option value="admin">{roleDisplayNames.admin}</option>
                <option value="logist">{roleDisplayNames.logist}</option>
                <option value="montajnik">{roleDisplayNames.montajnik}</option>
                <option value="tech_supp">{roleDisplayNames.tech_supp}</option>
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
            roleDisplayNames={roleDisplayNames}
            onEditRole={handleRoleChange}
            onDeactivate={handleDeactivate}
            onActivate={handleActivate}
            onEditUser={openEditUserModal} // Передаём функцию открытия модального окна
          />
        ))}
      </div>

      {/* Модальное окно редактирования пользователя */}
      {showEditModal && editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={closeEditUserModal}
          onSave={handleUserSave}
          roleDisplayNames={roleDisplayNames}
        />
      )}
    </div>
  );
}

export default UsersPage;