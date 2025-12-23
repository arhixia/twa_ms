// src/pages/AvailableTasksPage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchAvailableTasks, acceptTask } from "../../api";
import TaskCard from "../../components/TaskCard";
import useAuthStore from "@/store/useAuthStore";

export default function AvailableTasksPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const { updateAvailableTasksCount, updateMyTasksCount, updateAssignedTasksCount } = useAuthStore();

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAvailableTasks();
      setTasks(data.tasks || []);
    } catch (err) {
      console.error("Ошибка загрузки доступных задач:", err);
      setError("Не удалось загрузить доступные задачи.");
    } finally {
      setLoading(false);
    }
  }

  const handleAcceptTask = async (taskId) => {
    setActionLoading(taskId);
    try {
      await acceptTask(taskId);
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Задача успешно принята!");
      } else {
        alert("Задача успешно принята!");
      }
      await Promise.all([
        loadTasks(),
        updateAvailableTasksCount(),
        updateMyTasksCount(),
        updateAssignedTasksCount()
      ]);
    } catch (err) {
      console.error(`Ошибка при принятии задачи ${taskId}:`, err);
      const errorMessage = err.response?.data?.detail || "Не удалось принять задачу.";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`Ошибка: ${errorMessage}`);
      } else {
        alert(`Ошибка: ${errorMessage}`);
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleTaskCardClick = (task) => {
    navigate(`/montajnik/tasks/available/${task.id}`);
  };

  if (loading) {
    return (
      <div className="logist-main">
        <div className="empty">
          Загрузка доступных задач...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="logist-main">
        <div className="error">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Доступные задачи</h1>
        </div>
        <div className="cards">
          {tasks.length === 0 ? (
            <p>Нет доступных задач.</p>
          ) : (
            tasks.map(task => (
              <div
                key={task.id}
                className="task-card-wrapper"
                style={{
                  position: "relative",
                  borderRadius: "12px",
                  overflow: "hidden",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                }}
              >
                {/* Отображение mont_reward */}
                {task.montajnik_reward && (
                  <div className="task-mont-reward">
                    {task.montajnik_reward}
                  </div>
                )}
                
                <TaskCard
                  task={task}
                  onClick={handleTaskCardClick}
                  onAccept={() => handleAcceptTask(task.id)}
                  isAccepting={actionLoading === task.id}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}