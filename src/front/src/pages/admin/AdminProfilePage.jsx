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
  const [newWorkTypeTechSupp, setNewWorkTypeTechSupp] = useState(false);

  // Состояния для истории задач
  const [historyTasks, setHistoryTasks] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Состояния для фильтров истории задач
  const [selectedFilters, setSelectedFilters] = useState({
    company_id: [],
    assigned_user_id: [],
    work_type_id: [],
    equipment_id: [],
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
    if (value === "" || value === null) normalized = [];
    else if (Array.isArray(value)) normalized = value;
    else normalized = [value];

    setSelectedFilters(prev => ({ ...prev, [field]: normalized }));
  };

  // Функция для перехода к деталям завершенной задачи
  const viewCompletedTask = (taskId) => {
    navigate(`/admin/admin_completed-tasks/${taskId}`);
  };

  // Преобразование опций для MultiSelectFilter
  const companyOptions = companies.map(c => ({ value: c.id, label: c.name }));
  const montajnikOptions = montajniks.map(m => ({ value: m.id, label: `${m.name} ${m.lastname}` }));
  const workTypeOptions = workTypes.map(w => ({ value: w.id, label: w.name }));
  const equipmentOptions = equipments.map(eq => ({ value: eq.id, label: eq.name }));

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
        tech_supp_require: newWorkTypeTechSupp, 
      });
      alert(`Вид работы "${result.name}" добавлен`);
      setNewWorkTypeName("");
      setNewWorkTypePrice("");
      setNewWorkTypeTechSupp(false); 
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
        </div>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button className="add-btn" onClick={() => setShowAddCompanyModal(true)}>+ Компания</button>
          <button className="add-btn" onClick={() => setShowAddContactModal(true)}>+ Контакт</button>
          <button className="add-btn" onClick={() => setShowAddEquipmentModal(true)}>+ Оборудование</button>
          <button className="add-btn" onClick={() => setShowAddWorkTypeModal(true)}>+ Вид работ</button>
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
                {/* === Добавить компанию === */}
        {showAddCompanyModal && (
          <div className="modal-backdrop">
            <div className="modal">
              <div className="modal-header">
                <h3>Добавить компанию</h3>
                <button className="add-btn" style={{ padding: '4px 8px' }} onClick={() => setShowAddCompanyModal(false)}>×</button>
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
                    }}
                  />
                </label>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '15px' }}>
                  <button className="add-btn" style={{ backgroundColor: '#6c757d' }} onClick={() => setShowAddCompanyModal(false)}>Отмена</button>
                  <button className="add-btn" onClick={handleAddCompany}>Сохранить</button>
                </div>
              </div>
            </div>
          </div>
        )}

               {/* === Добавить компанию === */}
        {showAddCompanyModal && (
          <div className="modal-backdrop" onClick={() => setShowAddCompanyModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
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
                    }}
                  />
                </label>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '15px' }}>
                  <button className="add-btn" style={{ backgroundColor: '#6c757d' }} onClick={(e) => { e.stopPropagation(); setShowAddCompanyModal(false); }}>Отмена</button>
                  <button className="add-btn" onClick={(e) => { e.stopPropagation(); handleAddCompany(); }}>Сохранить</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === Добавить контакт === */}
        {showAddContactModal && (
          <div className="modal-backdrop" onClick={() => setShowAddContactModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Добавить контакт</h3>
                <button className="add-btn" style={{ padding: '4px 8px' }} onClick={(e) => { e.stopPropagation(); setShowAddContactModal(false); }}>×</button>
              </div>
              <div className="modal-body">
                <label className="dark-label">
                  ФИО
                  <input
                    type="text"
                    placeholder="Введите ФИО"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
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
                    placeholder="Введите телефон"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
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
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '15px' }}>
                  <button className="add-btn" style={{ backgroundColor: '#6c757d' }} onClick={(e) => { e.stopPropagation(); setShowAddContactModal(false); }}>Отмена</button>
                  <button className="add-btn" onClick={(e) => { e.stopPropagation(); handleAddContact(); }}>Сохранить</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === Добавить оборудование === */}
        {showAddEquipmentModal && (
          <div className="modal-backdrop" onClick={() => setShowAddEquipmentModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Добавить оборудование</h3>
                <button className="add-btn" style={{ padding: '4px 8px' }} onClick={(e) => { e.stopPropagation(); setShowAddEquipmentModal(false); }}>×</button>
              </div>
              <div className="modal-body">
                <label className="dark-label">
                  Название
                  <input
                    type="text"
                    value={newEquipmentName}
                    onChange={(e) => setNewEquipmentName(e.target.value)}
                    placeholder="Введите название"
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
                  Категория
                  <select
                    value={newEquipmentCategory}
                    onChange={(e) => setNewEquipmentCategory(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #444",
                      backgroundColor: "#1a1a1a",
                      color: "#e0e0e0",
                    }}
                  >
                    <option value="">Выберите категорию</option>
                    {categories.map((cat, i) => (
                      <option key={i} value={cat}>{cat}</option>
                    ))}
                  </select>
                </label>
                <label className="dark-label">
                  Цена
                  <input
                    type="number"
                    value={newEquipmentPrice}
                    onChange={(e) => setNewEquipmentPrice(e.target.value)}
                    placeholder="Введите цену"
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
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '15px' }}>
                  <button className="add-btn" style={{ backgroundColor: '#6c757d' }} onClick={(e) => { e.stopPropagation(); setShowAddEquipmentModal(false); }}>Отмена</button>
                  <button className="add-btn" onClick={(e) => { e.stopPropagation(); handleAddEquipment(); }}>Сохранить</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === Добавить вид работ === */}
                {/* === Добавить вид работ === */}
        {showAddWorkTypeModal && (
          <div className="modal-backdrop" onClick={() => setShowAddWorkTypeModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Добавить вид работ</h3>
                <button className="add-btn" style={{ padding: '4px 8px' }} onClick={(e) => { e.stopPropagation(); setShowAddWorkTypeModal(false); }}>×</button>
              </div>
              <div className="modal-body">
                <label className="dark-label">
                  Название
                  <input
                    type="text"
                    value={newWorkTypeName}
                    onChange={(e) => setNewWorkTypeName(e.target.value)}
                    placeholder="Введите название"
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
                  Цена
                  <input
                    type="number"
                    value={newWorkTypePrice}
                    onChange={(e) => setNewWorkTypePrice(e.target.value)}
                    placeholder="Введите цену"
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
                <label className="dark-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={newWorkTypeTechSupp}
                    onChange={(e) => setNewWorkTypeTechSupp(e.target.checked)}
                    style={{ margin: 0 }}
                  />
                  Требуется проверка тех.специалиста?
                </label>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '15px' }}>
                  <button className="add-btn" style={{ backgroundColor: '#6c757d' }} onClick={(e) => { e.stopPropagation(); setShowAddWorkTypeModal(false); }}>Отмена</button>
                  <button className="add-btn" onClick={(e) => { e.stopPropagation(); handleAddWorkType(); }}>Сохранить</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}