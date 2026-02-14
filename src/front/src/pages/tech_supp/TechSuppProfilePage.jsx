import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  techSuppProfile,
  getCompaniesList,
  getActiveMontajniks,
  getWorkTypes,
  getEquipmentList,
  techSuppFilterCompletedTasks
} from "../../api";
import MultiSelectFilter from "../../components/MultiSelectFilter";
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

const FILTERS_STORAGE_KEY = 'techSuppProfileFilters';

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
    company_id: [],
    assigned_user_id: [],
    work_type_id: [],
    equipment_id: [],
    search: "",
  };
};

export default function TechSuppProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFilters, setShowFilters] = useState(() => {
    try {
      const saved = localStorage.getItem('techSuppProfileShowFilters');
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
  const [historyTasks, setHistoryTasks] = useState([]);

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
      localStorage.setItem('techSuppProfileShowFilters', JSON.stringify(showFilters));
    } catch (err) {
      console.error('Ошибка сохранения состояния фильтров:', err);
    }
  }, [showFilters]);

  useEffect(() => {
    loadProfile();
    loadFilterOptions();
  }, []);

  useEffect(() => {
    setSelectedFilters(prev => ({ ...prev, search: debouncedSearch }));
  }, [debouncedSearch]);

  useEffect(() => {
    loadHistoryTasks(selectedFilters);
  }, [selectedFilters]);

  async function loadProfile() {
    setLoading(true);
    setError(null);
    try {
      const data = await techSuppProfile();
      setProfile(data);
    } catch (err) {
      console.error("Ошибка загрузки профиля тех.спеца:", err);
      setError(err.response?.data?.detail || err.message || "Ошибка загрузки профиля");
    } finally {
      setLoading(false);
    }
  }

  async function loadHistoryTasks(filters) {
    try {
      const data = await techSuppFilterCompletedTasks(filters);
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

  const viewCompletedTask = (taskId) => {
    navigate(`/tech_supp/completed-tasks/${taskId}`);
  };

  const handleFilterChange = (field, value) => {
    if (field === 'search') {
      setSearchInput(value);
    } else {
      let normalized;
      if (value === "" || value === null) normalized = [];
      else if (Array.isArray(value)) normalized = value;
      else normalized = [value];
      setSelectedFilters(prev => ({ ...prev, [field]: normalized }));
    }
  };

  // Функция для сброса всех фильтров
  const resetAllFilters = () => {
    const defaultFilters = {
      company_id: [],
      assigned_user_id: [],
      work_type_id: [],
      equipment_id: [],
      search: "",
    };
    setSelectedFilters(defaultFilters);
    setSearchInput("");
    localStorage.removeItem(FILTERS_STORAGE_KEY);
  };

  const companyOptions = companies.map(c => ({ value: c.id, label: c.name }));
  const montajnikOptions = montajniks.map(m => ({ value: m.id, label: m.name }));
  const workTypeOptions = workTypes.map(w => ({ value: w.id, label: w.name }));
  const equipmentOptions = equipments.map(eq => ({ value: eq.id, label: eq.name }));

  // Проверяем, есть ли активные фильтры
  const hasActiveFilters = 
    selectedFilters.company_id.length > 0 || 
    selectedFilters.assigned_user_id.length > 0 || 
    selectedFilters.work_type_id.length > 0 || 
    selectedFilters.equipment_id.length > 0 || 
    searchInput;

  if (loading) return <div className="logist-main"><div className="empty">Загрузка профиля...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;
  if (!profile) return <div className="logist-main"><div className="empty">Профиль не найден</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Личный кабинет</h1>
        </div>

        <div className="profile-overview">
          <div className="profile-card">
            <div className="profile-card-header">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <h2>Информация</h2>
            </div>
            <p><b>Имя:</b> {profile.name || "—"}</p>
            <p><b>Фамилия:</b> {profile.lastname || "—"}</p>
          </div>

          <div className="profile-card">
            <div className="profile-card-header">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
              </svg>
              <h2>Статистика</h2>
            </div>
            <p><b>Активные задачи:</b> {profile.active_checking_count || 0}</p>
            <p><b>Проверено задач:</b> {profile.completed_count || 0}</p>
          </div>
        </div>

        <div className="section">
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
                className="dark-select"
                placeholder="Поиск..."
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
            <div style={{ 
              display: 'flex', 
              gap: isMobile ? '6px' : '12px',
              flexWrap: 'wrap', 
              marginBottom: isMobile ? '8px' : '16px',
              width: '100%'
            }}>
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

          <div style={{ minHeight: '300px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#4CAF50', fontWeight: 'bold', fontSize: '1.2em', marginBottom: '12px' }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
              История выполненных задач
            </h3>
            {historyTasks && historyTasks.length > 0 ? (
              <div className="cards">
                {historyTasks.map((task) => (
                  <div key={task.id} className="task-card" onClick={() => viewCompletedTask(task.id)}>
                    <div className="task-id">#{task.id}</div>
                    <div className="task-client">{task.client || "—"}</div>

                    {task.vehicle_info && (
                      <div className="task-vehicle-model">{task.vehicle_info}</div>
                    )}

                    {task.gos_number && (
                      <div className="task-gos-number-wrapper">
                        <div className="task-gos-number">{task.gos_number}</div>
                      </div>
                    )}

                    <div className="equipment-section">
                      <div className="equipment-label">ОБОРУДОВАНИЕ:</div>
                      <div className="equipment-list">
                        {task.equipment && task.equipment.length > 0 ? (
                          (() => {
                            const groupedEquipment = task.equipment.reduce((acc, eq) => {
                              const name = eq.equipment?.name || `Оборудование ${eq.equipment_id}`;
                              if (!acc[name]) {
                                acc[name] = 0;
                              }
                              acc[name]++;
                              return acc;
                            }, {});

                            return Object.entries(groupedEquipment).map(([name, count], index) => (
                              <div key={index} className="equipment-item">
                                {count > 1 ? `${name} x${count}` : name}
                              </div>
                            ));
                          })()
                        ) : (
                          <div className="equipment-item">Оборудование не назначено</div>
                        )}
                      </div>
                    </div>

                    <div className="task-scheduled-at">
                      <span style={{ 
                        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", 
                        fontWeight: 600,
                        fontSize: '1.1em',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        Дата завершения:&nbsp;
                        {task.completed_at ? new Date(task.completed_at).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        }) : "—"}
                      </span>
                    </div>

                    <div className="task-status-badge" style={{ backgroundColor: '#20c997' }}>
                      Завершена
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">История пока пуста</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}