import React, { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import "@/styles/LogistPage.css";
import { logout, fetchTechActiveTasks } from "@/api";
import useAuthStore from "@/store/useAuthStore";

export default function TechSuppPage() {
  const navigate = useNavigate();
  const { 
    fullname, 
    logout: clearAuth, 
    techActiveTasksCount, 
    updateTechActiveTasksCount 
  } = useAuthStore();
  const [loadingCounts, setLoadingCounts] = useState(true);

  useEffect(() => {
    loadTaskCounts();
  }, []);

  async function loadTaskCounts() {
    setLoadingCounts(true);
    try {
      await updateTechActiveTasksCount();
    } catch (e) {
      console.error("Ошибка загрузки количества задач:", e);
    } finally {
      setLoadingCounts(false);
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } catch (e) {
      console.warn("Ошибка при logout:", e);
    }
    clearAuth();
    navigate("/login", { replace: true });
  }

  return (
    <div className="logist-app">
      <header className="logist-header">
        {/* Контейнер для иконки человечка и имени */}
        <div className="user-info">
          <div className="user-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <div className="user-fullname">
            {fullname || "Тех.спец"}
          </div>
        </div>

        <button className="logout-btn" onClick={handleLogout}>Выйти</button>
      </header>

      <nav className="montajnik-nav">
        <NavLink to="/tech_supp/tasks/active" className="nav-item">
          <div className="nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
            </svg>
          </div>
          <div className="nav-text">Активные задачи</div>
          {!loadingCounts && techActiveTasksCount > 0 && (
            <span className="badge">{techActiveTasksCount}</span>
          )}
        </NavLink>
        <NavLink to="/tech_supp/me" className="nav-item">
          <div className="nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <div className="nav-text">Личный кабинет</div>
        </NavLink>
      </nav>

      <main className="logist-main">
        <Outlet />
      </main>
    </div>
  );
}