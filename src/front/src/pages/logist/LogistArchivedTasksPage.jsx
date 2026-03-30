// front/src/pages/logist/LogistArchivedTasksPage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchLogistArchivedTasks, deleteArchivedTask, unarchiveTask } from "../../api";
import TaskCard from "../../components/TaskCard";
import "../../styles/LogistPage.css";
import { showAlert,showConfirm } from "../../utils/notify";


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

async function handleDeleteArchived(taskId) {
  const confirmed = await showConfirm(
    `Вы уверены, что хотите УДАЛИТЬ задачу #${taskId} из архива? Это действие необратимо.`
  )
  if (!confirmed) return
  try {
    await deleteArchivedTask(taskId)
    showAlert("✅ Задача удалена из архива")
    setTasks(prev => prev.filter(t => t.id !== taskId))
  } catch (err) {
    const msg = err.response?.data?.detail || "Не удалось удалить задачу"
    showAlert(`Ошибка: ${msg}`)
  }
}

async function handleUnarchive(taskId) {
  const confirmed = await showConfirm(
    `Убрать задачу #${taskId} из архива и перевести в черновики?`
  )
  if (!confirmed) return
  try {
    await unarchiveTask(taskId)
    showAlert("✅ Задача переведена в черновики")
    setTasks(prev => prev.filter(t => t.id !== taskId))
  } catch (err) {
    const msg = err.response?.data?.detail || "Не удалось разархивировать"
    showAlert(`Ошибка: ${msg}`)
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