// front/src/pages/montajnik/ProfilePage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchMontajnikProfile, logout } from "../../api"; // Предполагаем, что fetchMontajnikProfile и logout уже определены в api.js
import "../../styles/LogistPage.css"; // Используем стили логиста как основу

export default function ProfilePage() {
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
      const data = await fetchMontajnikProfile();
      setProfile(data);
    } catch (err) {
      console.error("Ошибка загрузки профиля:", err);
      setError(err.response?.data?.detail || err.message || "Ошибка загрузки профиля");
    } finally {
      setLoading(false);
    }
  }



  if (loading) return <div className="logist-main"><div className="empty">Загрузка профиля...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;
  if (!profile) return <div className="logist-main"><div className="empty">Профиль не найден</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1>Личный кабинет</h1>
        </div>

        <div className="profile-overview">
          <div className="profile-card">
            <h2>Информация</h2>
            <p><b>Имя:</b> {profile.name || "—"}</p>
            <p><b>Фамилия:</b> {profile.lastname || "—"}</p>
            <p><b>Роль:</b> {profile.role || "—"}</p>
          </div>

          <div className="profile-card">
            <h2>Статистика</h2>
            <p><b>Выполнено задач:</b> {profile.completed_count || 0}</p>
            <p><b>Всего заработано:</b> {profile.total_earned ? `${profile.total_earned} руб.` : "0 руб."}</p>
          </div>
        </div>

        {profile.history && profile.history.length > 0 ? (
          <div className="section">
            <h3>История выполненных задач</h3>
            <div className="history-list">
              {profile.history.map((task) => (
                <div key={task.id} className="history-item">
                  <p><b>#{task.id}</b> — {task.client || "Клиент не указан"}</p>
                  <p><b>ТС:</b> {task.vehicle_info || "—"}</p>
                  <p><b>Завершено:</b> {task.completed_at ? new Date(task.completed_at).toLocaleString() : "—"}</p>
                  <p><b>Награда:</b> {task.reward ? `${task.reward} руб.` : "0 руб."}</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="section">
            <h3>История выполненных задач</h3>
            <div className="empty">История пока пуста</div>
          </div>
        )}
      </div>
    </div>
  );
}