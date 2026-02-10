// src/pages/manager/ManagerTaskDetailPage.jsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchManagerTaskDetail,
  setInvoiceIssued,
  setWarranty,
  setCashPayment,
  getEquipmentList,
  getWorkTypes
} from "@/api";

export default function ManagerTaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);

  useEffect(() => {
    loadRefs();
    loadTask();
  }, [id]);

  async function loadRefs() {
    try {
      const [eqRes, wtRes] = await Promise.allSettled([
        getEquipmentList(),
        getWorkTypes()
      ]);

      setEquipment(eqRes.status === "fulfilled" ? eqRes.value || [] : []);
      setWorkTypes(wtRes.status === "fulfilled" ? wtRes.value || [] : []);
    } catch (e) {
      console.error("Ошибка загрузки справочников", e);
    }
  }

  async function loadTask() {
    try {
      setLoading(true);
      const data = await fetchManagerTaskDetail(id);
      setTask(data);
    } catch (err) {
      console.error("Ошибка загрузки задачи:", err);
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Не удалось загрузить задачу");
      } else {
        alert("Не удалось загрузить задачу");
      }
      navigate("/manager/tasks");
    } finally {
      setLoading(false);
    }
  }

  const handleStatusChange = async (action) => {
    let message;
    switch(action) {
      case "invoice":
        message = "Вы действительно хотите выставить счёт?";
        break;
      case "warranty":
        message = "Вы действительно хотите установить гарантию?";
        break;
      case "cash":
        message = "Вы действительно хотите установить оплату наличными?";
        break;
      default:
        return;
    }

    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.showConfirm(message, async (confirmed) => {
        if (confirmed) {
          await updateStatus(action);
        }
      });
    } else {
      if (window.confirm(message)) {
        await updateStatus(action);
      }
    }
  };

const getManagerStatusConfig = (status) => {
  const configs = {
    invoice_not_issued: {
      label: "Счет не выставлен",
      color: "#d97706",
      bgColor: "#d9770620"
    },
    invoice_issued: {
      label: "Счет выставлен",
      color: "#16a34a",
      bgColor: "#16a34a20"
    },
    warranty: {
      label: "Гарантия",
      color: "#1d4ed8",
      bgColor: "#1d4ed820"
    },
    cash_payment: {
      label: "Оплата наличными",
      color: "#b91c1c",
      bgColor: "#b91c1c20"
    }
  };
  
  return configs[status] || { label: status, color: "#6b7280", bgColor: "#6b728020" };
};

  async function updateStatus(action) {
    try {
      let result;
      if (action === "invoice") {
        result = await setInvoiceIssued(id);
      } else if (action === "warranty") {
        result = await setWarranty(id);
      } else if (action === "cash") {
        result = await setCashPayment(id);
      }
      
      setTask({ ...task, manager_status: result.manager_status });
      
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("✅ Статус успешно обновлён");
      } else {
        alert("✅ Статус успешно обновлён");
      }
    } catch (err) {
      console.error("Ошибка обновления статуса:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось обновить статус";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`Ошибка: ${errorMsg}`);
      } else {
        alert(`Ошибка: ${errorMsg}`);
      }
    }
  };

  const STATUS_TRANSLATIONS = {
    new: "Создана",
    accepted: "Принята монтажником",
    on_the_road: "Выехал на работу",
    started: "В процессе выполнения",
    on_site: "Прибыл на место",
    completed: "Завершена",
    inspection: "На проверке",
    returned: "Возвращена на доработку",
    archived: "В архиве",
    assigned: "Назначена",
  };

  const MANAGER_STATUS_TRANSLATIONS = {
    invoice_not_issued: "Счет не выставлен",
    invoice_issued: "Счет выставлен",
    warranty: "Гарантия",
    cash_payment: "Оплата наличными",
  };

  function getStatusDisplayName(statusKey) {
    return STATUS_TRANSLATIONS[statusKey] || statusKey || "—";
  }

  function getManagerStatusDisplayName(statusKey) {
    return MANAGER_STATUS_TRANSLATIONS[statusKey] || statusKey || "—";
  }

  // Получение имени оборудования по ID
  function getEquipmentName(equipmentId) {
    const eq = equipment.find(e => e.id === equipmentId);
    return eq ? eq.name : `Оборудование ${equipmentId}`;
  }

  // Получение имени типа работы по ID
  function getWorkTypeName(workTypeId) {
    const wt = workTypes.find(w => w.id === workTypeId);
    return wt ? wt.name : `Работа ${workTypeId}`;
  }

  if (loading) {
    return <div className="logist-main"><div className="empty">Загрузка задачи #{id}...</div></div>;
  }

  if (error) {
    return <div className="logist-main"><div className="error">{error}</div></div>;
  }

  if (!task) {
    return <div className="logist-main"><div className="empty">Задача не найдена</div></div>;
  }

  // Кнопки отображаются только если статус "Счет не выставлен"
  const canChangeStatus = task.manager_status === "invoice_not_issued";

  return (
    <div className="logist-main">
      <div className="page">
        {/* Заголовок с ID задачи и кнопками */}
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              className="icon-button"
              title="Назад"
              onClick={() => navigate(-1)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M3.86 8.753l5.482 4.796c.646.566 1.658.106 1.658-.753V3.204a1 1 0 0 0-1.659-.753l-5.48 4.796a1 1 0 0 0 0 1.506z"/>
              </svg>
            </button>
            <h1 className="page-title">Задача #{task.id}</h1>
          </div>
        </div>

        {/* Кнопки смены статуса */}
{/* Кнопки смены статуса */}
{canChangeStatus && (
  <div style={{ 
    display: 'flex', 
    gap: '12px', 
    flexWrap: 'wrap', 
    marginBottom: '24px',
    marginTop: '-8px'
  }}>
    <button
      className="gradient-button"
      onClick={() => handleStatusChange("invoice")}
      style={{ 
        flex: '1',
        minWidth: '140px',
        background: 'linear-gradient(to right, #16a34a, #acc3b4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      Счёт выставлен
    </button>
    <button
      className="gradient-button"
      onClick={() => handleStatusChange("warranty")}
      style={{ 
        flex: '1',
        minWidth: '140px',
        background: 'linear-gradient(to right, #1d4ed8, #929ec6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      Гарантия
    </button>
    <button
      className="gradient-button"
      onClick={() => handleStatusChange("cash")}
      style={{ 
        flex: '1',
        minWidth: '140px',
        background: 'linear-gradient(to right, #b91c1c, #c2a4a4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      Оплата наличными
    </button>
  </div>
)}

        <div className="task-detail">
          <div className="task-view">
            {/* === КЛИЕНТ === */}
            <div className="task-section">
              <div className="task-section-header">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                  <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <span>Клиент</span>
              </div>
              <div className="task-field">
                <div className="task-field-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  Компания:
                </div>
                <div className="task-field-value">
                  {task.company_name || "—"}
                </div>
              </div>
              <div className="task-field">
                <div className="task-field-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  Контактное лицо:
                </div>
                <div className="task-field-value">
                  {task.contact_person_name || "—"}
                </div>
              </div>
              <div className="task-field">
                <div className="task-field-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                  </svg>
                  Телефон:
                </div>
                <div className="task-field-value phone">
                  {task.contact_person_phone || "—"}
                  {task.contact_person_phone && (
                    <button
                      onClick={() => {
                        const telUrl = `tel:${task.contact_person_phone}`;
                        if (window.Telegram?.WebApp) {
                          window.open(telUrl, "_blank");
                        } else {
                          window.location.href = telUrl;
                        }
                      }}
                    >
                      Позвонить
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* === АДРЕС И СТАТУС === */}
            <div className="task-section">
              <div className="task-section-header">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <span>Адрес и статус</span>
              </div>
              <div className="task-field">
                <div className="task-field-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  Место/Адрес:
                </div>
                <div className="task-field-value">
                  {task.location ? (
                    <a href={`https://2gis.ru/search/${encodeURIComponent(task.location)}`} target="_blank" rel="noopener noreferrer">
                      {task.location}
                    </a>
                  ) : "—"}
                </div>
              </div>
              
              <div className="task-field">
  <div className="task-field-label">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4"></polyline>
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
    </svg>
    Статус задачи:
  </div>
  <div className="task-field-value">
    <span 
      style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: '6px',
        fontSize: '14px',
        fontWeight: '600',
        color: getManagerStatusConfig(task.manager_status).color,
        backgroundColor: getManagerStatusConfig(task.manager_status).bgColor,
        fontFamily: '"Inter", sans-serif',
      }}
    >
      {getManagerStatusConfig(task.manager_status).label}
    </span>
  </div>
</div>
              <div className="task-field">
                <div className="task-field-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  Дата:
                </div>
                <div className="task-field-value">
                  {task.scheduled_at ? new Date(task.scheduled_at).toLocaleString('ru-RU') : "—"}
                </div>
              </div>
            </div>

            {/* === ТРАНСПОРТ === */}
            <div className="task-section">
              <div className="task-section-header">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M4 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0m10 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0M6 8a1 1 0 0 0 0 2h4a1 1 0 1 0 0-2zM4.862 4.276 3.906 6.19a.51.51 0 0 0 .497.731c.91-.073 2.35-.17 3.597-.17s2.688.097 3.597.17a.51.51 0 0 0 .497-.731l-.956-1.913A.5.5 0 0 0 10.691 4H5.309a.5.5 0 0 0-.447.276" />
                  <path d="M2.52 3.515A2.5 2.5 0 0 1 4.82 2h6.362c1 0 1.904.596 2.298 1.515l.792 1.848c.075.175.21.319.38.404.5.25.855.715.965 1.262l.335 1.679q.05.242.049.49v.413c0 .814-.39 1.543-1 1.997V13.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-1.338c-1.292.048-2.745.088-4 .088s-2.708-.04-4-.088V13.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-1.892c-.61-.454-1-1.183-1-1.997v-.413a2.5 2.5 0 0 1 .049-.49l.335-1.68c.11-.546.465-1.012.964-1.261a.8.8 0 0 0 .381-.404l.792-1.848ZM4.82 3a1.5 1.5 0 0 0-1.379.91l-.792 1.847a1.8 1.8 0 0 1-.853.904.8.8 0 0 0-.43.564L1.03 8.904a1.5 1.5 0 0 0-.03.294v.413c0 .796.62 1.448 1.408 1.484 1.555.07 3.786.155 5.592.155s4.037-.084 5.592-.155A1.48 1.48 0 0 0 15 9.611v-.413q0-.148-.03-.294l-.335-1.68a.8.8 0 0 0-.43-.563 1.8 1.8 0 0 1-.853-.904l-.792-1.848A1.5 1.5 0 0 0 11.18 3z" />
                </svg>
                <span>Транспорт</span>
              </div>
              <div className="task-field">
                <div className="task-field-label">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M4 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0m10 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0M6 8a1 1 0 0 0 0 2h4a1 1 0 1 0 0-2zM4.862 4.276 3.906 6.19a.51.51 0 0 0 .497.731c.91-.073 2.35-.17 3.597-.17s2.688.097 3.597.17a.51.51 0 0 0 .497-.731l-.956-1.913A.5.5 0 0 0 10.691 4H5.309a.5.5 0 0 0-.447.276" />
                    <path d="M2.52 3.515A2.5 2.5 0 0 1 4.82 2h6.362c1 0 1.904.596 2.298 1.515l.792 1.848c.075.175.21.319.38.404.5.25.855.715.965 1.262l.335 1.679q.05.242.049.49v.413c0 .814-.39 1.543-1 1.997V13.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-1.338c-1.292.048-2.745.088-4 .088s-2.708-.04-4-.088V13.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-1.892c-.61-.454-1-1.183-1-1.997v-.413a2.5 2.5 0 0 1 .049-.49l.335-1.68c.11-.546.465-1.012.964-1.261a.8.8 0 0 0 .381-.404l.792-1.848ZM4.82 3a1.5 1.5 0 0 0-1.379.91l-.792 1.847a1.8 1.8 0 0 1-.853.904.8.8 0 0 0-.43.564L1.03 8.904a1.5 1.5 0 0 0-.03.294v.413c0 .796.62 1.448 1.408 1.484 1.555.07 3.786.155 5.592.155s4.037-.084 5.592-.155A1.48 1.48 0 0 0 15 9.611v-.413q0-.148-.03-.294l-.335-1.68a.8.8 0 0 0-.43-.563 1.8 1.8 0 0 1-.853-.904l-.792-1.848A1.5 1.5 0 0 0 11.18 3z" />
                  </svg>
                  ТС:
                </div>
                <div className="task-field-value">
                  {task.vehicle_info || "—"}
                </div>
              </div>
              <div className="task-field">
                <div className="task-field-label">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16" />
                    <path d="M11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0" />
                  </svg>
                  Гос. номер:
                </div>
                <div className="task-field-value">
                  {task.gos_number || "—"}
                </div>
              </div>
            </div>

            {/* === ФИНАНСЫ === */}
            <div className="task-section">
  <div className="task-section-header">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="8" y1="3" x2="8" y2="21" />
      <path d="M8 3h6a4 4 0 0 1 0 8H8" />
      <line x1="6" y1="14" x2="14" y2="14" />
      <line x1="6" y1="18" x2="14" y2="18" />
    </svg>
    <span>Цена</span>
  </div>
  <div className="task-field">
    <div className="task-field-label">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="8" y1="3" x2="8" y2="21" />
        <path d="M8 3h6a4 4 0 0 1 0 8H8" />
        <line x1="6" y1="14" x2="14" y2="14" />
        <line x1="6" y1="18" x2="14" y2="18" />
      </svg>
      Цена клиента:
    </div>
    <div className="task-field-value price">
      {task.client_price || "—"} ₽
    </div>
  </div>
  <div className="task-field">
    <div className="task-field-label">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="8" y1="3" x2="8" y2="21" />
        <path d="M8 3h6a4 4 0 0 1 0 8H8" />
        <line x1="6" y1="14" x2="14" y2="14" />
        <line x1="6" y1="18" x2="14" y2="18" />
      </svg>
      Награда монтажнику:
    </div>
    <div className="task-field-value price">
      {task.montajnik_reward || "—"} ₽
    </div>
  </div>
</div>

            {/* === РАБОТА И ОБОРУДОВАНИЕ === */}
            <div className="task-section">
              <div className="task-section-header">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M9.972 2.508a.5.5 0 0 0-.16-.556l-.178-.129a5 5 0 0 0-2.076-.783C6.215.862 4.504 1.229 2.84 3.133H1.786a.5.5 0 0 0-.354.147L.146 4.567a.5.5 0 0 0 0 .706l2.571 2.579a.5.5 0 0 0 .708 0l1.286-1.2a.5.5 0 0 0 .146-.353V5.57l8.387 8.873A.5.5 0 0 0 14 14.5l1.5-1.5a.5.5 0 0 0 .017-.689l-9.129-8.63c.747-.456 1.772-.839 3.112-.839a.5.5 0 0 0 .472-.334"/>
                </svg>
                <span>Работа и оборудование</span>
              </div>
              <div className="task-field">
                <div className="task-field-label">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M9.972 2.508a.5.5 0 0 0-.16-.556l-.178-.129a5 5 0 0 0-2.076-.783C6.215.862 4.504 1.229 2.84 3.133H1.786a.5.5 0 0 0-.354.147L.146 4.567a.5.5 0 0 0 0 .706l2.571 2.579a.5.5 0 0 0 .708 0l1.286-1.2a.5.5 0 0 0 .146-.353V5.57l8.387 8.873A.5.5 0 0 0 14 14.5l1.5-1.5a.5.5 0 0 0 .017-.689l-9.129-8.63c.747-.456 1.772-.839 3.112-.839a.5.5 0 0 0 .472-.334"/>
                  </svg>
                  Оборудование:
                </div>
                <div className="task-field-value">
                  {task.equipment && task.equipment.length > 0 ? (
                    <div className="task-equipment-list">
                      {task.equipment.map((e, index) => (
                        <div key={index} className="task-equipment-item">
                          {getEquipmentName(e.equipment_id)}
                          {e.serial_number && ` (СН: ${e.serial_number})`}
                          {` x${e.quantity}`}
                        </div>
                      ))}
                    </div>
                  ) : "—"}
                </div>
              </div>
              <div className="task-field">
                <div className="task-field-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                  </svg>
                  Виды работ:
                </div>
                <div className="task-field-value">
                  {task.work_types && task.work_types.length > 0 ? (
                    <div className="task-work-types-list">
                      {task.work_types.map((wt, index) => (
                        <div key={index} className="task-work-type-item">
                          {getWorkTypeName(wt.work_type_id)} (x{wt.quantity})
                        </div>
                      ))}
                    </div>
                  ) : "—"}
                </div>
              </div>
              <div className="task-field">
                <div className="task-field-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  Фото обязательно:
                </div>
                <div className="task-field-value">
                  {task.photo_required ? "Да" : "Нет"}
                </div>
              </div>
            </div>

            {/* === МОНТАЖНИК === */}
            <div className="task-field">
              <div className="task-field-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                Монтажник:
              </div>
              <div className="task-field-value">
                {task.assigned_user_name || "—"}
              </div>
            </div>

            {/* === КОММЕНТАРИЙ === */}
            <div className="task-field">
              <div className="task-field-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                Комментарий:
              </div>
              <div className="task-field-value">
                {task.comment || "—"}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}