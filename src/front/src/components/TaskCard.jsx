// front/src/components/TaskCard.jsx
import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

export default function TaskCard({ task, onClick }) {
  const navigate = useNavigate();
  const location = useLocation();

  function handleClick() {
    if (onClick) {
      onClick(task); // если передан onClick — вызываем его
      return;
    }

    // иначе — переход на страницу задачи
    if (location.pathname.startsWith("/logist")) {
      navigate(`/logist/tasks/${task.id}`);
    } else if (location.pathname.startsWith("/tech_supp")) {
      navigate(`/tech_supp/tasks/${task.id}`);
    } else if (location.pathname.startsWith("/montajnik")) {
      navigate(`/montajnik/tasks/${task.id}`);
    } else if (location.pathname.startsWith("/admin")) {
      navigate(`/admin/tasks/${task.id}`);
    } else {
      navigate(`/tasks/${task.id}`);
    }
  }

  // Определяем отображаемый статус и цвет
  // const displayStatus = task.status !== 'new' ? 'в работе' : task.status;
  // Цвет оставляем от первоначального статуса задачи или задаём общий для 'в работе'
  // const statusColor = task.status !== 'new' ? 'orange' : getStatusColor(task.status); // Пример с цветом
  // const statusColor = getStatusColor(task.status); // Или всегда использовать цвет оригинального статуса

  // Если нужно, чтобы цвет был фиксированным для "в работе", раскомментируйте следующую строку:
  // const statusColor = task.status !== 'new' ? '#FFA500' : getStatusColor(task.status); // Оранжевый для "в работе"

  const statusColor = getStatusColor(task.status);
  // const statusColor = task.status !== 'new' ? '#FFA500' : getStatusColor(task.status); // Пример: оранжевый для "в работе"

  return (
    <div className="task-card" onClick={handleClick}>
      <div className="task-row">
        <div className="task-title">
          #{task.id} — {task.client || "Клиент не указан"}
        </div>
        <div
          className="task-status"
          style={{
            backgroundColor: statusColor,
            padding: '2px 6px', // Если у вас нет padding в CSS для .task-status
            borderRadius: '4px', // Если у вас нет borderRadius в CSS для .task-status
            color: 'white', // Если у вас нет color в CSS для .task-status
            fontSize: '0.8em', // Если у вас нет fontSize в CSS для .task-status
          }}
        >
          {/* {displayStatus} */}
          {task.status}
        </div>
      </div>
      <div className="task-meta">
        {task.scheduled_at
          ? new Date(task.scheduled_at).toLocaleString()
          : "—"}
      </div>
    </div>
  );
}


function getStatusColor(status) {
  if (!status) return '#6c757d'; // серый для undefined/null

  const colorMap = {
    new: '#28a745', // зелёный
    accepted: '#ffc107', // жёлтый
    started: '#17a2b8', // синий
    completed: '#20c997', // бирюзовый
    inspection: '#6f42c1', // фиолетовый
    returned: '#fd7e14', // оранжевый
  };

  return colorMap[status] || '#6c757d'; // серый по умолчанию
}

// личный кабинет