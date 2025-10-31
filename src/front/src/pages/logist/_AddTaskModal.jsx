// front/src/pages/logist/_AddTaskModal.jsx
import React, { useState, useEffect } from "react";
import Modal from "../../components/Modal";
import {
  createDraft,
  publishTask,
  getEquipmentList,
  getWorkTypes,
  getCompaniesList,
  getContactPersonsByCompany,
} from "../../api";

export default function AddTaskModal({ open, onClose, onSaved, allowSaveOnlyDraft = false }) {

  // ✅ Изменяем структуру form для хранения equipment как массив объектов
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
    // ❌ Убираем equipment_ids
    // equipment_ids: [],
    // ✅ Добавляем новое поле gos_number
    gos_number: "",
    // ✅ Добавляем equipment как массив объектов
    equipment: [],
    work_types_ids: [], // Оставляем как список ID для простоты подсчета quantity
  });

  const [equipment, setEquipment] = useState([]); // Список всех доступных Equipment
  const [workTypes, setWorkTypes] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [contactPersons, setContactPersons] = useState([]);
  const [saving, setSaving] = useState(false);
  const [taskId, setTaskId] = useState(null);

  useEffect(() => {
    loadRefs();
    if (!open) {
      setTaskId(null);
    }
  }, [open]);

  async function loadRefs() {
    try {
      const eqRes = await getEquipmentList();
      const wtRes = await getWorkTypes();
      const compRes = await getCompaniesList();
      setEquipment(eqRes || []);
      setWorkTypes(wtRes || []);
      setCompanies(compRes || []);
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

  async function saveDraft(asPublish = false) {
    if (saving) return;
    setSaving(true);
    try {
      // ✅ Формируем payload в новом формате
      const payload = {
        ...form,
        // ❌ Убираем старое поле equipment_ids
        // equipment: (form.equipment_ids || []).map((id) => ({ equipment_id: id, quantity: 1 })),
        // ✅ Добавляем новое поле equipment как массив объектов
        equipment: form.equipment || [],
        work_types: form.work_types_ids || [], // Передаем список ID, сервер подсчитает quantity
        // ✅ scheduled_at передаём как есть (строку из datetime-local)
        scheduled_at: form.scheduled_at || null,
        assigned_user_id: form.assigned_user_id ? Number(form.assigned_user_id) : null,
        photo_required: Boolean(form.photo_required),
        assignment_type: form.assignment_type || "broadcast",
        // ✅ gos_number передаётся как есть
        gos_number: form.gos_number || null,
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

      onSaved && onSaved(newId);
      onClose();
    } catch (e) {
      console.error("Ошибка при сохранении:", e);
      alert(e.response?.data?.detail || e.message || "Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  }

  // --- НОВАЯ ЛОГИКА ДЛЯ РАБОТЫ С ОБОРУДОВАНИЕМ ---

  // ✅ Функция для добавления нового экземпляра оборудования в список
  function addEquipmentItem(equipmentId) {
    if (!equipmentId) return;
    const eq = equipment.find(e => e.id === equipmentId);
    if (!eq) return;

    const newItem = {
      // id: null, // ID будет присвоен бэкендом при сохранении
      equipment_id: equipmentId,
      equipment_name: eq.name, // Для удобства отображения
      serial_number: "", // Начальное пустое значение
      // quantity: 1, // ❌ Убираем quantity, так как каждый элемент - это одна единица
    };
    setForm((prevForm) => ({
      ...prevForm,
      equipment: [...prevForm.equipment, newItem],
    }));
  }

  // ✅ Функция для обновления поля конкретного экземпляра оборудования
  function updateEquipmentItem(index, field, value) {
    setForm((prevForm) => {
      const updatedEquipment = [...prevForm.equipment];
      // Проверяем, существует ли элемент по индексу
      if (updatedEquipment[index]) {
        updatedEquipment[index] = { ...updatedEquipment[index], [field]: value };
        return { ...prevForm, equipment: updatedEquipment };
      }
      // Если индекс не существует, возвращаем предыдущее состояние
      return prevForm;
    });
  }

  // ✅ Функция для удаления экземпляра оборудования из списка (полностью)
 function removeEquipmentItem(index) {
    setForm((prevForm) => ({
      ...prevForm,
      equipment: prevForm.equipment.filter((_, i) => i !== index),
    }));
  }

  // --- НОВАЯ ЛОГИКА ДЛЯ РАБОТЫ С ТИПАМИ РАБОТ ---

  // ✅ Функция для добавления типа работы в список (увеличивает счётчик)
  function addWorkType(workTypeId) {
    if (!workTypeId) return;
    setForm((prevForm) => ({
      ...prevForm,
      work_types_ids: [...prevForm.work_types_ids, workTypeId],
    }));
  }

  // ✅ Функция для удаления типа работы из списка (уменьшает счётчик)
  function removeWorkType(workTypeId) {
    setForm((prevForm) => {
      const indexToRemove = prevForm.work_types_ids.indexOf(workTypeId);
      if (indexToRemove !== -1) {
        const updatedWorkTypes = [...prevForm.work_types_ids];
        updatedWorkTypes.splice(indexToRemove, 1); // Удаляем только одно вхождение
        return { ...prevForm, work_types_ids: updatedWorkTypes };
      }
      return prevForm;
    });
  }

  // --- ЛОГИКА ДЛЯ ВЫБОРА ТИПОВ РАБОТ ОСТАЁТСЯ ПРОСТОЙ ---
  // work_types_ids - это список ID. Если ID встречается дважды, сервер подсчитает quantity=2.


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
            disabled={!form.company_id} // доступно только если выбрана компания
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

        {/* ===== НОВОЕ ПОЛЕ: ГОС. НОМЕР ===== */}
        <label>
          Гос. номер
          <input value={form.gos_number || ""} onChange={(e) => setField("gos_number", e.target.value)} />
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
            
                    onChange={(e) => updateEquipmentItem(index, "serial_number", e.target.value)} 
                    style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
                  />
                </div>
                {/* Кнопка удаления (удаляет конкретную строку/единицу) */}
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

        {/* --- Выбор нового оборудования из списка --- */}
        <select
          size={5}
          value=""
          onChange={(e) => {
            const val = Number(e.target.value);
            if (!isNaN(val) && val > 0) {
              {/* ✅ Добавляем по equipment_id, без проверки на дубликаты */}
              addEquipmentItem(val); 
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

        {/* ===== Виды работ (остаётся прежним) ===== */}
        {/* ===== Виды работ (обновлённая логика) ===== */}
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
                    onClick={() => removeWorkType(id)} 
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
              addWorkType(val); {/* ✅ Добавляем по work_type_id */}
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