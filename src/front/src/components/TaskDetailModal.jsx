// front/src/components/TaskDetailModal.jsx
import React, { useEffect, useState } from "react";
import {
  adminGetTaskById,
  adminUpdateTask,
  adminDeleteTask,
  getEquipmentList,
  getWorkTypes,
  getAdminCompaniesList,
  getAdminContactPersonsByCompany,
} from '../api';
import FileUploader from './FileUploader';
import "../styles/LogistPage.css";

export default function TaskDetailModal({ taskId, onClose, onTaskUpdated, onTaskDeleted }) {
  const [task, setTask] = useState(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [equipment, setEquipment] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [contactPersons, setContactPersons] = useState([]);

  useEffect(() => {
    loadRefs();
    loadTask();
  }, [taskId]);

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
    setLoading(true);
    try {
      const data = await adminGetTaskById(taskId);

      const t = {
        ...data,
        equipment: data.equipment || [],
        work_types: data.work_types || [], // Это теперь массив ID
        history: data.history || [],
        reports: data.reports || [],
        attachments: data.attachments || [],
      };

      // Инициализируем form с новыми полями
      const initialForm = {
        ...t,
        // Оборудование: массив объектов {equipment_id, serial_number}
        equipment: t.equipment.map(eq => ({
          id: eq.id, // если ID есть, иначе null
          equipment_id: eq.equipment_id,
          equipment_name: eq.equipment_name, // для удобства отображения
          serial_number: eq.serial_number || "",
        })),
        // Виды работ: массив ID (для подсчёта quantity на бэкенде)
        work_types_ids: t.work_types,
        gos_number: t.gos_number || "",
      };

      setTask(t);
      setForm(initialForm);

      // Загрузим контактные лица, если есть company_id
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
      onClose();
    } finally {
      setLoading(false);
    }
  }

  function setField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Загрузка контактных лиц при выборе компании
  async function handleCompanyChange(companyId) {
    if (!companyId) {
      setContactPersons([]);
      setField("contact_person_id", null);
      return;
    }
    try {
      const contacts = await getAdminContactPersonsByCompany(companyId);
      setContactPersons(contacts || []);
      // Сбрасываем выбор контактного лица при смене компании
      setField("contact_person_id", null);
    } catch (e) {
      console.error("Ошибка загрузки контактных лиц:", e);
      setContactPersons([]);
      setField("contact_person_id", null);
    }
  }

  // --- ЛОГИКА ДЛЯ РАБОТЫ С ОБОРУДОВАНИЕМ ---

  function addEquipmentItem(equipmentId) {
    if (!equipmentId) return;
    const eq = equipment.find(e => e.id === equipmentId);
    if (!eq) return;

    const newItem = {
      equipment_id: equipmentId,
      equipment_name: eq.name,
      serial_number: "",
    };
    setForm((prevForm) => ({
      ...prevForm,
      equipment: [...prevForm.equipment, newItem],
    }));
  }

  function updateEquipmentItem(index, field, value) {
    setForm((prevForm) => {
      const updatedEquipment = [...prevForm.equipment];
      if (updatedEquipment[index]) {
        updatedEquipment[index] = { ...updatedEquipment[index], [field]: value };
        return { ...prevForm, equipment: updatedEquipment };
      }
      return prevForm;
    });
  }

  function removeEquipmentItem(index) {
    setForm((prevForm) => ({
      ...prevForm,
      equipment: prevForm.equipment.filter((_, i) => i !== index),
    }));
  }

  // --- ЛОГИКА ДЛЯ РАБОТЫ С ТИПАМИ РАБОТ ---

  function addWorkType(workTypeId) {
    if (!workTypeId) return;
    setForm((prevForm) => ({
      ...prevForm,
      work_types_ids: [...prevForm.work_types_ids, workTypeId],
    }));
  }

  function removeWorkType(workTypeId) {
    setForm((prevForm) => {
      const indexToRemove = prevForm.work_types_ids.indexOf(workTypeId);
      if (indexToRemove !== -1) {
        const updatedWorkTypes = [...prevForm.work_types_ids];
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
        work_types: form.work_types_ids || [],
        // client_price и montajnik_reward убраны — рассчитываются автоматически
        client_price: undefined,
        montajnik_reward: undefined,
      };
      await adminUpdateTask(taskId, payload);
      alert("✅ Изменения сохранены");
      setEdit(false);
      onTaskUpdated && onTaskUpdated();
      loadTask();
    } catch (err) {
      console.error(err);
      alert("Ошибка при сохранении");
    }
  }

  async function handleDelete() {
    if (!window.confirm("Вы уверены, что хотите удалить задачу?")) return;
    try {
      await adminDeleteTask(taskId);
      alert("✅ Задача удалена");
      onTaskDeleted && onTaskDeleted(taskId);
      onClose();
    } catch (err) {
      console.error("Ошибка при удалении:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось удалить задачу.";
      alert(`Ошибка: ${errorMsg}`);
    }
  }

  function handleUploaded(file) {
    setForm((f) => ({ ...f, attachments: [...(f.attachments || []), file] }));
  }

  if (loading)
    return (
      <div className="modal-backdrop">
        <div className="modal" style={{ maxWidth: '500px' }}>
          <div className="modal-body">Загрузка задачи #{taskId}...</div>
        </div>
      </div>
    );
  if (!task)
    return (
      <div className="modal-backdrop">
        <div className="modal" style={{ maxWidth: '500px' }}>
          <div className="modal-body">Задача не найдена</div>
        </div>
      </div>
    );

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: '90%', maxWidth: '1000px' }}>
        <div className="modal-header">
          <h3>Задача #{task.id}</h3>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {edit ? (
            <div className="form-grid">
              {/* ===== Компания и контактное лицо ===== */}
              <label>
                Компания
                <select
                  value={form.company_id || ""}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value) : null;
                    setField("company_id", val);
                    if (val) {
                      handleCompanyChange(val);
                    } else {
                      setContactPersons([]);
                      setField("contact_person_id", null);
                    }
                  }}
                >
                  <option value="">Выберите компанию</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>

              <label>
                Контактное лицо
                <select
                  value={form.contact_person_id || ""}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value) : null;
                    setField("contact_person_id", val);
                  }}
                  disabled={!form.company_id}
                >
                  <option value="">Выберите контактное лицо</option>
                  {contactPersons.map(cp => (
                    <option key={cp.id} value={cp.id}>{cp.name}</option>
                  ))}
                </select>
              </label>

              <label>
                ТС (марка, гос.номер)
                <input
                  type="text"
                  value={form.vehicle_info || ""}
                  onChange={(e) => setField("vehicle_info", e.target.value)}
                />
              </label>
              {/* ===== НОВОЕ ПОЛЕ: ГОС. НОМЕР ===== */}
              <label>
                Гос. номер
                <input
                  type="text"
                  value={form.gos_number || ""}
                  onChange={(e) => setField("gos_number", e.target.value)}
                />
              </label>
              <label>
                Дата
                <input
                  type="datetime-local"
                  value={form.scheduled_at ? new Date(form.scheduled_at).toISOString().slice(0, 16) : ""}
                  onChange={(e) => setField("scheduled_at", e.target.value)}
                />
              </label>
              <label>
                Место
                <textarea
                  value={form.location || ""}
                  onChange={(e) => setField("location", e.target.value)}
                  rows="3"
                />
              </label>
              <label>
                Комментарий
                <textarea
                  value={form.comment || ""}
                  onChange={(e) => setField("comment", e.target.value)}
                  rows="3"
                />
              </label>
              <label>
                Монтажник (ID)
                <input
                  type="number"
                  value={form.assigned_user_id || ""}
                  onChange={(e) => setField("assigned_user_id", e.target.value ? parseInt(e.target.value) : null)}
                />
              </label>
              {/* ===== Цены (не редактируются, рассчитываются автоматически) ===== */}
              <label>
                Цена клиента (авто)
                <input
                  type="number"
                  step="0.01"
                  value={task.client_price || ""}
                  disabled
                />
              </label>
              <label>
                Награда монтажнику (авто)
                <input
                  type="number"
                  step="0.01"
                  value={task.montajnik_reward || ""}
                  disabled
                />
              </label>
              <label>
                Фото обязательно
                <input
                  type="checkbox"
                  checked={form.photo_required || false}
                  onChange={(e) => setField("photo_required", e.target.checked)}
                />
              </label>

              {/* ===== Оборудование (новая логика) ===== */}
              <label>Оборудование</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '10px' }}>
                {form.equipment.map((item, index) => {
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
                          onChange={(e) => updateEquipmentItem(index, "serial_number", e.target.value)}
                          style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeEquipmentItem(index)}
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
                    addEquipmentItem(val);
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

              {/* ===== Виды работ (новая логика) ===== */}
              <label>Виды работ</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                {(() => {
                  const counts = {};
                  form.work_types_ids.forEach(id => {
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
                          onClick={() => removeWorkType(id)}
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
                    addWorkType(val);
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
              <p><b>ТС:</b> {task.vehicle_info || "—"}</p>
              {/* ===== Отображение гос. номера ===== */}
              <p><b>Гос. номер:</b> {task.gos_number || "—"}</p>
              <p><b>Дата:</b> {task.scheduled_at ? new Date(task.scheduled_at).toLocaleString() : "—"}</p>
              <p><b>Статус:</b> {task.status || "—"}</p>
              <p><b>Монтажник:</b> {task.assigned_user_id || "—"}</p>
              <p><b>Комментарий:</b> {task.comment || "—"}</p>
              <p><b>Цена клиента:</b> {task.client_price || "—"}</p>
              <p><b>Награда монтажнику:</b> {task.montajnik_reward || "—"}</p>
              <p><b>Фото обязательно:</b> {task.photo_required ? "Да" : "Нет"}</p>
              {/* ===== Отображение оборудования с серийниками ===== */}
              <p>
                <b>Оборудование:</b> {" "}
                {task.equipment && task.equipment.length > 0 ? (
                  task.equipment.map(e => {
                    const eq = equipment.find(eq => eq.id === e.equipment_id);
                    const name = eq?.name || e.equipment_id;
                    const serial = e.serial_number ? ` (сер. ${e.serial_number})` : '';
                    return `${name}${serial}`;
                  }).join(", ")
                ) : "—"}
              </p>
              {/* ===== Отображение видов работ с количеством ===== */}
              <p>
                <b>Виды работ:</b> {" "}
                {task.work_types && task.work_types.length > 0 ? (
                  (() => {
                    const counts = {};
                    task.work_types.forEach(id => {
                      counts[id] = (counts[id] || 0) + 1;
                    });
                    const uniqueWorkTypesWithCounts = Object.entries(counts).map(([id, count]) => ({
                      id: parseInt(id, 10),
                      count,
                    }));

                    return uniqueWorkTypesWithCounts.map(({ id, count }) => {
                      const wt = workTypes.find(w => w.id === id);
                      if (!wt) return `ID ${id} x${count}`;
                      return `${wt.name} x${count}`;
                    }).join(", ");
                  })()
                ) : "—"}
              </p>
            </div>
          )}

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
        <div className="modal-actions">
          {edit ? (
            <>
              <button className="primary" onClick={saveEdit}>
                💾 Сохранить
              </button>
              <button onClick={() => setEdit(false)}>❌ Отмена</button>
            </>
          ) : (
            <>
              <button className="primary" onClick={() => setEdit(true)}>
                ✏️ Редактировать
              </button>
              <button style={{ backgroundColor: '#ef4444' }} onClick={handleDelete}>
                🗑 Удалить
              </button>
            </>
          )}
          <button onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}