import React, { useState, useEffect } from 'react';
import { adminFilterTasks, getAdminCompaniesList, getActiveMontajniks, getAdminWorkTypesList } from '../../api';
import TaskCard from '../../components/TaskCard';
import { useNavigate } from 'react-router-dom';


function AdminTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const [companies, setCompanies] = useState([]);
  const [montajniks, setMontajniks] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  const [selectedFilters, setSelectedFilters] = useState({
    status: "",
    company_id: "",
    assigned_user_id: "",
    work_type_id: "",
    task_id: "",
  });

  const navigate = useNavigate();

  useEffect(() => {
    const fetchFiltersData = async () => {
      try {
        const [companiesData, montajniksData, workTypesData] = await Promise.all([
          getAdminCompaniesList(),
          getActiveMontajniks(),
          getAdminWorkTypesList(),
        ]);
        setCompanies(companiesData);
        setMontajniks(montajniksData);
        setWorkTypes(workTypesData);
      } catch (err) {
        console.error("Ошибка загрузки фильтров", err);
      }
    };
    fetchFiltersData();
  }, []);

  const fetchTasks = async (filters = {}) => {
    setLoading(true);
    try {
      const data = await adminFilterTasks(filters);
      setTasks(data);
    } catch (err) {
      alert('Ошибка загрузки задач');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks(selectedFilters);
  }, [selectedFilters]);

  const handleFilterChange = (field, value) => {
    setSelectedFilters(prev => ({ ...prev, [field]: value }));
  };

  const openTaskDetail = (task) => {
    navigate(`/admin/tasks/${task.id}`);
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

  if (loading) return <div className="empty">Загрузка задач...</div>;

  return (
    <div className="content" style={{ paddingTop: '10px', paddingLeft: '20px', paddingRight: '20px' }}>
  <div className="page-header" style={{ marginBottom: '12px' }}>
    <h1 style={{ margin: 0 }}>Все задачи</h1>
  </div>

      <div className="filters" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
  
        <div>
          <label className="dark-label">Статус</label>
          <select
            className="dark-select"
            value={selectedFilters.status}
            onChange={e => handleFilterChange("status", e.target.value)}
          >
            <option value="">Все статусы</option>
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="dark-label">Компания</label>
          <select
            className="dark-select"
            value={selectedFilters.company_id}
            onChange={e => handleFilterChange("company_id", e.target.value)}
          >
            <option value="">Все компании</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label className="dark-label">Монтажник</label>
          <select
            className="dark-select"
            value={selectedFilters.assigned_user_id}
            onChange={e => handleFilterChange("assigned_user_id", e.target.value)}
          >
            <option value="">Все монтажники</option>
            {montajniks.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        <div>
          <label className="dark-label">Тип работы</label>
          <select
            className="dark-select"
            value={selectedFilters.work_type_id}
            onChange={e => handleFilterChange("work_type_id", e.target.value)}
          >
            <option value="">Все типы работ</option>
            {workTypes.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        
      </div>

      {tasks.length === 0 ? (
        <div className="empty">По выбранным фильтрам нет задач</div>
      ) : (
      <div className="cards">
  {tasks.map(task => (
    <TaskCard key={task.id} task={task} onClick={() => openTaskDetail(task)} />
  ))}
</div>

      )}
    </div>
  );
}

export default AdminTasksPage;


//работаем над филтрами