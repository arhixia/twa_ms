// front/src/pages/admin/TasksPage.jsx
import React, { useState, useEffect } from 'react';
import { adminListTasks } from '../../api';
import TaskCard from '../../components/TaskCard';
import TaskDetailModal from '../../components/TaskDetailModal'; // ✅ Новый компонент

function AdminTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState(null);

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
    setSelectedTaskId(task.id);
  };

  const handleTaskUpdated = () => {
    fetchTasks(); // обновить список задач
  };

  const handleTaskDeleted = (deletedId) => {
    setTasks(tasks.filter(t => t.id !== deletedId));
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
            onClick={() => openTaskDetail(task)} // ✅ при клике открываем модалку
          />
        ))}
      </div>
      {selectedTaskId && (
        <TaskDetailModal
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onTaskUpdated={handleTaskUpdated}
          onTaskDeleted={handleTaskDeleted}
        />
      )}
    </div>
  );
}

export default AdminTasksPage;