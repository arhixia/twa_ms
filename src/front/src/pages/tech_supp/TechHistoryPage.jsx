// front/src/pages/tech/TechHistoryPage.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchTechHistory } from "../../api"; // используем общую функцию
import TaskCard from "../../components/TaskCard";
import "../../styles/LogistPage.css";

export default function TechHistoryPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    try {
      const data = await fetchTechHistory(); // Используем общую функцию, но бэкенд должен возвращать только для tech_supp
      setItems(data || []);
    } catch (err) {
      console.error("Ошибка загрузки истории:", err);
      alert("Не удалось загрузить историю задач");
      navigate("/tech_supp"); // или куда-то ещё
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="logist-main">Загрузка истории задач...</div>;

  return (
    <div className="logist-main">
      <div className="page-header">
        <h1>История задач</h1>
      </div>
      <div className="cards">
        {items.length ? (
          items.map((item) => (
            <TaskCard key={item.id} task={item} />
            // TaskCard сам решит, куда перейти
          ))
        ) : (
          <div className="empty">Нет завершённых задач</div>
        )}
      </div>
    </div>
  );
}