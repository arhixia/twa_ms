// front/src/pages/logist/DraftDetailPage.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
// ✅ Добавим импорт для получения списка компаний и контактных лиц
import { getDraft, patchDraft, deleteDraft, publishTask, getEquipmentList, getWorkTypes, getCompaniesList, getContactPersonsByCompany } from "../../api";
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

      // --- НОВАЯ ЛОГИКА ОБРАБОТКИ equipment и work_types (аналогично TaskDetailPage) ---
      // equipment: массив объектов {equipment_id, serial_number}
      const processedEquipment = (d.equipment || []).map(e => ({
        equipment_id: e.equipment_id,
        serial_number: e.serial_number || "",
        // quantity игнорируется, так как каждая строка - отдельное оборудование
      }));

      // work_types: для отображения в task-view нужен массив объектов { work_type_id, quantity }
      // d.work_types уже содержит объекты с work_type_id и quantity
      const processedWorkTypesForView = (d.work_types || []).map(wt => ({
        work_type_id: wt.work_type_id,
        quantity: wt.quantity
      }));

      // --- СОЗДАЕМ task-подобный объект для отображения в task-view ---
      const processedDraftForView = {
        ...d,
        equipment: processedEquipment.map(e => ({
          equipment_id: e.equipment_id,
          serial_number: e.serial_number,
          quantity: 1, // Условное количество 1 для отображения, так как каждая строка - единица
        })),
        work_types: processedWorkTypesForView, // Теперь это [{ work_type_id: 3, quantity: 2 }, ...]
      };

      // --- ИНИЦИАЛИЗАЦИЯ form ДЛЯ РЕДАКТИРОВАНИЯ ---
      // form.work_types_ids: плоский массив ID, как в _AddTaskModal
      const formWorkTypesIds = [];
      (d.work_types || []).forEach(wtItem => {
        for (let i = 0; i < wtItem.quantity; i++) {
          formWorkTypesIds.push(wtItem.work_type_id);
        }
      });

      const initialForm = {
        ...d,
        equipment: processedEquipment, // массив объектов { equipment_id, serial_number }
        work_types_ids: formWorkTypesIds, // плоский массив ID, например, [3, 3, 5]
      };

      setDraft(processedDraftForView); // Для отображения в task-view
      setForm(initialForm); // Для редактирования
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
    setField("work_types_ids", [...(form.work_types_ids || []), workTypeId]);
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
      // Формируем payload в формате бекенда (аналогично _AddTaskModal)
      const payload = {
        ...form,
        equipment: form.equipment || [],
        work_types: form.work_types_ids || [], // Отправляем плоский массив ID
        // ❌ Явно исключаем client_price и montajnik_reward, так как они рассчитываются автоматически
        client_price: undefined,
        montajnik_reward: undefined,
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
      // Формируем payload для публикации (аналогично _AddTaskModal)
      const publishPayload = {
        draft_id: Number(id),
        ...form, // берем все поля из form, включая company_id, contact_person_id, gos_number
        equipment: form.equipment || [],
        work_types: form.work_types_ids || [], // Отправляем плоский массив ID
        // ❌ Явно исключаем client_price и montajnik_reward
        client_price: undefined,
        montajnik_reward: undefined,
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

          {/* ===== НОВОЕ ПОЛЕ: ГОС. НОМЕР ===== */}
          <label>
            Гос. номер
            <input value={form.gos_number || ""} onChange={(e) => setField("gos_number", e.target.value)} />
          </label>

          <label>
            Дата и время
            <input type="datetime-local" value={form.scheduled_at || ""} onChange={(e) => setField("scheduled_at", e.target.value)} />
          </label>
          <label className="full-row">
            Место {/* ✅ Исправлено: было "Место", теперь соответствует полю 'location' */}
            <textarea value={form.location || ""} onChange={(e) => setField("location", e.target.value)} />
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

          <label className="full-row">
            Комментарий
            <textarea value={form.comment || ""} onChange={(e) => setField("comment", e.target.value)} />
          </label>

          <label>
            Монтажник (ID)
            <input value={form.assigned_user_id || ""} onChange={(e) => setField("assigned_user_id", e.target.value)} />
          </label>

          {/* ❌ Убираем поля редактирования цен */}
          {/* <label>
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
          </label> */}

        </div>
      ) : (
        <div className="task-view">
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
          {/* ===== Отображение гос. номера ===== */}
          <p><b>Гос. номер:</b> {draft.gos_number || "—"}</p>
          <p>
            <b>Дата:</b> {draft.scheduled_at ? new Date(draft.scheduled_at).toLocaleString() : "—"}
          </p>
          <p>
            <b>Место:</b> {draft.location || "—"} {/* ✅ Исправлено: было "Место", теперь соответствует полю 'location' */}
          </p>
          <p>
            <b>Комментарий:</b> {draft.comment || "—"}
          </p>
          {/* ✅ Оставляем отображение цен */}
          <p>
            <b>Цена клиента:</b> {draft.client_price || "—"}
          </p>
          <p>
            <b>Награда монтажнику:</b> {draft.montajnik_reward || "—"}
          </p>
          {/* ===== Оборудование (отображение) ===== */}
          <p>
            <b>Оборудование:</b>{" "}
            {(draft.equipment || [])
              .map((e) => {
                const eqName = equipment.find((eq) => eq.id === e.equipment_id)?.name;
                // ✅ Отображаем serial_number и quantity
                return `${eqName || e.equipment_id}${e.serial_number ? ` (SN: ${e.serial_number})` : ''} x${e.quantity}`;
              })
              .join(", ") || "—"}
          </p>
          {/* ===== Виды работ (отображение) ===== */}
          <p>
  <b>Виды работ:</b>{" "}
  {draft.work_types && draft.work_types.length > 0 ? (
    draft.work_types.map(wt => { // wt = { work_type_id: 3, quantity: 2 }
      const wtObj = workTypes.find(w => w.id === wt.work_type_id); // w.id === 3
      const name = wtObj?.name || wt.work_type_id; // "Проверка оборудования" или 3
      const count = wt.quantity || 1; // 2
      return `${name} (x${count})`; // "Проверка оборудования (x2)"
    }).join(", ")
  ) : "—"}
</p>
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
