import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchLogistProfile,
  getCompaniesList,
  getActiveMontajniks,
  getWorkTypes,
  getEquipmentList,
  logistFilterCompletedTasks,
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

export default function LogistProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
    const filtersToUse = { ...selectedFilters, search: debouncedSearch };
    loadHistoryTasks(filtersToUse);
  }, [debouncedSearch, selectedFilters.company_id, selectedFilters.assigned_user_id, selectedFilters.work_type_id, selectedFilters.equipment_id]);

  async function loadProfile() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLogistProfile();
      setProfile(data);
    } catch (err) {
      console.error("Ошибка загрузки профиля логиста:", err);
      setError(err.response?.data?.detail || err.message || "Ошибка загрузки профиля");
    } finally {
      setLoading(false);
    }
  }

  async function loadHistoryTasks(filters) {
    try {
      const data = await logistFilterCompletedTasks(filters);
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
    navigate(`/logist/completed-tasks/${taskId}`);
  };

  const handleFilterChange = (field, value) => {
    let normalized;
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
            <h2>Информация</h2>
            <p><b>Имя:</b> {profile.name || "—"}</p>
            <p><b>Фамилия:</b> {profile.lastname || "—"}</p>
          </div>

          <div className="profile-card">
            <h2>Статистика</h2>
            <p><b>Выполнено задач:</b> {profile.completed_count || 0}</p>
            <p><b>В черновиках:</b> {profile.draft_count || 0}</p>
            <p><b>В архиве:</b> {profile.archived_count || 0}</p>
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
        className="dark-select"
        placeholder="Поиск..."
        value={selectedFilters.search}
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

  {/* Добавляем минимальную высоту для контейнера задач */}
  <div style={{ minHeight: '300px' }}>
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