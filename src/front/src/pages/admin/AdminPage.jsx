// front/src/pages/admin/AdminPage.jsx
import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import { logout } from '../../api';

export default function AdminPage() {
  const navigate = useNavigate();
  const { fullname, logout: clearAuth } = useAuthStore();

  async function handleLogout() {
    try {
      await logout(); // API logout
    } catch (e) {
      console.warn("Ошибка при logout:", e);
    }
    clearAuth(); // очистка Zustand
    navigate("/login", { replace: true }); // перенаправление
  }

  return (
    <div className="logist-app">
      {/* Шапка: имя слева, кнопка "выйти" справа */}
      <header className="logist-header">
        <div className="fullname">{fullname || "Админ"}</div>
        <button className="logout-btn" onClick={handleLogout}>🚪 Выйти</button>
      </header>

      {/* Навигация: Пользователи / Задачи */}
      <nav className="logist-nav">
        <NavLink to="/admin/users">Пользователи</NavLink>
        <NavLink to="/admin/tasks">Задачи</NavLink>
      </nav>

      {/* Контент страницы (UsersPage, TasksPage и т.д.) */}
      <main className="logist-main">
        <Outlet />
      </main>
    </div>
  );
}