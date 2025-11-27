import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchLogistProfile,
  addCompany,
  addContactPerson,
  getCompaniesList,
  getActiveMontajniks,
  getWorkTypes,
  getEquipmentList,
  logistFilterCompletedTasks,
  // ✅ Новый импорт для перехода на страницу архива
  fetchLogistArchivedTasks,
} from "../../api";
import MultiSelectFilter from "../../components/MultiSelectFilter"; // Добавляем импорт компонента
import "../../styles/LogistPage.css";

// Вспомогательная функция для дебаунса
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function LogistProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Состояния для фильтров
  const [selectedFilters, setSelectedFilters] = useState({
    company_id: [],
    assigned_user_id: [],
    work_type_id: [],
    equipment_id: [],
    search: "",
  });

  const [companies, setCompanies] = useState([]);
  const [montajniks, setMontajniks] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  const [equipments, setEquipments] = useState([]);

  // Состояния для модальных окон
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  // Состояния для истории задач
  const [historyTasks, setHistoryTasks] = useState([]);

  // Дебаунс для поиска
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(selectedFilters.search, 500);

  useEffect(() => {
    loadProfile();
    loadCompaniesForModal(); // Загружаем компании для модалки
    loadFilterOptions(); // Загружаем опции для фильтров
  }, []);

  useEffect(() => {
    // Загружаем задачи при изменении дебаунснутого поиска или других фильтров
    const filtersToUse = { ...selectedFilters, search: debouncedSearch };
    loadHistoryTasks(filtersToUse);
  }, [debouncedSearch, selectedFilters.company_id, selectedFilters.assigned_user_id, selectedFilters.work_type_id, selectedFilters.equipment_id]);

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

  async function loadHistoryTasks(filters) {
    try {
      const data = await logistFilterCompletedTasks(filters); // Используем новый эндпоинт
      setHistoryTasks(data || []);
    } catch (err) {
      console.error("Ошибка загрузки истории задач:", err);
      setHistoryTasks([]);
    }
  }

  async function loadFilterOptions() {
    try {
      const [companiesData, montajniksData, workTypesData, equipmentsData] = await Promise.all([
        getCompaniesList(),
        getActiveMontajniks(),
        getWorkTypes(),
        getEquipmentList()
      ]);
      setCompanies(companiesData || []);
      setMontajniks(montajniksData || []);
      setWorkTypes(workTypesData || []);
      setEquipments(equipmentsData || []);
    } catch (e) {
      console.error("Ошибка загрузки опций фильтров:", e);
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

  const handleFilterChange = (field, value) => {
    let normalized;
    if (value === "" || value === null) normalized = [];
    else if (Array.isArray(value)) normalized = value;
    else normalized = [value];

    setSelectedFilters(prev => ({ ...prev, [field]: normalized }));
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

  

  // Преобразование опций для MultiSelectFilter
  const companyOptions = companies.map(c => ({ value: c.id, label: c.name }));
  const montajnikOptions = montajniks.map(m => ({ value: m.id, label: m.name }));
  const workTypeOptions = workTypes.map(w => ({ value: w.id, label: w.name }));
  const equipmentOptions = equipments.map(eq => ({ value: eq.id, label: eq.name }));

  if (loading) return <div className="logist-main"><div className="empty">Загрузка профиля...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;
  if (!profile) return <div className="logist-main"><div className="empty">Профиль не найден</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1>Личный кабинет</h1>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button className="add-btn" onClick={() => setShowAddCompanyModal(true)}>+ Добавить компанию</button>
          <button className="add-btn" onClick={() => setShowAddContactModal(true)}>+ Добавить контакт</button>
          <button className="add-btn" onClick={goToArchivedTasks}>
            🗃 Архивные задачи
          </button>
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
            <p><b>В черновиках:</b> {profile.draft_count || 0}</p>
            <p><b>В архиве:</b> {profile.archived_count || 0}</p>
          </div>
        </div>

        {/* --- Модальное окно добавления компании --- */}
        {showAddCompanyModal && (
          <div className="modal-backdrop" onClick={() => setShowAddCompanyModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
              <div className="modal-header">
                <h3>Добавить компанию</h3>
                <button className="add-btn" style={{ padding: '4px 8px' }} onClick={(e) => { e.stopPropagation(); setShowAddCompanyModal(false); }}>×</button>
              </div>
              <div className="modal-body">
                <label className="dark-label">
                  Название
                  <input
                    type="text"
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    placeholder="Введите название"
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #444",
                      backgroundColor: "#1a1a1a",
                      color: "#e0e0e0",
                      appearance: 'none', // Убирает стрелочки
                    }}
                  />
                </label>
              </div>
              <div className="modal-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '15px' }}>
                <button className="add-btn" style={{ backgroundColor: '#6c757d' }} onClick={(e) => { e.stopPropagation(); setShowAddCompanyModal(false); }}>Отмена</button>
                <button className="add-btn" onClick={(e) => { e.stopPropagation(); handleAddCompany(); }}>Сохранить</button>
              </div>
            </div>
          </div>
        )}

        {/* --- Модальное окно добавления контактного лица --- */}
        {showAddContactModal && (
          <div className="modal-backdrop" onClick={() => setShowAddContactModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
              <div className="modal-header">
                <h3>Добавить контактное лицо</h3>
                <button className="add-btn" style={{ padding: '4px 8px' }} onClick={(e) => { e.stopPropagation(); setShowAddContactModal(false); }}>×</button>
              </div>
              <div className="modal-body">
                <label className="dark-label">
                  ФИО
                  <input
                    type="text"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="Введите ФИО"
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
                <label className="dark-label">
                  Телефон
                  <input
                    type="text"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    placeholder="Введите телефон (необязательно)"
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
                <label className="dark-label">
                  Компания
                  <select
                    value={selectedCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #444",
                      backgroundColor: "#1a1a1a",
                      color: "#e0e0e0",
                    }}
                  >
                    <option value="">Выберите компанию</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="modal-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '15px' }}>
                <button className="add-btn" style={{ backgroundColor: '#6c757d' }} onClick={(e) => { e.stopPropagation(); setShowAddContactModal(false); }}>Отмена</button>
                <button className="add-btn" onClick={(e) => { e.stopPropagation(); handleAddContact(); }}>Сохранить</button>
              </div>
            </div>
          </div>
        )}

        <div className="section">
          <h3>История выполненных задач</h3>
          <div style={{ marginBottom: '16px', maxWidth: '100%' }}>
  {/* Поиск */}
  <div style={{ marginBottom: '12px', width: '100%' }}>
    <label className="dark-label">Поиск</label>
    <input
      type="text"
      className="dark-input"
      placeholder="Поиск..."
      value={selectedFilters.search}
      onChange={e => handleFilterChange("search", e.target.value)}
      style={{
        width: '100%',
        padding: '8px 12px',
        border: '1px solid #444',
        borderRadius: '4px',
        backgroundColor: '#1a1a1a',
        color: '#e0e0e0',
        fontSize: '14px',
        boxSizing: 'border-box'
      }}
    />
  </div>

  <div className="filters" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', maxWidth: '100%' }}>
    {/* Компания */}
    <div style={{ width: '150px', minWidth: '150px', maxWidth: '150px' }}>
      <label className="dark-label">Компания</label>
      <MultiSelectFilter
        options={companyOptions}
        selectedValues={selectedFilters.company_id}
        onChange={(values) => handleFilterChange("company_id", values)}
        placeholder="Все компании"
        maxHeight={200}
        width="100%" 
      />
    </div>

    {/* Монтажник */}
    <div style={{ width: '150px', minWidth: '150px', maxWidth: '150px' }}>
      <label className="dark-label">Монтажник</label>
      <MultiSelectFilter
        options={montajnikOptions}
        selectedValues={selectedFilters.assigned_user_id}
        onChange={(values) => handleFilterChange("assigned_user_id", values)}
        placeholder="Все монтажники"
        maxHeight={200}
      />
    </div>

    {/* Тип работы */}
    <div style={{ width: '150px', minWidth: '150px', maxWidth: '150px' }}>
      <label className="dark-label">Тип работы</label>
      <MultiSelectFilter
        options={workTypeOptions}
        selectedValues={selectedFilters.work_type_id}
        onChange={(values) => handleFilterChange("work_type_id", values)}
        placeholder="Все типы работ"
        maxHeight={200}
      />
    </div>

    {/* Оборудование */}
    <div style={{ width: '150px', minWidth: '150px', maxWidth: '150px' }}>
      <label className="dark-label">Оборудование</label>
      <MultiSelectFilter
        options={equipmentOptions}
        selectedValues={selectedFilters.equipment_id}
        onChange={(values) => handleFilterChange("equipment_id", values)}
        placeholder="Все оборудование"
        maxHeight={200}
      />
    </div>
  </div>
</div>

          {historyTasks && historyTasks.length > 0 ? (
            <div className="history-list">
              {historyTasks.map((task) => (
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
          ) : (
            <div className="empty">История пока пуста</div>
          )}
        </div>
      </div>
    </div>
  );
}