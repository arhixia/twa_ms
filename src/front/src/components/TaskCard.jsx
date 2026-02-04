// src/components/TaskCard.jsx
import React from "react";
import { useNavigate } from "react-router-dom";

export default function TaskCard({ task, onClick, onUnarchive, onDelete, onAccept, onReject, isAccepting, isRejecting }) {
  const navigate = useNavigate();

  function handleClick() {
    if (onClick) {
      onClick(task);
      return;
    }
    navigate(`/logist/tasks/${task.id}`);
  }

  const statusColor = getStatusColor(task.status);
  const statusDisplay = getStatusLabel(task.status);

  // Используем новое поле client_name
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

  // Проверяем, является ли задача черновиком или архивной
  const isDraft = task.status === "draft";
  const isArchived = task.status === "archived";
  
  // Проверяем, может ли монтажник принимать/отклонять задачу
  // Для новых задач (new) - только кнопка принять
  const canAcceptNew = task.status === 'new' && onAccept && !onReject;
  // Для назначенных задач (assigned) - кнопки принять/отклонить
  const canAcceptRejectAssigned = task.status === 'assigned' && onAccept && onReject;

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
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11 6.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5z"/>
            <path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5M1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z"/>
          </svg>
          {formattedDate}
        </span>
      </div>

      {/* Статус (справа вверху) или иконки для архивных задач */}
      {isArchived ? (
        <div
          style={{
            position: "absolute",
            top: "8px",
            right: "8px",
            display: "flex",
            gap: "8px",
            zIndex: 2
          }}
        >
          {/* Кнопка "В черновики" - разархивировать */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (typeof onUnarchive === 'function') {
                onUnarchive(task.id);
              }
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
            title="Перевести в черновики"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="white" viewBox="0 0 16 16">
              <path fillRule="evenodd" d="M1 8a7 7 0 1 0 14 0A7 7 0 0 0 1 8m15 0A8 8 0 1 1 0 8a8 8 0 0 1 16 0m-7.5 3.5a.5.5 0 0 1-1 0V5.707L5.354 7.854a.5.5 0 1 1-.708-.708l3-3a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 5.707z"/>
            </svg>
          </button>

          {/* Кнопка "Удалить" */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (typeof onDelete === 'function') {
                onDelete(task.id);
              }
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
            title="Удалить задачу"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="white" viewBox="0 0 16 16">
              <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/>
              <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/>
            </svg>
          </button>
        </div>
      ) : (
        <div className="task-status-badge" style={{ backgroundColor: statusColor }}>
          {statusDisplay}
        </div>
      )}

      {/* Кнопка принятия для новых задач (справа внизу) */}
      {canAcceptNew && (
        <button
          disabled={isAccepting}
          onClick={(e) => {
            e.stopPropagation(); // Останавливаем всплытие, чтобы не сработал клик на карточку
            onAccept();
          }}
          style={{
            position: "absolute",
            bottom: "8px", // Отступ от низа карточки
            right: "8px",  // Отступ от правого края карточки
            background: "linear-gradient(to right, #10b981, #2563eb)", // Зелено-синий градиент
            color: "white",
            padding: "4px 8px", // Меньше паддинги для компактности
            borderRadius: "8px", // Меньше скругление
            fontSize: "12px", // Меньше шрифт
            fontWeight: "bold",
            cursor: isAccepting ? "not-allowed" : "pointer",
            border: "none",
            zIndex: 1, // Убедимся, что кнопка поверх других элементов
          }}
        >
          {isAccepting ? "..." : "ПРИНЯТЬ"}
        </button>
      )}

      {/* Кнопки принятия/отклонения для назначенных задач (справа внизу) */}
      {canAcceptRejectAssigned && (
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

      {/* Кнопка удаления (только для черновиков) */}
      {isDraft && (
        <button
          onClick={(e) => {
            e.stopPropagation(); // Останавливаем всплытие, чтобы не сработал клик на карточку
            // Здесь нужно добавить вызов функции удаления черновика
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
    </div>
  );
}

function getStatusLabel(status) {
  const labelMap = {
    new: 'В эфире',
    accepted: 'Принята',
    on_the_road: 'Выехал',
    started: 'Выполняется',
    on_site: 'Прибыл',
    completed: 'Завершена',
    inspection: 'На проверке',
    returned: 'На доработке',
    archived: 'Архив',
    assigned: 'Назначена',
    draft: 'Черновик'
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
    inspection: '#882486',
    returned: '#fd7e14',
    assigned: '#6f42c1',
    draft: '#6c757d'
  };
  return colorMap[status] || '#6c757d';
}