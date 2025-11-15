// front/src/pages/logist/LogistProfilePage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchLogistProfile,
  addCompany,
  addContactPerson,
  getCompaniesList,
  // ✅ Новый импорт для перехода на страницу архива
  fetchLogistArchivedTasks,
} from "../../api";
import "../../styles/LogistPage.css";

export default function LogistProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Состояния для модальных окон
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companies, setCompanies] = useState([]); // Для списка компаний в модалке добавления контакта

  useEffect(() => {
    loadProfile();
    loadCompaniesForModal(); // Загружаем компании для модалки
  }, []);

  async function loadProfile() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLogistProfile(); // Вызываем новый API метод
      setProfile(data);
    } catch (err) {
      console.error("Ошибка загрузки профиля логиста:", err);
      setError(err.response?.data?.detail || err.message || "Ошибка загрузки профиля");
    } finally {
      setLoading(false);
    }
  }

  // Загружаем компании для модалки добавления контакта
  async function loadCompaniesForModal() {
    try {
      const data = await getCompaniesList(); // Убедитесь, что этот метод доступен и возвращает список
      setCompanies(data || []);
    } catch (e) {
      console.error("Ошибка загрузки компаний для модалки:", e);
      // Можно не показывать ошибку, просто список будет пустой
      setCompanies([]);
    }
  }

  // ✅ Функция для перехода на страницу архивных задач
  const goToArchivedTasks = () => {
    navigate("/logist/archived-tasks"); // Предполагаем, что маршрут будет таким
  };

  // Функция для перехода к деталям завершенной задачи (если используется в истории)
  const viewCompletedTask = (taskId) => {
    navigate(`/logist/completed-tasks/${taskId}`); // Новый маршрут
  };

  // --- Логика добавления ---
  const handleAddCompany = async () => {
    if (!newCompanyName.trim()) {
      alert("Введите название компании");
      return;
    }
    try {
      const result = await addCompany({ name: newCompanyName.trim() });
      alert(`Компания "${result.name}" добавлена (ID: ${result.id})`);
      setNewCompanyName(""); // Очищаем поле
      setShowAddCompanyModal(false); // Закрываем модалку
      loadCompaniesForModal(); // Перезагружаем список для модалки
      loadProfile(); // Перезагружаем профиль, если там отображаются компании
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
      const result = await addContactPerson(selectedCompanyId, { name: newContactName.trim(), phone: newContactPhone.trim() });
      alert(`Контакт "${result.name}" добавлен (ID: ${result.id})`);
      setNewContactName("");
      setNewContactPhone("");
      setSelectedCompanyId("");
      setShowAddContactModal(false);
      loadProfile(); // Перезагружаем профиль, если там отображаются контакты
    } catch (err) {
      console.error("Ошибка добавления контактного лица:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось добавить контактное лицо.";
      alert(`Ошибка: ${errorMsg}`);
    }
  };

  if (loading) return <div className="logist-main"><div className="empty">Загрузка профиля...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;
  if (!profile) return <div className="logist-main"><div className="empty">Профиль не найден</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1>Личный кабинет</h1>
          {/* Кнопки для добавления */}
          <div>
            <button className="add-btn" onClick={() => setShowAddCompanyModal(true)}>+ Добавить компанию</button>
            <button className="add-btn" onClick={() => setShowAddContactModal(true)}>+ Добавить контакт</button>
            {/* ✅ НОВАЯ КНОПКА: Архивные задачи */}
            <button className="add-btn" onClick={goToArchivedTasks}>
              🗃 Архивные задачи
            </button>
          </div>
        </div>

        <div className="profile-overview">
          <div className="profile-card">
            <h2>Информация</h2>
            <p><b>Имя:</b> {profile.name || "—"}</p>
            <p><b>Фамилия:</b> {profile.lastname || "—"}</p>
          </div>

          <div className="profile-card">
            <h2>Статистика</h2>
            <p><b>Выполнено задач:</b> {profile.completed_count || 0}</p>
          </div>
        </div>

        {/* --- Модальное окно добавления компании --- */}
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

        {/* --- Модальное окно добавления контактного лица --- */}
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

        {profile.history && profile.history.length > 0 ? (
  <div className="section">
    <h3>История выполненных задач</h3>
    <div className="history-list">
      {profile.history.map((task) => (
        <div
          key={task.id}
          className="history-item clickable-history-item"
          onClick={() => viewCompletedTask(task.id)}
          style={{
            cursor: "pointer",
            padding: "12px",
            borderBottom: "1px solid #30363d",
            borderRadius: "8px",
            marginBottom: "8px",
            backgroundColor: "#0d1117",
          }}
        >
          <p style={{ margin: "4px 0" }}>
            <b>#{task.id}</b> — {task.client || "—"}
          </p>
          <p style={{ margin: "4px 0" }}>
            <b>ТС / гос.номер:</b> {task.vehicle_info || "—"} / {task.gos_number || "—"}
          </p>
          <p style={{ margin: "4px 0" }}>
            <b>Дата завершения:</b> {task.completed_at ? new Date(task.completed_at).toLocaleString() : "—"}
          </p>
        </div>
      ))}
    </div>
  </div>
) : (
  <div className="section">
    <h3>История выполненных задач</h3>
    <div className="empty">История пока пуста</div>
  </div>
)}
      </div>
    </div>
  );
}