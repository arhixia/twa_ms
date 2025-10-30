import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/styles.css";
import useAuthStore from "./store/useAuthStore";

function initTelegram() {
  const tg = window.Telegram?.WebApp;

  if (!tg) {
    console.warn("Telegram SDK не найден — браузерный режим");
    return;
  }

  try {
    tg.ready();
    tg.expand();
    tg.disableVerticalSwipes?.();
    console.log("✅ Telegram WebApp:", tg.platform, tg.version);
  } catch (err) {
    console.warn("Ошибка инициализации Telegram:", err);
  }
}

function Root() {
  const restoreAuth = useAuthStore((s) => s.restoreAuth);

  useEffect(() => {
    initTelegram();
    restoreAuth(); // 🧠 восстанавливаем сессии при старте
  }, []);

  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Root />);
