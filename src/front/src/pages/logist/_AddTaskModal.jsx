// front/src/pages/logist/_AddTaskModal.jsx
import React, { useState, useEffect } from "react";
import Modal from "../../components/Modal";
import FileUploader from "../../components/FileUploader";
import {
  createDraft,
  publishTask,
  getEquipmentList,
  getWorkTypes,
  uploadFallback,
  getCompaniesList,
  getContactPersonsByCompany,
} from "../../api";

export default function AddTaskModal({ open, onClose, onSaved, allowSaveOnlyDraft = false }) {

  const [form, setForm] = useState({
    company_id: null,
    contact_person_id: null,
    vehicle_info: "",
    scheduled_at: "", // ✅ Оставляем пустую строку
    location: "",
    comment: "",
    assignment_type: "broadcast",
    assigned_user_id: null,
    photo_required: false,
    equipment_ids: [],
    work_types_ids: [],
  });

  const [equipment, setEquipment] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [contactPersons, setContactPersons] = useState([]);
  const [saving, setSaving] = useState(false);
  const [taskId, setTaskId] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);

  useEffect(() => {
    loadRefs();
    if (!open) {
      setSelectedFiles([]);
      setTaskId(null);
    }
  }, [open]);

  async function loadRefs() {
    try {
      const [eqRes, wtRes, compRes] = await Promise.allSettled([
        getEquipmentList(),
        getWorkTypes(),
        getCompaniesList(),
      ]);

      setEquipment(eqRes.status === 'fulfilled' ? eqRes.value || [] : []);
      setWorkTypes(wtRes.status === 'fulfilled' ? wtRes.value || [] : []);
      setCompanies(compRes.status === 'fulfilled' ? compRes.value || [] : []);
    } catch (e) {
      console.error("Ошибка загрузки справочников", e);
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
      const contacts = await getContactPersonsByCompany(companyId);
      setContactPersons(contacts || []);
      setField("contact_person_id", null); // Сброс при смене компании
    } catch (e) {
      console.error("Ошибка загрузки контактных лиц:", e);
      setContactPersons([]);
      setField("contact_person_id", null);
    }
  }

  function handleFilesSelected(files) {
    setSelectedFiles(files);
  }

  async function saveDraft(asPublish = false) {
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        equipment: (form.equipment_ids || []).map((id) => ({ equipment_id: id, quantity: 1 })),
        work_types: form.work_types_ids || [],
        // ✅ scheduled_at передаём как есть (строку из datetime-local)
        scheduled_at: form.scheduled_at || null,
        assigned_user_id: form.assigned_user_id ? Number(form.assigned_user_id) : null,
        photo_required: Boolean(form.photo_required),
        assignment_type: form.assignment_type || "broadcast",
      };

      let result;
      if (asPublish) {
        result = await publishTask(payload);
        alert("✅ Опубликовано");
      } else {
        result = await createDraft(payload);
        alert("💾 Сохранено черновиком");
      }

      let newId = null;
      if (asPublish) {
        newId = result?.id || result?.task_id;
      } else {
        newId = result?.draft_id || result?.id;
      }

      if (newId === null || newId === undefined || newId <= 0) {
        console.error("Ошибка: Некорректный ID из ответа", result);
        throw new Error("Не удалось получить корректный ID созданной сущности из ответа сервера.");
      }

      setTaskId(newId);

      if (selectedFiles.length > 0 && newId) {
        const uploadPromises = selectedFiles.map(file =>
          uploadFallback(file, newId).catch(err => {
            console.error(`Ошибка загрузки файла ${file.name}:`, err);
            return null;
          })
        );

        const uploadResults = await Promise.all(uploadPromises);
        const successfulUploads = uploadResults.filter(res => res !== null);

        if (successfulUploads.length !== selectedFiles.length) {
          console.warn("Не все файлы были успешно загружены");
        }

        setSelectedFiles([]);
      }

      onSaved && onSaved(newId);
      onClose();
    } catch (e) {
      console.error("Ошибка при сохранении:", e);
      alert(e.response?.data?.detail || e.message || "Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Добавить задачу">
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
                handleCompanyChange(val);
              } else {
                setContactPersons([]);
                setField("contact_person_id", null);
              }
            }}
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              backgroundColor: "#f9f9f9", // ✅ Светлый фон
              color: "#333", // ✅ Темный текст
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
            onChange={(e) => {
              const val = e.target.value ? parseInt(e.target.value, 10) : null;
              setField("contact_person_id", val);
            }}
            disabled={!form.company_id}
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              backgroundColor: "#f9f9f9", // ✅ Светлый фон
              color: "#333", // ✅ Темный текст
            }}
          >
            <option value="">Выберите контактное лицо</option>
            {contactPersons.map(cp => (
              <option key={cp.id} value={cp.id}>{cp.name}</option>
            ))}
          </select>
        </label>

        <label>
          ТС (марка, гос.номер)
          <input value={form.vehicle_info} onChange={(e) => setField("vehicle_info", e.target.value)} />
        </label>

        {/* ===== ДАТА И ВРЕМЯ ===== */}
        <label>
          Дата и время
          <input
            type="datetime-local"
            value={form.scheduled_at}
            onChange={(e) => setField("scheduled_at", e.target.value)} // ✅ Передаём строку как есть
          />
        </label>

        <label>
          Место/адрес
          <textarea value={form.location} onChange={(e) => setField("location", e.target.value)} />
        </label>
        <label>
          Комментарий
          <textarea value={form.comment} onChange={(e) => setField("comment", e.target.value)} />
        </label>

        {/* ===== Оборудование ===== */}
        <label>Оборудование</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {form.equipment_ids.map((id) => {
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
            if (!isNaN(val) && !form.equipment_ids.includes(val)) {
              setField("equipment_ids", [...form.equipment_ids, val]);
            }
            e.target.value = ""; // Сброс для возможности повторного выбора
          }}
          style={{ width: "100%" }}
        >
          {equipment
            .filter(eq => !form.equipment_ids.includes(eq.id))
            .map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.name}
              </option>
            ))}
        </select>

        {/* ===== Виды работ ===== */}
        <label>Виды работ</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {form.work_types_ids.map((id) => {
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
                  onClick={() => setField("work_types_ids", form.work_types_ids.filter((w) => w !== id))}
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
            if (!isNaN(val) && !form.work_types_ids.includes(val)) {
              setField("work_types_ids", [...form.work_types_ids, val]);
            }
            e.target.value = ""; // Сброс
          }}
          style={{ width: "100%" }}
        >
          {workTypes
            .filter(wt => !form.work_types_ids.includes(wt.id))
            .map((wt) => (
              <option key={wt.id} value={wt.id}>
                {wt.name}
              </option>
            ))}
        </select>

        <label>
          Тип назначения
          <select value={form.assignment_type} onChange={(e) => setField("assignment_type", e.target.value)}>
            <option value="broadcast">broadcast</option>
            <option value="individual">assigned</option>
          </select>
        </label>
        <label>
          Назначить монтажника (id)
          <input
            value={form.assigned_user_id || ""}
            onChange={(e) => setField("assigned_user_id", e.target.value)}
            placeholder="ID монтажника"
          />
        </label>
        {/* Цены — не редактируются, рассчитываются автоматически */}
        <label>
          Цена клиента (авто)
          <input value="" disabled placeholder="Рассчитывается автоматически" />
        </label>
        <label>
          Вознаграждение монтажнику (авто)
          <input value="" disabled placeholder="Рассчитывается автоматически" />
        </label>
        <label>
          <input
            type="checkbox"
            checked={form.photo_required}
            onChange={(e) => setField("photo_required", e.target.checked)}
          />{" "}
          Фото обязательно
        </label>

        <div className="full-row">
          <label>
            Вложения (фото):
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                handleFilesSelected(files);
              }}
              disabled={saving}
            />
          </label>
          {selectedFiles.length > 0 && (
            <div className="attached-list full-row">
              <p>Выбрано файлов: {selectedFiles.length}</p>
              <ul>
                {selectedFiles.map((file, index) => (
                  <li key={index}>{file.name} ({(file.size / 1024).toFixed(2)} KB)</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="modal-actions">
        <button onClick={() => saveDraft(false)} disabled={saving}>
          {saving ? 'Сохранение...' : '💾 Сохранить как черновик'}
        </button>
        {!allowSaveOnlyDraft && (
          <button className="primary" onClick={() => saveDraft(true)} disabled={saving}>
            {saving ? 'Публикация...' : '📤 Опубликовать'}
          </button>
        )}
      </div>
    </Modal>
  );
}