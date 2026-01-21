// front/src/pages/logist/LogistArchivedTasksPage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchLogistArchivedTasks, deleteArchivedTask, unarchiveTask } from "../../api";
import TaskCard from "../../components/TaskCard";
import "../../styles/LogistPage.css";

export default function LogistArchivedTasksPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadArchivedTasks();
  }, []);

  async function loadArchivedTasks() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLogistArchivedTasks();
      setTasks(data || []);
    } catch (err) {
      console.error("Ошибка загрузки архивных задач:", err);
      let errorMsg = "Ошибка загрузки архивных задач";
      if (err.response?.data?.detail) {
        if (Array.isArray(err.response.data.detail)) {
          errorMsg = err.response.data.detail
            .map(d => d.msg || d.type || JSON.stringify(d))
            .join("; ");
        } else {
          errorMsg = err.response.data.detail;
        }
      } else if (err.message) {
        errorMsg = err.message;
      }
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }

 function handleDeleteArchived(taskId) {
  const text = `Вы уверены, что хотите УДАЛИТЬ задачу #${taskId} из архива? Это действие необратимо.`;

  if (window.Telegram?.WebApp?.showConfirm) {
    window.Telegram.WebApp.showConfirm(text, async (confirmed) => {
      if (!confirmed) return;

      try {
        await deleteArchivedTask(taskId);
        window.Telegram.WebApp.showAlert("✅ Задача удалена из архива");
        setTasks(prev => prev.filter(t => t.id !== taskId));
      } catch (err) {
        const msg = err.response?.data?.detail || "Не удалось удалить задачу";
        window.Telegram.WebApp.showAlert(`Ошибка: ${msg}`);
      }
    });
  } else {
    if (!window.confirm(text)) return;
    deleteArchivedTask(taskId)
      .then(() => setTasks(prev => prev.filter(t => t.id !== taskId)))
      .catch(() => alert("Ошибка удаления"));
  }
}


function handleUnarchive(taskId) {
  const text = `Убрать задачу #${taskId} из архива и перевести в черновики?`;

  if (window.Telegram?.WebApp?.showConfirm) {
    window.Telegram.WebApp.showConfirm(text, async (confirmed) => {
      if (!confirmed) return;

      try {
        await unarchiveTask(taskId);
        window.Telegram.WebApp.showAlert("✅ Задача переведена в черновики");
        setTasks(prev => prev.filter(t => t.id !== taskId));
      } catch (err) {
        const msg = err.response?.data?.detail || "Не удалось разархивировать";
        window.Telegram.WebApp.showAlert(`Ошибка: ${msg}`);
      }
    });
  } else {
    if (!window.confirm(text)) return;
    unarchiveTask(taskId)
      .then(() => setTasks(prev => prev.filter(t => t.id !== taskId)))
      .catch(() => alert("Ошибка"));
  }
}


  if (loading)
    return (
      <div className="logist-main">
        <div className="empty">Загрузка архивных задач...</div>
      </div>
    );

  if (error)
    return (
      <div className="logist-main">
        <div className="error">{error}</div>
      </div>
    );

  const handleTaskClick = (task) => {
    navigate(`/logist/archived-tasks/${task.id}`);
  };

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
            <h1 className="page-title">Архивные заявки</h1>
        </div>

        <div className="cards">
          {tasks.length ? (
            tasks.map(task => (
                <TaskCard 
                    key={task.id} 
                    task={task} 
                    onClick={handleTaskClick}
                    onUnarchive={handleUnarchive}
                    onDelete={handleDeleteArchived}
                  />
            ))
          ) : (
            <div className="empty">Архивных задач нет</div>
          )}
        </div>
      </div>
    </div>
  );
}