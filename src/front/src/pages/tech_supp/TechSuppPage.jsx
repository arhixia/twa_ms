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
        <div className="fullname">{fullname || "Тех.спец"}</div>
        <button className="logout-btn" onClick={handleLogout}>🚪 Выйти</button>
      </header>

      <nav className="logist-nav">
        <NavLink to="/tech_supp/tasks/active" className="nav-item-with-badge">
          Активные заявки
          {!loadingCounts && techActiveTasksCount > 0 && (
            <span className="badge">{techActiveTasksCount}</span>
          )}
        </NavLink>
        <NavLink to="/tech_supp/me">Личный кабинет</NavLink>
        {/* Добавьте другие ссылки, если нужно */}
      </nav>

      <main className="logist-main">
        <Outlet />
      </main>
    </div>
  );
}