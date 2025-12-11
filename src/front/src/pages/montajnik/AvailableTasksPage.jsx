import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // Убедитесь, что useNavigate импортирован
import { fetchAvailableTasks, acceptTask } from "../../api";
import TaskCard from "../../components/TaskCard"; // Используем общий компонент карточки задачи
import "../../styles/LogistPage.css";
import useAuthStore from "@/store/useAuthStore"; // Используем общий store аутентификации


export default function AvailableTasksPage() {
  const navigate = useNavigate(); // Хук для навигации
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { updateAvailableTasksCount, updateMyTasksCount , updateAssignedTasksCount } = useAuthStore();

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAvailableTasks();
      // Теперь data - объект с полем tasks
      setTasks(data.tasks || []);
    } catch (err) {
      console.error("Ошибка загрузки доступных задач:", err);
      setError("Не удалось загрузить доступные задачи.");
    } finally {
      setLoading(false);
    }
  }

const handleAcceptTask = async (taskId) => {
  try {
    await acceptTask(taskId); // Вызываем API функцию принятия задачи
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.showAlert("Задача успешно принята!");
    } else {
      alert("Задача успешно принята!");
    }
    // После успешного принятия обновляем все счетчики и перезагружаем задачи
    await Promise.all([
      loadTasks(), // Перезагружаем текущие задачи
      updateAvailableTasksCount(),
      updateMyTasksCount(),
      updateAssignedTasksCount()
    ]);
  } catch (err) {
    console.error(`Ошибка при принятии задачи ${taskId}:`, err);
    // Проверяем, есть ли детализированное сообщение об ошибке в ответе
    const errorMessage = err.response?.data?.detail || "Не удалось принять задачу.";
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.showAlert(`Ошибка: ${errorMessage}`);
    } else {
      alert(`Ошибка: ${errorMessage}`);
    }
  }
};

  // Функция для обхода клика по карточке - осуществляет навигацию
  const handleTaskCardClick = (task) => {
    // Используем navigate для перехода на страницу предпросмотра задачи
    navigate(`/montajnik/tasks/available/${task.id}`);
  };

  if (loading) {
    return (
      <div className="logist-main">
        <div className="empty">
          Загрузка доступных задач...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="logist-main">
        <div className="error">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1>Доступные задачи</h1>
        </div>
        <div className="cards">
          {tasks.length === 0 ? (
            <p>Нет доступных задач.</p>
          ) : (
            tasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                // Передаем функцию навигации в onClick
                onClick={handleTaskCardClick}
                // Оставляем возможность принять задачу прямо из списка (если реализовано в TaskCard)
                showAcceptButton={true} // Если хотите кнопку "Принять" в карточке
                onAccept={handleAcceptTask} // Если хотите кнопку "Принять" в карточке
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}