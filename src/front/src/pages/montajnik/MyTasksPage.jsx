import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // Импортируем useNavigate
import { fetchMyTasks } from "../../api"; 
import TaskCard from "../../components/TaskCard"; 
import useAuthStore from "@/store/useAuthStore"; 

export default function MyTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { updateMyTasksCount } = useAuthStore();
  const navigate = useNavigate(); // Получаем функцию навигации

  const handleTaskCardClick = (task) => {
    navigate(`/montajnik/tasks/${task.id}`);
  };

  useEffect(() => {
    const loadTasks = async () => {
      try {
        setLoading(true);
        const data = await fetchMyTasks(); 
        setTasks(data.tasks || []); 
      } catch (err) {
        console.error("Ошибка загрузки моих задач:", err);
        setError("Не удалось загрузить мои задачи.");
      } finally {
        setLoading(false);
      }
    };

    loadTasks(); 
  }, []);

  if (loading) {
    return (
      <div className="logist-main"> 
        <div className="empty"> 
          Загрузка моих задач...
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
        {/* Заголовок страницы */}
        <h1 className="page-title">Мои задачи</h1>
        
        <div className="cards">
          {tasks.length === 0 ? (
            <p>У вас пока нет назначенных задач.</p>
          ) : (
            tasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onClick={handleTaskCardClick} // Передаем обработчик в TaskCard
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}