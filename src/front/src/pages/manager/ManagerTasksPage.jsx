// src/pages/manager/ManagerTasksPage.jsx
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  managerFilterTasks,
  getManagerCompaniesList,
  getManagerMontajniks,
  getManagerWorkTypes,
  getManagerEquipmentList,
} from "@/api";
import TaskCard from "@/components/TaskCard";
import MultiSelectFilter from "@/components/MultiSelectFilter";

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

const InvoiceNotIssuedIcon = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
);
const InvoiceIssuedIcon = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>
);
const WarrantyIcon = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const CashPaymentIcon = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path fill={color} fillRule="evenodd" d="M11 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8m5-4a5 5 0 1 1-10 0 5 5 0 0 1 10 0"/>
    <path fill={color} d="M9.438 11.944c.047.596.518 1.06 1.363 1.116v.44h.375v-.443c.875-.061 1.386-.529 1.386-1.207 0-.618-.39-.936-1.09-1.1l-.296-.07v-1.2c.376.043.614.248.671.532h.658c-.047-.575-.54-1.024-1.329-1.073V8.5h-.375v.45c-.747.073-1.255.522-1.255 1.158 0 .562.378.92 1.007 1.066l.248.061v1.272c-.384-.058-.639-.27-.696-.563h-.668zm1.36-1.354c-.369-.085-.569-.26-.569-.522 0-.294.216-.514.572-.578v1.1zm.432.746c.449.104.655.272.655.569 0 .339-.257.571-.709.614v-1.195z"/>
    <path fill={color} d="M1 0a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h4.083q.088-.517.258-1H3a2 2 0 0 0-2-2V3a2 2 0 0 0 2-2h10a2 2 0 0 0 2 2v3.528c.38.34.717.728 1 1.154V1a1 1 0 0 0-1-1z"/>
    <path fill={color} d="M9.998 5.083 10 5a2 2 0 1 0-3.132 1.65 6 6 0 0 1 3.13-1.567"/>
  </svg>
);

const FILTERS_STORAGE_KEY = "managerTasksFilters";

const SECTIONS = [
  { key: "invoice_not_issued", title: "Невыставленные счета", icon: InvoiceNotIssuedIcon, color: "#d97706" },
  { key: "invoice_issued",     title: "Счет выставлен",       icon: InvoiceIssuedIcon,    color: "#16a34a" },
  { key: "warranty",           title: "Гарантия",             icon: WarrantyIcon,          color: "#1d4ed8" },
  { key: "cash_payment",       title: "Оплата наличными",     icon: CashPaymentIcon,       color: "#b54444" },
];

const defaultFilters = () => ({
  company_id: [],
  assigned_user_id: [],
  work_type_id: [],
  task_id: null,
  equipment_id: [],
  search: "",
});

const loadFilters = () => {
  try {
    const s = localStorage.getItem(FILTERS_STORAGE_KEY);
    return s ? JSON.parse(s) : defaultFilters();
  } catch { return defaultFilters(); }
};

export default function ManagerTasksPage() {
  const isMobile = useIsMobile();

  const [tasks, setTasks]           = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);  // первая загрузка — скрывает всё
  const [tasksLoading, setTasksLoading]     = useState(false);  // повторные — только затемняет карточки
  const [companies, setCompanies]   = useState([]);
  const [montajniks, setMontajniks] = useState([]);
  const [workTypes, setWorkTypes]   = useState([]);
  const [equipments, setEquipments] = useState([]);

  const [showFilters, setShowFilters] = useState(() => {
    try { return JSON.parse(localStorage.getItem("managerTasksShowFilters") || "false"); }
    catch { return false; }
  });

  const [selectedFilters, setSelectedFilters] = useState(loadFilters);
  const [searchInput, setSearchInput] = useState(() => loadFilters().search);
  const debouncedSearch = useDebounce(searchInput, 500);

  useEffect(() => {
    try { localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(selectedFilters)); }
    catch {}
  }, [selectedFilters]);

  useEffect(() => {
    try { localStorage.setItem("managerTasksShowFilters", JSON.stringify(showFilters)); }
    catch {}
  }, [showFilters]);

  // Загружаем справочники — каждый независимо
  useEffect(() => {
    getManagerCompaniesList()
      .then(data => setCompanies(data || []))
      .catch(err => console.error("Ошибка загрузки компаний", err));

    getManagerMontajniks()
      .then(data => setMontajniks(data || []))
      .catch(err => console.error("Ошибка загрузки монтажников", err));

    getManagerWorkTypes()
      .then(data => setWorkTypes(data || []))
      .catch(err => console.error("Ошибка загрузки типов работ", err));

    getManagerEquipmentList()
      .then(data => setEquipments(data || []))
      .catch(err => console.error("Ошибка загрузки оборудования", err));
  }, []);

  useEffect(() => {
    setSelectedFilters(prev => ({ ...prev, search: debouncedSearch }));
  }, [debouncedSearch]);

  // Загрузка задач: первый раз — полный спиннер, последующие — только затемнение карточек
  useEffect(() => {
    if (initialLoading) {
      managerFilterTasks(selectedFilters)
        .then(data => setTasks(data?.tasks || []))
        .catch(err => { console.error(err); setTasks([]); })
        .finally(() => setInitialLoading(false));
    } else {
      setTasksLoading(true);
      managerFilterTasks(selectedFilters)
        .then(data => setTasks(data?.tasks || []))
        .catch(err => { console.error(err); setTasks([]); })
        .finally(() => setTasksLoading(false));
    }
  }, [selectedFilters]);

  const handleFilterChange = (field, value) => {
    if (field === "search") {
      setSearchInput(value);
    } else {
      setSelectedFilters(prev => ({ ...prev, [field]: value }));
    }
  };

  const resetAllFilters = () => {
    setSelectedFilters(defaultFilters());
    setSearchInput("");
    localStorage.removeItem(FILTERS_STORAGE_KEY);
  };

  const hasActiveFilters =
    selectedFilters.company_id.length > 0 ||
    selectedFilters.assigned_user_id.length > 0 ||
    selectedFilters.work_type_id.length > 0 ||
    selectedFilters.equipment_id.length > 0 ||
    !!searchInput;

  // Группируем по manager_status
  const grouped = Object.fromEntries(SECTIONS.map(s => [s.key, []]));
  tasks.forEach(task => {
    if (task.manager_status && grouped[task.manager_status]) {
      grouped[task.manager_status].push(task);
    }
  });

  const companyOptions   = companies.map(c  => ({ value: c.id, label: c.name }));
  const montajnikOptions = montajniks.map(m => ({ value: m.id, label: m.name }));
  const workTypeOptions  = workTypes.map(w  => ({ value: w.id, label: w.name }));
  const equipmentOptions = equipments.map(e => ({ value: e.id, label: e.name }));

  return (
    <div className="logist-main">
      <div className="page">
        <h1 className="page-title">Задачи</h1>

        {/* Поиск + Сбросить */}
        <div style={{ display: "flex", gap: isMobile ? "8px" : "12px", alignItems: "center", marginBottom: isMobile ? "8px" : "12px", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "200px" }}>
            <input
              type="text"
              placeholder="Поиск..."
              className="dark-select"
              value={searchInput}
              onChange={e => handleFilterChange("search", e.target.value)}
              style={{ width: "100%", padding: isMobile ? "8px 12px" : "10px 14px", borderRadius: "6px", fontSize: "14px", outline: "none" }}
            />
          </div>
          {hasActiveFilters && (
            <button
              onClick={resetAllFilters}
              style={{ padding: isMobile ? "8px 12px" : "10px 16px", borderRadius: "6px", border: "1px solid #444", backgroundColor: "#2a2a2a", color: "#e0e0e0", cursor: "pointer", fontSize: "14px", whiteSpace: "nowrap" }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = "#3a3a3a"}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = "#2a2a2a"}
            >
              Сбросить
            </button>
          )}
        </div>

        {/* Тоггл фильтров */}
        <div
          style={{ marginBottom: isMobile ? "8px" : "16px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", color: "white", fontSize: "16px", fontWeight: "600", fontFamily: '"Inter", sans-serif' }}
          onClick={() => setShowFilters(!showFilters)}
        >
          <span style={{ display: "inline-block", transform: showFilters ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}>▶</span>
          Фильтры
        </div>

        {/* Панель фильтров — рендерится всегда независимо от загрузки задач */}
        {showFilters && (
          <div className="filters" style={{ display: "flex", gap: isMobile ? "6px" : "12px", flexWrap: "wrap", marginBottom: isMobile ? "8px" : "16px" }}>

            <div style={{ minWidth: isMobile ? "100%" : "150px", flex: isMobile ? "1 1 100%" : "1 1 150px", maxWidth: isMobile ? "100%" : "250px" }}>
              <label className="dark-label" style={{ marginBottom: isMobile ? "2px" : "4px" }}>Компания</label>
              <MultiSelectFilter
                options={companyOptions}
                selectedValues={selectedFilters.company_id}
                onChange={values => handleFilterChange("company_id", values)}
                placeholder="Все компании"
                maxHeight={200}
                width="100%"
              />
            </div>

            <div style={{ minWidth: isMobile ? "100%" : "150px", flex: isMobile ? "1 1 100%" : "1 1 150px", maxWidth: isMobile ? "100%" : "250px" }}>
              <label className="dark-label" style={{ marginBottom: isMobile ? "2px" : "4px" }}>Монтажник</label>
              <MultiSelectFilter
                options={montajnikOptions}
                selectedValues={selectedFilters.assigned_user_id}
                onChange={values => handleFilterChange("assigned_user_id", values)}
                placeholder="Все монтажники"
                maxHeight={200}
                width="100%"
              />
            </div>

            <div style={{ minWidth: isMobile ? "100%" : "150px", flex: isMobile ? "1 1 100%" : "1 1 150px", maxWidth: isMobile ? "100%" : "250px" }}>
              <label className="dark-label" style={{ marginBottom: isMobile ? "2px" : "4px" }}>Тип работы</label>
              <MultiSelectFilter
                options={workTypeOptions}
                selectedValues={selectedFilters.work_type_id}
                onChange={values => handleFilterChange("work_type_id", values)}
                placeholder="Все типы работ"
                maxHeight={200}
                width="100%"
              />
            </div>

            <div style={{ minWidth: isMobile ? "100%" : "150px", flex: isMobile ? "1 1 100%" : "1 1 150px", maxWidth: isMobile ? "100%" : "250px" }}>
              <label className="dark-label" style={{ marginBottom: isMobile ? "2px" : "4px" }}>Оборудование</label>
              <MultiSelectFilter
                options={equipmentOptions}
                selectedValues={selectedFilters.equipment_id}
                onChange={values => handleFilterChange("equipment_id", values)}
                placeholder="Все оборудование"
                maxHeight={200}
                width="100%"
              />
            </div>

          </div>
        )}

        {/* Секции — первая загрузка показывает спиннер, повторные — затемняют карточки */}
        {initialLoading ? (
          <div className="empty">Загрузка...</div>
        ) : (
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            marginTop: "8px",
            opacity: tasksLoading ? 0.5 : 1,
            transition: "opacity 0.15s ease",
            pointerEvents: tasksLoading ? "none" : "auto",
          }}>
            {SECTIONS.map(section => {
              const IconComponent = section.icon;
              const sectionTasks = grouped[section.key] || [];
              return (
                <div key={section.key}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                    <span style={{ width: "24px", height: "24px", borderRadius: "6px", backgroundColor: `${section.color}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <IconComponent color={section.color} />
                    </span>
                    <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: section.color, fontFamily: '"Inter", sans-serif' }}>
                      {section.title}
                      <span style={{ marginLeft: "8px", fontSize: "13px", fontWeight: 400, color: "#8b949e" }}>
                        ({sectionTasks.length})
                      </span>
                    </h2>
                  </div>

                  <div className="horizontal-cards-container">
                    {sectionTasks.length > 0 ? (
                      sectionTasks.map(task => (
                        <Link key={task.id} to={`/manager/tasks/${task.id}`} style={{ textDecoration: "none", display: "flex" }}>
                          <TaskCard task={task} />
                        </Link>
                      ))
                    ) : (
                      <div className="empty" style={{ padding: "12px", textAlign: "center", fontStyle: "italic", color: "#8b949e", fontSize: "15px", minWidth: "280px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        Задач нет
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}