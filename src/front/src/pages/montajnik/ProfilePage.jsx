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
import MultiSelectFilter from "../../components/MultiSelectFilter"; // Добавляем импорт компонента
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
    company_id: [],
    work_type_id: [],
    equipment_id: [],
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
    if (value === "" || value === null) normalized = [];
    else if (Array.isArray(value)) normalized = value;
    else normalized = [value];

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

  const monthNames = {
  1: 'Январь',
  2: 'Февраль',
  3: 'Март',
  4: 'Апрель',
  5: 'Май',
  6: 'Июнь',
  7: 'Июль',
  8: 'Август',
  9: 'Сентябрь',
  10: 'Октябрь',
  11: 'Ноябрь',
  12: 'Декабрь',
};


  // Преобразование опций для MultiSelectFilter
  const companyOptions = companies.map(c => ({ value: c.id, label: c.name }));
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
    <p>
      <b>
        За период {selectedStartYear} г., {monthNames[selectedStartMonth]} - {selectedEndYear} г., {monthNames[selectedEndMonth]}:
      </b>
    </p>
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