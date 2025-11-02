// front/src/pages/admin/TaskDetailPage.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  adminGetTaskById,
  adminUpdateTask,
  getEquipmentList,
  getWorkTypes,
  getAdminCompaniesList,      // ✅ Новое
  getAdminContactPersonsByCompany, // ✅ Новое
  getAdminContactPersonPhone, // <--- Новый импорт
} from '../../api';
import "../../styles/LogistPage.css";

export default function AdminTaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({}); // Используем form для хранения данных при редактировании
  const [loading, setLoading] = useState(false);
  const [equipment, setEquipment] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  const [companies, setCompanies] = useState([]); // ✅ Новое
  const [contactPersons, setContactPersons] = useState([]); // ✅ Новое
  // ✅ Состояние для хранения телефона контактного лица в режиме просмотра
  const [contactPersonPhone, setContactPersonPhone] = useState(null); // <--- Добавлено
  // ✅ Состояние для загрузки телефона в режиме редактирования
  const [loadingPhone, setLoadingPhone] = useState(false); // <--- Добавлено

  useEffect(() => {
    loadRefs();
    loadTask();
  }, [id]);

  async function loadRefs() {
    try {
      const eq = await getEquipmentList();
      const wt = await getWorkTypes();
      const companies = await getAdminCompaniesList(); // ✅ Новое
      setEquipment(eq || []);
      setWorkTypes(wt || []);
      setCompanies(companies || []);
    } catch (e) {
      console.error("Ошибка загрузки справочников", e);
    }
  }

  async function loadTask() {
    setLoading(true);
    try {
      const data = await adminGetTaskById(id);

      // --- НОВАЯ ЛОГИКА ОБРАБОТКИ equipment и work_types (аналогично TaskDetailPage.jsx) ---
      // equipment: массив объектов {equipment_id, serial_number, quantity}
      const processedEquipment = (data.equipment || []).map(e => ({
        equipment_id: e.equipment_id,
        serial_number: e.serial_number || "",
        quantity: e.quantity || 1,
      }));

      // work_types: для отображения в task-view нужен массив объектов { work_type_id, quantity }
      // data.work_types уже содержит объекты с work_type_id и quantity
      const processedWorkTypesForView = (data.work_types || []).map(wt => ({
        work_type_id: wt.work_type_id,
        quantity: wt.quantity
      }));

      const t = {
        ...data,
        // Оборудование: массив объектов {equipment_id, serial_number, quantity}
        equipment: processedEquipment,
        // Заменяем оригинальный work_types на обработанный (уже правильный)
        work_types: processedWorkTypesForView,
        history: data.history || [],
        reports: data.reports || [],
        attachments: data.attachments || [],
      };

      setTask(t);

      // --- ИНИЦИАЛИЗАoА form ДЛЯ РЕДАКТИРОВАНИЯ ---
      // equipment: массив объектов { equipment_id, serial_number }
      const formEquipment = t.equipment.map(e => ({
        equipment_id: e.equipment_id,
        serial_number: e.serial_number,
      }));

      // work_types_ids: плоский массив ID, как в AddTaskModal (для логики добавления/удаления)
      const formWorkTypesIds = [];
      processedWorkTypesForView.forEach(item => {
        for (let i = 0; i < item.quantity; i++) {
          formWorkTypesIds.push(item.work_type_id);
        }
      });

      const initialForm = {
        ...t,
        equipment: formEquipment,
        work_types_ids: formWorkTypesIds, // используем плоский массив
        // ✅ Инициализируем contact_person_phone в форме
        contact_person_phone: t.contact_person_phone || null, // <--- Добавлено
      };

      setForm(initialForm);

      // --- ЗАГРУЗКА ТЕЛЕФОНА КОНТАКТНОГО ЛИЦА ДЛЯ РЕЖИМА ПРОСМОТРА ---
      // Если contact_person_id есть, но contact_person_phone нет в данных задачи, загрузим его
      if (t.contact_person_id && !t.contact_person_phone) {
         try {
            const { phone } = await getAdminContactPersonPhone(t.contact_person_id); // <--- Вызываем эндпоинт админа
            setContactPersonPhone(phone); // <--- Устанавливаем телефон для просмотра
            // t.contact_person_phone = phone; // <--- Опционально: можно обновить и в task
         } catch (err) {
            console.error("Ошибка загрузки телефона при инициализации задачи:", err);
            setContactPersonPhone(null); // <--- Сброс при ошибке
         }
      } else {
        // Если телефон уже есть в data или contact_person_id отсутствует
        setContactPersonPhone(t.contact_person_phone || null);
      }

      // --- ЗАГРУЗКА КОНТАКТНЫХ ЛИЦ ДЛЯ КОМПАНИИ ЗАДАЧИ ---
      if (initialForm.company_id) {
        try {
          const contacts = await getAdminContactPersonsByCompany(initialForm.company_id); // <--- Вызываем эндпоинт админа
          setContactPersons(contacts || []);
        } catch (e) {
          console.error("Ошибка загрузки контактных лиц при инициализации задачи:", e);
          setContactPersons([]);
        }
      } else {
        setContactPersons([]);
      }
    } catch (err) {
      console.error("Ошибка загрузки задачи:", err);
      alert("Ошибка загрузки задачи");
    } finally {
      setLoading(false);
    }
  }

  function setField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // ✅ Загрузка контактных лиц при выборе компании в форме редактирования
  async function handleCompanyChangeForForm(companyId) { // <--- Переименовано для ясности
    if (!companyId) {
      setContactPersons([]);
      setField("contact_person_id", null);
      // ✅ Сбрасываем телефон
      setField("contact_person_phone", null); // <--- Добавлено
      return;
    }
    try {
      setLoadingPhone(true); // <--- Используем для индикатора загрузки
      const contacts = await getAdminContactPersonsByCompany(companyId); // <--- Вызываем эндпоинт админа
      setContactPersons(contacts || []);
      // Сбрасываем выбор контактного лица при смене компании
      setField("contact_person_id", null);
      // ✅ Сбрасываем телефон
      setField("contact_person_phone", null); // <--- Добавлено
    } catch (e) {
      console.error("Ошибка загрузки контактных лиц:", e);
      setContactPersons([]);
      setField("contact_person_id", null);
      // ✅ Сбрасываем телефон
      setField("contact_person_phone", null); // <--- Добавлено
      alert("Ошибка загрузки контактных лиц");
    } finally {
      setLoadingPhone(false); // <--- Скрываем индикатор
    }
  }

  // ✅ Новая функция для загрузки телефона контактного лица в форме редактирования
  async function handleContactPersonChangeForForm(contactPersonId) { // <--- Добавлено
    const val = contactPersonId ? parseInt(contactPersonId, 10) : null;
    setField("contact_person_id", val);

    if (val) {
      setLoadingPhone(true); // <--- Показываем индикатор загрузки
      try {
        const { phone } = await getAdminContactPersonPhone(val); // <--- Вызываем эндпоинт админа
        setField("contact_person_phone", phone); // <--- Устанавливаем телефон
      } catch (e) {
        console.error("Ошибка загрузки телефона контактного лица:", e);
        setField("contact_person_phone", null); // <--- Сброс при ошибке
      } finally {
        setLoadingPhone(false); // <--- Скрываем индикатор
      }
    } else {
      setField("contact_person_phone", null); // <--- Сброс если нет выбора
    }
  }

  // --- НОВАЯ ЛОГИКА ДЛЯ РАБОТЫ С ОБОРУДОВАНИЕМ (аналогично AddTaskModal) ---
  function addEquipmentItemToForm(equipmentId) {
    if (!equipmentId) return;
    const eq = equipment.find(e => e.id === equipmentId);
    if (!eq) return;

    const newItem = {
      equipment_id: equipmentId,
      serial_number: "", // ✅ Начальное пустое значение
    };
    setField("equipment", [...(form.equipment || []), newItem]);
  }

  function updateEquipmentItemInForm(index, field, value) {
    setForm((prevForm) => {
      const updatedEquipment = [...(prevForm.equipment || [])];
      if (updatedEquipment[index]) {
        updatedEquipment[index] = { ...updatedEquipment[index], [field]: value };
        return { ...prevForm, equipment: updatedEquipment };
      }
      return prevForm;
    });
  }

  function removeEquipmentItemFromForm(index) {
    setForm((prevForm) => ({
      ...prevForm,
      equipment: prevForm.equipment.filter((_, i) => i !== index),
    }));
  }

  // --- НОВАЯ ЛОГИКА ДЛЯ РАБОТЫ С ТИПАМИ РАБОТ (аналогично AddTaskModal) ---
  function addWorkTypeItemToForm(workTypeId) {
    if (!workTypeId) return;
    setForm((prevForm) => ({
      ...prevForm,
      work_types_ids: [...(prevForm.work_types_ids || []), workTypeId],
    }));
  }

  function removeWorkTypeItemFromForm(workTypeId) {
    setForm((prevForm) => {
      const indexToRemove = (prevForm.work_types_ids || []).indexOf(workTypeId);
      if (indexToRemove !== -1) {
        const updatedWorkTypes = [...(prevForm.work_types_ids || [])];
        updatedWorkTypes.splice(indexToRemove, 1);
        return { ...prevForm, work_types_ids: updatedWorkTypes };
      }
      return prevForm;
    });
  }

  async function saveEdit() {
    try {
      const payload = {
        ...form,
        equipment: form.equipment || [],
        work_types: form.work_types_ids || [], // Отправляем плоский массив ID
        client_price: undefined,
        montajnik_reward: undefined,
        gos_number: form.gos_number || null,
        // ❌ contact_person_phone не отправляем, сервер сам его возьмёт по contact_person_id
        contact_person_phone: undefined, // <--- Добавлено для ясности
      };
      await adminUpdateTask(id, payload);
      alert("✅ Изменения сохранены");
      setEdit(false);
      loadTask(); // Перезагружаем задачу
    } catch (err) {
      console.error(err);
      alert("Ошибка при сохранении");
    }
  }

  function handleUploaded(file) {
    setField("attachments", [...(form.attachments || []), file]);
  }

  if (loading)
    return (
      <div className="page">
        <h1>Задача #{id}</h1>Загрузка...
      </div>
    );
  if (!task)
    return (
      <div className="page">
        <h1>Задача не найдена</h1>
      </div>
    );

  return (
    <div className="page">
      <div className="page-header">
        <h1>Задача #{task.id}</h1>
        {!edit ? (
          <button className="add-btn" onClick={() => setEdit(true)}>
            ✏️ Редактировать
          </button>
        ) : (
          <>
            <button className="add-btn" onClick={saveEdit}>
              💾 Сохранить
            </button>
            <button className="add-btn" onClick={() => setEdit(false)}>
              ❌ Отмена
            </button>
          </>
        )}
      </div>

      <div className="task-detail">
        {edit ? (
          <div className="form-grid">
            {/* ===== Компания ===== */}
            <label>
              Компания
              <select
                value={form.company_id || ""}
                onChange={(e) => {
                  const val = e.target.value ? parseInt(e.target.value, 10) : null;
                  setField("company_id", val);
                  if (val) {
                    handleCompanyChangeForForm(val); // <--- Используем новую функцию
                  } else {
                    setContactPersons([]);
                    setField("contact_person_id", null);
                    // ✅ Сбрасываем телефон
                    setField("contact_person_phone", null); // <--- Добавлено
                  }
                }}
              >
                <option value="">Выберите компанию</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>

            {/* ===== Контактное лицо ===== */}
            <label>
              Контактное лицо
              <select
                value={form.contact_person_id || ""}
                // ✅ Используем новую функцию
                onChange={(e) => handleContactPersonChangeForForm(e.target.value)} // <--- Изменено
                disabled={!form.company_id} // доступно только если выбрана компания
              >
                <option value="">Выберите контактное лицо</option>
                {contactPersons.map(cp => (
                  <option key={cp.id} value={cp.id}>{cp.name}</option>
                ))}
              </select>
              {/* ✅ Индикатор загрузки телефона */}
              {loadingPhone && <span style={{ fontSize: '0.8em', color: '#888' }}>Загрузка телефона...</span>} {/* <--- Добавлено */}
            </label>

            {/* ===== НОВОЕ ПОЛЕ: ТЕЛЕФОН КОНТАКТНОГО ЛИЦА (в режиме редактирования) ===== */}
            <label>
              Телефон контактного лица
              <input
                type="text"
                value={form.contact_person_phone || ""}
                // ✅ Поле только для чтения, заполняется автоматически
                readOnly // <--- Изменено с disabled на readOnly
                placeholder="Выберите контактное лицо"
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                  backgroundColor: "#e0e0e0", // Светло-серый фон для readonly
                  color: "#333",
                  cursor: "not-allowed", // Курсор "запрещено"
                }}
              />
              {/* ✅ Ссылка для вызова, если телефон есть */}
              {form.contact_person_phone && ( // <--- Добавлено
                <a
                  href={`tel:${form.contact_person_phone}`}
                  style={{
                    display: 'inline-block',
                    marginTop: '4px',
                    fontSize: '0.9em',
                    color: '#1e88e5', // Синий цвет
                    textDecoration: 'none',
                  }}
                  onClick={(e) => {
                    // Предотвращаем отправку формы, если это внутри label
                    e.preventDefault();
                    window.location.href = `tel:${form.contact_person_phone}`;
                  }}
                >
                  📞 Позвонить
                </a>
              )}
            </label>

            <label>
              ТС
              <input value={form.vehicle_info || ""} onChange={(e) => setField("vehicle_info", e.target.value)} />
            </label>

            {/* ===== НОВОЕ ПОЛЕ: ГОС. НОМЕР ===== */}
            <label>
              Гос. номер
              <input value={form.gos_number || ""} onChange={(e) => setField("gos_number", e.target.value)} />
            </label>

            <label>
              Дата/время
              <input type="datetime-local" value={form.scheduled_at || ""} onChange={(e) => setField("scheduled_at", e.target.value)} />
            </label>
            <label className="full-row">
              Место
              <textarea value={form.location || ""} onChange={(e) => setField("location", e.target.value)} />
            </label>
            <label className="full-row">
              Комментарий
              <textarea value={form.comment || ""} onChange={(e) => setField("comment", e.target.value)} />
            </label>
            <label>
              Монтажник (ID)
              <input
                type="number"
                value={form.assigned_user_id || ""}
                onChange={(e) => setField("assigned_user_id", e.target.value)}
              />
            </label>
            {/* Цены — только для отображения, не редактируются */}
            <label>
              Цена клиента
              <input value="" disabled placeholder="Рассчитывается автоматически" />
            </label>
            <label>
              Награда монтажнику
              <input value="" disabled placeholder="Рассчитывается автоматически" />
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.photo_required || false}
                onChange={(e) => setField("photo_required", e.target.checked)}
              />{" "}
              Фото обязательно
            </label>

            {/* ===== Оборудование (новая логика) ===== */}
             <label>Оборудование</label>

            {/* --- Список выбранных элементов (название - поле серийного номера) --- */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '10px' }}>
              {/* ✅ Итерируемся по массиву form.equipment и используем index */}
              {form.equipment.map((item, index) => { 
                const eq = equipment.find((e) => e.id === item.equipment_id);
                return (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}> {/* ✅ Ключ - index */}
                    {/* Название оборудования */}
                    <div style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#e0e0e0' }}>
                      {eq?.name || `ID ${item.equipment_id}`}
                    </div>
                    {/* Поле ввода серийного номера */}
                    <div style={{ flex: 1 }}>
                      <input
                        type="text"
                        placeholder="Серийный номер"
                        value={item.serial_number || ""}
                
                        onChange={(e) => updateEquipmentItemInForm(index, "serial_number", e.target.value)} 
                        style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                      />
                    </div>
                    {/* Кнопка удаления (удаляет конкретную строку/единицу) */}
                    <button
                      type="button"
               
                      onClick={() => removeEquipmentItemFromForm(index)} 
                      style={{ padding: '8px', backgroundColor: 'red', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>

            {/* --- Выбор нового оборудования из списка --- */}
            <select
              size={5}
              value=""
              onChange={(e) => {
                const val = Number(e.target.value);
                if (!isNaN(val) && val > 0) {
                  {/* ✅ Добавляем по equipment_id, без проверки на дубликаты */}
                  addEquipmentItemToForm(val); 
                }
                e.target.value = ""; // Сброс для возможности повторного выбора
              }}
              style={{ width: "100%" }}
            >
              {/* ❌ УБИРАЕМ фильтрацию по уже выбранным equipment_id */}
              {/* {equipment
                .filter(eq => !form.equipment.some(item => item.equipment_id === eq.id))
                .map((eq) => ( */}
              {/* ✅ ОТОБРАЖАЕМ ВЕСЬ СПИСОК ОБОРУДОВАНИЯ */}
              {equipment.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name}
                </option>
              ))}
            </select>

            {/* ===== Виды работ (новая логика) ===== */}
             <label>Виды работ</label>
            {/* --- Отображение выбранных типов работ с количеством --- */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              {/* ✅ Используем useMemo или вычисляем counts прямо здесь для отображения */}
              {(() => {
                const counts = {};
                form.work_types_ids.forEach(id => {
                  counts[id] = (counts[id] || 0) + 1;
                });
                // Преобразуем в массив уникальных ID с количествами
                const uniqueWorkTypesWithCounts = Object.entries(counts).map(([id, count]) => ({
                  id: parseInt(id, 10),
                  count,
                }));

                return uniqueWorkTypesWithCounts.map(({ id, count }) => {
                  const wt = workTypes.find((w) => w.id === id);
                  if (!wt) return null;
                  return (
                    <div
                      key={id} 
                      style={{
                        padding: "4px 8px",
                        border: "1px solid #ccc",
                        borderRadius: 12,
                        backgroundColor: "#2196f3",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {wt.name} (x{count}) {/* ✅ Отображаем название и количество */}
                      <span
                        style={{ cursor: "pointer" }}
                        onClick={() => removeWorkTypeItemFromForm(id)} 
                      >
                        ×
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
            {/* --- Выбор нового типа работы из списка --- */}
            <select
              size={5}
              value=""
              onChange={(e) => {
                const val = Number(e.target.value);
                if (!isNaN(val) && val > 0) {
                  addWorkTypeItemToForm(val); {/* ✅ Добавляем по work_type_id */}
                }
                e.target.value = ""; // Сброс
              }}
              style={{ width: "100%" }}
            >
              {/* ❌ УБИРАЕМ фильтрацию по уже выбранным work_type_id */}
              {/* {workTypes
                .filter(wt => !form.work_types_ids.includes(wt.id))
                .map((wt) => ( */}
              {/* ✅ ОТОБРАЖАЕМ ВЕСЬ СПИСОК ТИПОВ РАБОТ */}
              {workTypes.map((wt) => (
                <option key={wt.id} value={wt.id}>
                  {wt.name}
                </option>
              ))}
            </select>

          </div>
        ) : (
          <div className="task-view">
            <p><b>Компания:</b> {task.company_name || "—"}</p>
            <p><b>Контактное лицо:</b> {task.contact_person_name || "—"}</p>
            {/* ===== НОВОЕ ПОЛЕ: ТЕЛЕФОН КОНТАКТНОГО ЛИЦА (в режиме просмотра) ===== */}
            <p>
              <b>Телефон контактного лица:</b>{" "}
              {contactPersonPhone || task.contact_person_phone || "—"} {/* <--- Используем загруженный или из задачи */}
              {/* ✅ Ссылка для вызова, если телефон есть */}
              {(contactPersonPhone || task.contact_person_phone) && ( // <--- Добавлено
                <a
                  href={`tel:${contactPersonPhone || task.contact_person_phone}`}
                  style={{
                    display: 'inline-block',
                    marginLeft: '8px',
                    fontSize: '0.9em',
                    color: '#1e88e5', // Синий цвет
                    textDecoration: 'none',
                  }}
                >
                  📞 Позвонить
                </a>
              )}
            </p>
            <p><b>ТС:</b> {task.vehicle_info || "—"}</p>
            {/* ===== НОВОЕ ПОЛЕ: ГОС. НОМЕР ===== */}
            <p><b>Гос. номер:</b> {task.gos_number || "—"}</p>
            <p><b>Дата:</b> {task.scheduled_at ? new Date(task.scheduled_at).toLocaleString() : "—"}</p>
            <p><b>Место:</b> {task.location || "—"}</p>
            <p><b>Статус:</b> {task.status || "—"}</p>
            <p><b>Монтажник:</b> {task.assigned_user_id || "—"}</p>
            <p><b>Комментарий:</b> {task.comment || "—"}</p>
            <p><b>Цена клиента:</b> {task.client_price || "—"}</p>
            <p><b>Награда монтажнику:</b> {task.montajnik_reward || "—"}</p>
            <p><b>Фото обязательно:</b> {task.photo_required ? "Да" : "Нет"}</p>
            <p>
              <b>Оборудование:</b>{" "}
              {(task.equipment || [])
                .map((e) => {
                  const eqName = equipment.find((eq) => eq.id === e.equipment_id)?.name;
                  // ✅ Отображаем serial_number и quantity
                  return `${eqName || e.equipment_id}${e.serial_number ? ` (SN: ${e.serial_number})` : ''} x${e.quantity}`;
                })
                .join(", ") || "—"}
            </p>

            {/* ===== ИЗМЕНЁННОЕ ОТОБРАЖЕНИЕ ВИДОВ РАБОТ (После изменений бэкенда) ===== */}
            <p>
              <b>Виды работ:</b>{" "}
              {task.work_types && task.work_types.length > 0 ? (
                task.work_types.map(wt => {
                  const wtObj = workTypes.find((w) => w.id === wt.work_type_id);
                  const name = wtObj?.name || wt.work_type_id;
                  const count = wt.quantity || 1; // Берём quantity из объекта
                  return `${name} (x${count})`;
                }).join(", ")
              ) : "—"}
            </p>

            <div>
              <b>Вложения:</b>
              <div className="attached-list" style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {(task.attachments || []).map((a, index) => {
                  let src = "";
                  let key = `attachment-${index}`;

                  if (a && typeof a === "object") {
                    if (a.url && typeof a.url === "string" && (a.url.startsWith("http://") || a.url.startsWith("https://"))) {
                      src = a.url;
                    } else if (a.storage_key && typeof a.storage_key === "string") {
                      src = `${import.meta.env.VITE_API_URL}/attachments/${a.storage_key}`;
                    }
                    key = a.id ? `id-${a.id}` : a.storage_key ? `sk-${a.storage_key}` : `index-${index}`;
                  } else if (typeof a === "string") {
                    src = `${import.meta.env.VITE_API_URL}/attachments/${a}`;
                    key = `str-${a}`;
                  }

                  if (src) {
                    return (
                      <div className="attached" key={key} style={{ minWidth: '100px', minHeight: '100px', border: '1px dashed #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px' }}>
                        <img
                          src={src}
                          alt={`Attachment ${index}`}
                          style={{ maxHeight: 100, maxWidth: '100%', objectFit: 'contain' }}
                          onLoad={() => console.log(`✅ IMG Loaded: ${src}`)}
                          onError={(e) => {
                            console.error(`❌ IMG Error: ${src}`, e);
                            e.target.onerror = null;
                            e.target.parentElement.innerHTML = `<span style="font-size: 12px; text-align: center;">Img Err (${index})</span>`;
                          }}
                        />
                      </div>
                    );
                  } else {
                    return (
                      <div className="attached" key={key} style={{ minWidth: '100px', minHeight: '100px', border: '1px dashed #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px' }}>
                        <span style={{ fontSize: '12px', textAlign: 'center' }}>Вложение (${index})</span>
                      </div>
                    );
                  }
                })}
              </div>
            </div>
          </div>
        )}

        <div className="section">
          <h3>История</h3>
          <ul>
            {(task.history || []).map((h, i) => (
              <li key={i}>
                {new Date(h.ts).toLocaleString()} — <b>{h.action}</b> —{" "}
                {h.comment || "—"}
              </li>
            ))}
          </ul>
        </div>

        <div className="section">
          <h3>Отчёты монтажников</h3>
          {(task.reports || []).length ? (
            task.reports.map((r) => (
              <div key={r.id} className="report">
                <p>
                  #{r.id}: {r.text || "—"}
                </p>
                <p>
                  logist: <b>{r.approval_logist || "—"}</b> | tech:{" "}
                  <b>{r.approval_tech || "—"}</b>
                </p>
              </div>
            ))
          ) : (
            <div className="empty">Отчётов пока нет</div>
          )}
        </div>
      </div>
    </div>
  );
}