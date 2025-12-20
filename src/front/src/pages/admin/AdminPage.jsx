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
            {fullname || "Админ"}
          </div>
        </div>

        <button className="logout-btn" onClick={handleLogout}>Выйти</button>
      </header>

      <nav className="montajnik-nav">
        <NavLink to="/admin/users" className="nav-item">
          <div className="nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <div className="nav-text">Пользователи</div>
        </NavLink>
        
        <NavLink to="/admin/tasks" className="nav-item">
          <div className="nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
            </svg>
          </div>
          <div className="nav-text">Задачи</div>
          {!loadingCounts && adminTasksCount > 0 && (
            <span className="badge">{adminTasksCount}</span>
          )}
        </NavLink>
        
        <NavLink to="/admin/work" className="nav-item">
          <div className="nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div className="nav-text">Работы</div>
        </NavLink>
        
        <NavLink to="/admin/contacts" className="nav-item">
          <div className="nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <div className="nav-text">Контакты</div>
        </NavLink>
        
        <NavLink to="/admin/me" className="nav-item">
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