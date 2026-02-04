// front/src/pages/admin/AdminPage.jsx
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

        <button className="logout-btn" onClick={handleLogout} aria-label="Выйти">
  <svg
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="2" width="13" height="20" rx="1.2" />
<line x1="8.5" y1="2" x2="8.5" y2="22" />
<circle cx="11.5" cy="12" r="0.8" />

<path d="M16 12h6" />
<path d="M19.5 9l3 3-3 3" />

  </svg>
</button>

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
        
        <NavLink to="/admin/equipment" className="nav-item">
          <div className="nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20a10 10 0 1 0 0-20 10 10 0 0 0 0 20z"></path>
              <path d="M12 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"></path>
              <path d="M12 14v6"></path>
            </svg>
          </div>
          <div className="nav-text">Оборудование</div>
        </NavLink>
        
        <NavLink to="/admin/districts" className="nav-item">
          <div className="nav-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-buildings" viewBox="0 0 16 16">
  <path d="M14.763.075A.5.5 0 0 1 15 .5v15a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5V14h-1v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V10a.5.5 0 0 1 .342-.474L6 7.64V4.5a.5.5 0 0 1 .276-.447l8-4a.5.5 0 0 1 .487.022M6 8.694 1 10.36V15h5zM7 15h2v-1.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5V15h2V1.309l-7 3.5z"/>
  <path d="M2 11h1v1H2zm2 0h1v1H4zm-2 2h1v1H2zm2 0h1v1H4zm4-4h1v1H8zm2 0h1v1h-1zm-2 2h1v1H8zm2 0h1v1h-1zm2-2h1v1h-1zm0 2h1v1h-1zM8 7h1v1H8zm2 0h1v1h-1zm2 0h1v1h-1zM8 5h1v1H8zm2 0h1v1h-1zm2 0h1v1h-1zm0-2h1v1h-1z"/>
</svg>
          </div>
          <div className="nav-text">Регионы</div>
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