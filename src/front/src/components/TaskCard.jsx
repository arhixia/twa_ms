// src/components/TaskCard.jsx
import React from "react";
import { useNavigate } from "react-router-dom";

export default function TaskCard({ 
  task, 
  onClick, 
  onUnarchive, 
  onDelete, 
  onAccept, 
  onReject, 
  isAccepting, 
  isRejecting,
  showPrice = false,
  showManagerStatus = false,
  isAdmin = false,         
  onLike,                  
  onDislike    
}) {
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

  const isDraft = task.status === "draft";
  const isArchived = task.status === "archived";
  const canAcceptNew = task.status === 'new' && onAccept && !onReject;
  const canAcceptRejectAssigned = task.status === 'assigned' && onAccept && onReject;
  const displayPrice = showPrice && task.montajnik_reward !== undefined && task.montajnik_reward !== null;


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
       <>
    {/* Менеджерский статус — СЛЕВА от основного */}
    {showManagerStatus && task.manager_status && (
      <div
        className="task-manager-status-badge"
        style={{
          position: 'absolute',
          top: '12px',
          right: 'calc(12px + 60px + 24px)', 
          padding: '4px 8px',
          borderRadius: '16px',
          fontSize: '12px',
          fontWeight: '600',
          color: 'white',
          textAlign: 'center',
          minWidth: '60px',
          backgroundColor: getManagerStatusColor(task.manager_status),
          zIndex: 2,
        }}
      >
        {getManagerStatusLabel(task.manager_status)}
      </div>
    )}

    {/* Основной статус — ТОЧНО на прежнем месте */}
    <div
      className="task-status-badge"
      style={{ backgroundColor: statusColor }}
    >
      {statusDisplay}
    </div>
  </>
      )}

      {displayPrice && (
        <div className="task-mont-reward" style={{
          position: "absolute",
          top: "50%", // По центру по вертикали
          transform: "translateY(-50%)", // Центрируем относительно своей высоты
          right: "8px", // Отступ от правого края карточки
          backgroundColor: "#2563eb", // Синий фон как у градиента кнопки принять
          color: "white",
          padding: "4px 8px",
          borderRadius: "8px",
          fontSize: "20px",
          fontWeight: "bold",
          zIndex: 1,
          textAlign: "center"
        }}>
          {task.montajnik_reward} ₽
        </div>
      )}

      {/* Кнопка принятия для новых задач (справа внизу) */}
      {canAcceptNew && (
        <button
          disabled={isAccepting}
          onClick={(e) => {
            e.stopPropagation();
            onAccept();
          }}
          style={{
            position: "absolute",
            bottom: "8px",
            right: "8px",
            background: "linear-gradient(to right, #10b981, #2563eb)",
            color: "white",
            padding: "4px 8px",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: "bold",
            cursor: isAccepting ? "not-allowed" : "pointer",
            border: "none",
            zIndex: 1,
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
            bottom: "8px",
            right: "8px",
            display: "flex",
            gap: "4px",
            zIndex: 1,
          }}
        >
          {onReject && (
            <button
              disabled={isRejecting}
              onClick={(e) => {
                e.stopPropagation();
                onReject();
              }}
              style={{
                background: "linear-gradient(to right, #ef4444, #dc2626)",
                color: "white",
                padding: "4px 8px",
                borderRadius: "8px",
                fontSize: "12px",
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
                e.stopPropagation();
                onAccept();
              }}
              style={{
                background: "linear-gradient(to right, #10b981, #2563eb)",
                color: "white",
                padding: "4px 8px",
                borderRadius: "8px",
                fontSize: "12px",
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
      if (typeof onDelete === 'function') {
        onDelete(task.id);
      }
    }}
    style={{
      position: "absolute",
      bottom: "8px",
      right: "8px",
      background: "linear-gradient(to right, #ef4444, #dc2626)",
      color: "white",
      padding: "4px 8px",
      borderRadius: "8px",
      fontSize: "12px",
      fontWeight: "bold",
      cursor: "pointer",
      border: "none",
      zIndex: 2
    }}
  >
    🗑 Удалить
  </button>
)}

{isAdmin && task.status === "completed" && (
  <div
    style={{
      position: "absolute",
      bottom: "8px",
      right: "8px",
      display: "flex",
      gap: "6px",
      alignItems: "center",
      zIndex: 2,
    }}
  >
    {/* Палец вверх */}
    <button
      onClick={(e) => {
        e.stopPropagation();
        onLike?.(task.id);
      }}
      style={{
        width: "32px",
        height: "32px",
        borderRadius: "50%",
        border: "none",
        background: task.logist_performance === "good"
          ? "linear-gradient(135deg, #10b981, #6fd695)"
          : "#374151",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        padding: 0,
        transition: "transform 0.15s ease, background 0.2s ease",
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = "scale(0.9)";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
      title="Хорошее качество работы"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="white" // ← белая заливка
        style={{
          transition: "opacity 0.2s ease",
          opacity: task.logist_performance === "good" ? 1 : 0.85,
        }}
      >
        <path d="M8.864.046C7.908-.193 7.02.53 6.956 1.466c-.072 1.051-.23 2.016-.428 2.59-.125.36-.479 1.013-1.04 1.639-.557.623-1.282 1.178-2.131 1.41C2.685 7.288 2 7.87 2 8.72v4.001c0 .845.682 1.464 1.448 1.545 1.07.114 1.564.415 2.068.723l.048.03c.272.165.578.348.97.484.397.136.861.217 1.466.217h3.5c.937 0 1.599-.477 1.934-1.064a1.86 1.86 0 0 0 .254-.912c0-.152-.023-.312-.077-.464.201-.263.38-.578.488-.901.11-.33.172-.762.004-1.149.069-.13.12-.269.159-.403.077-.27.113-.568.113-.857 0-.288-.036-.585-.113-.856a2 2 0 0 0-.138-.362 1.9 1.9 0 0 0 .234-1.734c-.206-.592-.682-1.1-1.2-1.272-.847-.282-1.803-.276-2.516-.211a10 10 0 0 0-.443.05 9.4 9.4 0 0 0-.062-4.509A1.38 1.38 0 0 0 9.125.111zM11.5 14.721H8c-.51 0-.863-.069-1.14-.164-.281-.097-.506-.228-.776-.393l-.04-.024c-.555-.339-1.198-.731-2.49-.868-.333-.036-.554-.29-.554-.55V8.72c0-.254.226-.543.62-.65 1.095-.3 1.977-.996 2.614-1.708.635-.71 1.064-1.475 1.238-1.978.243-.7.407-1.768.482-2.85.025-.362.36-.594.667-.518l.262.066c.16.04.258.143.288.255a8.34 8.34 0 0 1-.145 4.725.5.5 0 0 0 .595.644l.003-.001.014-.003.058-.014a9 9 0 0 1 1.036-.157c.663-.06 1.457-.054 2.11.164.175.058.45.3.57.65.107.308.087.67-.266 1.022l-.353.353.353.354c.043.043.105.141.154.315.048.167.075.37.075.581 0 .212-.027.414-.075.582-.05.174-.111.272-.154.315l-.353.353.353.354c.006.005.041.05.041.17a.9.9 0 0 1-.121.416c-.165.288-.503.56-1.066.56z"/>
      </svg>
    </button>

    {/* Палец вниз */}
    <button
      onClick={(e) => {
        e.stopPropagation();
        onDislike?.(task.id);
      }}
      style={{
        width: "32px",
        height: "32px",
        borderRadius: "50%",
        border: "none",
        background: task.logist_performance === "bad"
          ? "linear-gradient(135deg, #ef4444, #751f1f)"
          : "#374151",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        padding: 0,
        transition: "transform 0.15s ease, background 0.2s ease",
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = "scale(0.9)";
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
      }}
      title="Плохое качество работы"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="white" 
        style={{
          transition: "opacity 0.2s ease",
          opacity: task.logist_performance === "bad" ? 1 : 0.85,
        }}
      >
        <path d="M8.864 15.674c-.956.24-1.843-.484-1.908-1.42-.072-1.05-.23-2.015-.428-2.59-.125-.36-.479-1.012-1.04-1.638-.557-.624-1.282-1.179-2.131-1.41C2.685 8.432 2 7.85 2 7V3c0-.845.682-1.464 1.448-1.546 1.07-.113 1.564-.415 2.068-.723l.048-.029c.272-.166.578-.349.97-.484C6.931.08 7.395 0 8 0h3.5c.937 0 1.599.478 1.934 1.064.164.287.254.607.254.913 0 .152-.023.312-.077.464.201.262.38.577.488.9.11.33.172.762.004 1.15.069.13.12.268.159.403.077.27.113.567.113.856s-.036.586-.113.856c-.035.12-.08.244-.138.363.394.571.418 1.2.234 1.733-.206.592-.682 1.1-1.2 1.272-.847.283-1.803.276-2.516.211a10 10 0 0 1-.443-.05 9.36 9.36 0 0 1-.062 4.51c-.138.508-.55.848-1.012.964zM11.5 1H8c-.51 0-.863.068-1.14.163-.281.097-.506.229-.776.393l-.04.025c-.555.338-1.198.73-2.49.868-.333.035-.554.29-.554.55V7c0 .255.226.543.62.65 1.095.3 1.977.997 2.614 1.709.635.71 1.064 1.475 1.238 1.977.243.7.407 1.768.482 2.85.025.362.36.595.667.518l.262-.065c.16-.04.258-.144.288-.255a8.34 8.34 0 0 0-.145-4.726.5.5 0 0 1 .595-.643h.003l.014.004.058.013a9 9 0 0 0 1.036.157c.663.06 1.457.054 2.11-.163.175-.059.45-.301.57-.651.107-.308.087-.67-.266-1.021L12.793 7l.353-.354c.043-.042.105-.14.154-.315.048-.167.075-.37.075-.581s-.027-.414-.075-.581c-.05-.174-.111-.273-.154-.315l-.353-.354.353-.354c.047-.047.109-.176.005-.488a2.2 2.2 0 0 0-.505-.804l-.353-.354.353-.354c.006-.005.041-.05.041-.17a.9.9 0 0 0-.121-.415C12.4 1.272 12.063 1 11.5 1"/>
      </svg>
    </button>
  </div>
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

function getManagerStatusLabel(managerStatus) {
  const labelMap = {
    invoice_not_issued: 'Счет не выставлен',
    invoice_issued: 'Счет выставлен',
    warranty: 'Гарантия',
    cash_payment: 'Наличка',
  };
  return labelMap[managerStatus] || managerStatus || "—";
}

function getManagerStatusColor(managerStatus) {
  const colorMap = {
    invoice_not_issued: '#6b7280', // gray-500
    invoice_issued: '#39c3cf',     // blue-500
    warranty: '#422780',           // violet-500
    cash_payment: '#759f36',       // amber-500
  };
  return colorMap[managerStatus] || '#6c757d';
}