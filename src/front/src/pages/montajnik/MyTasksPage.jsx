// front/src/pages/montajnik/MyTasksPage.jsx
import React, { useState, useEffect } from "react";
import { fetchMyTasks } from "../../api"; 
import TaskCard from "../../components/TaskCard"; 
import "../../styles/LogistPage.css"; 

export default function MyTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadTasks = async () => {
      try {
        setLoading(true);
        const data = await fetchMyTasks(); 
        setTasks(data || []); 
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
        <div className="error"> {/* Предполагаем, что у вас есть стили для .error */}
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="logist-main"> {/* Используем общий класс основного контента */}
      <div className="page"> {/* Добавляем обертку для стилизации, если нужно */}
        <div className="page-header"> {/* Используем общий класс для заголовка страницы */}
          <h1>Мои задачи</h1>
        </div>
        <div className="cards"> {/* Используем общий класс для сетки карточек */}
          {tasks.length === 0 ? (
            <p>У вас пока нет назначенных задач.</p>
          ) : (
            tasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
  
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}