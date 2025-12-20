// src/pages/LoginPage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../api";
import useAuthStore from "../store/useAuthStore";
import "../styles/LoginForm.css";

export default function LoginPage() {
  const navigate = useNavigate();
  const { token, role, setAuth } = useAuthStore();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const [telegramId, setTelegramId] = useState(null);
  const [isTgReady, setIsTgReady] = useState(false);

  useEffect(() => {
    if (window.Telegram && window.Telegram.WebApp) {
      const initData = window.Telegram.WebApp.initDataUnsafe;
      console.log("Window Telegram WebApp initDataUnsafe:", initData);

      if (initData && initData.user && initData.user.id) {
        const id = initData.user.id;
        console.log("Telegram ID from Mini App:", id);
        setTelegramId(id);
        setIsTgReady(true);
      } else {
        console.warn("Telegram ID not found in initDataUnsafe or not in Mini App context");
      }
    } else {
      console.error("Telegram WebApp object is not available. Are you running inside a Telegram Mini App?");
    }

    if (token && role) {
      navigate(`/${role}`);
    }
  }, [token, role, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    // Убираем проверку isTgReady, если не требуется
    // Если нужно, чтобы работало только в Mini App — оставьте эту проверку
    // if (!isTgReady) {
    //   setError("SDK Telegram WebApp не готово или не в контексте Mini App.");
    //   return;
    // }

    try {
      // Передаём telegramId, даже если null — backend должен это обрабатывать
      const data = await loginUser(login, password, telegramId);

      if (!data.access_token) throw new Error("Нет токена в ответе");

      localStorage.setItem("token", data.access_token);
      if (data.role) localStorage.setItem("role", data.role);
      if (data.fullname) localStorage.setItem("fullname", data.fullname);

      setAuth(data.access_token, data.role ?? "logist", data.fullname ?? "Без имени");
      navigate(`/${data.role ?? "logist"}`);
    } catch (err) {
      console.error(err);
      setError("Неверный логин или пароль");
    }
  }

  return (
    <div className="login-wrapper">
      <form className="login-form" onSubmit={handleSubmit}>
        {/* Заголовок приложения по центру */}
         <div>
            <div className="app-title">GeoTask</div>
            <div className="app-subtitle">мини-приложение</div>
          </div>

        {/* Заголовок формы */}
        <h2 className="form-title">Авторизация</h2>

        {/* Поле Логин */}
        <div className="input-group">
          <input
            type="text"
            placeholder="Логин"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
          />
          <span className="input-icon">👤</span>
        </div>

        {/* Поле Пароль */}
        <div className="input-group">
          <input
            type={showPassword ? "text" : "password"}
            placeholder="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            className="toggle-password"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
          >
            {showPassword ? "👁️" : "👁️‍🗨️"}
          </button>
        </div>

        {/* Сообщение об ошибке */}
        {error && <div className="login-error">{error}</div>}

        {/* Кнопка Войти */}
        <button type="submit" className="login-btn">Войти</button>
      </form>
    </div>
  );
}