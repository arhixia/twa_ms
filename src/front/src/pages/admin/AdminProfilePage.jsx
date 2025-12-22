import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchAdminProfile,
} from "../../api";
import "../../styles/LogistPage.css";

export default function AdminProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    setLoading(true);
    try {
      const data = await fetchAdminProfile();
      setProfile(data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Ошибка загрузки профиля");
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="logist-main"><div className="empty">Загрузка...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Личный кабинет</h1>
        </div>

        <div className="profile-overview">
          <div className="profile-card">
            <h2>Информация</h2>
            <p>
              <b>Имя:</b> {profile?.name || "—"}
            </p>
            <p>
              <b>Фамилия:</b> {profile?.lastname || "—"}
            </p>
          </div>

          <div className="profile-card">
            <h2>Статистика</h2>
            <p><b>Всего задач:</b> {profile?.total_tasks || 0}</p>
            <p><b>Активных задач:</b> {profile?.active_tasks || 0}</p>
          </div>
        </div>
      </div>
    </div>
  );
}