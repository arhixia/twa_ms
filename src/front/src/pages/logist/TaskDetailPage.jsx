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
} from "../../api";
import FileUploader from "../../components/FileUploader";
import "../../styles/LogistPage.css";

// --- Модальное окно отклонения отчёта (без изменений) ---
function RejectReportModal({ taskId, reportId, onClose, onSubmitSuccess }) {
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const handlePhotoUpload = (file) => {
    setPhotos(prev => [...prev, file]);
  };

  const handleRemovePhoto = (indexToRemove) => {
    setPhotos(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleSubmit = async () => {
    if (!comment.trim()) {
      alert("Введите комментарий причины отклонения");
      return;
    }
    try {
      setSubmitting(true);
      const photoKeys = photos.map(p => typeof p === 'object' ? p.storage_key : p);
      await reviewReport(taskId, reportId, { approval: "rejected", comment, photos: photoKeys });
      alert("❌ Отчёт отклонён");
      onSubmitSuccess && onSubmitSuccess();
      onClose();
    } catch (err) {
      console.error("Ошибка отклонения отчёта:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось отклонить отчёт.";
      alert(`Ошибка: ${errorMsg}`);
    } finally {
      setSubmitting(false);
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
            <label>
              Фото:
              <FileUploader onUploaded={handlePhotoUpload} />
              <div className="attached-list" style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
                {photos.map((p, index) => (
                  <div key={index} style={{ position: 'relative', display: 'inline-block' }}>
                    <img
                      src={typeof p === 'object' ? p.url : `${import.meta.env.VITE_API_URL}/attachments/${p.storage_key || p}`}
                      alt={`Preview ${index}`}
                      style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px' }}
                    />
                    <button
                      onClick={() => handleRemovePhoto(index)}
                      style={{
                        position: 'absolute',
                        top: '-5px',
                        right: '-5px',
                        background: 'red',
                        color: 'white',
                        border: 'none',
                        borderRadius: '50%',
                        width: '20px',
                        height: '20px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            </label>
          </div>
        </div>
        <div className="modal-actions">
          <button className="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Отправка...' : 'Отправить'}
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
      const t = {
        ...data,
        equipment: data.equipment || [],
        work_types: data.work_types || [],
        history: data.history || [],
        reports: data.reports || [],
        attachments: data.attachments || [],
      };
      t.equipment_ids = t.equipment.map(e => e.equipment_id);
      t.work_types_ids = t.work_types;
      setTask(t);
      setForm(t);
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

  // ✅ Загрузка контактных лиц при выборе компании
  async function handleCompanyChange(companyId) {
    if (!companyId) {
      setContactPersons([]);
      setField("contact_person_id", null);
      return;
    }
    try {
      const contacts = await getContactPersonsByCompany(companyId);
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
      const payload = {
        ...form,
        equipment: (form.equipment_ids || []).map(id => ({ equipment_id: id, quantity: 1 })),
        work_types: form.work_types_ids || [],
        client_price: undefined,
        montajnik_reward: undefined,
      };
      await editTask(id, payload);
      alert("✅ Изменения сохранены");
      setEdit(false);
      loadTask();
    } catch (err) {
      console.error(err);
      alert("Ошибка при сохранении");
    }
  }

  // --- Отчёт: принять / отклонить ---
  async function handleApproveReport(taskId, reportId) {
    if (!window.confirm("Принять отчёт?")) return;
    try {
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

  function handleUploaded(file) {
    setForm(prev => ({ ...prev, attachments: [...(prev.attachments || []), file] }));
  }

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
            src = `https://s3.storage.selcloud.ru/mobile-service-testing/${a.storage_key}`;
          }
          key = a.id ? `id-${a.id}` : a.storage_key ? `sk-${a.storage_key}` : `index-${index}`;
        } else if (typeof a === "string") {
          src = `https://s3.storage.selcloud.ru/mobile-service-testing/${a}`;
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
              <span style={{ fontSize: '12px', textAlign: 'center' }}>Вложение ({index})</span>
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
              <label>
                Компания:
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
                Контактное лицо:
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
                ТС:
                <input
                  type="text"
                  value={form.vehicle_info || ""}
                  onChange={(e) => setField("vehicle_info", e.target.value)}
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
                  .map(e => equipment.find(eq => eq.id === e.equipment_id)?.name || e.equipment_id)
                  .join(", ") || "—"}
              </p>
              <p>
                <b>Виды работ:</b>{" "}
                {(task.work_types || [])
                  .map(wtId => workTypes.find(wt => wt.id === wtId)?.name || wtId)
                  .join(", ") || "—"}
              </p>
              <div>
                <b>Вложения:</b>
                {renderAttachments(task.attachments)}
              </div>
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
                  {r.photos?.length > 0 && (
                    <div className="attached-list">
                      {r.photos.map((url, idx) => (
                        <img key={idx} src={url} alt={`Report ${idx}`} style={{ maxHeight: 100 }} />
                      ))}
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