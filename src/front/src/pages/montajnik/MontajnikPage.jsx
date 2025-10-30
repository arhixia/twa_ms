// front/src/pages/montajnik/MontajnikPage.jsx
import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import "@/styles/LogistPage.css"; // Импортируем общие стили
import { logout } from "@/api"; // Предполагаем, что API функция logout общая
import useAuthStore from "@/store/useAuthStore"; // Используем общий store аутентификации

export default function MontajnikPage() {
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
        <div className="fullname">{fullname || "Монтажник"}</div> 
        <button className="logout-btn" onClick={handleLogout}>🚪 Выйти</button>
      </header>

      <nav className="logist-nav"> 
        <NavLink to="/montajnik/tasks/mine">Мои задачи</NavLink>
        <NavLink to="/montajnik/tasks/available">Доступные задачи</NavLink>
        <NavLink to="/montajnik/me">Личный кабинет</NavLink>
      </nav>

      <main className="logist-main"> 
        <Outlet /> 
      </main>
    </div>
  );
}