import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import { logout, superAdminListAllUsers } from '../../api';

export default function SuperAdminPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { 
    fullname, 
    logout: clearAuth 
  } = useAuthStore();
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    // Автоматически перенаправляем на /users если находимся на корневом пути
    if (location.pathname === '/super_admin') {
      navigate('/super_admin/users', { replace: true });
    }
    
    loadUsers();
  }, [location.pathname]);

  async function loadUsers() {
    setLoadingUsers(true);
    try {
      const userData = await superAdminListAllUsers();
      setUsers(userData);
    } catch (e) {
      console.error("Ошибка загрузки пользователей:", e);
    } finally {
      setLoadingUsers(false);
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
            {fullname || "Супер Админ"}
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
        <NavLink to="/super_admin/users" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <div className="nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="9" cy="7" r="4"></circle>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
            </svg>
          </div>
          <div className="nav-text">Пользователи</div>
          {!loadingUsers && users.length > 0 && (
            <span className="badge">{users.length}</span>
          )}
        </NavLink>
        
        <NavLink to="/super_admin/companies" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <div className="nav-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-building" viewBox="0 0 16 16">
  <path d="M4 2.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zm3 0a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zm3.5-.5a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5zM4 5.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zM7.5 5a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5zm2.5.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zM4.5 8a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5zm2.5.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5zm3.5-.5a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h1a.5.5 0 0 0 .5-.5v-1a.5.5 0 0 0-.5-.5z"/>
  <path d="M2 1a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1zm11 0H3v14h3v-2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V15h3z"/>
</svg>
          </div>
          <div className="nav-text">Компании</div>
        </NavLink>
      </nav>

      <main className="logist-main">
        <Outlet />
      </main>
    </div>
  );
}