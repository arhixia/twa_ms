// front/src/pages/tech/TechTaskHistoryPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchTechTaskFullHistory,
  getTechCompaniesList,      // ✅ Новое
  getTechContactPersonsByCompany, // ✅ Новое
  getTechContactPersonPhone, // <--- Новый импорт
} from "../../api";
import "../../styles/LogistPage.css";

export default function TechTaskHistoryPage() {
  const { id } = useParams(); // ID задачи из URL
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState([]); // ✅ Состояние для компаний
  // ✅ Состояние для кэша контактных лиц: { [companyId]: [{id, name}, ...] }
  const [contactPersonsCache, setContactPersonsCache] = useState({});
  // ✅ Состояние для хранения телефонов контактных лиц: { [contactPersonId]: phone }
  const [contactPersonPhonesCache, setContactPersonPhonesCache] = useState({}); // <--- Добавлено

  useEffect(() => {
    loadRefs(); // ✅ Загружаем справочники
    loadHistory();
  }, [id]);

  // ✅ Обновляем loadRefs, чтобы загружать компании
  async function loadRefs() {
    try {
      const companiesData = await getTechCompaniesList(); // ✅ Используем эндпоинт тех.спеца
      setCompanies(companiesData || []);
    } catch (e) {
      console.error("Ошибка загрузки справочников", e);
    }
  }

  async function loadHistory() {
    setLoading(true);
    try {
      const data = await fetchTechTaskFullHistory(id); // Вызываем API функцию для тех.спеца
      setHistory(data || []);
    } catch (err) {
      console.error("Ошибка загрузки истории:", err);
      alert("Ошибка загрузки истории");
      navigate(-1); // Возвращаемся назад при ошибке
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
          // Загружаем их с помощью эндпоинта тех.спеца
          personsForCompany = await getTechContactPersonsByCompany(companyId); // ✅ Используем эндпоинт тех.спеца
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

  // ✅ Новая функция для получения телефона контактного лица по ID
  // Использует useCallback для мемоизации, чтобы не создавать новую функцию на каждый рендер
  const getContactPersonPhoneById = useCallback(
    async (contactPersonId) => {
      if (!contactPersonId) return "—";

      let phone = contactPersonPhonesCache[contactPersonId];

      // Если телефон для этого контактного лица еще не загружен
      if (phone === undefined) { // Проверяем на undefined, так как phone может быть null
        try {
          // Загружаем его с помощью эндпоинта тех.спеца
          const { phone: fetchedPhone } = await getTechContactPersonPhone(contactPersonId); // <--- Вызываем эндпоинт
          phone = fetchedPhone;
          // И обновляем кэш
          setContactPersonPhonesCache((prevCache) => ({
            ...prevCache,
            [contactPersonId]: phone,
          }));
        } catch (error) {
          console.error(`Ошибка загрузки телефона для контактного лица ${contactPersonId}:`, error);
          // В случае ошибки, возвращаем null и кэшируем его
          phone = null;
          setContactPersonPhonesCache((prevCache) => ({
            ...prevCache,
            [contactPersonId]: null,
          }));
        }
      }

      return phone || "—"; // Возвращаем телефон или "—", если он null/undefined
    },
    [contactPersonPhonesCache] // Зависит от кэша
  );


  if (loading) return <div className="logist-main"><div className="empty">Загрузка истории задачи #{id}...</div></div>;
  if (!history.length) return <div className="logist-main"><div className="empty">История задачи #{id} пуста</div></div>;

  return (
    <div className="logist-main">
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
                      {/* ❌ Удаляем строку с клиентом */}
                      {/* <div><b>Клиент:</b> {h.client || "—"}</div> */}
                      
                      {/* ✅ Отображаем имена */}
                      <div><b>Компания:</b> {companyName}</div>
                      {/* ✅ Используем специальный компонент для асинхронного имени контакта */}
                      <ContactNameResolver
                        contactPersonId={h.contact_person_id}
                        companyId={h.company_id}
                        getContactPersonNameById={getContactPersonNameById}
                        
                      />
                      <div>
                        <b>Телефон контактного лица:</b>{" "}
                        {/* ✅ Используем специальный компонент для асинхронного телефона контакта */}
                        <ContactPhoneResolver
                          contactPersonId={h.contact_person_id}
                          getContactPersonPhoneById={getContactPersonPhoneById} // <--- Передаём функцию
                          fallbackPhone={h.contact_person_phone} // <--- Передаём телефон из истории, если есть
                        />
                      </div>
                      <div><b>ТС:</b> {h.vehicle_info || "—"}</div>
                      {/* ===== НОВОЕ ПОЛЕ: ГОС. НОМЕР ===== */}
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
    </div>
  );
}

// ✅ Новый компонент для асинхронного разрешения имени контактного лица
function ContactNameResolver({ contactPersonId, companyId, getContactPersonNameById }) {
  const [contactPersonName, setContactPersonName] = useState("...");

  useEffect(() => {
    let isCancelled = false; // Флаг для предотвращения установки состояния, если компонент размонтирован

    async function resolveName() {
      if (!contactPersonId || !companyId) {
        setContactPersonName("—");
        return;
      }

      try {
        const name = await getContactPersonNameById(contactPersonId, companyId);
        // Устанавливаем имя только если компонент еще смонтирован
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

    // Функция очистки, вызывается при размонтировании компонента
    return () => {
      isCancelled = true;
    };
  }, [contactPersonId, companyId, getContactPersonNameById]); // Перезапускаем, если ID или функция изменятся

  return <div><b>Контакт:</b> {contactPersonName}</div>;
}

// ✅ Новый компонент для асинхронного разрешения телефона контактного лица
function ContactPhoneResolver({ contactPersonId, getContactPersonPhoneById, fallbackPhone }) { // <--- Добавлено
  const [contactPersonPhone, setContactPersonPhone] = useState("...");

  useEffect(() => {
    let isCancelled = false; // Флаг для предотвращения установки состояния, если компонент размонтирован

    async function resolvePhone() {
      if (!contactPersonId) {
        setContactPersonPhone("—");
        return;
      }

      try {
        // Если есть fallbackPhone (например, из истории), используем его
        let phone = fallbackPhone;
        // Иначе загружаем телефон
        if (phone === undefined || phone === null) {
           phone = await getContactPersonPhoneById(contactPersonId);
        }
        // Устанавливаем телефон только если компонент еще смонтирован
        if (!isCancelled) {
          setContactPersonPhone(phone || "—");
        }
      } catch (error) {
        console.error("Ошибка при разрешении телефона контакта:", error);
        if (!isCancelled) {
          setContactPersonPhone(`Контакт ${contactPersonId}`);
        }
      }
    }

    resolvePhone();

    // Функция очистки, вызывается при размонтировании компонента
    return () => {
      isCancelled = true;
    };
  }, [contactPersonId, getContactPersonPhoneById, fallbackPhone]); // Перезапускаем, если ID, функция или fallback изменятся

  // ✅ Отображаем телефон с ссылкой для вызова, если он есть
  return (
    <span>
      {contactPersonPhone}
      {contactPersonPhone && contactPersonPhone !== "—" && contactPersonPhone !== `Контакт ${contactPersonId}` && (
        <a
          href={`tel:${contactPersonPhone}`}
          style={{
            display: 'inline-block',
            marginLeft: '8px',
            fontSize: '0.9em',
            color: '#1e88e5', // Синий цвет
            textDecoration: 'none',
          }}
          onClick={(e) => {
            // Предотвращаем отправку формы, если это внутри label
            e.preventDefault();
            window.location.href = `tel:${contactPersonPhone}`;
          }}
        >
          📞 Позвонить
        </a>
      )}
    </span>
  );
}