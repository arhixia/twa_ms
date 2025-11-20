// front/src/pages/admin/AdminTasksPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import {
  adminFilterTasks,
  getAdminCompaniesList,
  getActiveMontajniks,
  getAdminWorkTypesList,
  getAdminEquipmentList
} from '../../api';
import TaskCard from '../../components/TaskCard';
import { useNavigate } from 'react-router-dom';
import "../../styles/LogistPage.css";
import "../../styles/styles.css";

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

function AdminTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const [companies, setCompanies] = useState([]);
  const [montajniks, setMontajniks] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  const [equipments, setEquipments] = useState([]);

  const [selectedFilters, setSelectedFilters] = useState({
    status: "",
    company_id: null,
    assigned_user_id: null,
    work_type_id: null,
    task_id: null,
    equipment_id: null,
    search: "",
  });

  // Добавим состояние для поискового поля, которое будет обновляться при каждом вводе
  const [searchInput, setSearchInput] = useState("");

  // Применяем дебаунс к searchInput
  const debouncedSearch = useDebounce(searchInput, 500); // 500мс задержка

  const navigate = useNavigate();

  useEffect(() => {
    const fetchFiltersData = async () => {
      try {
        const [companiesData, montajniksData, workTypesData, equipmentsData] = await Promise.all([
          getAdminCompaniesList(),
          getActiveMontajniks(),
          getAdminWorkTypesList(),
          getAdminEquipmentList()
        ]);
        setCompanies(companiesData || []);
        setMontajniks(montajniksData || []);
        setWorkTypes(workTypesData || []);
        setEquipments(equipmentsData || []);
      } catch (err) {
        console.error("Ошибка загрузки фильтров", err);
      }
    };
    fetchFiltersData();
  }, []);

  // Обновим fetchTasks, чтобы он принимал фильтры и управлял загрузкой
  const fetchTasks = async (filters = {}) => {
    // Не устанавливаем setLoading(true) здесь, если мы управляем загрузкой по-другому
    // или делаем это более аккуратно, чтобы избежать мерцания при быстрых вводах
    try {
      const data = await adminFilterTasks(filters);
      setTasks(data || []);
    } catch (err) {
      console.error('Ошибка загрузки задач', err);
      alert('Ошибка загрузки задач');
    } finally {
      // setLoading(false); // Управление через useEffect
    }
  };

  // useEffect для отслеживания изменений debouncedSearch
  useEffect(() => {
    // Обновляем selectedFilters.search только когда debouncedSearch изменился
    setSelectedFilters(prev => ({ ...prev, search: debouncedSearch }));
  }, [debouncedSearch]);

  // useEffect для отслеживания всех фильтров (включая обновлённый search)
  useEffect(() => {
    setLoading(true);
    fetchTasks(selectedFilters).finally(() => {
      setLoading(false);
    });
  }, [selectedFilters]); // Зависимость от selectedFilters, который теперь обновляется с дебаунсом для search

  const handleFilterChange = (field, value) => {
    let normalized;
    if (value === "" || value === null) normalized = null;
    else if (!isNaN(value) && value !== true && value !== false) normalized = Number(value);
    else normalized = value;

    // Для поля 'search' обновляем отдельное состояние searchInput
    if (field === 'search') {
      setSearchInput(normalized);
    } else {
      // Для остальных полей обновляем selectedFilters напрямую
      setSelectedFilters(prev => ({ ...prev, [field]: normalized }));
    }
  };

  const openTaskDetail = (task) => {
    navigate(`/admin/tasks/${task.id}`);
  };

  const STATUS_OPTIONS = [
    { value: "new", label: "Создана" },
    { value: "accepted", label: "Принята монтажником" },
    { value: "on_the_road", label: "Выехал на работу" },
    { value: "on_site", label: "Прибыл на место" },
    { value: "started", label: "В процессе выполнения" },
    { value: "assigned", label: "Назначена" },
    { value: "inspection", label: "На проверке" },
    { value: "returned", label: "Возвращена на доработку" },
    { value: "archived", label: "Архив" },
  ];

  if (loading && tasks.length === 0) return <div className="empty">Загрузка задач...</div>;

  return (
    <div className="content" style={{ paddingTop: '10px', paddingLeft: '20px', paddingRight: '20px', minWidth: 0 }}>
      <div className="page-header" style={{ marginBottom: '12px' }}>
        <h1 style={{ margin: 0 }}>Все задачи</h1>
      </div>

      <div
  className="search-container"
  style={{
    marginBottom: '12px',
    width: '100%',
  }}
>
  <input
    type="text"
    placeholder="Поиск..."
    className="dark-input"
    value={searchInput}
    onChange={e => handleFilterChange("search", e.target.value)}
    style={{
      width: '100%',
      padding: '10px 14px',
      borderRadius: '6px',
      border: '1px solid #444',
      backgroundColor: '#1a1a1a',
      color: '#e0e0e0',
      fontSize: '14px',
      outline: 'none',
      transition: '0.2s',
    }}
  />
</div>


      <div className="filters" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px', maxWidth: '100%' }}>
        {/* Статус */}
        <div>
          <label className="dark-label">Статус</label>
          <select
            className="dark-select"
            value={selectedFilters.status || ""}
            onChange={e => handleFilterChange("status", e.target.value)}
          >
            <option value="">Все статусы</option>
            {STATUS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>

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
            {montajniks.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
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
      </div>

      {loading && tasks.length === 0 ? (
        <div className="empty">Загрузка задач...</div>
      ) : tasks.length === 0 ? (
        <div className="empty">По выбранным фильтрам нет задач</div>
      ) : (
        <div className="cards" style={{ minWidth: 0 }}>
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} onClick={() => openTaskDetail(task)} />
          ))}
        </div>
      )}
    </div>
  );
}

export default AdminTasksPage;