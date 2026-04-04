import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/styles.css";
import useAuthStore from "./store/useAuthStore";
import { detectPlatform, PLATFORMS } from "./utils/platform";
import vkBridge from '@vkontakte/vk-bridge'; 

const initTelegram = () => {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    tg.disableVerticalSwipes?.();
  } catch (err) {
    console.warn("Ошибка инициализации Telegram:", err);
  }
};

const initVK = async () => {
  try {
    await vkBridge.send("VKWebAppInit");
    console.log("✅ VK Bridge initialized");
  } catch (err) {
    console.warn("❌ Ошибка инициализации VK Bridge:", err);
  }
};

function Root() {
  const restoreAuth = useAuthStore((s) => s.restoreAuth);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initApp = async () => {
      const platform = detectPlatform();
      console.log("Platform detected:", platform);

      if (platform === PLATFORMS.TELEGRAM) {
        initTelegram();
      } else if (platform === PLATFORMS.VK) {
        await initVK();
      }

      await restoreAuth();
      setIsReady(true);
    };

    initApp();
  }, []);

  if (!isReady) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
        Загрузка...
      </div>
    );
  }

  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Root />);