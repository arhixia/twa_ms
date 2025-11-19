import React, { useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import "@/styles/LogistPage.css";
import { logout, fetchActiveTasks } from "@/api";
import useAuthStore from "@/store/useAuthStore";

export default function LogistPage() {
  const navigate = useNavigate();
  const { fullname, logout: clearAuth, activeTasksCount, updateActiveTasksCount } = useAuthStore();

  useEffect(() => {
    updateActiveTasksCount();
  }, [updateActiveTasksCount]);

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
        <div className="fullname">{fullname || "Логист"}</div>
        <button className="logout-btn" onClick={handleLogout}>🚪 Выйти</button>
      </header>

      <nav className="logist-nav">
        <NavLink to="/logist/tasks/active" className="nav-item-with-badge">
          Активные заявки
          {activeTasksCount > 0 && (
            <span className="badge">{activeTasksCount}</span>
          )}
        </NavLink>
        <NavLink to="/logist/drafts">Черновики</NavLink>
        <NavLink to="/logist/me">Личный кабинет</NavLink>
      </nav>
      <main className="logist-main">
        <Outlet />
      </main>
    </div>
  );
}