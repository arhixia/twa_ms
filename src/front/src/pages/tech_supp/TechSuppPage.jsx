// front/src/pages/tech/TechSuppPage.jsx
import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import "@/styles/LogistPage.css";
import { logout } from "@/api";
import useAuthStore from "@/store/useAuthStore";

export default function TechSuppPage() {
  const navigate = useNavigate();
  const { fullname, logout: clearAuth } = useAuthStore();

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
        <NavLink to="/tech_supp/tasks/active">Активные заявки</NavLink>
        <NavLink to="/tech_supp/tasks/history">История</NavLink>
        {/* Добавьте другие ссылки, если нужно */}
      </nav>

      <main className="logist-main">
        <Outlet />
      </main>
    </div>
  );
}