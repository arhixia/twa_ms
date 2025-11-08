// front/src/pages/tech/TechSuppProfilePage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { techSuppProfile } from "../../api"; // Добавим новый API метод
import "../../styles/LogistPage.css";

export default function TechSuppProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    setLoading(true);
    setError(null);
    try {
      const data = await techSuppProfile(); // Вызываем новый API метод
      setProfile(data);
    } catch (err) {
      console.error("Ошибка загрузки профиля тех.спеца:", err);
      setError(err.response?.data?.detail || err.message || "Ошибка загрузки профиля");
    } finally {
      setLoading(false);
    }
  }

  // Функция для перехода к деталям завершенной задачи
  const viewCompletedTask = (taskId) => {
    navigate(`/tech_supp/completed-tasks/${taskId}`); // Новый маршрут
  };

  if (loading) return <div className="logist-main"><div className="empty">Загрузка профиля...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;
  if (!profile) return <div className="logist-main"><div className="empty">Профиль не найден</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1>Личный кабинет</h1>
          {/* У тех.спеца нет кнопок добавления */}
        </div>

        <div className="profile-overview">
          <div className="profile-card">
            <h2>Информация</h2>
            <p><b>ID:</b> {profile.id || "—"}</p>
            <p><b>Имя:</b> {profile.name || "—"}</p>
            <p><b>Фамилия:</b> {profile.lastname || "—"}</p>
          </div>

          <div className="profile-card">
            <h2>Статистика</h2>
            <p><b>Проверено задач:</b> {profile.completed_count || 0}</p>
            <p><b>Общая стоимость задач:</b> {profile.total_earned ? `${profile.total_earned} руб.` : "0 руб."}</p>
          </div>
        </div>

        {profile.history && profile.history.length > 0 ? (
          <div className="section">
            <h3>История проверенных задач</h3>
            <div className="history-list">
              {profile.history.map((task) => (
                <div
                  key={task.id}
                  className="history-item clickable-history-item"
                  onClick={() => viewCompletedTask(task.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <p><b>#{task.id}</b> — {task.contact_person} ({task.client})</p>
                  <p><b>ТС:</b> {task.vehicle_info || "—"}</p>
                  <p><b>Завершено:</b> {task.completed_at ? new Date(task.completed_at).toLocaleString() : "—"}</p>
                  <p><b>Стоимость:</b> {task.reward ? `${task.reward} руб.` : "0 руб."}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="section">
            <h3>История проверенных задач</h3>
            <div className="empty">История пока пуста</div>
          </div>
        )}
      </div>
    </div>
  );
}