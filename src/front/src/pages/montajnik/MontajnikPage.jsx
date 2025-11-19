import React, { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import "@/styles/LogistPage.css"; // Импортируем общие стили
import { logout, fetchMyTasks, fetchAvailableTasks, getAssignedTasks } from "@/api"; // Предполагаем, что API функция logout общая
import useAuthStore from "@/store/useAuthStore"; // Используем общий store аутентификации

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
      // Обновляем все количества задач через store
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
      <header className="logist-header"> 
        <div className="fullname">{fullname || "Монтажник"}</div> 
        <button className="logout-btn" onClick={handleLogout}>🚪 Выйти</button>
      </header>

      <nav className="logist-nav"> 
        <NavLink to="/montajnik/tasks/mine" className="nav-item-with-badge">
          Мои задачи
          {!loadingCounts && myTasksCount > 0 && (
            <span className="badge">{myTasksCount}</span>
          )}
        </NavLink>
        <NavLink to="/montajnik/tasks/available" className="nav-item-with-badge">
          Доступные задачи
          {!loadingCounts && availableTasksCount > 0 && (
            <span className="badge">{availableTasksCount}</span>
          )}
        </NavLink>
        <NavLink to="/montajnik/tasks/assigned" className="nav-item-with-badge">
          Назначенные задачи
          {!loadingCounts && assignedTasksCount > 0 && (
            <span className="badge">{assignedTasksCount}</span>
          )}
        </NavLink>
        <NavLink to="/montajnik/me">Личный кабинет</NavLink>
      </nav>

      <main className="logist-main"> 
        <Outlet /> 
      </main>
    </div>
  );
}