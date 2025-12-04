import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import { logout, adminListTasks } from '../../api';

export default function AdminPage() {
  const navigate = useNavigate();
  const { 
    fullname, 
    logout: clearAuth, 
    adminTasksCount, 
    updateAdminTasksCount 
  } = useAuthStore();
  const [loadingCounts, setLoadingCounts] = useState(true);

  useEffect(() => {
    loadTaskCounts();
  }, []);

  async function loadTaskCounts() {
    setLoadingCounts(true);
    try {
      await updateAdminTasksCount();
    } catch (e) {
      console.error("Ошибка загрузки количества задач:", e);
    } finally {
      setLoadingCounts(false);
    }
  }

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
        <button className="logout-btn" onClick={handleLogout}>Выйти</button>
      </header>

      {/* Навигация: Пользователи / Задачи */}
      <nav className="logist-nav">
        <NavLink to="/admin/users">Пользователи</NavLink>
        <NavLink to="/admin/tasks" className="nav-item-with-badge">
          Задачи
          {!loadingCounts && adminTasksCount > 0 && (
            <span className="badge">{adminTasksCount}</span>
          )}
        </NavLink>
        <NavLink to="/admin/work">Работы</NavLink>
        <NavLink to="/admin/contacts">Контакты</NavLink>
         <NavLink to="/admin/me">Личный кабинет</NavLink>
      </nav>

      {/* Контент страницы (UsersPage, TasksPage и т.д.) */}
      <main className="logist-main">
        <Outlet />
      </main>
    </div>
  );
}

