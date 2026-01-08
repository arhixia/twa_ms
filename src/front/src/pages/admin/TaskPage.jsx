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
import MultiSelectFilter from "../../components/MultiSelectFilter"; // Добавляем импорт компонента
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
  const [showFilters, setShowFilters] = useState(false); // Фильтры изначально скрыты

  const [companies, setCompanies] = useState([]);
  const [montajniks, setMontajniks] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  const [equipments, setEquipments] = useState([]);

  const [selectedFilters, setSelectedFilters] = useState({
    status: [],
    company_id: [],
    assigned_user_id: [],
    work_type_id: [],
    task_id: null,
    equipment_id: [],
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
    if (value === "" || value === null) normalized = [];
    else if (Array.isArray(value)) normalized = value;
    else normalized = [value];

    // Для поля 'search' обновляем отдельное состояние searchInput
    if (field === 'search') {
      setSearchInput(value);
    } else {
      // Для остальных полей обновляем selectedFilters напрямую
      setSelectedFilters(prev => ({ ...prev, [field]: normalized }));
    }
  };

  const handleTaskCardClick = (task) => {
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
    { value: "returned", label: "На доработке" },
    { value: "archived", label: "Архив" },
  ];

  // Преобразование опций для MultiSelectFilter
  const companyOptions = companies.map(c => ({ value: c.id, label: c.name }));
  const montajnikOptions = montajniks.map(m => ({ value: m.id, label: m.name }));
  const workTypeOptions = workTypes.map(w => ({ value: w.id, label: w.name }));
  const equipmentOptions = equipments.map(eq => ({ value: eq.id, label: eq.name }));

  return (
    <div className="logist-main">
      <div className="page">
        <h1 className="page-title">Все задачи</h1>
        
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
            className="dark-select"
            value={searchInput}
            onChange={e => handleFilterChange("search", e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '6px',
              fontSize: '14px',
              outline: 'none',
              transition: '0.2s',
            }}
          />
        </div>

        <div 
          className="toggle-filters"
          style={{
            marginBottom: '16px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: 'white',
            fontSize: '16px',
            fontWeight: '600',
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          }}
          onClick={() => setShowFilters(!showFilters)}
        >
          <span style={{
            display: 'inline-block',
            transform: showFilters ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            fontSize: '16px'
          }}>
            ▶
          </span>
          Фильтры
        </div>

        {showFilters && (
          <div className="filters" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px', maxWidth: '100%' }}>
            {/* Статус */}
            <div style={{ minWidth: '150px' }}>
              <label className="dark-label">Статус</label>
              <MultiSelectFilter
                options={STATUS_OPTIONS}
                selectedValues={selectedFilters.status}
                onChange={(values) => handleFilterChange("status", values)}
                placeholder="Все статусы"
                maxHeight={200}
              />
            </div>

            {/* Компания */}
            <div style={{ minWidth: '150px' }}>
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
            <div style={{ minWidth: '150px' }}>
              <label className="dark-label">Монтажник</label>
              <MultiSelectFilter
                options={montajnikOptions}
                selectedValues={selectedFilters.assigned_user_id}
                onChange={(values) => handleFilterChange("assigned_user_id", values)}
                placeholder="Все монтажники"
                maxHeight={200}
                width="100%"
              />
            </div>

            {/* Тип работы */}
            <div style={{ minWidth: '150px' }}>
              <label className="dark-label">Тип работы</label>
              <MultiSelectFilter
                options={workTypeOptions}
                selectedValues={selectedFilters.work_type_id}
                onChange={(values) => handleFilterChange("work_type_id", values)}
                placeholder="Все типы работ"
                maxHeight={200}
                width="100%"
              />
            </div>

            {/* Оборудование */}
            <div style={{ minWidth: '150px' }}>
              <label className="dark-label">Оборудование</label>
              <MultiSelectFilter
                options={equipmentOptions}
                selectedValues={selectedFilters.equipment_id}
                onChange={(values) => handleFilterChange("equipment_id", values)}
                placeholder="Все оборудование"
                maxHeight={200}
                width="100%"
              />
            </div>
          </div>
        )}

        <div className="cards">
          {loading ? (
            <div className="empty">Загрузка задач...</div>
          ) : tasks.length ? (
            tasks.map(task => (
              <TaskCard 
                key={task.id} 
                task={task} 
                onClick={handleTaskCardClick}
              />
            ))
          ) : (
            <div className="empty">По выбранным фильтрам нет задач</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminTasksPage;