// front/src/pages/logist/TaskDetailPage.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchTaskDetail,
  editTask,
  reviewReport,
  getEquipmentList,
  getWorkTypes,
  getCompaniesList,
  getContactPersonsByCompany,
  getContactPersonPhone, // <--- Новый импорт
} from "../../api";
import "../../styles/LogistPage.css";

function RejectReportModal({ taskId, reportId, onClose, onSubmitSuccess }) {
  const [comment, setComment] = useState("");

  const handleSubmit = async () => {
    if (!comment.trim()) {
      alert("Введите комментарий причины отклонения");
      return;
    }
    try {
      await reviewReport(taskId, reportId, { approval: "rejected", comment, photos: [] });
      alert("❌ Отчёт отклонён");
      onSubmitSuccess && onSubmitSuccess();
      onClose();
    } catch (err) {
      console.error("Ошибка отклонения отчёта:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось отклонить отчёт.";
      alert(`Ошибка: ${errorMsg}`);
    } finally {
      // setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>Отклонить отчёт #{reportId} по задаче #{taskId}</h2>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <label>
              Комментарий:
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows="4"
                placeholder="Причина отклонения..."
              />
            </label>
          </div>
        </div>
        <div className="modal-actions">
          {/* ❌ Убираем состояние submitting из кнопки */}
          <button className="primary" onClick={handleSubmit} /*disabled={submitting}*/>
            Отправить
          </button>
          <button onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

export default function TaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [equipment, setEquipment] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  const [companies, setCompanies] = useState([]); // ✅ Новое
  const [contactPersons, setContactPersons] = useState([]); // ✅ Новое
  // ✅ Состояние для хранения телефона контактного лица в режиме просмотра
  const [contactPersonPhone, setContactPersonPhone] = useState(null); // <--- Добавлено
  // ✅ Состояние для загрузки телефона в режиме редактирования
  const [loadingPhone, setLoadingPhone] = useState(false); // <--- Добавлено
  const [rejectModal, setRejectModal] = useState({ open: false, taskId: null, reportId: null });

  useEffect(() => {
    loadRefs();
    loadTask();
  }, [id]);

  async function loadRefs() {
    try {
      const eq = await getEquipmentList();
      const wt = await getWorkTypes();
      const companies = await getCompaniesList(); // ✅ Новое
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
      const data = await fetchTaskDetail(id);

      // --- НОВАЯ ЛОГИКА ОБРАБОТКИ work_types (После изменений бэкенда) ---
      // Теперь data.work_types - это массив объектов { work_type_id, quantity }
      // Напрямую используем его для task.work_types
      const processedWorkTypes = (data.work_types || []).map(wt => ({
        work_type_id: wt.work_type_id,
        quantity: wt.quantity,
      }));

      const t = {
        ...data,
        // Оборудование: массив объектов {equipment_id, serial_number, quantity}
        equipment: (data.equipment || []).map(e => ({
          equipment_id: e.equipment_id,
          serial_number: e.serial_number || "",
          quantity: e.quantity || 1,
        })),
        // Заменяем оригинальный work_types на обработанный (уже правильный)
        work_types: processedWorkTypes,
        history: data.history || [],
        reports: data.reports || [],
      };

      setTask(t);

      // --- ИНИЦИАЛИЗАЦИЯ form ДЛЯ РЕДАКТИРОВАНИЯ ---
      // equipment: массив объектов { equipment_id, serial_number }
      const formEquipment = t.equipment.map(e => ({
        equipment_id: e.equipment_id,
        serial_number: e.serial_number,
      }));

      // work_types_ids: плоский массив ID, как в AddTaskModal (для логики добавления/удаления)
      const formWorkTypesIds = [];
      processedWorkTypes.forEach(item => {
        for (let i = 0; i < item.quantity; i++) {
          formWorkTypesIds.push(item.work_type_id);
        }
      });

      const initialForm = {
        ...t,
        equipment: formEquipment,
        work_types_ids: formWorkTypesIds, // используем плоский массив
        // ✅ Инициализируем contact_person_phone в форме
        contact_person_phone: t.contact_person_phone || null,
      };

      setForm(initialForm);


      if (t.contact_person_id && !t.contact_person_phone) {
         try {
            const { phone } = await getContactPersonPhone(t.contact_person_id);
            setContactPersonPhone(phone); // Устанавливаем телефон для просмотра
         } catch (err) {
            console.error("Ошибка загрузки телефона при инициализации задачи:", err);
            setContactPersonPhone(null); // Сброс при ошибке
         }
      } else {
        // Если телефон уже есть в data или contact_person_id отсутствует
        setContactPersonPhone(t.contact_person_phone || null);
      }

      if (initialForm.company_id) {
  try {
    const contactsForDraftCompany = await getContactPersonsByCompany(initialForm.company_id);
    setContactPersons(contactsForDraftCompany || []);

    // ✅ Устанавливаем уже выбранное контактное лицо
    if (initialForm.contact_person_id) {
      setField("contact_person_id", initialForm.contact_person_id);
      // При желании, можно сразу подгрузить телефон
      if (!initialForm.contact_person_phone) {
        const { phone } = await getContactPersonPhone(initialForm.contact_person_id);
        setField("contact_person_phone", phone);
        setContactPersonPhone(phone);
      }
    }
  } catch (err) {
    console.error("Ошибка загрузки контактных лиц при инициализации задачи:", err);
    setContactPersons([]);
  }
} else {
  setContactPersons([]);
}
      // --- КОНЕЦ НОВОГО БЛОКА ---

    } catch (err) {
      console.error("Ошибка загрузки задачи:", err);
      alert("Ошибка загрузки задачи");
    } finally {
      setLoading(false);
    }
  }

  function setField(k, v) {
    setForm(prev => ({ ...prev, [k]: v }));
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
      const contacts = await getContactPersonsByCompany(companyId);
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
        const { phone } = await getContactPersonPhone(val); // <--- Вызываем отдельный эндпоинт
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
      await editTask(id, payload);
      alert("✅ Изменения сохранены");
      setEdit(false);
      loadTask(); // Перезагружаем данные
    } catch (err) {
      console.error(err);
      alert("Ошибка при сохранении");
    }
  }

  // --- Отчёт: принять / отклонить ---
  async function handleApproveReport(taskId, reportId) {
    if (!window.confirm("Принять отчёт?")) return;
    try {
      // ❌ При принятии тоже отправляем пустой массив photos
      await reviewReport(taskId, reportId, { approval: "approved", comment: "", photos: [] });
      alert("✅ Отчёт принят");
      loadTask();
    } catch (err) {
      console.error("Ошибка принятия отчёта:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось принять отчёт.";
      alert(`Ошибка: ${errorMsg}`);
    }
  }

  function handleRejectReport(taskId, reportId) {
    setRejectModal({ open: true, taskId, reportId });
  }

  function closeRejectModal() {
    setRejectModal({ open: false, taskId: null, reportId: null });
  }

  function handleRejectSuccess() {
    loadTask();
  }

  // ✅ Обновляем renderAttachments, чтобы он работал с photos из отчётов
  function renderAttachments(attachments) {
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return <span>Нет вложений</span>;
    }

    return (
      <div className="attached-list" style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {attachments.map((a, index) => {
          let src = "";
          let key = `attachment-${index}`;

          if (a && typeof a === "object") {
            if (a.presigned_url) {
              src = a.presigned_url;
            } else if (a.storage_key) {
              src = `https://s3.storage.selcloud.ru/mobile-service-testing/   
  ${a.storage_key}`;
            }
            key = a.id ? `id-${a.id}` : a.storage_key ? `sk-${a.storage_key}` : `index-${index}`;
          } else if (typeof a === "string") {
            src = `https://s3.storage.selcloud.ru/mobile-service-testing/   
  ${a}`;
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
                    e.target.parentElement.innerHTML = `<span style={{ fontSize: 12px, textAlign: 'center' }}>Img Err (${index})</span>`;
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
    );
  }

  if (loading) return <div className="logist-main"><div className="empty">Загрузка задачи #{id}...</div></div>;
  if (!task) return <div className="logist-main"><div className="empty">Задача не найдена</div></div>;

  // Форматирование даты для datetime-local
  const formatDateTimeLocal = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1>Задача #{task.id}</h1>
          {!edit ? (
            <button type="button" className="add-btn" onClick={() => setEdit(true)}>
              ✏️ Редактировать
            </button>
          ) : (
            <>
              <button type="button" className="add-btn" onClick={saveEdit}>
                💾 Сохранить
              </button>
              <button type="button" className="add-btn" onClick={() => setEdit(false)}>
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
                Компания:
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
                Контактное лицо:
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
                Телефон контактного лица:
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
                ТС:
                <input
                  type="text"
                  value={form.vehicle_info || ""}
                  onChange={(e) => setField("vehicle_info", e.target.value)}
                />
              </label>

               <label>
                Гос. номер:
                <input
                  type="text"
                  value={form.gos_number || ""}
                  onChange={(e) => setField("gos_number", e.target.value)}
                />
              </label>

              <label>
                Дата:
                <input
                  type="datetime-local"
                  value={formatDateTimeLocal(form.scheduled_at)}
                  onChange={(e) => setField("scheduled_at", e.target.value)}
                />
              </label>
              <label>
                Место:
                <input
                  type="text"
                  value={form.location || ""}
                  onChange={(e) => setField("location", e.target.value)}
                />
              </label>
              <label>
                Комментарий:
                <textarea
                  value={form.comment || ""}
                  onChange={(e) => setField("comment", e.target.value)}
                  rows="3"
                />
              </label>
              {/* Цены — только для отображения, не редактируются */}
              <label>
                Цена клиента:
                <input
                  type="number"
                  step="0.01"
                  value={task.client_price || ""}
                  disabled
                />
              </label>
              <label>
                Награда монтажнику:
                <input
                  type="number"
                  step="0.01"
                  value={task.montajnik_reward || ""}
                  disabled
                />
              </label>
              <label>
                Фото обязательно:
                <input
                  type="checkbox"
                  checked={form.photo_required || false}
                  onChange={(e) => setField("photo_required", e.target.checked)}
                />
              </label>

              {/* ===== Оборудование (редактирование) ===== */}
              <label>Оборудование</label>
              {/* --- Список выбранных элементов (название - поле серийного номера) --- */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '10px' }}>
                {(form.equipment || []).map((item, index) => {
                  const eq = equipment.find((e) => e.id === item.equipment_id);
                  return (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
                    addEquipmentItemToForm(val);
                  }
                  e.target.value = ""; // Сброс для возможности повторного выбора
                }}
                style={{ width: "100%" }}
              >
                {equipment.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.name}
                  </option>
                ))}
              </select>

              {/* ===== Виды работ (редактирование) ===== */}
              <label>Виды работ</label>
              {/* --- Отображение выбранных типов работ с количеством --- */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                {(() => {
                  const counts = {};
                  (form.work_types_ids || []).forEach(id => {
                    counts[id] = (counts[id] || 0) + 1;
                  });
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
              {/* --- Выбор нового вида работ из списка --- */}
              <select
                size={5}
                value=""
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!isNaN(val) && val > 0) {
                    addWorkTypeItemToForm(val);
                  }
                  e.target.value = ""; // Сброс
                }}
                style={{ width: "100%" }}
              >
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
                {contactPersonPhone || task.contact_person_phone || "—"} 
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
              <p><b>Гос. номер:</b> {task.gos_number || "—"}</p>
              <p><b>Дата:</b> {task.scheduled_at ? new Date(task.scheduled_at).toLocaleString() : "—"}</p>
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
                    const wtObj = workTypes.find(w => w.id === wt.work_type_id);
                    const name = wtObj?.name || wt.work_type_id;
                    const count = wt.quantity || 1; // Берём quantity из объекта
                    return `${name} (x${count})`;
                  }).join(", ")
                ) : "—"}
              </p>

            </div>
          )}

          {/* === БЛОК ИСТОРИИ ОСТАЛСЯ БЕЗ ИЗМЕНЕНИЙ === */}
          <div className="section">
            <h3>История</h3>
            <button type="button" className="add-btn" onClick={() => navigate(`/logist/tasks/${id}/history`)}>
              Подробнее
            </button>
          </div>

          <div className="section">
            <h3>Отчёты монтажников</h3>
            {(task.reports || []).length ? (
              task.reports.map((r) => (
                <div key={r.id} className="report">
                  <p>#{r.id}: {r.text || "—"}</p>
                  <p>
                    logist: <b>{r.approval_logist || "—"}</b> | tech: <b>{r.approval_tech || "—"}</b>
                  </p>
                  {(r.approval_tech !== "waiting" && r.approval_tech !== "rejected") && (
                    <p style={{ color: r.approval_tech === "approved" ? "green" : "orange" }}>
                      <b>Тех.спец:</b> {r.approval_tech} {r.review_comment && r.approval_tech === "rejected" && ` - ${r.review_comment}`}
                    </p>
                  )}
                  <div className="report-actions">
                    {r.approval_logist === "waiting" ? (
                      <>
                        <button type="button" onClick={() => handleApproveReport(task.id, r.id)}>✅ Принять</button>
                        <button type="button" onClick={() => handleRejectReport(task.id, r.id)}>❌ Отклонить</button>
                      </>
                    ) : null}
                  </div>
                  {r.photos && r.photos.length > 0 && (
                    <div className="attached-list">
                      {renderAttachments(r.photos)}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="empty">Отчётов пока нет</div>
            )}
          </div>
        </div>
      </div>

      {rejectModal.open && (
        <RejectReportModal
          taskId={rejectModal.taskId}
          reportId={rejectModal.reportId}
          onClose={closeRejectModal}
          onSubmitSuccess={handleRejectSuccess}
        />
      )}
    </div>
  );
}