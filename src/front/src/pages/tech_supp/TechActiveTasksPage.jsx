import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { techSuppFilterTasks, getTechCompaniesList, getActiveMontajniks, getWorkTypes, getEquipmentList } from "../../api";
import MultiSelectFilter from "../../components/MultiSelectFilter";
import TaskCard from "../../components/TaskCard";
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

export default function TechActiveTasksPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 500);

  useEffect(() => {
    const fetchFiltersData = async () => {
      try {
        const [companiesData, montajniksData, workTypesData, equipmentsData] = await Promise.all([
          getTechCompaniesList(),
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
    techSuppFilterTasks(selectedFilters).finally(() => {
      setLoading(false);
    }).then(data => {
      setTasks(data || []);
    }).catch(e => {
      console.error(e);
      setTasks([]);
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
    navigate(`/tech_supp/tasks/${task.id}`);
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

  // Преобразование опций для MultiSelectFilter
  const companyOptions = companies.map(c => ({ value: c.id, label: c.name }));
  const montajnikOptions = montajniks.map(m => ({ value: m.id, label: m.name }));
  const workTypeOptions = workTypes.map(w => ({ value: w.id, label: w.name }));
  const equipmentOptions = equipments.map(eq => ({ value: eq.id, label: eq.name }));

  return (
    <div className="logist-main">
      <div className="page">
        <h1 className="page-title">Активные задачи</h1>
        
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

        <div className="cards">
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
      </div>
    </div>
  );
}