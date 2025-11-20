import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchAdminProfile,
  getAdminCompaniesList,
  getAdminContactPersonsByCompany,
  getAdminContactPersonPhone,
  adminAddCompany,
  adminAddContactPerson,
  adminAddEquipment,
  adminAddWorkType,
  getAdminEquipmentList,
  getAdminWorkTypesList,
  adminListCompletedTasks,
  adminFilterCompletedTasks,
  getActiveMontajniks, // Используем существующий эндпоинт
} from "../../api";
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

function SearchableEquipmentSelect({ availableEquipment, onSelect }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredEquipment, setFilteredEquipment] = useState(availableEquipment);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const term = searchTerm.toLowerCase();
    setFilteredEquipment(
      !term
        ? availableEquipment
        : availableEquipment.filter((eq) => eq.name.toLowerCase().includes(term))
    );
  }, [searchTerm, availableEquipment]);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        placeholder="🔍 Поиск оборудования..."
        style={{
          width: "100%",
          padding: "8px 12px",
          border: "1px solid #444",
          borderRadius: "4px",
          backgroundColor: "#1a1a1a",
          color: "#e0e0e0",
        }}
      />
      {isOpen && (
        <ul
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 100,
            maxHeight: "200px",
            overflowY: "auto",
            listStyle: "none",
            margin: 0,
            padding: 0,
            backgroundColor: "#1a1a1a",
            border: "1px solid #444",
            borderTop: "none",
            borderRadius: "0 0 4px 4px",
          }}
        >
          {filteredEquipment.length ? (
            filteredEquipment.map((eq) => (
              <li
                key={eq.id}
                onClick={() => {
                  onSelect(eq.id);
                  setSearchTerm("");
                }}
                onMouseDown={(e) => e.preventDefault()}
                style={{
                  padding: "8px 12px",
                  cursor: "pointer",
                  color: "#e0e0e0",
                  backgroundColor: "#2a2a2a",
                  borderBottom: "1px solid #3a3a3a",
                }}
              >
                {eq.name}
              </li>
            ))
          ) : (
            <li style={{ padding: "8px 12px", color: "#888", fontStyle: "italic" }}>
              Ничего не найдено
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export default function AdminProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [companies, setCompanies] = useState([]);

  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [showAddEquipmentModal, setShowAddEquipmentModal] = useState(false);
  const [showAddWorkTypeModal, setShowAddWorkTypeModal] = useState(false);

  const [newCompanyName, setNewCompanyName] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  const [newEquipmentName, setNewEquipmentName] = useState("");
  const [newEquipmentCategory, setNewEquipmentCategory] = useState("");
  const [newEquipmentPrice, setNewEquipmentPrice] = useState("");
  const [categories, setCategories] = useState([]);
  const [filteredCategories, setFilteredCategories] = useState([]);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  const [newWorkTypeName, setNewWorkTypeName] = useState("");
  const [newWorkTypePrice, setNewWorkTypePrice] = useState("");

  // Состояния для истории задач
  const [historyTasks, setHistoryTasks] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Состояния для фильтров истории задач
  const [selectedFilters, setSelectedFilters] = useState({
    company_id: null,
    assigned_user_id: null,
    work_type_id: null,
    equipment_id: null,
    search: "",
  });

  const [montajniks, setMontajniks] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  const [equipments, setEquipments] = useState([]);

  // Дебаунс для поиска
  const debouncedSearch = useDebounce(selectedFilters.search, 500);

  useEffect(() => {
    loadProfile();
    loadRefsForModals();
    loadFilterOptions();
  }, []);

  useEffect(() => {
    // Загружаем задачи при изменении дебаунснутого поиска или других фильтров
    const filtersToUse = { ...selectedFilters, search: debouncedSearch };
    loadHistoryTasks(filtersToUse);
  }, [debouncedSearch, selectedFilters.company_id, selectedFilters.assigned_user_id, selectedFilters.work_type_id, selectedFilters.equipment_id]);

  async function loadProfile() {
    setLoading(true);
    try {
      const data = await fetchAdminProfile();
      setProfile(data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Ошибка загрузки профиля");
    } finally {
      setLoading(false);
    }
  }

  async function loadRefsForModals() {
    try {
      const [eqRes, wtRes, compRes] = await Promise.allSettled([
        getAdminEquipmentList(),
        getAdminWorkTypesList(),
        getAdminCompaniesList(),
      ]);

      setCompanies(compRes.status === "fulfilled" ? compRes.value || [] : []);
      if (eqRes.status === "fulfilled") {
        const equipmentList = eqRes.value || [];
        const uniqueCategories = [...new Set(equipmentList.map((e) => e.category))];
        setCategories(uniqueCategories);
        setFilteredCategories(uniqueCategories);
      }
    } catch {
      setCompanies([]);
      setCategories([]);
      setFilteredCategories([]);
    }
  }

  async function loadFilterOptions() {
    try {
      const [montajniksData, workTypesData, equipmentsData] = await Promise.all([
        getActiveMontajniks(), // Используем существующий эндпоинт
        getAdminWorkTypesList(),
        getAdminEquipmentList()
      ]);
      setMontajniks(montajniksData || []);
      setWorkTypes(workTypesData || []);
      setEquipments(equipmentsData || []);
    } catch (e) {
      console.error("Ошибка загрузки опций фильтров:", e);
    }
  }

  async function loadHistoryTasks(filters) {
    try {
      setHistoryLoading(true);
      const data = await adminFilterCompletedTasks(filters);
      setHistoryTasks(data || []);
    } catch (err) {
      console.error("Ошибка загрузки истории задач:", err);
      setHistoryTasks([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  const handleFilterChange = (field, value) => {
    let normalized;
    if (value === "" || value === null) normalized = null;
    else if (!isNaN(value) && value !== true && value !== false) normalized = Number(value);
    else normalized = value;

    setSelectedFilters(prev => ({ ...prev, [field]: normalized }));
  };

  // Функция для перехода к деталям завершенной задачи
  const viewCompletedTask = (taskId) => {
    navigate(`/admin/admin_completed-tasks/${taskId}`);
  };

  const handleAddCompany = async () => {
    if (!newCompanyName.trim()) return alert("Введите название компании");
    try {
      const result = await adminAddCompany({ name: newCompanyName.trim() });
      alert(`Компания "${result.name}" добавлена`);
      setNewCompanyName("");
      setShowAddCompanyModal(false);
      loadRefsForModals();
    } catch (err) {
      alert(err.response?.data?.detail || "Ошибка добавления компании");
    }
  };

  const handleAddContact = async () => {
    if (!newContactName.trim() || !selectedCompanyId)
      return alert("Заполните ФИО и выберите компанию");
    try {
      const result = await adminAddContactPerson(selectedCompanyId, {
        name: newContactName.trim(),
        phone: newContactPhone.trim(),
      });
      alert(`Контакт "${result.name}" добавлен`);
      setNewContactName("");
      setNewContactPhone("");
      setSelectedCompanyId("");
      setShowAddContactModal(false);
    } catch (err) {
      alert(err.response?.data?.detail || "Ошибка добавления контакта");
    }
  };

  const handleAddEquipment = async () => {
    if (!newEquipmentName.trim() || !newEquipmentCategory.trim() || !newEquipmentPrice.trim())
      return alert("Заполните все поля");
    const priceNum = parseFloat(newEquipmentPrice);
    if (isNaN(priceNum) || priceNum <= 0) return alert("Цена должна быть положительной");
    try {
      const result = await adminAddEquipment({
        name: newEquipmentName.trim(),
        category: newEquipmentCategory.trim(),
        price: priceNum,
      });
      alert(`Оборудование "${result.name}" добавлено`);
      setNewEquipmentName("");
      setNewEquipmentCategory("");
      setNewEquipmentPrice("");
      setShowAddEquipmentModal(false);
      loadRefsForModals();
    } catch (err) {
      alert(err.response?.data?.detail || "Ошибка добавления оборудования");
    }
  };

  const handleAddWorkType = async () => {
    if (!newWorkTypeName.trim() || !newWorkTypePrice.trim()) return alert("Заполните все поля");
    const priceNum = parseFloat(newWorkTypePrice);
    if (isNaN(priceNum) || priceNum <= 0) return alert("Цена должна быть положительной");
    try {
      const result = await adminAddWorkType({
        name: newWorkTypeName.trim(),
        price: priceNum,
      });
      alert(`Вид работы "${result.name}" добавлен`);
      setNewWorkTypeName("");
      setNewWorkTypePrice("");
      setShowAddWorkTypeModal(false);
    } catch (err) {
      alert(err.response?.data?.detail || "Ошибка добавления вида работы");
    }
  };

  if (loading) return <div className="logist-main"><div className="empty">Загрузка...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1>Личный кабинет</h1>
          <div>
            <button onClick={() => setShowAddCompanyModal(true)}>+ Компания</button>
            <button onClick={() => setShowAddContactModal(true)}>+ Контакт</button>
            <button onClick={() => setShowAddEquipmentModal(true)}>+ Оборудование</button>
            <button onClick={() => setShowAddWorkTypeModal(true)}>+ Вид работ</button>
          </div>
        </div>

        <div className="profile-overview">
          <div className="profile-card">
            <h2>Информация</h2>
            <p>
              <b>Имя:</b> {profile?.name || "—"}
            </p>
            <p>
              <b>Фамилия:</b> {profile?.lastname || "—"}
            </p>
          </div>
        </div>

        {/* === История завершенных задач === */}
        <div className="section">
          <h3>История выполненных задач</h3>
          <div className="filters" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px', maxWidth: '100%' }}>
            {/* Компания */}
            <div>
              <label className="dark-label">Компания</label>
              <select
                className="dark-select"
                value={selectedFilters.company_id ?? ""}
                onChange={e => handleFilterChange("company_id", e.target.value)}
              >
                <option value="">Все компании</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Монтажник */}
            <div>
              <label className="dark-label">Монтажник</label>
              <select
                className="dark-select"
                value={selectedFilters.assigned_user_id ?? ""}
                onChange={e => handleFilterChange("assigned_user_id", e.target.value)}
              >
                <option value="">Все монтажники</option>
                {montajniks.map(m => <option key={m.id} value={m.id}>{m.name} {m.lastname}</option>)}
              </select>
            </div>

            {/* Тип работы */}
            <div>
              <label className="dark-label">Тип работы</label>
              <select
                className="dark-select"
                value={selectedFilters.work_type_id ?? ""}
                onChange={e => handleFilterChange("work_type_id", e.target.value)}
              >
                <option value="">Все типы работ</option>
                {workTypes.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>

            {/* Оборудование */}
            <div>
              <label className="dark-label">Оборудование</label>
              <select
                className="dark-select"
                value={selectedFilters.equipment_id ?? ""}
                onChange={e => handleFilterChange("equipment_id", e.target.value)}
              >
                <option value="">Все оборудование</option>
                {equipments.map(eq => <option key={eq.id} value={eq.id}>{eq.name}</option>)}
              </select>
            </div>

            {/* Поиск */}
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label className="dark-label">Поиск</label>
              <input
                type="text"
                className="dark-input"
                placeholder="Поиск..."
                value={selectedFilters.search}
                onChange={e => handleFilterChange("search", e.target.value)}
              />
            </div>
          </div>

          {historyLoading ? (
            <div className="empty">Загрузка истории задач...</div>
          ) : historyTasks && historyTasks.length > 0 ? (
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
                    <b>Монтажник:</b> {task.assigned_user_name || "—"}
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
            <div className="empty">История задач пуста</div>
          )}
        </div>

        {/* === Добавить компанию === */}
        {showAddCompanyModal && (
          <div className="modal-backdrop">
            <div className="modal">
              <div className="modal-header">
                <h2>Добавить компанию</h2>
                <button className="close" onClick={() => setShowAddCompanyModal(false)}>
                  ×
                </button>
              </div>

              <div className="modal-body">
                <input
                  type="text"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder="Название компании"
                  className="input"
                />
              </div>

              <div className="modal-actions">
                <button className="primary" onClick={handleAddCompany}>
                  Добавить
                </button>
                <button onClick={() => setShowAddCompanyModal(false)}>Отмена</button>
              </div>
            </div>
          </div>
        )}

        {/* === Добавить контакт === */}
        {showAddContactModal && (
          <div className="modal-backdrop">
            <div className="modal">
              <div className="modal-header">
                <h2>Добавить контакт</h2>
                <button className="close" onClick={() => setShowAddContactModal(false)}>
                  ×
                </button>
              </div>

              <div className="modal-body">
                <input
                  type="text"
                  placeholder="ФИО"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  className="input"
                />
                <input
                  type="text"
                  placeholder="Телефон"
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                  className="input"
                />
                <select
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  className="input"
                >
                  <option value="">Выберите компанию</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-actions">
                <button className="primary" onClick={handleAddContact}>
                  Добавить
                </button>
                <button onClick={() => setShowAddContactModal(false)}>Отмена</button>
              </div>
            </div>
          </div>
        )}

        {/* === Добавить оборудование === */}
        {showAddEquipmentModal && (
          <div className="modal-backdrop">
            <div className="modal">
              <div className="modal-header">
                <h2>Добавить оборудование</h2>
                <button className="close" onClick={() => setShowAddEquipmentModal(false)}>×</button>
              </div>

              <div className="modal-body">
                <input
                  type="text"
                  value={newEquipmentName}
                  onChange={(e) => setNewEquipmentName(e.target.value)}
                  placeholder="Название"
                  className="input"
                />

                {/* Выбор категории как у компании */}
                <select
                  value={newEquipmentCategory}
                  onChange={(e) => setNewEquipmentCategory(e.target.value)}
                  className="input"
                >
                  <option value="">Выберите категорию</option>
                  {categories.map((cat, i) => (
                    <option key={i} value={cat}>{cat}</option>
                  ))}
                </select>

                <input
                  type="number"
                  step="0.01"
                  value={newEquipmentPrice}
                  onChange={(e) => setNewEquipmentPrice(e.target.value)}
                  placeholder="Цена"
                  className="input"
                />
              </div>

              <div className="modal-actions">
                <button className="primary" onClick={handleAddEquipment}>Добавить</button>
                <button onClick={() => setShowAddEquipmentModal(false)}>Отмена</button>
              </div>
            </div>
          </div>
        )}

        {/* === Добавить вид работ === */}
        {showAddWorkTypeModal && (
          <div className="modal-backdrop">
            <div className="modal">
              <div className="modal-header">
                <h2>Добавить вид работ</h2>
                <button className="close" onClick={() => setShowAddWorkTypeModal(false)}>
                  ×
                </button>
              </div>

              <div className="modal-body">
                <input
                  type="text"
                  value={newWorkTypeName}
                  onChange={(e) => setNewWorkTypeName(e.target.value)}
                  placeholder="Название"
                  className="input"
                />
                <input
                  type="number"
                  step="0.01"
                  value={newWorkTypePrice}
                  onChange={(e) => setNewWorkTypePrice(e.target.value)}
                  placeholder="Цена"
                  className="input"
                />
              </div>

              <div className="modal-actions">
                <button className="primary" onClick={handleAddWorkType}>
                  Добавить
                </button>
                <button onClick={() => setShowAddWorkTypeModal(false)}>Отмена</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}