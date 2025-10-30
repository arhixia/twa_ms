// src/pages/LoginPage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../api"; // Убедитесь, что ваш API обновлён
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
      //  Получаем initDataUnsafe через глобальный объект
      const initData = window.Telegram.WebApp.initDataUnsafe;
      console.log("Window Telegram WebApp initDataUnsafe:", initData);

      if (initData && initData.user && initData.user.id) {
        const id = initData.user.id;
        console.log("Telegram ID from Mini App:", id);
        setTelegramId(id);
        setIsTgReady(true);
      } else {
        console.warn("Telegram ID not found in initDataUnsafe or not in Mini App context");
        // setIsTgReady(true); // Если вы хотите, чтобы форма работала и не в Mini App, раскомментируйте
      }
    } else {
      console.error("Telegram WebApp object is not available. Are you running inside a Telegram Mini App?");
      // setIsTgReady(true); // Если вы хотите, чтобы форма работала и не в Mini App, раскомментируйте
    }


    if (token && role) {
      navigate(`/${role}`);
    }
  }, [token, role, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    // ✅ Проверяем, готов ли SDK и есть ли telegramId, если мы ожидаем его в Mini App
    if (!isTgReady) {
      setError("SDK Telegram WebApp не готово или не в контексте Mini App.");
      return;
    }
    // telegramId может быть null, если не в Mini App, в этом случае отправим null
    // или можно сделать проверку и не отправлять, если null, но тогда backend должен это учитывать.

    try {
      // ✅ Передаём telegramId в loginUser
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
        <h2 className="login-title">Авторизация</h2>
        <div className="input-group">
          <input
            type="text"
            placeholder="Логин"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
          />
        </div>
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
            👁
          </button>
        </div>
        {/* ✅ Опционально: показываем, что SDK готов и telegram_id получен */}
        {isTgReady && telegramId && (
          <div className="login-info" style={{ color: 'gray', fontSize: '0.8em' }}>
            Telegram ID: {telegramId} (обнаружен в Mini App)
          </div>
        )}
        {error && <div className="login-error">{error}</div>}
        <button type="submit" className="login-btn">Войти</button>
      </form>
    </div>
  );
}