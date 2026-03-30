import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/styles.css";
import useAuthStore from "./store/useAuthStore";
import { detectPlatform } from "./utils/platform";

function initTelegram() {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    tg.disableVerticalSwipes?.();
  } catch (err) {
    console.warn("Ошибка инициализации Telegram:", err);
  }
}

async function initVK() {
  try {
    const result = await window.vkBridge.send('VKWebAppInit');
    if (result.result) {
    }
  } catch (err) {
    console.warn("Ошибка инициализации VK Bridge:", err);
  }
}

function Root() {
  const restoreAuth = useAuthStore((s) => s.restoreAuth);

  useEffect(() => {
    const platform = detectPlatform();
    console.log(" Платформа:", platform);

    if (platform === 'telegram') initTelegram();
    if (platform === 'vk') initVK();

    restoreAuth();
  }, []);

  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Root />);