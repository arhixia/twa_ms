// front/src/pages/logist/DraftDetailPage.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
// ✅ Добавим импорт для получения списка компаний и контактных лиц
import { getDraft, patchDraft, deleteDraft, publishTask, getEquipmentList, getWorkTypes, getCompaniesList, getContactPersonsByCompany } from "../../api";
import FileUploader from "../../components/FileUploader";
import "../../styles/LogistPage.css";

export default function DraftDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [equipment, setEquipment] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  // ✅ Новые состояния для компаний и контактных лиц
  const [companies, setCompanies] = useState([]);
  const [contactPersons, setContactPersons] = useState([]);
  const [loadingRefs, setLoadingRefs] = useState(false); // Для загрузки справочников при редактировании

  useEffect(() => {
    loadRefs();
    loadDraft();
  }, [id]);

  // ✅ Загружаем компании
  async function loadRefs() {
    try {
      const eq = await getEquipmentList();
      const wt = await getWorkTypes();
      const comps = await getCompaniesList(); // ✅ Загружаем компании
      setEquipment(eq || []);
      setWorkTypes(wt || []);
      setCompanies(comps || []);
    } catch (e) {
      console.error("Ошибка загрузки справочников", e);
    }
  }

  async function loadDraft() {
    setLoading(true);
    try {
      const res = await getDraft(id);
      const d = { id: res.draft_id, ...res.data };

      // преобразуем equipment/work_types для селектов
      d.equipment_ids = (d.equipment || []).map((e) => e.equipment_id);
      d.work_types_ids = d.work_types || [];

      // ✅ Копируем attachments и преобразуем в массив строк storage_key
      // Это важно для унификации данных между объектами из API и строками новых uploads
      d.attachments = (d.attachments || [])
        .map(a => {
          if (a && typeof a === 'object' && a.storage_key) {
            // Если a - объект с storage_key, берем его
            return a.storage_key;
          } else if (typeof a === 'string') {
            // Если a - уже строка (storage_key), оставляем как есть
            return a;
          }
          // Если формат не распознан, игнорируем этот элемент
          console.warn("Нераспознанный формат вложения в черновике:", a);
          return null;
        })
        .filter(sk => sk !== null); // Убираем null/undefined

      setDraft(d);
      setForm({ ...d }); // копируем в form
    } catch (e) {
      console.error(e);
      alert("Ошибка загрузки черновика");
    } finally {
      setLoading(false);
    }
  }

  function setField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // ✅ Загрузка контактных лиц при выборе компании в форме
  async function loadContactPersonsForFormCompany(companyId) {
    if (!companyId) {
      setContactPersons([]);
      setField("contact_person_id", null);
      return;
    }
    try {
      setLoadingRefs(true); // Показываем индикатор загрузки
      const contacts = await getContactPersonsByCompany(companyId);
      setContactPersons(contacts || []);
      // Сбрасываем выбор контактного лица при смене компании
      setField("contact_person_id", null);
    } catch (e) {
      console.error("Ошибка загрузки контактных лиц:", e);
      setContactPersons([]);
      setField("contact_person_id", null);
      alert("Ошибка загрузки контактных лиц");
    } finally {
      setLoadingRefs(false); // Скрываем индикатор
    }
  }

  async function saveEdit() {
    try {
      // Формируем payload в формате бекенда
      const payload = {
        ...form,
        equipment: (form.equipment_ids || []).map((id) => ({ equipment_id: id, quantity: 1 })),
        work_types: form.work_types_ids || [],
        // ✅ Передаем вложения как массив строк storage_key
        attachments_add: (form.attachments || []).filter(sk => typeof sk === 'string' && sk),
      };
      await patchDraft(id, payload);
      alert("💾 Изменения сохранены");
      setEdit(false);
      await loadDraft(); // Перезагружаем данные
    } catch (e) {
      console.error(e);
      alert("Ошибка сохранения");
    }
  }

  async function handlePublish() {
    if (!window.confirm("Опубликовать задачу?")) return;
    try {
      // Формируем payload для публикации
      const publishPayload = {
        draft_id: Number(id),
        // Передаем поля компании и контакта из формы
        company_id: form.company_id,
        contact_person_id: form.contact_person_id,
        // Передаем location из формы
        location: form.location,
        // ... другие поля, если нужно, но они должны быть в form
      };
      await publishTask(publishPayload);
      await deleteDraft(id);
      alert("✅ Задача опубликована");
      navigate("/logist/tasks/active");
    } catch (e) {
      console.error(e);
      alert("Ошибка при публикации задачи");
    }
  }

  async function handleDelete() {
    if (!window.confirm("Удалить черновик?")) return;
    try {
      await deleteDraft(id);
      alert("🗑 Черновик удалён");
      navigate("/logist/drafts");
    } catch (e) {
      console.error(e);
      alert("Ошибка удаления черновика");
    }
  }

  if (loading) return <div className="page">Загрузка...</div>;
  if (!draft) return <div className="page">Черновик не найден</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>Черновик #{draft.id}</h1>
      </div>

      {edit ? (
        <div className="form-grid">
          {/* ❌ Удаляем поле "Клиент" */}
          {/* <label>
            Клиент
            <input value={form.client || ""} onChange={(e) => setField("client", e.target.value)} />
          </label> */}

          {/* ✅ Новое поле "Компания" */}
          <label>
            Компания
            <select
              value={form.company_id || ""}
              onChange={(e) => {
                const val = e.target.value ? parseInt(e.target.value) : null;
                setField("company_id", val);
                if (val) {
                  loadContactPersonsForFormCompany(val);
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

          {/* ✅ Новое поле "Контактное лицо" */}
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
            <input value={form.vehicle_info || ""} onChange={(e) => setField("vehicle_info", e.target.value)} />
          </label>
          <label>
            Дата и время
            <input type="datetime-local" value={form.scheduled_at || ""} onChange={(e) => setField("scheduled_at", e.target.value)} />
          </label>
          <label className="full-row">
            Место {/* ✅ Исправлено: было "Место", теперь соответствует полю 'location' */}
            <textarea value={form.location || ""} onChange={(e) => setField("location", e.target.value)} />
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
              if (!form.equipment_ids.includes(val) && !isNaN(val)) {
                setField("equipment_ids", [...form.equipment_ids, val]);
              }
            }}
            style={{ width: "100%" }}
          >
            {equipment.map((eq) => (
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
                    onClick={() =>
                      setField("work_types_ids", form.work_types_ids.filter((i) => i !== id))
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
              if (!form.work_types_ids.includes(val) && !isNaN(val)) {
                setField("work_types_ids", [...form.work_types_ids, val]);
              }
            }}
            style={{ width: "100%" }}
          >
            {workTypes.map((wt) => (
              <option key={wt.id} value={wt.id}>
                {wt.name}
              </option>
            ))}
          </select>

          <label className="full-row">
            Комментарий
            <textarea value={form.comment || ""} onChange={(e) => setField("comment", e.target.value)} />
          </label>

          <label>
            Монтажник (ID)
            <input value={form.assigned_user_id || ""} onChange={(e) => setField("assigned_user_id", e.target.value)} />
          </label>

          <label>
            Цена клиента
            <input
              type="number"
              step="0.01"
              value={form.client_price || ""}
              onChange={(e) => setField("client_price", e.target.value)}
            />
          </label>
          <label>
            Награда монтажнику
            <input
              type="number"
              step="0.01"
              value={form.montajnik_reward || ""}
              onChange={(e) => setField("montajnik_reward", e.target.value)}
            />
          </label>

          <div className="full-row uploader-block">
            {/* ✅ Передаем taskId напрямую */}
            <FileUploader
              key={`uploader-edit-${draft.id}`} // Уникальный ключ при открытии редактирования
              taskId={draft.id || null}
              // onUploaded должен получить объект файла с storage_key
              // и мы добавляем ТОЛЬКО строку storage_key в массив
              onUploaded={(uploadedFileObj) => {
                if (uploadedFileObj?.storage_key) {
                  setField("attachments", [...(form.attachments || []), uploadedFileObj.storage_key]);
                } else {
                  console.error("[ERROR] FileUploader onUploaded передал некорректные данные:", uploadedFileObj);
                  alert("Ошибка: Не удалось получить ключ загруженного файла.");
                }
              }}
            />

            {/* Отображение уже добавленных и новых вложений как строк storage_key */}
            {/* form.attachments гарантированно содержит только строки */}
            <div className="attached-list">
              {(form.attachments || []).map((storageKey, index) => (
                <div className="attached" key={index} style={{ padding: '4px', fontSize: '12px', border: '1px solid #ccc', borderRadius: '4px', marginBottom: '2px' }}>
                  {storageKey} {/* Отображаем storage_key как текст */}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="task-view">
          {/* ❌ Удаляем строку отображения "Клиент" */}
          {/* <p>
            <b>Клиент:</b> {draft.client || "—"}
          </p> */}

          {/* ✅ Добавляем строки отображения "Компания" и "Контактное лицо" */}
          <p>
            <b>Компания:</b> {draft.company_name || "—"}
          </p>
          <p>
            <b>Контактное лицо:</b> {draft.contact_person_name || "—"}
          </p>

          <p>
            <b>ТС:</b> {draft.vehicle_info || "—"}
          </p>
          <p>
            <b>Дата:</b> {draft.scheduled_at || "—"}
          </p>
          <p>
            <b>Место:</b> {draft.location || "—"} {/* ✅ Исправлено: было "Место", теперь соответствует полю 'location' */}
          </p>
          <p>
            <b>Комментарий:</b> {draft.comment || "—"}
          </p>
          <p>
            <b>Цена клиента:</b> {draft.client_price || "—"}
          </p>
          <p>
            <b>Награда монтажнику:</b> {draft.montajnik_reward || "—"}
          </p>
          <p>
            <b>Оборудование:</b>{" "}
            {(draft.equipment || []).map((e) => {
              const eqName = equipment.find((eq) => eq.id === e.equipment_id)?.name;
              return eqName || e.equipment_id;
            }).join(", ") || "—"}
          </p>
          <p>
            <b>Виды работ:</b>{" "}
            {(draft.work_types || []).map((wtId) => {
              const wtName = workTypes.find((wt) => wt.id === wtId)?.name;
              return wtName || wtId;
            }).join(", ") || "—"}
          </p>

          {/* ✅ Отображение вложений с заглушками */}
          <div>
            <b>Вложения:</b>
            <div className="attached-list" style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {Array.isArray(draft.attachments) && draft.attachments.length > 0 ? (
                draft.attachments.map((attachment, index) => {
                  // --- Безопасное извлечение src ---
                  let src = '';
                  let key = `attachment-${index}`;

                  // Проверяем, является ли attachment объектом (на случай, если где-то осталось)
                  // Хотя выше мы преобразовали в строки, страховка не помешает.
                  if (attachment && typeof attachment === 'object') {
                    // Проверяем url
                    if (attachment.url && typeof attachment.url === 'string' && attachment.url.startsWith('http')) {
                      src = attachment.url;
                    }
                    // Проверяем storage_key
                    else if (attachment.storage_key && typeof attachment.storage_key === 'string') {
                      src = `${import.meta.env.VITE_API_URL}/attachments/${attachment.storage_key}`;
                    }

                    // Генерируем уникальный ключ
                    key = attachment.id ? `id-${attachment.id}` :
                          attachment.storage_key ? `sk-${attachment.storage_key}` :
                          `index-${index}`;
                  }
                  // Если attachment - строка (предположительно, storage_key)
                  else if (typeof attachment === 'string') {
                    src = `${import.meta.env.VITE_API_URL}/attachments/${attachment}`;
                    key = `str-${attachment}`;
                  }

                  // --- Рендерим элемент ---
                  // Если src есть и выглядит как URL - пробуем показать картинку
                  if (src && (src.startsWith('http://') || src.startsWith('https://'))) {
                    return (
                      <div className="attached" key={key} style={{ minWidth: '100px', minHeight: '100px', border: '1px dashed #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px' }}>
                        <img
                          src={src}
                          alt={`Attachment ${index}`}
                          style={{ maxHeight: 100, maxWidth: '100%', objectFit: 'contain' }}
                          onError={(e) => {
                            // Если картинка не загрузилась, меняем её на текст
                            e.target.onerror = null; // предотвращает зацикливание
                            e.target.parentElement.innerHTML = `<span style="font-size: 12px; text-align: center;">Img Err (${index})</span>`;
                          }}
                        />
                      </div>
                    );
                  }
                  // Если src есть, но это не URL (например, локальный путь или ошибка формирования) - показываем текст
                  else if (src) {
                    return (
                      <div className="attached" key={key} style={{ minWidth: '100px', minHeight: '100px', border: '1px dashed #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px' }}>
                        <span style={{ fontSize: '12px', textAlign: 'center' }}>Invalid Src ({index})</span>
                      </div>
                    );
                  }
                  // Если src не удалось определить - показываем общую заглушку
                  else {
                    return (
                      <div className="attached" key={key} style={{ minWidth: '100px', minHeight: '100px', border: '1px dashed #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px' }}>
                        <span style={{ fontSize: '12px', textAlign: 'center' }}>Вложение ({index})</span>
                      </div>
                    );
                  }
                })
              ) : (
                <span>Нет вложений</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="modal-actions" style={{ marginTop: 16 }}>
        {edit ? (
          <>
            <button className="primary" onClick={saveEdit}>💾 Сохранить</button>
            <button onClick={() => setEdit(false)}>❌ Отмена</button>
            {/* ✅ Показываем индикатор загрузки при выборе компании */}
            {loadingRefs && <span>Загрузка...</span>}
          </>
        ) : (
          <>
            <button className="primary" onClick={() => setEdit(true)}>✏️ Редактировать</button>
            <button className="primary" onClick={handlePublish}>📤 Опубликовать</button>
            <button style={{ backgroundColor: '#ef4444' }} onClick={handleDelete}>🗑 Удалить</button>
          </>
        )}
      </div>
    </div>
  );
}