// src/pages/AssignedTasksPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAssignedTasks, acceptTask, rejectTask } from "../../api";
import TaskCard from "../../components/TaskCard";
import useAuthStore from "@/store/useAuthStore";

export default function AssignedTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [rejectTaskId, setRejectTaskId] = useState(null);

  const { updateAssignedTasksCount, updateMyTasksCount, updateAvailableTasksCount } = useAuthStore();
  const navigate = useNavigate(); // Получаем функцию навигации

  // Обработчик клика по карточке задачи
   const handleTaskCardClick = (task) => {
    navigate(`/montajnik/tasks/assigned/${task.id}`);
  };

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await getAssignedTasks();
      setTasks(res.tasks || []);
    } catch (e) {
      console.error("Ошибка загрузки назначенных задач:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept(taskId) {
    setActionLoading(`accept-${taskId}`); // Используем уникальный ключ для типа действия
    try {
      await acceptTask(taskId);
      await Promise.all([
        load(), // Перезагружаем текущие задачи
        updateAssignedTasksCount(),
        updateMyTasksCount(),
        updateAvailableTasksCount()
      ]);
    } catch (e) {
      console.error("Ошибка при принятии задачи:", e);
    } finally {
      setActionLoading(null);
    }
  }

  function openRejectModal(taskId) {
    setRejectTaskId(taskId);
    setRejectComment("");
    setShowRejectModal(true);
  }

  async function handleRejectConfirm() {
    if (!rejectTaskId) return;
    setActionLoading(`reject-${rejectTaskId}`); // Используем уникальный ключ для типа действия
    try {
      await rejectTask(rejectTaskId, rejectComment || null);
      setShowRejectModal(false);
      setRejectComment("");
      setRejectTaskId(null);
      await Promise.all([
        load(), // Перезагружаем текущие задачи
        updateAssignedTasksCount(),
        updateMyTasksCount(),
        updateAvailableTasksCount()
      ]);
    } catch (err) {
      console.error(err);
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Ошибка при отклонении задачи");
      } else {
        alert("Ошибка при отклонении задачи");
      }
    } finally {
      setActionLoading(null);
    }
  }

  // Функция для вызова отклонения (передается в TaskCard)
  const handleReject = (taskId) => {
    openRejectModal(taskId);
  };

  return (
    <div className="logist-main"> {/* Обернем в logist-main для единообразия */}
      <div className="page">
        <div className="page-header"> {/* Используем общий стиль заголовка */}
          <h1 className="page-title">Назначенные задачи</h1> {/* Используем стиль заголовка как в MyTasksPage */}
        </div>

        <div className="cards">
          {loading ? (
            <div>Загрузка...</div>
          ) : tasks.length ? (
            tasks.map((task) => (
              <div
                key={task.id}
                className="task-card-wrapper"
                style={{
                  position: "relative", // Для позиционирования кнопок
                  borderRadius: "12px",
                  overflow: "hidden",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                }}
              >
                {/* Передаем onClick, onAccept, onReject и статусы загрузки в TaskCard */}
                <TaskCard
                  task={task}
                  onClick={handleTaskCardClick}
                  onAccept={() => handleAccept(task.id)}
                  onReject={() => handleReject(task.id)}
                  isAccepting={actionLoading === `accept-${task.id}`} // Проверяем уникальный ключ
                  isRejecting={actionLoading === `reject-${task.id}`} // Проверяем уникальный ключ
                />
              </div>
            ))
          ) : (
            <div className="empty">Нет назначенных задач</div>
          )}
        </div>

        {/* Модалка отклонения */}
                {/* Модалка отклонения */}
        {showRejectModal && (
          <div className="modal-backdrop" onClick={() => setShowRejectModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Отклонить задачу #{rejectTaskId}</h2>
                <button className="close" onClick={() => setShowRejectModal(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="section">
                  <label className="dark-label">
                    Причина отклонения (необязательно):
                  </label>
                  <textarea
                    value={rejectComment}
                    onChange={(e) => setRejectComment(e.target.value)}
                    rows="3"
                    placeholder="Можно оставить пустым..."
                    className="dark-select"
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button
                  className="gradient-button"
                  onClick={handleRejectConfirm}
                  disabled={actionLoading === `reject-${rejectTaskId}`}
                  style={{ background: 'linear-gradient(to right, #ef4444, #dc2626)' }}
                >
                  {actionLoading === `reject-${rejectTaskId}` ? 'Отклонение...' : 'Подтвердить'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}