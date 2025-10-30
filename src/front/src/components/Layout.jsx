// ---------------------------
// src/components/Layout.jsx
// ---------------------------
import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { logout as apiLogout } from "../api";

export default function Layout({ children }) {
  const navigate = useNavigate();
  const fullname = localStorage.getItem("fullname") || "User";

    async function handleLogout() {
    try {
      await logout();
    } catch {}
    localStorage.clear();
    useAuthStore.getState().clearAuth();
    window.location.replace("/login");
  }


  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          Mini <span>Logist</span>
        </div>
        <div className="user-row">{fullname}</div>
        <nav className="nav">
          <NavLink to="/tasks/active">Активные заявки</NavLink>
          <NavLink to="/tasks/history">История</NavLink>
          <NavLink to="/drafts">Черновики</NavLink>
        </nav>
        <div className="sidebar-foot">
          <button className="logout" onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}


//маршруизация + добавить эндпоинты на прсомотр чернвоиков 