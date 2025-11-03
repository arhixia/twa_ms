// front/src/pages/admin/TasksPage.jsx
import React, { useState, useEffect } from 'react';
import { adminListTasks } from '../../api';
import TaskCard from '../../components/TaskCard';
import { useNavigate } from 'react-router-dom'; // Импортируем navigate

function AdminTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate(); // Используем navigate для перехода

  const fetchTasks = async () => {
    try {
      const data = await adminListTasks();
      setTasks(data);
    } catch (err) {
      alert('Ошибка загрузки задач');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const openTaskDetail = (task) => {
    navigate(`/admin/tasks/${task.id}`); // Перенаправляем на страницу деталей задачи
  };


  if (loading) return <div className="empty">Загрузка задач...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>Все задачи</h1>
      </div>
      <div className="cards">
        {tasks.map(task => (
          <TaskCard
            key={task.id}
            task={task}
            onClick={() => openTaskDetail(task)} // При клике переходим на страницу задачи
          />
        ))}
      </div>
    </div>
  );
}

export default AdminTasksPage;