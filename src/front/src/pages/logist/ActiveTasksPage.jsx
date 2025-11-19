import React, { useEffect, useState } from "react";
import { fetchActiveTasks, logistFilterTasks, getCompaniesList, getActiveMontajniks, getWorkTypes, getEquipmentList } from "../../api";
import TaskCard from "../../components/TaskCard";
import AddTaskModal from "./_AddTaskModal";
import useAuthStore from "@/store/useAuthStore";


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

export default function ActiveTasksPage() {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(false);

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

    const [searchInput, setSearchInput] = useState("");
    const debouncedSearch = useDebounce(searchInput, 500);

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
        let normalized;
        if (value === "" || value === null) normalized = null;
        else if (!isNaN(value) && value !== true && value !== false) normalized = Number(value);
        else normalized = value;

        if (field === 'search') {
            setSearchInput(normalized);
        } else {
            setSelectedFilters(prev => ({ ...prev, [field]: normalized }));
        }
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
    ];

    return (
        <div className="page">
            <div className="page-header">
                <h1>Активные заявки</h1>
                <button className="add-btn" onClick={()=>setOpen(true)}> Добавить задачу</button>
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

            <div className="cards">
                {loading ? <div>Загрузка...</div> : tasks.length ? tasks.map(t=> <TaskCard key={t.id} task={t} />) : <div className="empty">Нет активных задач</div>}
            </div>
            <AddTaskModal open={open} onClose={()=>setOpen(false)} onSaved={() => logistFilterTasks(selectedFilters).then(data => setTasks(data || []))} />
        </div>
    ); 
}