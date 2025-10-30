// front/src/components/TaskDetailModal.jsx
import React, { useEffect, useState } from "react";
import {
  adminGetTaskById,
  adminUpdateTask,
  adminDeleteTask,
  getEquipmentList,
  getWorkTypes,
  getAdminCompaniesList,      // ✅ Новое
  getAdminContactPersonsByCompany, // ✅ Новое
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
  const [companies, setCompanies] = useState([]); // ✅ Новое
  const [contactPersons, setContactPersons] = useState([]); // ✅ Новое

  useEffect(() => {
    loadRefs();
    loadTask();
  }, [taskId]);

  async function loadRefs() {
    try {
      const [eqRes, wtRes, compRes] = await Promise.allSettled([
        getEquipmentList(),
        getWorkTypes(),
        getAdminCompaniesList(), // ✅ Новое
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
        work_types: data.work_types || [],
        history: data.history || [],
        reports: data.reports || [],
        attachments: data.attachments || [],
      };

      t.equipment_ids = t.equipment.map((e) => e.equipment_id);
      t.work_types_ids = t.work_types;

      setTask(t);
      setForm(t);
    } catch (err) {
      console.error("Ошибка загрузки задачи:", err);
      alert("Ошибка загрузки задачи");
      onClose(); // Закрываем модалку при ошибке
    } finally {
      setLoading(false);
    }
  }

  function setField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // ✅ Загрузка контактных лиц при выборе компании
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

  async function saveEdit() {
    try {
      // ✅ Автоматический расчёт цен на бэке, не передаём client_price и montajnik_reward
      const payload = {
        ...form,
        equipment: (form.equipment_ids || []).map((id) => ({
          equipment_id: id,
          quantity: 1,
        })),
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

  // ✅ Улучшенная функция отображения вложений
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
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.parentElement.innerHTML = `<span style="font-size: 12px; text-align: center;">Img Err (${index})</span>`;
                  }}
                />
              </div>
            );
          } else {
            return (
              <div className="attached" key={key} style={{ minWidth: '100px', minHeight: '100px', border: '1px dashed #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px' }}>
                <span style={{ fontSize: '12px', textAlign: 'center' }}>Вложение ({index})</span>
              </div>
            );
          }
        })}
      </div>
    );
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
                  disabled={!form.company_id} // доступно только если выбрана компания
                >
                  <option value="">Выберите контактное лицо</option>
                  {contactPersons.map(cp => (
                    <option key={cp.id} value={cp.id}>{cp.name}</option>
                  ))}
                </select>
              </label>

              <label>
                ТС
                <input
                  type="text"
                  value={form.vehicle_info || ""}
                  onChange={(e) => setField("vehicle_info", e.target.value)}
                />
              </label>
              <label>
                Дата
                <input
                  type="datetime-local"
                  value={form.scheduled_at ? new Date(form.scheduled_at).toISOString().slice(0, 16) : ""}
                  onChange={(e) => setField("scheduled_at", e.target.value ? new Date(e.target.value) : null)}
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
                  disabled // ✅ Отключено для редактирования
                />
              </label>
              <label>
                Награда монтажнику (авто)
                <input
                  type="number"
                  step="0.01"
                  value={task.montajnik_reward || ""}
                  disabled // ✅ Отключено для редактирования
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

              {/* ===== Оборудование (редактирование) ===== */}
              <label>Оборудование</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                {form.equipment_ids?.map((id) => {
                  const eq = equipment.find((e) => e.id === id);
                  if (!eq) return null;
                  return (
                    <div
                      key={id}
                      style={{
                        padding: "4px 8px",
                        border: "1px solid #ccc",
                        borderRadius: 12,
                        backgroundColor: "#4caf50",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      {eq.name}
                      <span
                        style={{ cursor: "pointer" }}
                        onClick={() =>
                          setField("equipment_ids", form.equipment_ids.filter((i) => i !== id))
                        }
                      >
                        ×
                      </span>
                    </div>
                  );
                })}
              </div>
              <select
                size={5}
                value=""
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!isNaN(val) && val > 0 && !form.equipment_ids?.includes(val)) {
                    setField("equipment_ids", [...(form.equipment_ids || []), val]);
                  }
                  e.target.value = "";
                }}
                style={{ width: "100%" }}
              >
                {equipment
                  .filter(eq => !form.equipment_ids?.includes(eq.id))
                  .map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.name}
                    </option>
                  ))}
              </select>

              {/* ===== Виды работ (редактирование) ===== */}
              <label>Виды работ</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                {form.work_types_ids?.map((id) => {
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
                      {wt.name}
                      <span
                        style={{ cursor: "pointer" }}
                        onClick={() =>
                          setField("work_types_ids", form.work_types_ids.filter((w) => w !== id))
                        }
                      >
                        ×
                      </span>
                    </div>
                  );
                })}
              </div>
              <select
                size={5}
                value=""
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (!isNaN(val) && val > 0 && !form.work_types_ids?.includes(val)) {
                    setField("work_types_ids", [...(form.work_types_ids || []), val]);
                  }
                  e.target.value = "";
                }}
                style={{ width: "100%" }}
              >
                {workTypes
                  .filter(wt => !form.work_types_ids?.includes(wt.id))
                  .map((wt) => (
                    <option key={wt.id} value={wt.id}>
                      {wt.name}
                    </option>
                  ))}
              </select>

              <label className="full-row">
                Вложения:
                <FileUploader onUploaded={handleUploaded} />
                {renderAttachments(form.attachments || [])}
              </label>
            </div>
          ) : (
            <div className="task-view">
              <p><b>Компания:</b> {task.company_name || "—"}</p>
              <p><b>Контактное лицо:</b> {task.contact_person_name || "—"}</p>
              <p><b>ТС:</b> {task.vehicle_info || "—"}</p>
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
                  .map(
                    (e) =>
                      equipment.find((eq) => eq.id === e.equipment_id)?.name ||
                      e.equipment_id
                  )
                  .join(", ") || "—"}
              </p>
              <p>
                <b>Виды работ:</b>{" "}
                {(task.work_types || [])
                  .map(
                    (wtId) => workTypes.find((wt) => wt.id === wtId)?.name || wtId
                  )
                  .join(", ") || "—"}
              </p>
              <div>
                <b>Вложения:</b>
                {renderAttachments(task.attachments)}
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