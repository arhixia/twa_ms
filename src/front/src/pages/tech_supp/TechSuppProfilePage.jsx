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

export default function TechSuppProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFilters, setShowFilters] = useState(false); // Фильтры изначально скрыты

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

  // Состояния для истории задач
  const [historyTasks, setHistoryTasks] = useState([]);

  // Дебаунс для поиска
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(selectedFilters.search, 500);

  useEffect(() => {
    loadProfile();
    loadFilterOptions();
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

  // Функция для перехода к деталям завершенной задачи
  const viewCompletedTask = (taskId) => {
    navigate(`/tech_supp/completed-tasks/${taskId}`);
  };

  const handleFilterChange = (field, value) => {
    let normalized;
    if (field === 'search') {
      setSearchInput(value);
      setSelectedFilters(prev => ({ ...prev, [field]: value }));
      return;
    }
    
    if (value === "" || value === null) normalized = [];
    else if (Array.isArray(value)) normalized = value;
    else normalized = [value];

    setSelectedFilters(prev => ({ ...prev, [field]: normalized }));
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
            <div style={{ marginBottom: '16px', maxWidth: '100%' }}>
              {/* Поиск */}
              <div style={{ marginBottom: '12px', width: '100%' }}>
                <label className="dark-label">Поиск</label>
                <input
                  type="text"
                  className="dark-select"
                  placeholder="Поиск..."
                  value={searchInput}
                  onChange={e => handleFilterChange("search", e.target.value)}
                />
              </div>

              <div className="filters" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', maxWidth: '100%' }}>
                {/* Компания */}
                <div style={{ width: '150px', minWidth: '150px', maxWidth: '150px', flex: '0 0 auto' }}>
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
                <div style={{ width: '150px', minWidth: '150px', maxWidth: '150px', flex: '0 0 auto' }}>
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
                <div style={{ width: '150px', minWidth: '150px', maxWidth: '150px', flex: '0 0 auto' }}>
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
                <div style={{ width: '150px', minWidth: '150px', maxWidth: '150px', flex: '0 0 auto' }}>
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
          )}

          {/* Добавляем минимальную высоту для контейнера задач */}
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
                    {/* ID задачи */}
                    <div className="task-id">#{task.id}</div>

                    {/* Название компании/ИП */}
                    <div className="task-client">{task.client || "—"}</div>

                    {/* Модель ТС */}
                    {task.vehicle_info && (
                      <div className="task-vehicle-model">{task.vehicle_info}</div>
                    )}

                    {/* Госномер в рамке */}
                    {task.gos_number && (
                      <div className="task-gos-number-wrapper">
                        <div className="task-gos-number">{task.gos_number}</div>
                      </div>
                    )}

                    {/* Блок оборудования */}
                    <div className="equipment-section">
              <div className="equipment-label">ОБОРУДОВАНИЕ:</div>
              <div className="equipment-list">
                {task.equipment && task.equipment.length > 0 ? (
                  (() => {
                    // Группируем оборудование по названию
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

                    {/* Дата и время */}
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

                    {/* Статус (справа вверху) */}
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