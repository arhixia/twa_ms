import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/styles.css";
import useAuthStore from "./store/useAuthStore";
import { detectPlatform, PLATFORMS, loadTelegramScript } from "./utils/platform";
import vkBridge from '@vkontakte/vk-bridge';
import { ModalProvider } from "./components/useModal";
import { registerModalHandlers } from "./utils/notify";
import { useModal } from "./components/useModal";

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

function AppWithModal() {
  const { showAlert, showConfirm } = useModal();

  useEffect(() => {
    registerModalHandlers({ showAlert, showConfirm });
  }, [showAlert, showConfirm]);

  return <App />;
}

function Root() {
  const restoreAuth = useAuthStore((s) => s.restoreAuth);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const initApp = async () => {
      let platform = detectPlatform();
      console.log("Initial platform detection:", platform);

      if (platform === PLATFORMS.WEB) {
        try {
          // Пробуем загрузить Telegram SDK
          await loadTelegramScript();
          // Перепроверяем платформу после загрузки скрипта
          if (window.Telegram?.WebApp?.initData) {
            platform = PLATFORMS.TELEGRAM;
            console.log("Platform re-detected as Telegram after script load");
          } else {
            console.log("Telegram script loaded, but no initData found. Staying on WEB.");
          }
        } catch (e) {
          console.warn("Could not load Telegram script, staying on WEB", e);
        }
      }

      console.log("Final platform:", platform);

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
      <ModalProvider>
        <AppWithModal />
      </ModalProvider>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Root />);