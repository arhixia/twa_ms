// front/src/pages/admin/UsersPage.jsx
import React, { useState, useEffect } from 'react';
import { adminListUsers, adminCreateUser, adminChangeUserRole, adminDeactivateUser, adminActivateUser, adminUpdateUser, adminGetAllDistricts } from '../../api';
import UserCard from '../../components/UserCard';

// Иконки
const UserIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
    <path d="M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6"/>
  </svg>
);

const LoginIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-person-vcard" viewBox="0 0 16 16">
  <path d="M5 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4m4-2.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5M9 8a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4A.5.5 0 0 1 9 8m1 2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5"/>
  <path d="M2 2a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM1 4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8.96q.04-.245.04-.5C9 10.567 7.21 9 5 9c-2.086 0-3.8 1.398-3.984 3.181A1 1 0 0 1 1 12z"/>
</svg>
);

const PasswordIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-person-bounding-box" viewBox="0 0 16 16">
  <path d="M1.5 1a.5.5 0 0 0-.5.5v3a.5.5 0 0 1-1 0v-3A1.5 1.5 0 0 1 1.5 0h3a.5.5 0 0 1 0 1zM11 .5a.5.5 0 0 1 .5-.5h3A1.5 1.5 0 0 1 16 1.5v3a.5.5 0 0 1-1 0v-3a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 1-.5-.5M.5 11a.5.5 0 0 1 .5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 1 0 1h-3A1.5 1.5 0 0 1 0 14.5v-3a.5.5 0 0 1 .5-.5m15 0a.5.5 0 0 1 .5.5v3a1.5 1.5 0 0 1-1.5 1.5h-3a.5.5 0 0 1 0-1h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 1 .5-.5"/>
  <path d="M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1zm8-9a3 3 0 1 1-6 0 3 3 0 0 1 6 0"/>
</svg>
);

const NameIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
    <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6m2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0m4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4m-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10s-3.516.68-4.168 1.332c-.678.678-.83 1.418-.832 1.664z"/>
  </svg>
);

const RoleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-question-circle" viewBox="0 0 16 16">
  <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/>
  <path d="M5.255 5.786a.237.237 0 0 0 .241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286m1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94"/>
</svg>
);

const DistrictIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-buildings" viewBox="0 0 16 16">
  <path d="M14.763.075A.5.5 0 0 1 15 .5v15a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5V14h-1v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V10a.5.5 0 0 1 .342-.474L6 7.64V4.5a.5.5 0 0 1 .276-.447l8-4a.5.5 0 0 1 .487.022M6 8.694 1 10.36V15h5zM7 15h2v-1.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5V15h2V1.309l-7 3.5z"/>
  <path d="M2 11h1v1H2zm2 0h1v1H4zm-2 2h1v1H2zm2 0h1v1H4zm4-4h1v1H8zm2 0h1v1h-1zm-2 2h1v1H8zm2 0h1v1h-1zm2-2h1v1h-1zm0 2h1v1h-1zM8 7h1v1H8zm2 0h1v1h-1zm2 0h1v1h-1zM8 5h1v1H8zm2 0h1v1h-1zm2 0h1v1h-1zm0-2h1v1h-1z"/>
</svg>
);



// Компонент автодополнения для района
function DistrictInput({ value, onChange, districts, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const [filteredDistricts, setFilteredDistricts] = useState(districts);
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    if (!inputValue.trim()) {
      setFilteredDistricts(districts);
    } else {
      const termLower = inputValue.toLowerCase();
      setFilteredDistricts(
        districts.filter(district => district.name.toLowerCase().includes(termLower))
      );
    }
  }, [inputValue, districts]);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
    setIsOpen(true);
  };

  const handleDistrictSelect = (district) => {
    setInputValue(district.name);
    onChange(district.id);
    setIsOpen(false);
  };

  const handleInputFocus = () => setIsOpen(true);
  const handleInputBlur = () => setTimeout(() => setIsOpen(false), 150);

  return (
    <div className="searchable-select-container">
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        placeholder={placeholder}
        className="searchable-select-input"
      />
      {isOpen && filteredDistricts.length > 0 && (
        <ul className="searchable-select-dropdown">
          {filteredDistricts.map((district) => (
            <li
              key={district.id}
              onClick={() => handleDistrictSelect(district)}
              className="searchable-select-option"
              onMouseDown={(e) => e.preventDefault()}
            >
              {district.name}
            </li>
          ))}
        </ul>
      )}
      {isOpen && filteredDistricts.length === 0 && inputValue.trim() !== '' && (
        <ul className="searchable-select-dropdown">
          <li className="searchable-select-no-results">
            Ничего не найдено
          </li>
        </ul>
      )}
    </div>
  );
}

// Компонент модального окна добавления
function CreateUserModal({ isOpen, onClose, onCreate, roleDisplayNames }) {
  const [formData, setFormData] = useState({
    login: '',
    password: '',
    name: '',
    lastname: '',
    role: 'montajnik',
    telegram_id: '',
    district_id: null,
  });
  const [districts, setDistricts] = useState([]);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && formData.role === 'montajnik') {
      loadDistricts();
    }
  }, [isOpen, formData.role]);

  async function loadDistricts() {
    setLoadingDistricts(true);
    try {
      const data = await adminGetAllDistricts();
      setDistricts(data || []);
    } catch (err) {
      console.error("Ошибка загрузки регионов:", err);
    } finally {
      setLoadingDistricts(false);
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'role') {
      setFormData(prev => ({
        ...prev,
        [name]: value,
        district_id: value === 'montajnik' ? prev.district_id : null
      }));
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleDistrictChange = (districtId) => {
    setFormData({ ...formData, district_id: districtId });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.login.trim() || !formData.password.trim() || !formData.name.trim() || !formData.lastname.trim()) {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Заполните все обязательные поля");
      } else {
        alert("Заполните все обязательные поля");
      }
      return;
    }
    
    setSaving(true);
    try {
      const payload = { ...formData };
      if (payload.telegram_id === '') delete payload.telegram_id;
      if (payload.role !== 'montajnik') delete payload.district_id;
      const newUser = await adminCreateUser(payload);
      onCreate(newUser); // Вызываем onCreate, который обновит список
      setFormData({ 
        login: '', 
        password: '', 
        name: '', 
        lastname: '', 
        role: 'montajnik', 
        telegram_id: '',
        district_id: null
      });
      onClose();
      // Показываем алерт
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
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="task-section-header">
            <UserIcon />
            <span>Добавить пользователя</span>
          </div>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="task-field">
            <div className="task-field-label">
              <LoginIcon />
              Логин:
            </div>
            <div className="task-field-value">
              <input
                type="text"
                name="login"
                value={formData.login}
                onChange={handleChange}
                placeholder="Введите логин"
                className="dark-select"
              />
            </div>
          </div>
          
          <div className="task-field">
  <div className="task-field-label">
    <PasswordIcon />
    Пароль:
  </div>
  <div className="task-field-value">
    <input
      type="text"
      name="password"
      value={formData.password}
      onChange={handleChange}
      placeholder="Введите пароль"
      className="dark-select"
    />
  </div>
</div>
          
          <div className="task-field">
            <div className="task-field-label">
              <NameIcon />
              Имя:
            </div>
            <div className="task-field-value">
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Введите имя"
                className="dark-select"
              />
            </div>
          </div>
          
          <div className="task-field">
            <div className="task-field-label">
              <UserIcon />
              Фамилия:
            </div>
            <div className="task-field-value">
              <input
                type="text"
                name="lastname"
                value={formData.lastname}
                onChange={handleChange}
                placeholder="Введите фамилию"
                className="dark-select"
              />
            </div>
          </div>
          
          <div className="task-field">
            <div className="task-field-label">
              <RoleIcon />
              Роль:
            </div>
            <div className="task-field-value">
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
                    <option value="manager">{roleDisplayNames.manager}</option> 
                  </select>
            </div>
          </div>
          
          {formData.role === 'montajnik' && (
            <div className="task-field">
              <div className="task-field-label">
                <DistrictIcon />
                Регион:
              </div>
              <div className="task-field-value">
                {loadingDistricts ? (
                  <div className="empty">Загрузка...</div>
                ) : districts.length > 0 ? (
                  <DistrictInput
                    value={districts.find(d => d.id === formData.district_id)?.name || ""}
                    onChange={handleDistrictChange}
                    districts={districts}
                    placeholder="Выберите регион"
                  />
                ) : (
                  <div className="empty">Нет доступных регионов</div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="gradient-button" style={{ background: 'linear-gradient(to right, #6c757d, #495057)' }} onClick={onClose}>Отмена</button>
          <button className="gradient-button" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Компонент модального окна редактирования
function EditUserModal({ user, onClose, onSave, roleDisplayNames }) {
  const [formData, setFormData] = useState({
    name: user.name,
    lastname: user.lastname,
    login: user.login,
    password: '', // Поле для нового пароля
    role: user.role,
    district_id: user.district_id || null,
  });
  const [districts, setDistricts] = useState([]);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user.role === 'montajnik') {
      loadDistricts();
    }
  }, [user.role]);

  async function loadDistricts() {
    setLoadingDistricts(true);
    try {
      const data = await adminGetAllDistricts();
      setDistricts(data || []);
    } catch (err) {
      console.error("Ошибка загрузки районов:", err);
    } finally {
      setLoadingDistricts(false);
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'role') {
      setFormData(prev => ({
        ...prev,
        [name]: value,
        district_id: value === 'montajnik' ? prev.district_id : null
      }));
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleDistrictChange = (districtId) => {
    setFormData({ ...formData, district_id: districtId });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.lastname.trim() || !formData.login.trim()) {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Заполните все обязательные поля");
      } else {
        alert("Заполните все обязательные поля");
      }
      return;
    }
    
    setSaving(true);
    try {
      // Подготовим payload, исключив пустой пароль
      const payload = { ...formData };
      if (!payload.password) {
        delete payload.password; // Не отправляем пустой пароль
      }
      if (payload.role !== 'montajnik') delete payload.district_id;
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
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="task-section-header">
            <UserIcon />
            <span>Редактировать пользователя #{user.id}</span>
          </div>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="task-field">
            <div className="task-field-label">
              <LoginIcon />
              Логин:
            </div>
            <div className="task-field-value">
              <input
                type="text"
                name="login"
                value={formData.login}
                onChange={handleChange}
                required
                className="dark-select"
              />
            </div>
          </div>
          
          <div className="task-field">
            <div className="task-field-label">
              <PasswordIcon />
              Новый пароль (оставьте пустым, чтобы не менять):
            </div>
            <div className="task-field-value">
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Введите новый пароль"
                className="dark-select"
              />
            </div>
          </div>
          
          <div className="task-field">
            <div className="task-field-label">
              <NameIcon />
              Имя:
            </div>
            <div className="task-field-value">
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="dark-select"
              />
            </div>
          </div>
          
          <div className="task-field">
            <div className="task-field-label">
              <UserIcon />
              Фамилия:
            </div>
            <div className="task-field-value">
              <input
                type="text"
                name="lastname"
                value={formData.lastname}
                onChange={handleChange}
                required
                className="dark-select"
              />
            </div>
          </div>
          
          <div className="task-field">
            <div className="task-field-label">
              <RoleIcon />
              Роль:
            </div>
            <div className="task-field-value">
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
                <option value="manager">{roleDisplayNames.manager}</option> 
              </select>
            </div>
          </div>
          
          {formData.role === 'montajnik' && (
            <div className="task-field">
              <div className="task-field-label">
                <DistrictIcon />
                Регион:
              </div>
              <div className="task-field-value">
                {loadingDistricts ? (
                  <div className="empty">Загрузка...</div>
                ) : districts.length > 0 ? (
                  <DistrictInput
                    value={districts.find(d => d.id === formData.district_id)?.name || ""}
                    onChange={handleDistrictChange}
                    districts={districts}
                    placeholder="Выберите регион"
                  />
                ) : (
                  <div className="empty">Нет доступных регионов</div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button className="gradient-button" style={{ background: 'linear-gradient(to right, #6c757d, #495057)' }} onClick={onClose}>Отмена</button>
          <button className="gradient-button" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Маппинг ролей для отображения
  const roleDisplayNames = {
    admin: 'Администратор',
    logist: 'Логист',
    montajnik: 'Монтажник',
    tech_supp: 'Тех.специалист',
    manager: 'Менеджер'
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

  const handleCreateUser = (newUser) => {
    setUsers([...users, newUser]);
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
  };

  // Функция закрытия модального окна редактирования
  const closeEditUserModal = () => {
    setShowEditModal(false);
    setEditingUser(null);
  };

  if (loading) return <div className="logist-main"><div className="empty">Загрузка...</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Пользователи</h1>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button className="gradient-button" onClick={() => setShowCreateModal(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus" viewBox="0 0 16 16">
              <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4" stroke="currentColor" strokeWidth="2" fill="none"/>
            </svg>
            Добавить пользователя
          </button>
        </div>
        
        <div className="cards" style={{ marginTop: '24px', gap: '24px' }}>
          {users.map(user => (
            <UserCard
              key={user.id}
              user={user}
              roleDisplayNames={roleDisplayNames}
              onEditRole={handleRoleChange}
              onDeactivate={handleDeactivate}
              onActivate={handleActivate}
              onEditUser={openEditUserModal}
            />
          ))}
        </div>

        {/* Модальное окно добавления пользователя */}
        <CreateUserModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateUser}
          roleDisplayNames={roleDisplayNames}
        />

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
    </div>
  );
}

export default UsersPage;