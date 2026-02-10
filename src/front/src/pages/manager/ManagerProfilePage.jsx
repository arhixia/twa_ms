// src/pages/manager/ManagerProfilePage.jsx
import React, { useState, useEffect } from "react";
import { managerProfile } from "@/api";

export default function ManagerProfilePage() {
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
      const data = await managerProfile();
      setProfile(data);
    } catch (err) {
      console.error("Ошибка загрузки профиля менеджера:", err);
      setError(err.response?.data?.detail || err.message || "Ошибка загрузки профиля");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="logist-main"><div className="empty">Загрузка профиля...</div></div>;
  }

  if (error) {
    return <div className="logist-main"><div className="error">{error}</div></div>;
  }

  if (!profile) {
    return <div className="logist-main"><div className="empty">Профиль не найден</div></div>;
  }

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Личный кабинет</h1>
        </div>

        <div className="profile-overview">
          {/* Информация */}
          <div className="profile-card">
            <div className="profile-card-header">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <h2>Информация</h2>
            </div>
            <p><b>Имя:</b> {profile.name || "—"}</p>
            <p><b>Фамилия:</b> {profile.lastname || "—"}</p>
          </div>

          {/* Статистика */}
          <div className="profile-card">
            <div className="profile-card-header">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path>
              </svg>
              <h2>Статистика</h2>
            </div>
            <p><b>Невыставленные счета:</b> {profile.invoice_not_issued_count || 0}</p>
            <p><b>Счет выставлен:</b> {profile.invoice_issued_count || 0}</p>
            <p><b>Гарантия:</b> {profile.warranty_count || 0}</p>
            <p><b>Оплата наличными:</b> {profile.cash_payment_count || 0}</p>
            <p><b>Всего задач:</b> {profile.total_tasks_count || 0}</p>
          </div>
        </div>
      </div>
    </div>
  );
}