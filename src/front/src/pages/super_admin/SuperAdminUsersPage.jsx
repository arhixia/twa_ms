import React, { useState, useEffect } from 'react';
import { superAdminListAllUsers, superAdminCreateUser, superAdminUpdateUser, superAdminListAllCompanies } from '../../api';
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

const CompanyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
  </svg>
);

// Компонент поиска и выбора компании
function SearchableCompanySelect({ availableCompanies, onSelect, selectedCompanyId }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredCompanies, setFilteredCompanies] = useState(availableCompanies);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredCompanies(availableCompanies);
    } else {
      const termLower = searchTerm.toLowerCase();
      setFilteredCompanies(
        availableCompanies.filter(c =>
          (c.name && c.name.toLowerCase().includes(termLower)) ||
          (c.id && c.id.toString().includes(termLower))
        )
      );
    }
  }, [searchTerm, availableCompanies]);

  const handleInputChange = (e) => {
    setSearchTerm(e.target.value);
    setIsOpen(true);
  };

  const handleItemClick = (company) => {
    onSelect(company.id);
    setSearchTerm(""); // Очищаем поле поиска после выбора
  };

  const handleInputFocus = () => setIsOpen(true);
  const handleInputBlur = () => setTimeout(() => setIsOpen(false), 150);

  // Найти название выбранной компании
  const selectedCompany = availableCompanies.find(c => c.id === selectedCompanyId);

  return (
    <div className="searchable-select-container">
      <input
        type="text"
        value={selectedCompany ? `${selectedCompany.name} (ID: ${selectedCompany.id})` : searchTerm}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        placeholder="🔍 Поиск компании (название, ID)..."
        className="searchable-select-input"
        readOnly={!searchTerm} // Только для чтения если не в режиме поиска
      />
      {isOpen && filteredCompanies.length > 0 && (
        <ul className="searchable-select-dropdown">
          {filteredCompanies.map((c) => (
            <li
              key={c.id}
              onClick={() => handleItemClick(c)}
              className="searchable-select-option"
              onMouseDown={(e) => e.preventDefault()}
            >
              {c.name} (ID: {c.id})
            </li>
          ))}
        </ul>
      )}
      {isOpen && filteredCompanies.length === 0 && searchTerm.trim() !== '' && (
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
    company_id: ''
  });
  const [companies, setCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadCompanies();
    }
  }, [isOpen]);

  const loadCompanies = async () => {
    setLoadingCompanies(true);
    try {
      const data = await superAdminListAllCompanies();
      setCompanies(data);
    } catch (err) {
      console.error("Ошибка загрузки компаний:", err);
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Ошибка загрузки компаний");
      } else {
        alert("Ошибка загрузки компаний");
      }
    } finally {
      setLoadingCompanies(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleCompanySelect = (companyId) => {
    setFormData({ ...formData, company_id: companyId });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.login.trim() || !formData.password.trim() || !formData.name.trim() || !formData.lastname.trim() || !formData.company_id) {
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
      const newUser = await superAdminCreateUser(payload);
      onCreate(newUser);
      setFormData({ login: '', password: '', name: '', lastname: '', role: 'montajnik', company_id: '' });
      onClose();
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
              </select>
            </div>
          </div>
          
          <div className="task-field">
            <div className="task-field-label">
              <CompanyIcon />
              Компания:
            </div>
            <div className="task-field-value">
              {loadingCompanies ? (
                <div>Загрузка...</div>
              ) : (
                <SearchableCompanySelect
                  availableCompanies={companies}
                  onSelect={handleCompanySelect}
                  selectedCompanyId={formData.company_id}
                />
              )}
            </div>
          </div>
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

function EditUserModal({ user, onClose, onSave, roleDisplayNames }) {
  const [formData, setFormData] = useState({
    name: user.name,
    lastname: user.lastname,
    login: user.login,
    password: '', // Поле для нового пароля
    role: user.role,
    company_id: user.company_id || ''
  });
  const [companies, setCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    setLoadingCompanies(true);
    try {
      const data = await superAdminListAllCompanies();
      setCompanies(data);
    } catch (err) {
      console.error("Ошибка загрузки компаний:", err);
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Ошибка загрузки компаний");
      } else {
        alert("Ошибка загрузки компаний");
      }
    } finally {
      setLoadingCompanies(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleCompanySelect = (companyId) => {
    setFormData({ ...formData, company_id: companyId });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.lastname.trim() || !formData.login.trim() || !formData.company_id) {
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
      const updatedUser = await superAdminUpdateUser(user.id, payload);
      onSave(updatedUser);
      onClose();
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

  // Найти название текущей компании
  const currentCompanyName = companies.find(c => c.id === formData.company_id)?.name || 'Компания не выбрана';

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
              </select>
            </div>
          </div>
          
          <div className="task-field">
            <div className="task-field-label">
              <CompanyIcon />
              Компания:
            </div>
            <div className="task-field-value">
              {loadingCompanies ? (
                <div>Загрузка...</div>
              ) : (
                <SearchableCompanySelect
                  availableCompanies={companies}
                  onSelect={handleCompanySelect}
                  selectedCompanyId={formData.company_id}
                />
              )}
            </div>
          </div>
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

function SuperAdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [companies, setCompanies] = useState([]);

  const roleDisplayNames = {
    admin: 'Администратор',
    logist: 'Логист',
    montajnik: 'Монтажник',
    tech_supp: 'Тех.специалист',
    super_admin: 'Супер админ'
  };

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await superAdminListAllUsers();
      // Группируем пользователей по company_id
      const groupedUsers = {};
      data.forEach(user => {
        const companyId = user.company_id || 'no_company';
        if (!groupedUsers[companyId]) {
          groupedUsers[companyId] = [];
        }
        groupedUsers[companyId].push(user);
      });
      setUsers(groupedUsers);
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

  const fetchCompanies = async () => {
    try {
      const data = await superAdminListAllCompanies();
      setCompanies(data);
    } catch (err) {
      console.error("Ошибка загрузки компаний:", err);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchCompanies();
  }, []);

  const handleCreateUser = (newUser) => {
    setUsers(prev => {
      const newGroupedUsers = { ...prev };
      const companyId = newUser.company_id || 'no_company';
      if (!newGroupedUsers[companyId]) {
        newGroupedUsers[companyId] = [];
      }
      newGroupedUsers[companyId].push(newUser);
      return newGroupedUsers;
    });
  };

  const openEditUserModal = (user) => {
    setEditingUser(user);
    setShowEditModal(true);
  };

  const handleUserSave = (updatedUser) => {
    setUsers(prev => {
      const newGroupedUsers = { ...prev };
      // Находим старую компанию пользователя
      let oldCompanyId = null;
      for (const [companyId, userList] of Object.entries(prev)) {
        if (userList.some(u => u.id === updatedUser.id)) {
          oldCompanyId = companyId;
          break;
        }
      }
      
      // Удаляем пользователя из старой группы
      if (oldCompanyId) {
        newGroupedUsers[oldCompanyId] = newGroupedUsers[oldCompanyId].filter(u => u.id !== updatedUser.id);
      }
      
      // Добавляем в новую группу
      const newCompanyId = updatedUser.company_id || 'no_company';
      if (!newGroupedUsers[newCompanyId]) {
        newGroupedUsers[newCompanyId] = [];
      }
      newGroupedUsers[newCompanyId].push(updatedUser);
      
      return newGroupedUsers;
    });
    setShowEditModal(false);
    setEditingUser(null);
  };

  const closeEditUserModal = () => {
    setShowEditModal(false);
    setEditingUser(null);
  };

  if (loading) return <div className="logist-main"><div className="empty">Загрузка...</div></div>;

  // Получаем отсортированные ID компаний
  const sortedCompanyIds = Object.keys(users).sort((a, b) => {
    // Сначала сортируем по company_id, 'no_company' в конец
    if (a === 'no_company') return 1;
    if (b === 'no_company') return -1;
    return parseInt(a) - parseInt(b);
  });

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Пользователи (все компании)</h1>
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
          {sortedCompanyIds.map(companyId => {
            const company = companies.find(c => c.id.toString() === companyId);
            const companyName = company ? company.name : 'Без компании';
            
            // Сортируем пользователей по роли внутри компании, деактивированные в конец
            const sortedUsers = [...users[companyId]].sort((a, b) => {
              // Если статусы разные (один активен, другой нет), неактивного в конец
              if (a.is_active !== b.is_active) {
                return a.is_active ? -1 : 1;
              }
              
              // Если оба активны или оба неактивны, сортируем по ролям
              const roleOrder = {
                'admin': 1,
                'logist': 2,
                'tech_supp': 3,
                'montajnik': 4,
                'super_admin': 5
              };
              return (roleOrder[a.role] || 6) - (roleOrder[b.role] || 6);
            });
            
            return (
              <React.Fragment key={companyId}>
                <div style={{ 
                  gridColumn: '1 / -1', 
                  padding: '10px 0',
                  borderBottom: '1px solid #444',
                  marginTop: '20px',
                  marginBottom: '10px'
                }}>
                  <h3 style={{ margin: 0, fontSize: '1.2em', color: 'white' }}>{companyName}</h3>
                </div>
                {sortedUsers.map(user => (
                  <UserCard
                    key={user.id}
                    user={user}
                    roleDisplayNames={roleDisplayNames}
                    onEditUser={openEditUserModal}
                    isSuperAdmin={true}
                  />
                ))}
              </React.Fragment>
            );
          })}
        </div>

        <CreateUserModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreate={handleCreateUser}
          roleDisplayNames={roleDisplayNames}
        />

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

export default SuperAdminUsersPage;