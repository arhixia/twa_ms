// src/pages/MontajnikPage.jsx
import React, { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { logout, fetchMyTasks, fetchAvailableTasks, getAssignedTasks } from "@/api"; 
import useAuthStore from "@/store/useAuthStore"; 

export default function MontajnikPage() {
  const navigate = useNavigate();
  const { 
    fullname, 
    logout: clearAuth, 
    assignedTasksCount, 
    availableTasksCount,
    myTasksCount,
    updateAssignedTasksCount,
    updateAvailableTasksCount,
    updateMyTasksCount
  } = useAuthStore(); 
  const [loadingCounts, setLoadingCounts] = useState(true);

  useEffect(() => {
    loadTaskCounts();
  }, []);

  async function loadTaskCounts() {
    setLoadingCounts(true);
    try {
      await Promise.all([
        updateMyTasksCount(),
        updateAssignedTasksCount(),
        updateAvailableTasksCount()
      ]);
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
      {/* Шапка с логотипом, именем и кнопкой выхода */}
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
            {fullname || "Монтажник"}
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

      {/* Навигация по макету */}
      <nav className="montajnik-nav">
        <NavLink to="/montajnik/tasks/mine" className="nav-item">
          <div className="nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </div>
          <div className="nav-text">Мои задачи</div>
          {!loadingCounts && myTasksCount > 0 && (
            <span className="badge">{myTasksCount}</span>
          )}
        </NavLink>
        <NavLink to="/montajnik/tasks/available" className="nav-item">
          <div className="nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
            </svg>
          </div>
          <div className="nav-text">Доступные задачи</div>
          {!loadingCounts && availableTasksCount > 0 && (
            <span className="badge">{availableTasksCount}</span>
          )}
        </NavLink>
        <NavLink to="/montajnik/tasks/assigned" className="nav-item">
          <div className="nav-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="5" width="20" height="14" rx="2" ry="2"></rect>
              <line x1="8" y1="10" x2="16" y2="10"></line>
              <line x1="8" y1="14" x2="16" y2="14"></line>
            </svg>
          </div>
          <div className="nav-text">Назначенные задачи</div>
          {!loadingCounts && assignedTasksCount > 0 && (
            <span className="badge">{assignedTasksCount}</span>
          )}
        </NavLink>
        <NavLink to="/montajnik/me" className="nav-item">
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