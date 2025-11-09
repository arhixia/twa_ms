// front/src/pages/logist/LogistArchivedTasksPage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchLogistArchivedTasks, deleteArchivedTask } from "../../api";
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

  async function handleDeleteArchived(taskId) {
    if (!window.confirm(`Вы уверены, что хотите УДАЛИТЬ задачу #${taskId} из архива? Это действие необратимо.`)) return;
    try {
      await deleteArchivedTask(taskId);
      alert("✅ Задача удалена из архива");
      setTasks(prevTasks => prevTasks.filter(t => t.id !== taskId));
    } catch (err) {
      console.error("Ошибка удаления архивной задачи:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось удалить задачу из архива.";
      alert(`Ошибка: ${errorMsg}`);
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

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1>Архивные задачи</h1>
          <button className="add-btn" onClick={() => navigate(-1)}>
            ⬅️ Назад
          </button>
        </div>

        {/* Всё строго в столбец */}
        <div
          className="cards"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            alignItems: "stretch",
          }}
        >
          {tasks.length ? (
            tasks.map(task => (
              <div key={task.id} className="card archived-task-card">
                <div className="card-header" style={{ justifyContent: "space-between" }}>
                  <h3 style={{ margin: 0 }}>#{task.id}</h3>
                  <span className={`status-badge status-${task.status || "unknown"}`}>
                    <p><b>Статус:</b> {task.status || "—"}</p>
                  </span>
                </div>

                <div className="card-body">
                  <p><b>Клиент:</b> {task.client || "—"}</p>
                  <p><b>Дата:</b> {task.scheduled_at ? new Date(task.scheduled_at).toLocaleString() : "—"}</p>
                  <p><b>Цена клиента:</b> {task.client_price || "—"}</p>
                  <p><b>Награда монтажнику:</b> {task.montajnik_reward || "—"}</p>
                </div>

                <div className="card-actions" style={{ display: "flex", gap: "8px" }}>
                  <button
                    className="add-btn"
                    onClick={() => navigate(`/logist/archived-tasks/${task.id}`)}
                    style={{ backgroundColor: "#2196f3", color: "white" }}
                  >
                    📋 Подробнее
                  </button>
                  <button
                    className="add-btn"
                    onClick={() => handleDeleteArchived(task.id)}
                    style={{ backgroundColor: "#ef4444", color: "white" }}
                  >
                    🗑 Удалить
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty">Архивных задач нет</div>
          )}
        </div>
      </div>
    </div>
  );
}
