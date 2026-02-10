// src/pages/manager/ManagerTasksPage.jsx
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { fetchManagerTasks } from "@/api";
import TaskCard from "@/components/TaskCard";

// SVG иконки
// SVG иконки
const InvoiceNotIssuedIcon = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <line x1="16" y1="13" x2="8" y2="13"></line>
    <line x1="16" y1="17" x2="8" y2="17"></line>
    <polyline points="10 9 9 9 8 9"></polyline>
  </svg>
);

const InvoiceIssuedIcon = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <path d="M9 12l2 2 4-4"></path>
  </svg>
);

const WarrantyIcon = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
  </svg>
);

const CashPaymentIcon = ({ color }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="none">
    <path 
      fill={color} 
      fillRule="evenodd" 
      d="M11 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8m5-4a5 5 0 1 1-10 0 5 5 0 0 1 10 0"
    />
    <path 
      fill={color} 
      d="M9.438 11.944c.047.596.518 1.06 1.363 1.116v.44h.375v-.443c.875-.061 1.386-.529 1.386-1.207 0-.618-.39-.936-1.09-1.1l-.296-.07v-1.2c.376.043.614.248.671.532h.658c-.047-.575-.54-1.024-1.329-1.073V8.5h-.375v.45c-.747.073-1.255.522-1.255 1.158 0 .562.378.92 1.007 1.066l.248.061v1.272c-.384-.058-.639-.27-.696-.563h-.668zm1.36-1.354c-.369-.085-.569-.26-.569-.522 0-.294.216-.514.572-.578v1.1zm.432.746c.449.104.655.272.655.569 0 .339-.257.571-.709.614v-1.195z"
    />
    <path 
      fill={color} 
      d="M1 0a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h4.083q.088-.517.258-1H3a2 2 0 0 0-2-2V3a2 2 0 0 0 2-2h10a2 2 0 0 0 2 2v3.528c.38.34.717.728 1 1.154V1a1 1 0 0 0-1-1z"
    />
    <path 
      fill={color} 
      d="M9.998 5.083 10 5a2 2 0 1 0-3.132 1.65 6 6 0 0 1 3.13-1.567"
    />
  </svg>
);

export default function ManagerTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    try {
      setLoading(true);
      const data = await fetchManagerTasks();
      setTasks(data.tasks || []);
    } catch (err) {
      console.error("Ошибка загрузки задач менеджера:", err);
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Ошибка загрузки задач");
      } else {
        alert("Ошибка загрузки задач");
      }
    } finally {
      setLoading(false);
    }
  }

  // Группируем задачи по manager_status
  const groupedTasks = {
    invoice_not_issued: [],
    invoice_issued: [],
    warranty: [],
    cash_payment: [],
  };

  tasks.forEach(task => {
    if (task.manager_status && groupedTasks[task.manager_status]) {
      groupedTasks[task.manager_status].push(task);
    }
  });

  const sections = [
    {
      key: "invoice_not_issued",
      title: "Невыставленные счета",
      icon: InvoiceNotIssuedIcon,
      color: "#d97706", // Приглушённый оранжевый
    },
    {
      key: "invoice_issued",
      title: "Счет выставлен",
      icon: InvoiceIssuedIcon,
      color: "#16a34a", // Приглушённый зелёный
    },
    {
      key: "warranty",
      title: "Гарантия",
      icon: WarrantyIcon,
      color: "#1d4ed8", // Приглушённый синий
    },
    {
      key: "cash_payment",
      title: "Оплата наличными",
      icon: CashPaymentIcon,
      color: "#b54444", // Приглушённый красный
    },
  ];

  if (loading) {
    return <div className="logist-main"><div className="empty">Загрузка...</div></div>;
  }

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Задачи</h1>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
          {sections.map(section => {
            const IconComponent = section.icon;
            return (
              <div key={section.key}>
                {/* Заголовок секции */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '8px',
                }}>
                  <span style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    backgroundColor: `${section.color}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <IconComponent color={section.color} />
                  </span>
                  <h2 style={{
                    margin: 0,
                    fontSize: '16px',
                    fontWeight: 600,
                    color: section.color, // Текст теперь того же цвета!
                    fontFamily: '"Inter", sans-serif',
                  }}>
                    {section.title}
                  </h2>
                </div>

                {/* Контейнер с карточками */}
             {/* Контейнер с карточками */}
<div className="horizontal-cards-container">
  {groupedTasks[section.key].length > 0 ? (
    groupedTasks[section.key].map(task => (
      <Link key={task.id} to={`/manager/tasks/${task.id}`} style={{ textDecoration: 'none', display: 'flex' }}>
        <TaskCard task={task}  />
      </Link>
    ))
  ) : (
    <div 
      className="empty" 
      style={{ 
        padding: '12px', 
        textAlign: 'center',
        fontStyle: 'italic',
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#8b949e',
        fontSize: '15px',
        minWidth: '280px', /* Соответствует ширине карточек */
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      Задач нет
    </div>
  )}
</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}