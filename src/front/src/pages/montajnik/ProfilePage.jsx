import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchMontajnikProfile,
  getCompaniesList,
  getWorkTypes,
  getEquipmentList,
  montajnikFilterCompletedTasks,
  getMontajnikEarningsByPeriod
} from "../../api";
import "../../styles/LogistPage.css"; // Используем стили логиста как основу

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

export default function ProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Состояния для фильтров
  const [selectedFilters, setSelectedFilters] = useState({
    company_id: null,
    work_type_id: null,
    equipment_id: null,
    search: "",
  });

  // Состояния для заработка за период
  const [selectedStartYear, setSelectedStartYear] = useState(new Date().getFullYear());
  const [selectedStartMonth, setSelectedStartMonth] = useState(new Date().getMonth() + 1); // 1-12
  const [selectedEndYear, setSelectedEndYear] = useState(new Date().getFullYear());
  const [selectedEndMonth, setSelectedEndMonth] = useState(new Date().getMonth() + 1); // 1-12
  const [periodEarnings, setPeriodEarnings] = useState(null);
  const [earningsLoading, setEarningsLoading] = useState(false);

  const [companies, setCompanies] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  const [equipments, setEquipments] = useState([]);

  // Состояния для истории задач
  const [historyTasks, setHistoryTasks] = useState([]);

  // Дебаунс для поиска
  const debouncedSearch = useDebounce(selectedFilters.search, 500);

  useEffect(() => {
    loadProfile();
    loadFilterOptions();
  }, []);

  useEffect(() => {
    // Загружаем задачи при изменении дебаунснутого поиска или других фильтров
    const filtersToUse = { ...selectedFilters, search: debouncedSearch };
    loadHistoryTasks(filtersToUse);
  }, [debouncedSearch, selectedFilters.company_id, selectedFilters.work_type_id, selectedFilters.equipment_id]);

  // Загружаем заработок за выбранный период при изменении дат
  useEffect(() => {
    loadPeriodEarnings();
  }, [selectedStartYear, selectedStartMonth, selectedEndYear, selectedEndMonth]);

  async function loadProfile() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMontajnikProfile();
      setProfile(data);
    } catch (err) {
      console.error("Ошибка загрузки профиля:", err);
      setError(err.response?.data?.detail || err.message || "Ошибка загрузки профиля");
    } finally {
      setLoading(false);
    }
  }

  async function loadPeriodEarnings() {
    if (!selectedStartYear || !selectedStartMonth || !selectedEndYear || !selectedEndMonth) return;
    
    setEarningsLoading(true);
    try {
      const data = await getMontajnikEarningsByPeriod(
        selectedStartYear, 
        selectedStartMonth, 
        selectedEndYear, 
        selectedEndMonth
      );
      setPeriodEarnings(data);
    } catch (err) {
      console.error("Ошибка загрузки заработка за период:", err);
      setPeriodEarnings(null);
    } finally {
      setEarningsLoading(false);
    }
  }

  async function loadHistoryTasks(filters) {
    try {
      const data = await montajnikFilterCompletedTasks(filters);
      setHistoryTasks(data || []);
    } catch (err) {
      console.error("Ошибка загрузки истории задач:", err);
      setHistoryTasks([]);
    }
  }

  async function loadFilterOptions() {
    try {
      const [companiesData, workTypesData, equipmentsData] = await Promise.all([
        getCompaniesList(),
        getWorkTypes(),
        getEquipmentList()
      ]);
      setCompanies(companiesData || []);
      setWorkTypes(workTypesData || []);
      setEquipments(equipmentsData || []);
    } catch (e) {
      console.error("Ошибка загрузки опций фильтров:", e);
    }
  }

  // Функция для перехода к деталям завершенной задачи
  const viewCompletedTask = (taskId) => {
    navigate(`/montajnik/completed-tasks/${taskId}`); // Новый маршрут
  };

  const handleFilterChange = (field, value) => {
    let normalized;
    if (value === "" || value === null) normalized = null;
    else if (!isNaN(value) && value !== true && value !== false) normalized = Number(value);
    else normalized = value;

    setSelectedFilters(prev => ({ ...prev, [field]: normalized }));
  };

  const handleStartYearChange = (e) => {
    setSelectedStartYear(Number(e.target.value));
  };

  const handleStartMonthChange = (e) => {
    setSelectedStartMonth(Number(e.target.value));
  };

  const handleEndYearChange = (e) => {
    setSelectedEndYear(Number(e.target.value));
  };

  const handleEndMonthChange = (e) => {
    setSelectedEndMonth(Number(e.target.value));
  };

  // Генерация списка лет (например, последние 5 лет)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  // Месяцы
  const months = [
    { value: 1, name: 'Январь' },
    { value: 2, name: 'Февраль' },
    { value: 3, name: 'Март' },
    { value: 4, name: 'Апрель' },
    { value: 5, name: 'Май' },
    { value: 6, name: 'Июнь' },
    { value: 7, name: 'Июль' },
    { value: 8, name: 'Август' },
    { value: 9, name: 'Сентябрь' },
    { value: 10, name: 'Октябрь' },
    { value: 11, name: 'Ноябрь' },
    { value: 12, name: 'Декабрь' },
  ];

  if (loading) return <div className="logist-main"><div className="empty">Загрузка профиля...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;
  if (!profile) return <div className="logist-main"><div className="empty">Профиль не найден</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1>Личный кабинет</h1>
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
            <p><b>Всего заработано:</b> {profile.total_earned ? `${profile.total_earned} руб.` : "0 руб."}</p>
          </div>

          {/* Блок заработка за период */}
          <div className="profile-card">
            <h2>Заработок за период</h2>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
              <div>
                <label className="dark-label">С</label>
                <select
                  className="dark-select"
                  value={selectedStartYear}
                  onChange={handleStartYearChange}
                >
                  {years.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
                <select
                  className="dark-select"
                  value={selectedStartMonth}
                  onChange={handleStartMonthChange}
                >
                  {months.map(month => (
                    <option key={month.value} value={month.value}>{month.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="dark-label">По</label>
                <select
                  className="dark-select"
                  value={selectedEndYear}
                  onChange={handleEndYearChange}
                >
                  {years.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
                <select
                  className="dark-select"
                  value={selectedEndMonth}
                  onChange={handleEndMonthChange}
                >
                  {months.map(month => (
                    <option key={month.value} value={month.value}>{month.name}</option>
                  ))}
                </select>
              </div>
            </div>
            
            {earningsLoading ? (
              <p>Загрузка...</p>
            ) : periodEarnings ? (
              <div>
                <p><b>За период {periodEarnings.period_display}:</b></p>
                <p style={{ fontSize: '1.2em', fontWeight: 'bold', color: '#4ade80' }}>
                  {periodEarnings.total_earned} руб.
                </p>
                <p>Количество задач: {periodEarnings.task_count}</p>
              </div>
            ) : (
              <p>Нет данных</p>
            )}
          </div>
        </div>

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
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
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
                    transition: "background 0.2s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#161b22"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "#0d1117"}
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
                  <p style={{ margin: "4px 0" }}>
                    <b>Награда:</b> {task.montajnik_reward ? `${task.montajnik_reward} руб.` : "0 руб."}
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