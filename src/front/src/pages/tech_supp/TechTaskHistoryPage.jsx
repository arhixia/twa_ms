// front/src/pages/tech/TechTaskHistoryPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchTechTaskFullHistory,
  getTechCompaniesList,
  getTechContactPersonsByCompany,
} from "../../api";
import "../../styles/LogistPage.css";

export default function TechTaskHistoryPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [contactPersonsCache, setContactPersonsCache] = useState({});

  useEffect(() => {
    loadRefs();
    loadHistory();
  }, [id]);

  async function loadRefs() {
    try {
      const companiesData = await getTechCompaniesList();
      setCompanies(companiesData || []);
    } catch (e) {
      console.error("Ошибка загрузки справочников", e);
    }
  }

  async function loadHistory() {
    setLoading(true);
    try {
      const data = await fetchTechTaskFullHistory(id);
      setHistory(data || []);
    } catch (err) {
      console.error("Ошибка загрузки истории:", err);
      alert("Ошибка загрузки истории");
      navigate(-1);
    } finally {
      setLoading(false);
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

  function getCompanyNameById(companyId) {
    if (!companyId) return "—";
    const company = companies.find((c) => c.id === companyId);
    return company ? company.name : `Компания ${companyId}`;
  }

  const getContactPersonNameById = useCallback(
    async (contactPersonId, companyId) => {
      if (!contactPersonId || !companyId) return "—";

      let personsForCompany = contactPersonsCache[companyId];

      if (!personsForCompany) {
        try {
          personsForCompany = await getTechContactPersonsByCompany(companyId);
          setContactPersonsCache((prevCache) => ({
            ...prevCache,
            [companyId]: personsForCompany,
          }));
        } catch (error) {
          console.error(`Ошибка загрузки контактных лиц для компании ${companyId}:`, error);
          return `Контакт ${contactPersonId}`;
        }
      }

      const contactPerson = personsForCompany.find((cp) => cp.id === contactPersonId);
      return contactPerson ? contactPerson.name : `Контакт ${contactPersonId}`;
    },
    [contactPersonsCache]
  );

  if (loading) return <div className="logist-main"><div className="empty">Загрузка истории задачи #{id}...</div></div>;
  if (!history.length) return <div className="logist-main"><div className="empty">История задачи #{id} пуста</div></div>;

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
            <h1 className="page-title">История задачи #{id}</h1>
          </div>
        </div>

        <div className="history-list" style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '24px',
          maxHeight: 'none',
          overflowY: 'visible'
        }}>
          {history.map((h) => {
              let dateStr = "Invalid Date";
              try {
                if (h.timestamp) {
                  dateStr = new Date(h.timestamp).toLocaleString();
                }
              } catch (e) {
                console.warn(`[WARN] Некорректная дата в записи истории ${h.id}:`, h.timestamp);
              }

              const userStr = h.user_name
                ? h.user_name
                : h.user_id
                ? `Пользователь ${h.user_id}`
                : "Система";

              const eventTypeStr = h.event_type || h.action || "—";
              const commentStr = h.comment || "—";

              const companyName = getCompanyNameById(h.company_id);

              return (
                <li key={h.id} className="history-item" style={{ 
                  marginBottom: '0',
                  border: '2px solid var(--border-subtle)',
                  borderRadius: '10px',
                  padding: '16px',
                  minHeight: '120px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  backgroundColor: 'var(--bg-card)',
                }}>
                  {/* --- Заголовок записи истории --- */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '8px'
                  }}>
                    <div style={{ 
                      flex: '1 1 auto',
                      minWidth: '200px'
                    }}>
                      <b style={{ color: '#e6eef8', fontSize: '1.1em' }}>{dateStr}</b> — <span style={{ color: '#c9d1d9', fontSize: '1em' }}>{userStr}</span>
                    </div>
                    <div style={{ 
                      fontSize: '0.9em', 
                      color: '#8b949e',
                      flex: '0 0 auto',
                      textAlign: 'right',
                      padding: '4px 8px',
                      background: 'rgba(16, 185, 129, 0.1)',
                      borderRadius: '6px'
                    }}>
                      {eventTypeStr}
                    </div>
                  </div>

                  {/* --- Комментарий --- */}
                  <div style={{ 
                    marginTop: '12px',
                    padding: '12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '8px',
                    color: '#e6eef8',
                    border: '2px solid rgba(255, 255, 255, 0.08)',
                    flex: 1
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                      </svg>
                      <b>Комментарий</b>
                    </div>
                    {(() => {
                      try {
                        const parsed = JSON.parse(commentStr);
                        if (Array.isArray(parsed)) {
                          return (
                            <ul style={{ margin: '8px 0 0 0', paddingLeft: '16px' }}>
                              {parsed.map((item, idx) => (
                                <li key={idx} style={{ color: '#c9d1d9', marginBottom: '4px' }}>
                                  <b style={{ color: '#79c0ff' }}>{item.field || item.action || "—"}</b>: "{item.old || "—"}" → "{item.new || "—"}"
                                </li>
                              ))}
                            </ul>
                          );
                        } else {
                          return <div style={{ margin: '8px 0 0 0', whiteSpace: 'pre-wrap', color: '#c9d1d9' }}>{commentStr}</div>;
                        }
                      } catch (e) {
                        return <div style={{ margin: '8px 0 0 0', whiteSpace: 'pre-wrap', color: '#c9d1d9' }}>{commentStr}</div>;
                      }
                    })()}
                  </div>

                  {/* --- Состояние задачи (скрытое по умолчанию) --- */}
                  <StateSnapshotSection h={h} companyName={companyName} getContactPersonNameById={getContactPersonNameById} getStatusDisplayName={getStatusDisplayName} />
                </li>
              );
            })}
        </div>
      </div>
    </div>
  );
}

function StateSnapshotSection({ h, companyName, getContactPersonNameById, getStatusDisplayName }) {
  const [expanded, setExpanded] = useState(false);

  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  return (
    <div style={{ marginTop: '12px' }}>
      <button 
        onClick={toggleExpanded} 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
          background: 'none',
          border: 'none',
          color: '#79c0ff',
          cursor: 'pointer',
          fontSize: '1em',
          padding: '0',
          margin: '0'
        }}
      >
        <span style={{ transform: `rotate(${expanded ? '90deg' : '0deg'})`, transition: 'transform 0.2s' }}>▶</span>
        <b>Состояние задачи</b>
      </button>

      {expanded && (
        <div style={{ 
          marginTop: '12px', 
          padding: '12px', 
          backgroundColor: 'rgba(255, 255, 255, 0.03)', 
          borderRadius: '8px', 
          color: '#e6eef8',
          border: '2px solid rgba(255, 255, 255, 0.08)'
        }}>
          {/* === Адаптивная сетка для полей === */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
            gap: '12px',
            rowGap: '8px'
          }}>
            {/* === ОСНОВНАЯ ИНФОРМАЦИЯ === */}
            <div className="task-section" style={{ gridColumn: '1 / -1' }}>
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
                  {companyName}
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
                  <ContactNameResolver
                    contactPersonId={h.contact_person_id}
                    companyId={h.company_id}
                    getContactPersonNameById={getContactPersonNameById}
                  />
                </div>
              </div>
              
              <div className="task-field">
                <div className="task-field-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                  </svg>
                  Телефон:
                </div>
                <div className="task-field-value">
                  {h.contact_person_phone || "—"}
                </div>
              </div>
            </div>

            {/* === АДРЕС И СТАТУС === */}
            <div className="task-section" style={{ gridColumn: '1 / -1' }}>
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
                  {h.location ? (
                    <a href={`https://2gis.ru/search/${encodeURIComponent(h.location)}`} target="_blank" rel="noopener noreferrer">
                      {h.location}
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
                  {getStatusDisplayName(h.status)}
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
                  {h.scheduled_at ? new Date(h.scheduled_at).toLocaleString() : "—"}
                </div>
              </div>
            </div>

            {/* === ФИНАНСЫ === */}
            <div className="task-section" style={{ gridColumn: '1 / -1' }}>
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
                  {h.client_price || "—"} ₽
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
                  {h.montajnik_reward || "—"} ₽
                </div>
              </div>
            </div>

            {/* === РАБОТА И ОБОРУДОВАНИЕ === */}
            <div className="task-section" style={{ gridColumn: '1 / -1' }}>
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
                  {h.equipment_snapshot && h.equipment_snapshot.length > 0 ? (
                    <div className="task-equipment-list">
                      {h.equipment_snapshot.map((e, idx) => (
                        <div key={idx} className="task-equipment-item">
                          {e.name} x{e.quantity} (СН: {e.serial_number || 'N/A'})
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
                  {h.work_types_snapshot && h.work_types_snapshot.length > 0 ? (
                    <div className="task-work-types-list">
                      {h.work_types_snapshot.map((wt, idx) => (
                        <div key={idx} className="task-work-type-item">
                          {wt.name} x{wt.quantity}
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
                  {h.photo_required ? "Да" : "Нет"}
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
                {h.assigned_user_name || h.assigned_user_id || "—"}
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
                {h.comment_field || "—"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ContactNameResolver({ contactPersonId, companyId, getContactPersonNameById }) {
  const [contactPersonName, setContactPersonName] = useState("...");

  useEffect(() => {
    let isCancelled = false;

    async function resolveName() {
      if (!contactPersonId || !companyId) {
        setContactPersonName("—");
        return;
      }

      try {
        const name = await getContactPersonNameById(contactPersonId, companyId);
        if (!isCancelled) {
          setContactPersonName(name);
        }
      } catch (error) {
        console.error("Ошибка при разрешении имени контакта:", error);
        if (!isCancelled) {
          setContactPersonName(`Контакт ${contactPersonId}`);
        }
      }
    }

    resolveName();

    return () => {
      isCancelled = true;
    };
  }, [contactPersonId, companyId, getContactPersonNameById]);

  return (
    <span style={{ color: '#c9d1d9' }}>{contactPersonName}</span>
  );
}