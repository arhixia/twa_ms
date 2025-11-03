// front/src/pages/admin/AdminTaskDetailPage.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  adminGetTaskById,
  adminUpdateTask,
  adminDeleteTask,
  getEquipmentList,
  getWorkTypes,
  getAdminCompaniesList,
  getAdminContactPersonsByCompany,
  getAdminContactPersonPhone,
} from '../../api'; // Убедитесь, что путь к API корректен
import "../../styles/LogistPage.css"; // Предполагаем, что стили подходят

export default function AdminTaskDetailPage() {
  const { id: taskIdStr } = useParams();
  const taskId = parseInt(taskIdStr, 10);
  const navigate = useNavigate();

  const [task, setTask] = useState(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [equipment, setEquipment] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [contactPersons, setContactPersons] = useState([]);
  const [contactPersonPhone, setContactPersonPhone] = useState(null);
  const [loadingPhone, setLoadingPhone] = useState(false);

  useEffect(() => {
    if (isNaN(taskId)) {
      alert("Неверный ID задачи");
      navigate("/admin/tasks"); // Перенаправляем на список, если ID некорректен
      return;
    }
    loadRefs();
    loadTask();
  }, [taskId, navigate]);

  async function loadRefs() {
    try {
      const [eqRes, wtRes, compRes] = await Promise.allSettled([
        getEquipmentList(),
        getWorkTypes(),
        getAdminCompaniesList(),
      ]);

      setEquipment(eqRes.status === 'fulfilled' ? eqRes.value || [] : []);
      setWorkTypes(wtRes.status === 'fulfilled' ? wtRes.value || [] : []);
      setCompanies(compRes.status === 'fulfilled' ? compRes.value || [] : []);
    } catch (e) {
      console.error("Ошибка загрузки справочников", e);
    }
  }

  async function loadTask() {
    if (isNaN(taskId)) return;
    setLoading(true);
    try {
      const data = await adminGetTaskById(taskId);

      // --- НОВАЯ ЛОГИКА ОБРАБОТКИ equipment и work_types ---
      const processedEquipment = (data.equipment || []).map(e => ({
        equipment_id: e.equipment_id,
        serial_number: e.serial_number || "",
        quantity: e.quantity || 1,
      }));

      const processedWorkTypesForView = (data.work_types || []).map(wt => ({
        work_type_id: wt.work_type_id,
        quantity: wt.quantity
      }));

      const t = {
        ...data,
        equipment: processedEquipment,
        work_types: processedWorkTypesForView,
        history: data.history || [],
        reports: data.reports || [],
        attachments: data.attachments || [],
      };

      setTask(t);

      // --- ИНИЦИАЛИЗАЦИЯ form ДЛЯ РЕДАКТИРОВАНИЯ ---
      const formEquipment = t.equipment.map(e => ({
        equipment_id: e.equipment_id,
        serial_number: e.serial_number || "",
      }));

      const formWorkTypesIds = [];
      (data.work_types || []).forEach(wtItem => {
        for (let i = 0; i < wtItem.quantity; i++) {
          formWorkTypesIds.push(wtItem.work_type_id);
        }
      });

      const initialForm = {
        ...t,
        equipment: formEquipment,
        work_types_ids: formWorkTypesIds,
        gos_number: t.gos_number || "",
        contact_person_phone: t.contact_person_phone || null,
      };

      setForm(initialForm);

      // --- ЗАГРУЗКА ТЕЛЕФОНА КОНТАКТНОГО ЛИЦА ДЛЯ РЕЖИМА ПРОСМОТРА ---
      if (t.contact_person_id && !t.contact_person_phone) {
         try {
            const { phone } = await getAdminContactPersonPhone(t.contact_person_id);
            setContactPersonPhone(phone);
         } catch (err) {
            console.error("Ошибка загрузки телефона контактного лица:", err);
            setContactPersonPhone(null);
         }
      } else {
        setContactPersonPhone(t.contact_person_phone || null);
      }

      // --- ЗАГРУЗКА КОНТАКТНЫХ ЛИЦ ДЛЯ КОМПАНИИ ЗАДАЧИ ---
      if (initialForm.company_id) {
        try {
          const contacts = await getAdminContactPersonsByCompany(initialForm.company_id);
          setContactPersons(contacts || []);
        } catch (e) {
          console.error("Ошибка загрузки контактных лиц:", e);
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
  async function handleCompanyChangeForForm(companyId) {
    if (!companyId) {
      setContactPersons([]);
      setField("contact_person_id", null);
      setField("contact_person_phone", null);
      return;
    }
    try {
      setLoadingPhone(true);
      const contacts = await getAdminContactPersonsByCompany(companyId);
      setContactPersons(contacts || []);
      setField("contact_person_id", null);
      setField("contact_person_phone", null);
    } catch (e) {
      console.error("Ошибка загрузки контактных лиц:", e);
      setContactPersons([]);
      setField("contact_person_id", null);
      setField("contact_person_phone", null);
      alert("Ошибка загрузки контактных лиц");
    } finally {
      setLoadingPhone(false);
    }
  }

  // ✅ Новая функция для загрузки телефона контактного лица в форме редактирования
  async function handleContactPersonChangeForForm(contactPersonId) {
    const val = contactPersonId ? parseInt(contactPersonId, 10) : null;
    setField("contact_person_id", val);

    if (val) {
      setLoadingPhone(true);
      try {
        const { phone } = await getAdminContactPersonPhone(val);
        setField("contact_person_phone", phone);
      } catch (e) {
        console.error("Ошибка загрузки телефона контактного лица:", e);
        setField("contact_person_phone", null);
      } finally {
        setLoadingPhone(false);
      }
    } else {
      setField("contact_person_phone", null);
    }
  }

  // --- НОВАЯ ЛОГИКА ДЛЯ РАБОТЫ С ОБОРУДОВАНИЕМ ---
  function addEquipmentItemToForm(equipmentId) {
    if (!equipmentId) return;
    const eq = equipment.find(e => e.id === equipmentId);
    if (!eq) return;

    const newItem = {
      equipment_id: equipmentId,
      serial_number: "",
    };
    setForm((prevForm) => ({
      ...prevForm,
      equipment: [...(prevForm.equipment || []), newItem],
    }));
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

  // --- НОВАЯ ЛОГИКА ДЛЯ РАБОТЫ С ТИПАМИ РАБОТ ---
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
    if (isNaN(taskId)) return;
    try {
      const payload = {
        ...form,
        equipment: form.equipment || [],
        work_types: form.work_types_ids || [],
        client_price: undefined,
        montajnik_reward: undefined,
        gos_number: form.gos_number || null,
        contact_person_phone: undefined,
      };
      await adminUpdateTask(taskId, payload);
      alert("✅ Изменения сохранены");
      setEdit(false);
      loadTask(); // Перезагружаем данные после сохранения
    } catch (err) {
      console.error(err);
      alert("Ошибка при сохранении");
    }
  }

  async function handleDelete() {
    if (isNaN(taskId)) return;
    if (!window.confirm("Вы уверены, что хотите удалить задачу?")) return;
    try {
      await adminDeleteTask(taskId);
      alert("✅ Задача удалена");
      navigate("/admin/tasks"); // Перенаправляем на список задач после удаления
    } catch (err) {
      console.error("Ошибка при удалении:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось удалить задачу.";
      alert(`Ошибка: ${errorMsg}`);
    }
  }

  function handleUploaded(file) {
    setForm((f) => ({ ...f, attachments: [...(f.attachments || []), file] }));
  }

  if (loading) {
    return (
      <div className="page">
        <h1>Загрузка задачи #{taskId}...</h1>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="page">
        <h1>Задача не найдена</h1>
        <button onClick={() => navigate("/admin/tasks")}>Назад к списку</button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Задача #{task.id}</h1>
        {!edit ? (
          <>
            <button className="add-btn" onClick={() => setEdit(true)}>
              ✏️ Редактировать
            </button>
            <button className="add-btn" style={{ backgroundColor: '#ef4444' }} onClick={handleDelete}>
              🗑 Удалить
            </button>
          </>
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
                    handleCompanyChangeForForm(val);
                  } else {
                    setContactPersons([]);
                    setField("contact_person_id", null);
                    setField("contact_person_phone", null);
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
                onChange={(e) => handleContactPersonChangeForForm(e.target.value)}
                disabled={!form.company_id}
              >
                <option value="">Выберите контактное лицо</option>
                {contactPersons.map(cp => (
                  <option key={cp.id} value={cp.id}>{cp.name}</option>
                ))}
              </select>
              {loadingPhone && <span style={{ fontSize: '0.8em', color: '#888' }}>Загрузка телефона...</span>}
            </label>

            {/* ===== ТЕЛЕФОН КОНТАКТНОГО ЛИЦА ===== */}
            <label>
              Телефон контактного лица
              <input
                type="text"
                value={form.contact_person_phone || ""}
                readOnly
                placeholder="Выберите контактное лицо"
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                  backgroundColor: "#e0e0e0",
                  color: "#333",
                  cursor: "not-allowed",
                }}
              />
              {form.contact_person_phone && (
                <a
                  href={`tel:${form.contact_person_phone}`}
                  style={{
                    display: 'inline-block',
                    marginTop: '4px',
                    fontSize: '0.9em',
                    color: '#1e88e5',
                    textDecoration: 'none',
                  }}
                >
                  📞 Позвонить
                </a>
              )}
            </label>

            <label>
              ТС (марка, гос.номер)
              <input value={form.vehicle_info || ""} onChange={(e) => setField("vehicle_info", e.target.value)} />
            </label>

            {/* ===== ГОС. НОМЕР ===== */}
            <label>
              Гос. номер
              <input value={form.gos_number || ""} onChange={(e) => setField("gos_number", e.target.value)} />
            </label>

            <label>
              Дата и время
              <input
                type="datetime-local"
                value={form.scheduled_at ? new Date(form.scheduled_at).toISOString().slice(0, 16) : ""}
                onChange={(e) => setField("scheduled_at", e.target.value)}
              />
            </label>
            <label>
              Место/адрес
              <textarea value={form.location || ""} onChange={(e) => setField("location", e.target.value)} rows="3" />
            </label>
            <label>
              Комментарий
              <textarea value={form.comment || ""} onChange={(e) => setField("comment", e.target.value)} rows="3" />
            </label>
            <label>
              Монтажник (ID)
              <input
                type="number"
                value={form.assigned_user_id || ""}
                onChange={(e) => setField("assigned_user_id", e.target.value ? parseInt(e.target.value) : null)}
              />
            </label>
            {/* Цены — не редактируются */}
            <label>
              Цена клиента (авто)
              <input value="" disabled placeholder="Рассчитывается автоматически" />
            </label>
            <label>
              Награда монтажнику (авто)
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

            {/* ===== Оборудование (редактирование) ===== */}
            <label>Оборудование</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '10px' }}>
              {(form.equipment || []).map((item, index) => {
                const eq = equipment.find((e) => e.id === item.equipment_id);
                return (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px', backgroundColor: '#e0e0e0' }}>
                      {eq?.name || `ID ${item.equipment_id}`}
                    </div>
                    <div style={{ flex: 1 }}>
                      <input
                        type="text"
                        placeholder="Серийный номер"
                        value={item.serial_number || ""}
                        onChange={(e) => updateEquipmentItemInForm(index, "serial_number", e.target.value)}
                        style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                      />
                    </div>
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
            <select
              size={5}
              value=""
              onChange={(e) => {
                const val = Number(e.target.value);
                if (!isNaN(val) && val > 0) {
                  addEquipmentItemToForm(val);
                }
                e.target.value = "";
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
                      {wt.name} (x{count})
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
            <select
              size={5}
              value=""
              onChange={(e) => {
                const val = Number(e.target.value);
                if (!isNaN(val) && val > 0) {
                  addWorkTypeItemToForm(val);
                }
                e.target.value = "";
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
            {/* ===== ТЕЛЕФОН КОНТАКТНОГО ЛИЦА ===== */}
            <p>
              <b>Телефон контактного лица:</b>{" "}
              {contactPersonPhone || task.contact_person_phone || "—"}
              {(contactPersonPhone || task.contact_person_phone) && (
                <a
                  href={`tel:${contactPersonPhone || task.contact_person_phone}`}
                  style={{
                    display: 'inline-block',
                    marginLeft: '8px',
                    fontSize: '0.9em',
                    color: '#1e88e5',
                    textDecoration: 'none',
                  }}
                >
                  📞 Позвонить
                </a>
              )}
            </p>
            <p><b>ТС:</b> {task.vehicle_info || "—"}</p>
            {/* ===== ГОС. НОМЕР ===== */}
            <p><b>Гос. номер:</b> {task.gos_number || "—"}</p>
            <p><b>Дата:</b> {task.scheduled_at ? new Date(task.scheduled_at).toLocaleString() : "—"}</p>
            <p><b>Статус:</b> {task.status || "—"}</p>
            <p><b>Монтажник:</b> {task.assigned_user_id || "—"}</p>
            <p><b>Комментарий:</b> {task.comment || "—"}</p>
            <p><b>Цена клиента:</b> {task.client_price || "—"}</p>
            <p><b>Награда монтажнику:</b> {task.montajnik_reward || "—"}</p>
            <p><b>Фото обязательно:</b> {task.photo_required ? "Да" : "Нет"}</p>

            {/* ===== Оборудование (отображение) ===== */}
            <p>
              <b>Оборудование:</b>{" "}
              {(task.equipment || [])
                .map((e) => {
                  const eqName = equipment.find((eq) => eq.id === e.equipment_id)?.name;
                  return `${eqName || e.equipment_id}${e.serial_number ? ` (SN: ${e.serial_number})` : ''} x${e.quantity}`;
                })
                .join(", ") || "—"}
            </p>

            {/* ===== Виды работ (отображение) ===== */}
            <p>
              <b>Виды работ:</b>{" "}
              {task.work_types && task.work_types.length > 0 ? (
                task.work_types.map(wt => {
                  const wtObj = workTypes.find(w => w.id === wt.work_type_id);
                  const name = wtObj?.name || wt.work_type_id;
                  const count = wt.quantity || 1;
                  return `${name} (x${count})`;
                }).join(", ")
              ) : "—"}
            </p>
          </div>
        )}

         <div className="section">
          <h3>История</h3>
          {/* Кнопка "Подробнее" теперь ведёт на отдельную страницу истории */}
          <button className="add-btn" onClick={() => navigate(`/admin/tasks/${task.id}/history`)}>
            Подробнее
          </button>
          {/* Пример отображения истории на месте (закомментирован) */}
          {/* <ul>
            {(task.history || []).map((h, i) => (
              <li key={i}>
                {new Date(h.ts).toLocaleString()} — <b>{h.action}</b> —{" "}
                {h.comment || "—"}
              </li>
            ))}
          </ul> */}
        </div>

        <div className="section">
          <h3>Отчёты монтажников</h3>
          {(task.reports || []).length ? (
            task.reports.map((r) => (
              <div key={r.id} className="report">
                <p>#{r.id}: {r.text || "—"}</p>
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