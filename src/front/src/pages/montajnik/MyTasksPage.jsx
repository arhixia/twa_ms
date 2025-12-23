import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { fetchMyTasks } from "../../api"; 
import TaskCard from "../../components/TaskCard"; 
import useAuthStore from "@/store/useAuthStore"; 

export default function MyTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { updateMyTasksCount } = useAuthStore();
  const navigate = useNavigate();

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
        <h1 className="page-title">Мои задачи</h1>
        
        <div className="cards">
          {tasks.length === 0 ? (
            <p>У вас пока нет назначенных задач.</p>
          ) : (
            tasks.map(task => (
              <div
                key={task.id}
                className="task-card-wrapper"
                style={{
                  position: "relative",
                  borderRadius: "12px",
                  overflow: "hidden",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                }}
              >
                {/* Отображение mont_reward */}
                {task.montajnik_reward && (
                  <div className="task-mont-reward">
                    {task.montajnik_reward}
                  </div>
                )}
                
                <TaskCard
                  task={task}
                  onClick={handleTaskCardClick}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}