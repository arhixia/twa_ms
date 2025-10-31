import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import "@/styles/LogistPage.css";
import { logout } from "@/api";
import useAuthStore from "@/store/useAuthStore";
import AddTaskModal from "@/pages/logist/_AddTaskModal";


export default function LogistPage() {
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
        <div className="fullname">{fullname || "Логист"}</div>
        <button className="logout-btn" onClick={handleLogout}>🚪 Выйти</button>
      </header>

      <nav className="logist-nav">
        <NavLink to="/logist/tasks/active">Активные заявки</NavLink>
        <NavLink to="/logist/drafts">Черновики</NavLink>
        <NavLink to="/logist/tasks/history">История</NavLink>
      </nav>
      <main className="logist-main">
        <Outlet />
      </main>

    </div>
  );
}
