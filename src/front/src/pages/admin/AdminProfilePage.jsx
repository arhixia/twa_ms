// front/src/pages/admin/AdminProfilePage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  // Импортируем все нужные API функции
  fetchAdminProfile, // <- НОВОЕ: Импортируем новый API метод
  getAdminCompaniesList,
  getAdminContactPersonsByCompany,
  getAdminContactPersonPhone,
  adminAddCompany,
  adminAddContactPerson,
} from '../../api';
import "../../styles/LogistPage.css";

export default function AdminProfilePage() {
  const navigate = useNavigate();
  // Состояния для профиля
  const [profile, setProfile] = useState(null); // <- НОВОЕ: Состояние для данных профиля
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Состояния для модальных окон
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companies, setCompanies] = useState([]);

  useEffect(() => {
    loadProfile(); // <- НОВОЕ: Вызываем загрузку профиля
    loadCompaniesForModal();
  }, []);

  // <- НОВОЕ: Функция загрузки профиля админа
  async function loadProfile() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminProfile(); // <- Вызываем новый API метод
      setProfile(data);
    } catch (err) {
      console.error("Ошибка загрузки профиля админа:", err);
      setError(err.response?.data?.detail || err.message || "Ошибка загрузки профиля");
    } finally {
      setLoading(false);
    }
  }

  async function loadCompaniesForModal() {
    try {
      const data = await getAdminCompaniesList();
      setCompanies(data || []);
    } catch (e) {
      console.error("Ошибка загрузки компаний для модалки:", e);
      setCompanies([]);
    }
  }

  // --- Логика добавления ---
  const handleAddCompany = async () => {
    if (!newCompanyName.trim()) {
      alert("Введите название компании");
      return;
    }
    try {
      const result = await adminAddCompany({ name: newCompanyName.trim() });
      alert(`Компания "${result.name}" добавлена (ID: ${result.id})`);
      setNewCompanyName("");
      setShowAddCompanyModal(false);
      loadCompaniesForModal();
      // loadProfile(); // Можно перезагрузить, если в профиле отображаются компании
    } catch (err) {
      console.error("Ошибка добавления компании:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось добавить компанию.";
      alert(`Ошибка: ${errorMsg}`);
    }
  };

  const handleAddContact = async () => {
    if (!newContactName.trim() || !selectedCompanyId) {
      alert("Заполните ФИО и выберите компанию");
      return;
    }
    try {
      const result = await adminAddContactPerson(selectedCompanyId, { name: newContactName.trim(), phone: newContactPhone.trim() });
      alert(`Контакт "${result.name}" добавлен (ID: ${result.id})`);
      setNewContactName("");
      setNewContactPhone("");
      setSelectedCompanyId("");
      setShowAddContactModal(false);
      // loadProfile(); // Можно перезагрузить, если в профиле отображаются контакты
    } catch (err) {
      console.error("Ошибка добавления контактного лица:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось добавить контактное лицо.";
      alert(`Ошибка: ${errorMsg}`);
    }
  };

  if (loading) return <div className="logist-main"><div className="empty">Загрузка профиля...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;
  if (!profile) return <div className="logist-main"><div className="empty">Профиль не найден</div></div>; // <- Проверяем profile вместо useAuthStore

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1>Личный кабинет</h1>
          <div>
            <button className="add-btn" onClick={() => setShowAddCompanyModal(true)}>+ Добавить компанию</button>
            <button className="add-btn" onClick={() => setShowAddContactModal(true)}>+ Добавить контакт</button>
          </div>
        </div>

        <div className="profile-overview">
          <div className="profile-card">
            <h2>Информация</h2>
            <p><b>Имя:</b> {profile.name || "—"}</p>
            <p><b>Фамилия:</b> {profile.lastname || "—"}</p>
          </div>
        </div>

        {/* --- Модальные окна остаются без изменений --- */}
        {showAddCompanyModal && (
          <div className="modal-backdrop">
            <div className="modal" style={{ maxWidth: '500px' }}>
              <div className="modal-header">
                <h2>Добавить компанию</h2>
                <button className="close" onClick={() => setShowAddCompanyModal(false)}>×</button>
              </div>
              <div className="modal-body">
                <label>
                  Название:
                  <input
                    type="text"
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    placeholder="Введите название"
                  />
                </label>
              </div>
              <div className="modal-actions">
                <button className="primary" onClick={handleAddCompany}>Добавить</button>
                <button onClick={() => setShowAddCompanyModal(false)}>Отмена</button>
              </div>
            </div>
          </div>
        )}

        {showAddContactModal && (
          <div className="modal-backdrop">
            <div className="modal" style={{ maxWidth: '500px' }}>
              <div className="modal-header">
                <h2>Добавить контактное лицо</h2>
                <button className="close" onClick={() => setShowAddContactModal(false)}>×</button>
              </div>
              <div className="modal-body">
                <label>
                  ФИО:
                  <input
                    type="text"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="Введите ФИО"
                  />
                </label>
                <label>
                  Телефон:
                  <input
                    type="text"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    placeholder="Введите телефон (необязательно)"
                  />
                </label>
                <label>
                  Компания:
                  <select
                    value={selectedCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                  >
                    <option value="">Выберите компанию</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="modal-actions">
                <button className="primary" onClick={handleAddContact}>Добавить</button>
                <button onClick={() => setShowAddContactModal(false)}>Отмена</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}