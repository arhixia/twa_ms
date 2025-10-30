// front/src/pages/tech/TechActiveTasksPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchTechActiveTasks } from "../../api"; // используем общую функцию
import TaskCard from "../../components/TaskCard";
import "../../styles/LogistPage.css";

export default function TechActiveTasksPage() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    try {
      const data = await fetchTechActiveTasks();
      setTasks(data || []);
    } catch (err) {
      console.error("Ошибка загрузки активных задач:", err);
      alert("Не удалось загрузить активные задачи");
      navigate("/tech_supp"); // или куда-то ещё
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="logist-main">Загрузка активных задач...</div>;

  return (
    <div className="logist-main">
      <div className="page-header">
        <h1>Активные задачи</h1>
      </div>
      <div className="cards">
        {tasks.length ? (
          tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
            // TaskCard сам решит, куда перейти, по location.pathname
          ))
        ) : (
          <div className="empty">Нет активных задач</div>
        )}
      </div>
    </div>
  );
}