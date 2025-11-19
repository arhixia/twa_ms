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

  const statusColor = getStatusColor(task.status);
  const statusDisplay = getStatusLabel(task.status);

  const vehicleDisplay = task.vehicle_info && task.gos_number 
    ? `${task.vehicle_info} / ${task.gos_number}`
    : task.vehicle_info || task.gos_number || "—";

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
            padding: '2px 6px',
            borderRadius: '4px',
            color: 'white',
            fontSize: '0.8em',
          }}
        >
          {statusDisplay}
        </div>
      </div>
      <div className="task-meta-bold">
        {vehicleDisplay}
      </div>
      <div className="task-meta">
        {task.scheduled_at
          ? new Date(task.scheduled_at).toLocaleString()
          : "—"}
      </div>
    </div>
  );
}

function getStatusLabel(status) {
  const labelMap = {
    new: 'Создана',
    accepted: 'Принята',
    on_the_road: 'Выехал',
    started: 'Выполняется',
    on_site: 'Прибыл',
    completed: 'Завершена',
    inspection: 'На проверке',
    returned: 'Возвращена',
    archived: 'Архив',
    assigned: 'Назначена'
  };

  return labelMap[status] || status;
}

function getStatusColor(status) {
  if (!status) return '#6c757d'; // серый для undefined/null

  const colorMap = {
    new: '#28a745', // зелёный
    accepted: '#ffc107', // жёлтый
    on_the_road: '#17a2b8', // синий
    started: '#17a2b8', // синий
    on_site: '#17a2b8', // синий
    completed: '#20c997', // бирюзовый
    inspection: '#6f42c1', // фиолетовый
    returned: '#fd7e14', // оранжевый
    assigned: '#6f42c1', // фиолетовый
  };

  return colorMap[status] || '#6c757d'; // серый по умолчанию
}