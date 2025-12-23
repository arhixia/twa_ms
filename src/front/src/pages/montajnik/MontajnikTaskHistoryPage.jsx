// front/src/pages/montajnik/MontajnikTaskHistoryPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchMontTaskFullHistory,
  getMontCompaniesList,
  getMontContactPersonsByCompany,
} from "../../api";
import "../../styles/LogistPage.css";

export default function MontajnikTaskHistoryPage() {
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
      const companiesData = await getMontCompaniesList();
      setCompanies(companiesData || []);
    } catch (e) {
      console.error("Ошибка загрузки справочников", e);
    }
  }

  async function loadHistory() {
    setLoading(true);
    try {
      const data = await fetchMontTaskFullHistory(id);
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
          personsForCompany = await getMontContactPersonsByCompany(companyId);
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
      // Проверяем, что contactPerson не null/undefined и у него есть name
      return contactPerson && contactPerson.name ? contactPerson.name : `Контакт ${contactPersonId}`;
    },
    [contactPersonsCache]
  );

  if (loading) return <div className="logist-main"><div className="empty">Загрузка истории задачи #{id}...</div></div>;
  if (!history.length) return <div className="logist-main"><div className="empty">История задачи #{id} пуста</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <h1>История задачи #{id}</h1>
            <button className="gradient-button" onClick={() => navigate(-1)}>
              ⬅️ Назад
            </button>
          </div>
        </div>

        <div className="history-list">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
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
                <li key={h.id} style={{ 
                  padding: '16px', 
                  borderBottom: '1px solid var(--border-subtle)',
                  backgroundColor: 'var(--bg-card)',
                  borderRadius: '8px',
                  marginBottom: '8px'
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
                      <b style={{ color: '#e6eef8' }}>{dateStr}</b> — <span style={{ color: '#c9d1d9' }}>{userStr}</span>
                    </div>
                    <div style={{ 
                      fontSize: '0.9em', 
                      color: '#8b949e',
                      flex: '0 0 auto',
                      textAlign: 'right'
                    }}>
                      {eventTypeStr}
                    </div>
                  </div>

                  {/* --- Комментарий --- */}
                  <div style={{ 
                    marginTop: '12px',
                    padding: '8px',
                    backgroundColor: '#161b22',
                    borderRadius: '4px',
                    color: '#e6eef8'
                  }}>
                    <b>Комментарий:</b>
                    {(() => {
                      try {
                        const parsed = JSON.parse(commentStr);
                        if (Array.isArray(parsed)) {
                          return (
                            <ul style={{ margin: '8px 0 0 0', paddingLeft: '16px' }}>
                              {parsed.map((item, idx) => (
                                <li key={idx} style={{ color: '#c9d1d9' }}>
                                  <b>{item.field || item.action || "—"}</b>: "{item.old || "—"}" → "{item.new || "—"}"
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
          </ul>
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
          backgroundColor: '#161b22', 
          borderRadius: '4px', 
          color: '#e6eef8' 
        }}>
          {/* === Адаптивная сетка для полей === */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
            gap: '12px',
            rowGap: '8px'
          }}>
            {/* Основная информация */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <b style={{ marginBottom: '4px', color: '#79c0ff' }}>Компания:</b>
              <span style={{ color: '#c9d1d9' }}>{companyName}</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <b style={{ marginBottom: '4px', color: '#79c0ff' }}>Контакт:</b>
              <ContactNameResolver
                contactPersonId={h.contact_person_id}
                companyId={h.company_id}
                getContactPersonNameById={getContactPersonNameById}
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <b style={{ marginBottom: '4px', color: '#79c0ff' }}>ТС:</b>
              <span style={{ color: '#c9d1d9' }}>{h.vehicle_info || "—"}</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <b style={{ marginBottom: '4px', color: '#79c0ff' }}>Гос. номер:</b>
              <span style={{ color: '#c9d1d9' }}>{h.gos_number || "—"}</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <b style={{ marginBottom: '4px', color: '#79c0ff' }}>Дата:</b>
              <span style={{ color: '#c9d1d9' }}>
                {h.scheduled_at ? new Date(h.scheduled_at).toLocaleString() : "—"}
              </span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <b style={{ marginBottom: '4px', color: '#79c0ff' }}>Место/Адрес:</b>
              <span style={{ color: '#c9d1d9' }}>
                {h.location ? (
                  <a
                    href={`https://2gis.ru/search/${encodeURIComponent(h.location)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#1e88e5',
                      textDecoration: 'none',
                      fontWeight: 'bold'
                    }}
                  >
                    {h.location}
                  </a>
                ) : "—"}
              </span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <b style={{ marginBottom: '4px', color: '#79c0ff' }}>Статус:</b>
              <span style={{ color: '#c9d1d9' }}>{getStatusDisplayName(h.status)}</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <b style={{ marginBottom: '4px', color: '#79c0ff' }}>Монтажник:</b>
              <span style={{ color: '#c9d1d9' }}>{h.assigned_user_name || "—"}</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <b style={{ marginBottom: '4px', color: '#79c0ff' }}>Комментарий:</b>
              <span style={{ color: '#c9d1d9' }}>{h.comment_field || "—"}</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <b style={{ marginBottom: '4px', color: '#79c0ff' }}>Цена клиента:</b>
              <span style={{ color: '#c9d1d9' }}>{h.client_price || "—"}</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <b style={{ marginBottom: '4px', color: '#79c0ff' }}>Награда монтажнику:</b>
              <span style={{ color: '#c9d1d9' }}>{h.montajnik_reward || "—"}</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <b style={{ marginBottom: '4px', color: '#79c0ff' }}>Фото обязательно:</b>
              <span style={{ color: '#c9d1d9' }}>{h.photo_required ? "Да" : "Нет"}</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <b style={{ marginBottom: '4px', color: '#79c0ff' }}>Тип назначения:</b>
              <span style={{ color: '#c9d1d9' }}>
                {h.assignment_type === "broadcast" ? "в эфир" : 
                 h.assignment_type === "individual" ? "персональная" : h.assignment_type || "—"}
              </span>
            </div>

            {/* Оборудование */}
            <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column' }}>
              <b style={{ marginBottom: '4px', color: '#79c0ff' }}>Оборудование:</b>
              <span style={{ color: '#c9d1d9' }}>
                {h.equipment_snapshot && h.equipment_snapshot.length > 0 ? (
                  h.equipment_snapshot.map((e, idx) => (
                    `${e.name}${e.serial_number ? ` (SN: ${e.serial_number})` : ''} x${e.quantity}`
                  )).join(", ")
                ) : "—"}
              </span>
            </div>

            {/* Виды работ */}
            <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column' }}>
              <b style={{ marginBottom: '4px', color: '#79c0ff' }}>Виды работ:</b>
              <span style={{ color: '#c9d1d9' }}>
                {h.work_types_snapshot && h.work_types_snapshot.length > 0 ? (
                  h.work_types_snapshot.map((wt) => (
                    `${wt.name} x${wt.quantity}`
                  )).join(", ")
                ) : "—"}
              </span>
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