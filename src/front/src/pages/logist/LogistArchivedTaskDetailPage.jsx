// front/src/pages/logist/LogistArchivedTaskDetailPage.jsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchLogistArchivedTaskDetail, getEquipmentList, getWorkTypes } from "../../api";
import "../../styles/LogistPage.css";

export default function LogistArchivedTaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [equipmentList, setEquipmentList] = useState([]);
  const [workTypesList, setWorkTypesList] = useState([]);

  useEffect(() => {
    loadRefs();
    loadTask();
  }, [id]);

  async function loadRefs() {
    try {
      const [eqRes, wtRes] = await Promise.allSettled([
        getEquipmentList(),
        getWorkTypes(),
      ]);
      setEquipmentList(eqRes.status === 'fulfilled' ? eqRes.value || [] : []);
      setWorkTypesList(wtRes.status === 'fulfilled' ? wtRes.value || [] : []);
    } catch (e) {
      console.error("Ошибка загрузки справочников", e);
    }
  }

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

  function getStatusDisplayName(statusKey) {
    return STATUS_TRANSLATIONS[statusKey] || statusKey || "—";
  }

  const REPORT_APPROVAL_TRANSLATIONS = {
    waiting: "Проверяется",
    approved: "Принято",
    rejected: "Отклонено",
  };

  function getReportApprovalDisplayName(approvalKey) {
    return REPORT_APPROVAL_TRANSLATIONS[approvalKey] || approvalKey || "—";
  }

  async function loadTask() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLogistArchivedTaskDetail(id);
      setTask(data);
    } catch (err) {
      console.error("Ошибка загрузки архивной задачи логиста:", err);
      setError(err.response?.data?.detail || err.message || "Ошибка загрузки задачи");
      if (err.response?.status === 403 || err.response?.status === 404) {
        navigate("/logist/profile");
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="logist-main"><div className="empty">Загрузка архивной задачи #{id}...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;
  if (!task) return <div className="logist-main"><div className="empty">Задача не найдена</div></div>;

  const getEquipmentNameById = (eqId) => {
    const eq = equipmentList.find(e => e.id === eqId);
    return eq ? eq.name : `ID ${eqId}`;
  };

  const getWorkTypeNameById = (wtId) => {
    const wt = workTypesList.find(w => w.id === wtId);
    return wt ? wt.name : `ID ${wtId}`;
  };

  return (
  <div className="logist-main">
    <div className="page">
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
          <h1 className="page-title">Архивная задача #{task.id}</h1>
        </div>
        {/* --- ИКОНКА ИСТОРИИ --- */}
        <button
          className="icon-button"
          title="История изменений"
          onClick={() => navigate(`/logist/tasks/${task.id}/history`)}
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
            <path d="M8.515 1.019A7 7 0 0 0 8 1V0a8 8 0 0 1 .589.022zm2.004.45a7 7 0 0 0-.985-.299l.219-.976q.576.129 1.126.342zm1.37.71a7 7 0 0 0-.439-.27l.493-.87a8 8 0 0 1 .979.654l-.615.789a7 7 0 0 0-.418-.302zm1.834 1.79a7 7 0 0 0-.653-.796l.724-.69q.406.429.747.91zm.744 1.352a7 7 0 0 0-.214-.468l.893-.45a8 8 0 0 1 .45 1.088l-.95.313a7 7 0 0 0-.179-.483m.53 2.507a7 7 0 0 0-.1-1.025l.985-.17q.1.58.116 1.17zm-.131 1.538q.05-.254.081-.51l.993.123a8 8 0 0 1-.23 1.155l-.964-.267q.069-.247.12-.501m-.952 2.379q.276-.436.486-.908l.914.405q-.24.54-.555 1.038zm-.964 1.205q.183-.183.35-.378l.758.653a8 8 0 0 1-.401.432z"/>
            <path d="M8 1a7 7 0 1 0 4.95 11.95l.707.707A8.001 8.001 0 1 1 8 0z"/>
            <path d="M7.5 3a.5.5 0 0 1 .5.5v5.21l3.248 1.856a.5.5 0 0 1-.496.868l-3.5-2A.5.5 0 0 1 7 9V3.5a.5.5 0 0 1 .5-.5"/>
          </svg>
        </button>
      </div>

      <div className="task-detail">
        <div className="task-view">
          {/* === ОСНОВНАЯ ИНФОРМАЦИЯ === */}
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
                      const phone = task.contact_person_phone;
                      const telUrl = `tel:${phone}`;
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
                Статус:
              </div>
              <div className="task-field-value">
                {getStatusDisplayName(task.status)}
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
                {task.scheduled_at ? new Date(task.scheduled_at).toLocaleString() : "—"}
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
                    {task.equipment.map((e, index) => {
                      const eqName = getEquipmentNameById(e.equipment_id);
                      return (
                        <div key={index} className="task-equipment-item">
                          {eqName} x{e.quantity} (СН: {e.serial_number || 'N/A'})
                        </div>
                      );
                    })}
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
                    {task.work_types.map((wt, index) => {
                      const wtName = getWorkTypeNameById(wt.work_type_id);
                      return (
                        <div key={index} className="task-work-type-item">
                          {wtName} x{wt.quantity}
                        </div>
                      );
                    })}
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
              {task.assigned_user_name || task.assigned_user_id || "—"}
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