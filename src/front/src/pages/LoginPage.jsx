// src/pages/LoginPage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../api";
import useAuthStore from "../store/useAuthStore";
import { detectPlatform, getPlatformUserId } from "../utils/platform";
import "../styles/LoginForm.css";

const VK_GROUP_ID = import.meta.env.VITE_VK_GROUP_ID 

async function requestVKMessagesPermission() {
  if (!window.vkBridge) {
    console.warn('vkBridge не найден')
    return
  }
  if (!VK_GROUP_ID) {
    console.warn('VITE_VK_GROUP_ID не задан в .env')
    return
  }
  
  try {
    const result = await window.vkBridge.send('VKWebAppAllowMessagesFromGroup', {
      group_id: parseInt(VK_GROUP_ID),
    })
    console.log('✅ Результат запроса:', result)
  } catch (err) {
    console.warn('❌ VK сообщения не разрешены:', err)
  }
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { token, role, setAuth } = useAuthStore();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const [platformId, setPlatformId] = useState(null);
  const [platform, setPlatform] = useState('web');

  useEffect(() => {
    getPlatformUserId().then(({ platform, id }) => {
      console.log(`📱 Платформа: ${platform}, ID: ${id}`);
      setPlatform(platform);
      setPlatformId(id);
    })

    if (token && role) {
      navigate(`/${role}`);
    }
  }, [token, role, navigate]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    try {
      const data = await loginUser(login, password, platformId, platform);

      if (!data.access_token) throw new Error("Нет токена в ответе");
      if (platform === 'vk') {
        await requestVKMessagesPermission()
      }

      setAuth(data.access_token, data.role ?? "logist", data.fullname ?? "Без имени");
      navigate(`/${data.role ?? "logist"}`);
    } catch (err) {
      console.error(err);
      setError("Неверный логин или пароль");
    }
  }

  // JSX без изменений
  return (
    <div className="login-wrapper">
      <form className="login-form" onSubmit={handleSubmit} style={{ fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif' }}>
        <div>
          <div className="app-title">GeoTask</div>
          <div className="app-subtitle">мини-приложение</div>
        </div>

        <h2 className="form-title">Авторизация</h2>

        <div className="input-group">
          <input
            type="text"
            placeholder="Логин"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
          />
          <span className="input-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </span>
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
          >
            {showPassword ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
                <line x1="2" y1="2" x2="22" y2="22" stroke="currentColor" strokeWidth="2"/>
              </svg>
            )}
          </button>
        </div>

        {error && <div className="login-error">{error}</div>}

        <button type="submit" className="login-btn">Войти</button>
      </form>
    </div>
  );
}