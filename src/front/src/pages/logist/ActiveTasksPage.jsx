import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { logistFilterTasks, getCompaniesList, getActiveMontajniks, getWorkTypes, getEquipmentList } from "../../api";
import TaskCard from "../../components/TaskCard";
import AddTaskModal from "./_AddTaskModal";
import MultiSelectFilter from "../../components/MultiSelectFilter";

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

const FILTERS_STORAGE_KEY = 'logistActiveTasksFilters';

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

export default function ActiveTasksPage() {
    const navigate = useNavigate();
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);
    const [showFilters, setShowFilters] = useState(() => {
      try {
        const saved = localStorage.getItem('logistActiveTasksShowFilters');
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
    const debouncedSearch = useDebounce(searchInput, 500);
    const isMobile = useIsMobile();

    // Сохраняем фильтры при каждом изменении
    useEffect(() => {
      try {
        localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(selectedFilters));
      } catch (err) {
        console.error('Ошибка сохранения фильтров:', err);
      }
    }, [selectedFilters]);

    // Сохраняем состояние показа фильтров
    useEffect(() => {
      try {
        localStorage.setItem('logistActiveTasksShowFilters', JSON.stringify(showFilters));
      } catch (err) {
        console.error('Ошибка сохранения состояния фильтров:', err);
      }
    }, [showFilters]);

    useEffect(() => {
        const fetchFiltersData = async () => {
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
            } catch (err) {
                console.error("Ошибка загрузки фильтров", err);
            }
        };
        fetchFiltersData();
    }, []);

    useEffect(() => {
        setSelectedFilters(prev => ({ ...prev, search: debouncedSearch }));
    }, [debouncedSearch]);

    useEffect(() => {
        setLoading(true);
        logistFilterTasks(selectedFilters).finally(() => {
            setLoading(false);
        }).then(data => {
            setTasks(data || []);
        }).catch(e => {
            console.error(e);
            setTasks([]);
        });
    }, [selectedFilters]);

    const handleFilterChange = (field, value) => {
        if (field === 'search') {
            setSearchInput(value);
        } else {
            setSelectedFilters(prev => ({ ...prev, [field]: value }));
        }
    };

    const handleTaskCardClick = (task) => {
        navigate(`/logist/tasks/${task.id}`);
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isMobile ? '12px' : '16px', flexWrap: 'wrap', gap: '8px' }}>
                    <h1 className="page-title" style={{ margin: 0 }}>Активные заявки</h1>
                    <button 
                        className="add-btn" 
                        onClick={() => setOpen(true)}
                        style={{
                            padding: isMobile ? '8px 12px' : '8px 16px',
                            fontSize: '14px',
                            fontWeight: '600',
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            background: 'linear-gradient(135deg, #10b981, #2563eb)',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                          <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4" stroke="currentColor" strokeWidth="2" fill="none"/>
                        </svg> 
                        {isMobile ? 'Добавить' : 'Добавить задачу'}
                    </button>
                </div>
                
                <div style={{ 
                  display: 'flex', 
                  gap: isMobile ? '8px' : '12px',
                  alignItems: 'center', 
                  marginBottom: isMobile ? '8px' : '12px',
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
                            padding: isMobile ? '8px 12px' : '10px 14px',
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
                        padding: isMobile ? '8px 12px' : '10px 16px',
                        borderRadius: '6px',
                        border: '1px solid #444',
                        backgroundColor: '#2a2a2a',
                        color: '#e0e0e0',
                        cursor: 'pointer',
                        fontSize: isMobile ? '13px' : '14px',
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
                      marginBottom: isMobile ? '8px' : '16px',
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
                    <div className="filters" style={{ 
                      display: 'flex', 
                      gap: isMobile ? '6px' : '12px',
                      flexWrap: 'wrap', 
                      marginBottom: isMobile ? '8px' : '16px',
                      width: '100%'
                    }}>
                        {/* Статус */}
                        <div style={{ 
                          minWidth: isMobile ? '100%' : '150px',
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

                <div className="cards" style={{ minHeight: '200px', width: '100%' }}>
                    {loading ? (
                        <div className="empty">Загрузка...</div>
                    ) : tasks.length ? (
                        tasks.map(t => (
                            <TaskCard 
                                key={t.id} 
                                task={t} 
                                onClick={handleTaskCardClick}
                            />
                        ))
                    ) : (
                        <div className="empty">Нет активных задач</div>
                    )}
                </div>
                
                <AddTaskModal 
                    open={open} 
                    onClose={() => setOpen(false)} 
                    onSaved={() => logistFilterTasks(selectedFilters).then(data => setTasks(data || []))}
                />
            </div>
        </div>
    );
}