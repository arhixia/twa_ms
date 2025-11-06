// front/src/pages/admin/AdminTaskHistoryPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  adminfetchTaskFullHistory, // Используем админский эндпоинт
  getAdminCompaniesList, // Используем админский эндпоинт
  getAdminContactPersonsByCompany, // Используем админский эндпоинт
  getAdminContactPersonPhone, // Используем админский эндпоинт
} from '../../api'; // Убедитесь, что путь к API корректен
import "../../styles/LogistPage.css"; // Предполагаем, что стили подходят

export default function AdminTaskHistoryPage() {
  const { id } = useParams(); // ID задачи из URL
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState([]); // ✅ Состояние для компаний
  // ✅ Состояние для кэша контактных лиц: { [companyId]: [{id, name}, ...] }
  const [contactPersonsCache, setContactPersonsCache] = useState({});

  useEffect(() => {
    loadRefs(); // ✅ Загружаем справочники
    loadHistory();
  }, [id]);

  async function loadRefs() {
    try {
      const companiesData = await getAdminCompaniesList(); // Админский эндпоинт
      setCompanies(companiesData || []);
    } catch (e) {
      console.error("Ошибка загрузки справочников", e);
    }
  }

  async function loadHistory() {
    setLoading(true);
    try {
      const data = await adminfetchTaskFullHistory(id); // Админский эндпоинт
      setHistory(data || []);
    } catch (err) {
      console.error("Ошибка загрузки истории:", err);
      alert("Ошибка загрузки истории");
      navigate(-1); // Возвращаемся назад
    } finally {
      setLoading(false);
    }
  }

  // ✅ Функция для получения имени компании по ID
  function getCompanyNameById(companyId) {
    if (!companyId) return "—";
    const company = companies.find((c) => c.id === companyId);
    return company ? company.name : `Компания ${companyId}`;
  }

  // ✅ Функция для получения имени контактного лица по ID и Company ID
  // Использует useCallback для мемоизации, чтобы не создавать новую функцию на каждый рендер
  const getContactPersonNameById = useCallback(
    async (contactPersonId, companyId) => {
      if (!contactPersonId || !companyId) return "—";

      let personsForCompany = contactPersonsCache[companyId];

      // Если контактные лица для этой компании еще не загружены
      if (!personsForCompany) {
        try {
          // Загружаем их
          personsForCompany = await getAdminContactPersonsByCompany(companyId); // Админский эндпоинт
          // И обновляем кэш
          setContactPersonsCache((prevCache) => ({
            ...prevCache,
            [companyId]: personsForCompany,
          }));
        } catch (error) {
          console.error(`Ошибка загрузки контактных лиц для компании ${companyId}:`, error);
          // В случае ошибки, возвращаем ID
          return `Контакт ${contactPersonId}`;
        }
      }

      // Ищем контактное лицо в загруженном/закэшированном списке
      const contactPerson = personsForCompany.find((cp) => cp.id === contactPersonId);
      return contactPerson ? contactPerson.name : `Контакт ${contactPersonId}`;
    },
    [contactPersonsCache] // Зависит от кэша
  );

  if (loading) return <div className="page">Загрузка истории задачи #{id}...</div>;
  if (!history.length) return <div className="page">История задачи #{id} пуста</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>История задачи #{id}</h1>
        <button className="add-btn" onClick={() => navigate(-1)}>
          ⬅️ Назад
        </button>
      </div>

      <div className="history-list">
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {history.map((h) => {
            // --- Безопасное извлечение даты ---
            let dateStr = "Invalid Date";
            try {
              if (h.timestamp) {
                dateStr = new Date(h.timestamp).toLocaleString();
              }
            } catch (e) {
              console.warn(`[WARN] Некорректная дата в записи истории ${h.id}:`, h.timestamp);
            }

            // --- Безопасное извлечение пользователя ---
            const userStr = h.user_id ? `Пользователь ${h.user_id}` : "Система";

            // --- Безопасное извлечение типа события ---
            const eventTypeStr = h.event_type || h.action || "—";

            // --- Безопасное извлечение комментария ---
            const commentStr = h.comment || "—";

            // --- Безопасное извлечение поля ---
            const fieldNameStr = h.field_name || "—";
            const oldValueStr = h.old_value || "—";
            const newValueStr = h.new_value || "—";

            // --- Безопасное извлечение связанной сущности ---
            const relatedEntityTypeStr = h.related_entity_type || "—";
            const relatedEntityIdStr = h.related_entity_id || "—";

            // ✅ Получаем имена
            const companyName = getCompanyNameById(h.company_id);
            // Для имени контакта нам нужна асинхронная операция, поэтому пока покажем ID или заглушку
            // Фактическое имя будет установлено внутри компонента ContactNameResolver

            return (
              <li key={h.id} style={{ padding: '16px 0', borderBottom: '1px solid #eee' }}>
                {/* --- Заголовок записи истории --- */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <b>{dateStr}</b> — {userStr}
                  </div>
                  <div style={{ fontSize: '0.9em', color: '#888' }}>
                    {eventTypeStr}
                  </div>
                </div>

                {/* --- Комментарий --- */}
                <div style={{ marginTop: '8px' }}>
                  <b>Комментарий:</b>
                  {(() => {
                    try {
                      // Попробуем распарсить JSON
                      const parsed = JSON.parse(commentStr);
                      if (Array.isArray(parsed)) {
                        return (
                          <ul style={{ margin: 0, paddingLeft: '16px' }}>
                            {parsed.map((item, idx) => (
                              <li key={idx}>
                                <b>{item.field || item.action || "—"}</b>: "{item.old || "—"}" → "{item.new || "—"}"
                              </li>
                            ))}
                          </ul>
                        );
                      } else {
                        return <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{commentStr}</pre>;
                      }
                    } catch (e) {
                      // Если не JSON — просто текст
                      return <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{commentStr}</pre>;
                    }
                  })()}
                </div>

                {/* --- Изменённое поле (если есть) --- */}
                {(h.field_name || h.old_value || h.new_value) && (
                  <div style={{ marginTop: '8px', fontSize: '0.9em' }}>
                    <b>Поле:</b> {fieldNameStr} | <b>Старое:</b> {oldValueStr} | <b>Новое:</b> {newValueStr}
                  </div>
                )}

                {/* --- Связанная сущность (если есть) --- */}
                {(h.related_entity_type || h.related_entity_id) && (
                  <div style={{ marginTop: '4px', fontSize: '0.9em' }}>
                    <b>Сущность:</b> {relatedEntityTypeStr} (ID: {relatedEntityIdStr})
                  </div>
                )}

                {/* --- Все поля задачи на момент события --- */}
                <div style={{ marginTop: '12px', padding: '8px', backgroundColor: '#161b22', borderRadius: '4px', color: '#e6eef8' }}>
                  <b>Состояние задачи:</b>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '4px' }}>
                    {/* ✅ Отображаем имена */}
                    <div><b>Компания:</b> {companyName}</div>
                    {/* ✅ Используем специальный компонент для асинхронного имени и телефона контакта */}
                    <ContactNameResolver
                      contactPersonId={h.contact_person_id}
                      companyId={h.company_id}
                      getContactPersonNameById={getContactPersonNameById}
                      contactPersonPhone={h.contact_person_phone} // <--- Передаем телефон из истории
                    />
                    <div><b>ТС:</b> {h.vehicle_info || "—"}</div>
                    {/* ===== НОВОЕ ПОЛЕ: Гос. номер ===== */}
                    <div><b>Гос. номер:</b> {h.gos_number || "—"}</div>
                    <div><b>Дата:</b> {h.scheduled_at ? new Date(h.scheduled_at).toLocaleString() : "—"}</div>
                    <div><b>Место:</b> {h.location || "—"}</div>
                    <div><b>Статус:</b> {h.status || "—"}</div>
                    <div><b>Монтажник:</b> {h.assigned_user_id || "—"}</div>
                    <div><b>Комментарий:</b> {h.comment_field || "—"}</div>
                    <div><b>Цена клиента:</b> {h.client_price || "—"}</div>
                    <div><b>Награда монтажнику:</b> {h.montajnik_reward || "—"}</div>
                    <div><b>Фото обязательно:</b> {h.photo_required ? "Да" : "Нет"}</div>
                    <div><b>Тип назначения:</b> {h.assignment_type || "—"}</div>
                    {/* ===== Оборудование (отображение) ===== */}
                    <div style={{ gridColumn: '1 / -1' }}> {/* Занимает всю ширину */}
                      <b>Оборудование:</b> {" "}
                      {h.equipment_snapshot && h.equipment_snapshot.length > 0 ? (
                        h.equipment_snapshot.map((e, idx) => (
                           // e - это объект { name, serial_number, quantity }
                          `${e.name}${e.serial_number ? ` (SN: ${e.serial_number})` : ''} x${e.quantity}`
                        )).join(", ")
                      ) : "—"}
                    </div>
                    {/* ===== Виды работ (из снимка) ===== */}
                    <div style={{ gridColumn: '1 / -1' }}> {/* Занимает всю ширину */}
                      <b>Виды работ:</b> {" "}
                      {h.work_types_snapshot && h.work_types_snapshot.length > 0 ? (
                         h.work_types_snapshot.map((wt) => (
                            // wt - это объект { name, quantity }
                            `${wt.name} x${wt.quantity}`
                        )).join(", ")
                      ) : "—"}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ✅ Новый компонент для асинхронного разрешения имени и телефона контактного лица
// (Код компонента остается без изменений, только импорты админские)
function ContactNameResolver({ contactPersonId, companyId, getContactPersonNameById, contactPersonPhone }) {
  const [contactPersonName, setContactPersonName] = useState("...");
  const [resolvedPhone, setResolvedPhone] = useState(contactPersonPhone || null); // <--- Состояние для телефона

  useEffect(() => {
    let isCancelled = false; // Флаг для предотвращения установки состояния, если компонент размонтирован

    async function resolveName() {
      if (!contactPersonId || !companyId) {
        setContactPersonName("—");
        // Если контактное лицо или компания не указаны, сбрасываем телефон
        if (!isCancelled) {
            setResolvedPhone(null);
        }
        return;
      }

      try {
        const name = await getContactPersonNameById(contactPersonId, companyId);
        // Устанавливаем имя только если компонент еще смонтирован
        if (!isCancelled) {
          setContactPersonName(name);
        }
         // Если телефон не пришел из props, попробуем загрузить его
        if (!contactPersonPhone) {
            try {
                const { phone } = await getAdminContactPersonPhone(contactPersonId); // <--- Вызываем админский эндпоинт
                if (!isCancelled) {
                   setResolvedPhone(phone); // <--- Устанавливаем загруженный телефон
                }
            } catch (phoneError) {
                console.error("Ошибка загрузки телефона контактного лица в истории:", phoneError);
                if (!isCancelled) {
                    setResolvedPhone(null); // <--- Сброс при ошибке
                }
            }
        } else {
            // Если телефон пришел из props, используем его
            if (!isCancelled) {
                setResolvedPhone(contactPersonPhone);
            }
        }
      } catch (error) {
        console.error("Ошибка при разрешении имени контакта:", error);
        if (!isCancelled) {
          setContactPersonName(`Контакт ${contactPersonId}`);
          // Также сбрасываем телефон при ошибке имени
          setResolvedPhone(null);
        }
      }
    }

    resolveName();

    // Функция очистки, вызывается при размонтировании компонента
    return () => {
      isCancelled = true;
    };
  }, [contactPersonId, companyId, getContactPersonNameById, contactPersonPhone]); // Перезапускаем, если ID, функция или телефон из props изменятся

  return (
   <div>
      <b>Контакт:</b> {contactPersonName}
      {/* ===== НОВОЕ ПОЛЕ: Телефон контактного лица (в истории) ===== */}
      {resolvedPhone && ( // <--- Отображаем телефон, если он есть
        <span>
          {" "}
          (<a href={`tel:${resolvedPhone}`} style={{ color: '#1e88e5', textDecoration: 'none' }}>{resolvedPhone}</a>) {/* <--- Ссылка для вызова */}
        </span>
      )}
    </div>
  );
}