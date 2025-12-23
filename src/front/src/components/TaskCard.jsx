// src/components/TaskCard.jsx
import React from "react";
import { useNavigate } from "react-router-dom"; // Оставляем только useNavigate, если он нужен в ином случае

export default function TaskCard({ task, onClick, onAccept, onReject, onDelete, isAccepting, isRejecting }) { // Принимаем новые пропсы
  // const navigate = useNavigate(); // Не нужен, так как onClick передает функцию

  function handleClick() {
    if (onClick) {
      onClick(task);
      return;
    }

    // Эта логика не выполнится, если onClick всегда передается
    // const navigate = useNavigate();
    // const location = useLocation();
    // if (location.pathname.startsWith("/logist")) {
    //   navigate(`/logist/tasks/${task.id}`);
    // } else if (location.pathname.startsWith("/tech_supp")) {
    //   navigate(`/tech_supp/tasks/${task.id}`);
    // } else if (location.pathname.startsWith("/montajnik")) {
    //   navigate(`/montajnik/tasks/${task.id}`);
    // } else if (location.pathname.startsWith("/admin")) {
    //   navigate(`/admin/tasks/${task.id}`);
    // } else {
    //   navigate(`/tasks/${task.id}`);
    // }
  }

  const statusColor = getStatusColor(task.status);
  const statusDisplay = getStatusLabel(task.status);

  // ✅ Используем новое поле client_name
  const clientName = task.client_name || "—";

  // Форматирование даты
  const formattedDate = task.scheduled_at
    ? new Date(task.scheduled_at).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : "—";

  // Рендеринг оборудования: используем equipment.name
  
  const renderEquipment = () => {
    if (!task.equipment || task.equipment.length === 0) {
      return <div className="equipment-item">Оборудование не назначено</div>;
    }

    // Группируем оборудование по названию
    const groupedEquipment = task.equipment.reduce((acc, eq) => {
      const name = eq.equipment?.name || `Оборудование ${eq.equipment_id}`;
      if (!acc[name]) {
        acc[name] = 0;
      }
      acc[name]++;
      return acc;
    }, {});

    return Object.entries(groupedEquipment).map(([name, count], index) => (
      <div key={index} className="equipment-item">
        {count > 1 ? `${name} x${count}` : name}
      </div>
    ));
  };

  // Проверяем, является ли задача черновиком
  const isDraft = task.status === "draft";

  return (
    <div className="task-card" onClick={handleClick}>
      {/* ID задачи */}
      <div className="task-id">#{task.id}</div>

      {/* Название компании/ИП */}
      <div className="task-client">{clientName}</div>

      {/* Модель ТС */}
      {task.vehicle_info && (
        <div className="task-vehicle-model">{task.vehicle_info}</div>
      )}

      {/* Госномер в рамке */}
      {task.gos_number && (
        <div className="task-gos-number-wrapper">
          <div className="task-gos-number">{task.gos_number}</div>
        </div>
      )}

      {/* Блок оборудования */}
      <div className="equipment-section">
        <div className="equipment-label">ОБОРУДОВАНИЕ:</div>
        <div className="equipment-list">
          {renderEquipment()}
        </div>
      </div>

      {/* Дата и время */}
      <div className="task-scheduled-at">
        <span>📅 {formattedDate}</span>
      </div>

      {/* Статус (справа вверху) */}
      <div className="task-status-badge" style={{ backgroundColor: statusColor }}>
        {statusDisplay}
      </div>

      {/* Кнопка удаления (только для черновиков) */}
      {isDraft && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation(); // Останавливаем всплытие, чтобы не сработал клик на карточку
            onDelete(task.id);
          }}
          style={{
            position: "absolute",
            bottom: "8px", // Отступ от низа карточки
            right: "8px",  // Отступ от правого края карточки
            background: "linear-gradient(to right, #ef4444, #dc2626)", // Красный градиент
            color: "white",
            padding: "4px 8px", // Меньше паддинги для компактности
            borderRadius: "8px", // Меньше скругление
            fontSize: "12px", // Меньше шрифт
            fontWeight: "bold",
            cursor: "pointer",
            border: "none",
            zIndex: 2 // Убедимся, что кнопка поверх других элементов
          }}
        >
          🗑 Удалить
        </button>
      )}

      {/* Контейнер для кнопок "Принять" и "Отклонить" (справа внизу) */}
      {(onAccept || onReject) && (
        <div
          style={{
            position: "absolute",
            bottom: "8px", // Отступ от низа карточки
            right: "8px",  // Отступ от правого края карточки
            display: "flex", // Располагаем кнопки в ряд
            gap: "4px", // Небольшой отступ между кнопками
            zIndex: 1, // Убедимся, что кнопки поверх других элементов
          }}
        >
          {onReject && (
            <button
              disabled={isRejecting}
              onClick={(e) => {
                e.stopPropagation(); // Останавливаем всплытие, чтобы не сработал клик на карточку
                onReject();
              }}
              style={{
                // --- ГРАДИЕНТ ---
                background: "linear-gradient(to right, #ef4444, #dc2626)", // Красный градиент
                // backgroundColor: "#dc3545", // <-- Закомментировано
                // --- /ГРАДИЕНТ ---
                color: "white",
                padding: "4px 8px", // Меньше паддинги для компактности
                borderRadius: "8px", // Меньше скругление
                fontSize: "12px", // Меньше шрифт
                fontWeight: "bold",
                cursor: isRejecting ? "not-allowed" : "pointer",
                border: "none",
              }}
            >
              {isRejecting ? "..." : "ОТКЛОНИТЬ"}
            </button>
          )}
          {onAccept && (
            <button
              disabled={isAccepting}
              onClick={(e) => {
                e.stopPropagation(); // Останавливаем всплытие, чтобы не сработал клик на карточку
                onAccept();
              }}
              style={{
                // --- ГРАДИЕНТ ---
                background: "linear-gradient(to right, #10b981, #2563eb)", // Зелено-синий градиент
                // backgroundColor: "#28a745", // <-- Закомментировано
                // --- /ГРАДИЕНТ ---
                color: "white",
                padding: "4px 8px", // Меньше паддинги для компактности
                borderRadius: "8px", // Меньше скругление
                fontSize: "12px", // Меньше шрифт
                fontWeight: "bold",
                cursor: isAccepting ? "not-allowed" : "pointer",
                border: "none",
              }}
            >
              {isAccepting ? "..." : "ПРИНЯТЬ"}
            </button>
          )}
        </div>
      )}
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
    assigned: 'Назначена',
    draft: 'Черновик' // ✅ Добавлен статус "Черновик"
  };
  return labelMap[status] || status;
}

function getStatusColor(status) {
  if (!status) return '#6c757d';

  const colorMap = {
    new: '#28a745',
    accepted: '#ffc107',
    on_the_road: '#17a2b8',
    started: '#17a2b8',
    on_site: '#17a2b8',
    completed: '#20c997',
    inspection: '#6f42c1',
    returned: '#fd7e14',
    assigned: '#6f42c1',
    draft: '#6c757d' // ✅ Цвет для статуса "Черновик"
  };
  return colorMap[status] || '#6c757d';
}