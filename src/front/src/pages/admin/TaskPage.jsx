import React, { useState, useEffect, useRef } from 'react';
import {
  adminFilterTasks,
  getAdminCompaniesList,
  getActiveMontajniks,
  getAdminWorkTypesList,
  getAdminEquipmentList,
  adminSetLogistPerformanceBad,
  adminSetLogistPerformanceGood
} from '../../api';
import TaskCard from '../../components/TaskCard';
import { useNavigate } from 'react-router-dom';
import MultiSelectFilter from "../../components/MultiSelectFilter";
import "../../styles/LogistPage.css";
import "../../styles/styles.css";
import { showAlert, showConfirm } from '../../utils/notify'

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

// ✅ Хук для определения мобильного устройства
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

const FILTERS_STORAGE_KEY = 'adminTasksFilters';

// Функция для загрузки фильтров из localStorage
const loadFiltersFromStorage = () => {
  try {
    const saved = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (err) {
    console.error('Ошибка загрузки фильтров:', err);
  }
  return {
    status: [],
    company_id: [],
    assigned_user_id: [],
    work_type_id: [],
    task_id: null,
    equipment_id: [],
    search: "",
  };
};

function AdminTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(() => {
    try {
      const saved = localStorage.getItem('adminTasksShowFilters');
      return saved ? JSON.parse(saved) : false;
    } catch {
      return false;
    }
  });

  const [companies, setCompanies] = useState([]);
  const [montajniks, setMontajniks] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  const [equipments, setEquipments] = useState([]);

  const [selectedFilters, setSelectedFilters] = useState(loadFiltersFromStorage);
  const [searchInput, setSearchInput] = useState(() => loadFiltersFromStorage().search);

  // Применяем дебаунс к searchInput
  const debouncedSearch = useDebounce(searchInput, 500);
  
  const navigate = useNavigate();
  const isMobile = useIsMobile(); // ✅ Используем хук

  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(selectedFilters));
    } catch (err) {
      console.error('Ошибка сохранения фильтров:', err);
    }
  }, [selectedFilters]);

  useEffect(() => {
    try {
      localStorage.setItem('adminTasksShowFilters', JSON.stringify(showFilters));
    } catch (err) {
      console.error('Ошибка сохранения состояния фильтров:', err);
    }
  }, [showFilters]);

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

  const fetchTasks = async (filters = {}) => {
    try {
      const data = await adminFilterTasks(filters);
      setTasks(data || []);
    } catch (err) {
      console.error('Ошибка загрузки задач', err);
      showAlert('Ошибка загрузки задач')
    }
  };

  useEffect(() => {
    setSelectedFilters(prev => ({ ...prev, search: debouncedSearch }));
  }, [debouncedSearch]);

  useEffect(() => {
    setLoading(true);
    fetchTasks(selectedFilters).finally(() => {
      setLoading(false);
    });
  }, [selectedFilters]);

  const handleFilterChange = (field, value) => {
    let normalized;
    if (value === "" || value === null) normalized = [];
    else if (Array.isArray(value)) normalized = value;
    else normalized = [value];

    if (field === 'search') {
      setSearchInput(value);
    } else {
      setSelectedFilters(prev => ({ ...prev, [field]: normalized }));
    }
  };

  const handleTaskCardClick = (task) => {
    navigate(`/admin/tasks/${task.id}`);
  };

  // Функция для сброса всех фильтров
  const resetAllFilters = () => {
    const defaultFilters = {
      status: [],
      company_id: [],
      assigned_user_id: [],
      work_type_id: [],
      task_id: null,
      equipment_id: [],
      search: "",
    };
    setSelectedFilters(defaultFilters);
    setSearchInput("");
    localStorage.removeItem(FILTERS_STORAGE_KEY);
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
    { value: "completed", label: "Завершена" },
  ];

  const companyOptions = companies.map(c => ({ value: c.id, label: c.name }));
  const montajnikOptions = montajniks.map(m => ({ value: m.id, label: m.name }));
  const workTypeOptions = workTypes.map(w => ({ value: w.id, label: w.name }));
  const equipmentOptions = equipments.map(eq => ({ value: eq.id, label: eq.name }));

  // Проверяем, есть ли активные фильтры
  const hasActiveFilters = 
    selectedFilters.status.length > 0 || 
    selectedFilters.company_id.length > 0 || 
    selectedFilters.assigned_user_id.length > 0 || 
    selectedFilters.work_type_id.length > 0 || 
    selectedFilters.equipment_id.length > 0 || 
    searchInput;

  return (
    <div className="logist-main">
      <div className="page">
        <h1 className="page-title">Все задачи</h1>
        
        <div style={{ 
          display: 'flex', 
          gap: isMobile ? '8px' : '12px', // ✅ Меньший gap на мобильных
          alignItems: 'center', 
          marginBottom: isMobile ? '8px' : '12px', // ✅ Меньший отступ
          flexWrap: 'wrap'
        }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <input
              type="text"
              placeholder="Поиск..."
              className="dark-select"
              value={searchInput}
              onChange={e => handleFilterChange("search", e.target.value)}
              style={{
                width: '100%',
                padding: isMobile ? '8px 12px' : '10px 14px', // ✅ Меньший padding
                borderRadius: '6px',
                fontSize: '14px',
                outline: 'none',
                transition: '0.2s',
              }}
            />
          </div>
          
          {hasActiveFilters && (
            <button
              onClick={resetAllFilters}
              style={{
                padding: isMobile ? '8px 12px' : '10px 16px', // ✅ Меньший padding
                borderRadius: '6px',
                border: '1px solid #444',
                backgroundColor: '#2a2a2a',
                color: '#e0e0e0',
                cursor: 'pointer',
                fontSize: isMobile ? '13px' : '14px', // ✅ Меньший шрифт
                whiteSpace: 'nowrap',
                transition: '0.2s',
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#3a3a3a';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#2a2a2a';
              }}
            >
              Сбросить
            </button>
          )}
        </div>

        <div 
          className="toggle-filters"
          style={{
            marginBottom: isMobile ? '8px' : '16px', // ✅ Меньший отступ
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
          <div 
            className="filters" 
            style={{ 
              display: 'flex', 
              gap: isMobile ? '6px' : '12px', // ✅ Меньший gap между фильтрами
              flexWrap: 'wrap', 
              marginBottom: isMobile ? '8px' : '16px', // ✅ Меньший отступ снизу
              width: '100%',
            }}
          >
            {/* Статус */}
            <div style={{ 
              minWidth: isMobile ? '100%' : '150px', // ✅ На мобильных на всю ширину
              flex: isMobile ? '1 1 100%' : '1 1 150px', 
              maxWidth: isMobile ? '100%' : '250px' 
            }}>
              <label className="dark-label" style={{ marginBottom: isMobile ? '2px' : '4px' }}>Статус</label>
              <MultiSelectFilter
                options={STATUS_OPTIONS}
                selectedValues={selectedFilters.status}
                onChange={(values) => handleFilterChange("status", values)}
                placeholder="Все статусы"
                maxHeight={200}
                width="100%"
              />
            </div>

            {/* Компания */}
            <div style={{ 
              minWidth: isMobile ? '100%' : '150px',
              flex: isMobile ? '1 1 100%' : '1 1 150px',
              maxWidth: isMobile ? '100%' : '250px'
            }}>
              <label className="dark-label" style={{ marginBottom: isMobile ? '2px' : '4px' }}>Компания</label>
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
            <div style={{ 
              minWidth: isMobile ? '100%' : '150px',
              flex: isMobile ? '1 1 100%' : '1 1 150px',
              maxWidth: isMobile ? '100%' : '250px'
            }}>
              <label className="dark-label" style={{ marginBottom: isMobile ? '2px' : '4px' }}>Монтажник</label>
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
            <div style={{ 
              minWidth: isMobile ? '100%' : '150px',
              flex: isMobile ? '1 1 100%' : '1 1 150px',
              maxWidth: isMobile ? '100%' : '250px'
            }}>
              <label className="dark-label" style={{ marginBottom: isMobile ? '2px' : '4px' }}>Тип работы</label>
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
            <div style={{ 
              minWidth: isMobile ? '100%' : '150px',
              flex: isMobile ? '1 1 100%' : '1 1 150px',
              maxWidth: isMobile ? '100%' : '250px'
            }}>
              <label className="dark-label" style={{ marginBottom: isMobile ? '2px' : '4px' }}>Оборудование</label>
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

        <div 
          className="cards"
          style={{
            minHeight: '200px',
            width: '100%',
          }}
        >
          {loading ? (
            <div className="empty">Загрузка задач...</div>
          ) : tasks.length ? (
            tasks.map(task => (
              <TaskCard 
                key={task.id} 
                task={task} 
                onClick={handleTaskCardClick}
                showManagerStatus={true}
                isAdmin={true}
                onLike={async (taskId) => {
                  try {
                    await adminSetLogistPerformanceGood(taskId);
                    setTasks(prev => prev.map(t => 
                      t.id === taskId ? { ...t, logist_performance: 'good' } : t
                    ));
                  } catch (err) {
                    showAlert('Не удалось поставить оценку: ' + (err.response?.data?.detail || err.message))
                  }
                }}
                onDislike={async (taskId) => {
                  try {
                    await adminSetLogistPerformanceBad(taskId);
                    setTasks(prev => prev.map(t => 
                      t.id === taskId ? { ...t, logist_performance: 'bad' } : t
                    ));
                  } catch (err) {
                    showAlert('Не удалось поставить оценку: ' + (err.response?.data?.detail || err.message))
                  }
                }}
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