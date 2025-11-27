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
  getContactPersonPhone, // <--- Новый импорт
  getActiveMontajniks,
  fetchActiveTasks,
  
} from "../../api";
import useAuthStore from "@/store/useAuthStore";

export default function AddTaskModal({ open, onClose, onSaved, allowSaveOnlyDraft = false }) {
  const [form, setForm] = useState({
    company_id: null,
    contact_person_id: null,
    contact_person_phone: null, // <--- Добавлено
    vehicle_info: "",
    scheduled_at: "", // ✅ Оставляем пустую строку
    location: "",
    comment: "",
    assignment_type: "broadcast",
    assigned_user_id: null,
    photo_required: false,
    gos_number: "",
    // ✅ equipment как массив объектов { equipment_id, serial_number }
    equipment: [],
    // ✅ work_types_ids как плоский массив ID
    work_types_ids: [],
  });

  const [equipmentList, setEquipmentList] = useState([]); // Список всех Equipment
  const [workTypesList, setWorkTypesList] = useState([]); // Список всех WorkType
  const [companies, setCompanies] = useState([]);
  const [montajniks, setMontajniks] = useState([]);
  const [contactPersons, setContactPersons] = useState([]);
  const [saving, setSaving] = useState(false);
  const [taskId, setTaskId] = useState(null);
  const [loadingPhone, setLoadingPhone] = useState(false); // <--- Для загрузки телефона

  useEffect(() => {
    if (open) {
      loadRefs();
    } else {
      setTaskId(null);
    }
  }, [open]);

  async function loadRefs() {
    try {
      const [eqRes, wtRes, compRes,montRes] = await Promise.allSettled([
        getEquipmentList(),
        getWorkTypes(),
        getCompaniesList(),
        getActiveMontajniks(),
      ]);

      setEquipmentList(eqRes.status === 'fulfilled' ? eqRes.value || [] : []);
      setWorkTypesList(wtRes.status === 'fulfilled' ? wtRes.value || [] : []);
      setCompanies(compRes.status === 'fulfilled' ? compRes.value || [] : []);
      setMontajniks(montRes.status === 'fulfilled' ? montRes.value || [] : []);
    } catch (e) {
      console.error("Ошибка загрузки справочников", e);
    }
  }

  function setField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }


  function SearchableMontajnikSelect({ availableMontajniks, onSelect, selectedUserId }) {
    const [searchTerm, setSearchTerm] = useState("");
    const [filteredMontajniks, setFilteredMontajniks] = useState(availableMontajniks);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
      if (!searchTerm.trim()) {
        setFilteredMontajniks(availableMontajniks);
      } else {
        const termLower = searchTerm.toLowerCase();
        setFilteredMontajniks(
          availableMontajniks.filter(m =>
            (m.name && m.name.toLowerCase().includes(termLower)) ||
            (m.lastname && m.lastname.toLowerCase().includes(termLower)) ||
            (m.id && m.id.toString().includes(termLower)) // Поиск по ID
          )
        );
      }
    }, [searchTerm, availableMontajniks]);

    const handleInputChange = (e) => {
      setSearchTerm(e.target.value);
      setIsOpen(true);
    };

    const handleItemClick = (montajnik) => {
      onSelect(montajnik.id);
      setSearchTerm("");
    };

    const handleInputFocus = () => setIsOpen(true);
    const handleInputBlur = () => setTimeout(() => setIsOpen(false), 150);

    return (
      <div style={{ position: 'relative', width: '100%' }}>
        <input
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder="🔍 Поиск монтажника (имя, фамилия, ID)..."
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #444',
            borderRadius: '4px',
            backgroundColor: '#1a1a1a',
            color: '#e0e0e0',
            fontSize: '14px',
          }}
        />
        {isOpen && filteredMontajniks.length > 0 && (
          <ul
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 100,
              maxHeight: '200px',
              overflowY: 'auto',
              listStyle: 'none',
              margin: 0,
              padding: 0,
              backgroundColor: '#1a1a1a',
              border: '1px solid #444',
              borderTop: 'none',
              borderRadius: '0 0 4px 4px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.5)',
            }}
          >
            {filteredMontajniks.map((m) => (
              <li
                key={m.id}
                onClick={() => handleItemClick(m)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  color: '#e0e0e0',
                  backgroundColor: '#2a2a2a',
                  borderBottom: '1px solid #3a3a3a',
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                {m.name} {m.lastname} (ID: {m.id})
              </li>
            ))}
          </ul>
        )}
        {isOpen && filteredMontajniks.length === 0 && searchTerm.trim() !== '' && (
          <ul
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 100,
              maxHeight: '200px',
              overflowY: 'auto',
              listStyle: 'none',
              margin: 0,
              padding: 0,
              backgroundColor: '#1a1a1a',
              border: '1px solid #444',
              borderTop: 'none',
              borderRadius: '0 0 4px 4px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.5)',
            }}
          >
            <li style={{ padding: '8px 12px', color: '#888', fontStyle: 'italic' }}>
              Ничего не найдено
            </li>
          </ul>
        )}
      </div>
    );
  }


  // ✅ Загрузка контактных лиц при выборе компании
  async function handleCompanyChange(companyId) {
    if (!companyId) {
      setContactPersons([]);
      setField("contact_person_id", null);
      setField("contact_person_phone", null);
      return;
    }
    try {
      const contacts = await getContactPersonsByCompany(companyId);
      setContactPersons(contacts || []);
      setField("contact_person_id", null); // Сброс при смене компании
      setField("contact_person_phone", null);
    } catch (e) {
      console.error("Ошибка загрузки контактных лиц:", e);
      setContactPersons([]);
      setField("contact_person_id", null);
      setField("contact_person_phone", null);
    }
  }

  // ✅ Новая функция для загрузки телефона контактного лица
  async function handleContactPersonChange(contactPersonId) {
    const val = contactPersonId ? parseInt(contactPersonId, 10) : null;
    setField("contact_person_id", val);

    if (val) {
      setLoadingPhone(true);
      try {
        const { phone } = await getContactPersonPhone(val);
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

  async function saveDraft(asPublish = false) {
    if (saving) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        equipment: form.equipment || [],
        work_types: form.work_types_ids || [],
        scheduled_at: form.scheduled_at || null,
        assigned_user_id: form.assigned_user_id ? Number(form.assigned_user_id) : null,
        photo_required: Boolean(form.photo_required),
        assignment_type: form.assignment_type || "broadcast",
        gos_number: form.gos_number || null,
        contact_person_phone: undefined, // Не отправляем, сервер сам возьмёт по contact_person_id
      };

      let result;
    if (asPublish) {
      result = await publishTask(payload);
      alert("✅ Опубликовано");
      useAuthStore.getState().updateActiveTasksCount();
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
  function addEquipmentItem(equipmentId) {
    if (!equipmentId) return;
    const eq = equipmentList.find(e => e.id === equipmentId);
    if (!eq) return;

    const newItem = {
      equipment_id: equipmentId,
      equipment_name: eq.name, // Для отображения
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

  // --- НОВАЯ ЛОГИКА ДЛЯ РАБОТЫ С ТИПАМИ РАБОТ ---
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

  // --- КОМПОНЕНТ: Умный поиск для оборудования ---
  function SearchableEquipmentSelect({ availableEquipment, onSelect, selectedItems }) {
    const [searchTerm, setSearchTerm] = useState("");
    const [filteredEquipment, setFilteredEquipment] = useState(availableEquipment);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
      if (!searchTerm.trim()) {
        setFilteredEquipment(availableEquipment);
      } else {
        const termLower = searchTerm.toLowerCase();
        setFilteredEquipment(
          availableEquipment.filter(eq =>
            eq.name.toLowerCase().includes(termLower)
          )
        );
      }
    }, [searchTerm, availableEquipment]);

    const handleInputChange = (e) => {
      setSearchTerm(e.target.value);
      setIsOpen(true);
    };

    const handleItemClick = (equipment) => {
      onSelect(equipment.id);
      setSearchTerm("");
    };

    const handleInputFocus = () => setIsOpen(true);
    const handleInputBlur = () => setTimeout(() => setIsOpen(false), 150);

    return (
      <div style={{ position: 'relative', width: '100%' }}>
        <input
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder="🔍 Поиск оборудования..."
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #444',
            borderRadius: '4px',
            backgroundColor: '#1a1a1a',
            color: '#e0e0e0',
            fontSize: '14px',
          }}
        />
        {isOpen && filteredEquipment.length > 0 && (
          <ul
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 100,
              maxHeight: '200px',
              overflowY: 'auto',
              listStyle: 'none',
              margin: 0,
              padding: 0,
              backgroundColor: '#1a1a1a',
              border: '1px solid #444',
              borderTop: 'none',
              borderRadius: '0 0 4px 4px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.5)',
            }}
          >
            {filteredEquipment.map((eq) => (
              <li
                key={eq.id}
                onClick={() => handleItemClick(eq)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  color: '#e0e0e0',
                  backgroundColor: '#2a2a2a',
                  borderBottom: '1px solid #3a3a3a',
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                {eq.name}
              </li>
            ))}
          </ul>
        )}
        {isOpen && filteredEquipment.length === 0 && searchTerm.trim() !== '' && (
          <ul
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 100,
              maxHeight: '200px',
              overflowY: 'auto',
              listStyle: 'none',
              margin: 0,
              padding: 0,
              backgroundColor: '#1a1a1a',
              border: '1px solid #444',
              borderTop: 'none',
              borderRadius: '0 0 4px 4px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.5)',
            }}
          >
            <li style={{ padding: '8px 12px', color: '#888', fontStyle: 'italic' }}>
              Ничего не найдено
            </li>
          </ul>
        )}
      </div>
    );
  }

  // --- КОМПОНЕНТ: Умный поиск для видов работ ---
  function SearchableWorkTypeSelect({ availableWorkTypes, onSelect, selectedWorkTypeIds }) {
    const [searchTerm, setSearchTerm] = useState("");
    const [filteredWorkTypes, setFilteredWorkTypes] = useState(availableWorkTypes);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
      if (!searchTerm.trim()) {
        setFilteredWorkTypes(availableWorkTypes);
      } else {
        const termLower = searchTerm.toLowerCase();
        setFilteredWorkTypes(
          availableWorkTypes.filter(wt =>
            wt.name.toLowerCase().includes(termLower)
          )
        );
      }
    }, [searchTerm, availableWorkTypes]);

    const handleInputChange = (e) => {
      setSearchTerm(e.target.value);
      setIsOpen(true);
    };

    const handleItemClick = (workType) => {
      onSelect(workType.id);
      setSearchTerm("");
    };

    const handleInputFocus = () => setIsOpen(true);
    const handleInputBlur = () => setTimeout(() => setIsOpen(false), 150);

    return (
      <div style={{ position: 'relative', width: '100%' }}>
        <input
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder="🔍 Поиск вида работ..."
          style={{
            width: '100%',
            padding: '8px 12px',
            border: '1px solid #444',
            borderRadius: '4px',
            backgroundColor: '#1a1a1a',
            color: '#e0e0e0',
            fontSize: '14px',
          }}
        />
        {isOpen && filteredWorkTypes.length > 0 && (
          <ul
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 100,
              maxHeight: '200px',
              overflowY: 'auto',
              listStyle: 'none',
              margin: 0,
              padding: 0,
              backgroundColor: '#1a1a1a',
              border: '1px solid #444',
              borderTop: 'none',
              borderRadius: '0 0 4px 4px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.5)',
            }}
          >
            {filteredWorkTypes.map((wt) => (
              <li
                key={wt.id}
                onClick={() => handleItemClick(wt)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  color: '#e0e0e0',
                  backgroundColor: '#2a2a2a',
                  borderBottom: '1px solid #3a3a3a',
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                {wt.name}
              </li>
            ))}
          </ul>
        )}
        {isOpen && filteredWorkTypes.length === 0 && searchTerm.trim() !== '' && (
          <ul
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 100,
              maxHeight: '200px',
              overflowY: 'auto',
              listStyle: 'none',
              margin: 0,
              padding: 0,
              backgroundColor: '#1a1a1a',
              border: '1px solid #444',
              borderTop: 'none',
              borderRadius: '0 0 4px 4px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.5)',
            }}
          >
            <li style={{ padding: '8px 12px', color: '#888', fontStyle: 'italic' }}>
              Ничего не найдено
            </li>
          </ul>
        )}
      </div>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Добавить задачу">
      <div className="form-grid">
        {/* Компания */}
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
                setField("contact_person_phone", null);
              }
            }}
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid #444",
              backgroundColor: "#1a1a1a",
              color: "#e0e0e0",
            }}
          >
            <option value="">Выберите компанию</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        {/* Контактное лицо */}
        <label>
          Контактное лицо
          <select
            value={form.contact_person_id || ""}
            onChange={(e) => handleContactPersonChange(e.target.value)}
            disabled={!form.company_id}
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid #444",
              backgroundColor: "#1a1a1a",
              color: "#e0e0e0",
            }}
          >
            <option value="">Выберите контактное лицо</option>
            {contactPersons.map(cp => (
              <option key={cp.id} value={cp.id}>{cp.name}</option>
            ))}
          </select>
          {loadingPhone && <span style={{ fontSize: '0.8em', color: '#888' }}>Загрузка телефона...</span>}
        </label>

        {/* Телефон контактного лица */}
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
              border: "1px solid #444",
              backgroundColor: "#2a2a2a",
              color: "#b0b0b0",
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
                color: '#bb86fc',
                textDecoration: 'none',
              }}
              onClick={(e) => {
                e.preventDefault();
                window.location.href = `tel:${form.contact_person_phone}`;
              }}
            >
            </a>
          )}
        </label>

        <label>
          ТС
          <input
            value={form.vehicle_info}
            onChange={(e) => setField("vehicle_info", e.target.value)}
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid #444",
              backgroundColor: "#1a1a1a",
              color: "#e0e0e0",
            }}
          />
        </label>

        <label>
          Гос. номер
          <input
            value={form.gos_number || ""}
            onChange={(e) => setField("gos_number", e.target.value)}
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid #444",
              backgroundColor: "#1a1a1a",
              color: "#e0e0e0",
            }}
          />
        </label>

        <label>
          Дата и время
          <input
            type="datetime-local"
            value={form.scheduled_at}
            onChange={(e) => setField("scheduled_at", e.target.value)}
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid #444",
              backgroundColor: "#1a1a1a",
              color: "#e0e0e0",
            }}
          />
        </label>

        <label style={{ display: "block", marginTop: "12px", color: "#e0e0e0" }}>
            Место/адрес
            <textarea
              value={form.location || ""}
              onChange={(e) => setField("location", e.target.value)}
              rows="3"
              style={{
                width: "100%",
                resize: "vertical",        // <-- только вертикальное растягивание
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #444",
                backgroundColor: "#1a1a1a",
                color: "#e0e0e0",
                marginTop: "4px"
              }}
            />
          </label>

          <label style={{ display: "block", marginTop: "12px", color: "#e0e0e0" }}>
            Комментарий
            <textarea
              value={form.comment || ""}
              onChange={(e) => setField("comment", e.target.value)}
              rows="3"
              style={{
                width: "100%",
                resize: "vertical",        // <-- только вниз тянуть
                padding: "8px",
                borderRadius: "4px",
                border: "1px solid #444",
                backgroundColor: "#1a1a1a",
                color: "#e0e0e0",
                marginTop: "4px"
              }}
            />
          </label>

        {/* Оборудование */}
        <label>Оборудование</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '10px' }}>
          {form.equipment.map((item, index) => {
            const eq = equipmentList.find((e) => e.id === item.equipment_id);
            return (
              <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  flex: 1,
                  padding: '8px',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  backgroundColor: '#2a2a2a',
                  color: '#e0e0e0',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {eq?.name || `ID ${item.equipment_id}`}
                </div>
                <div style={{ flex: 1 }}>
                  <input
                    type="text"
                    placeholder="Серийный номер"
                    value={item.serial_number || ""}
                    onChange={(e) => updateEquipmentItem(index, "serial_number", e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      backgroundColor: '#1a1a1a',
                      color: '#e0e0e0',
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeEquipmentItem(index)}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: '#cf6679',
                    color: '#000',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
        <SearchableEquipmentSelect
          availableEquipment={equipmentList}
          onSelect={addEquipmentItem}
          selectedItems={form.equipment} // Не используется в фильтрации, так как разрешено дублирование
        />

        {/* Виды работ */}
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
              const wt = workTypesList.find((w) => w.id === id);
              if (!wt) return null;
              return (
                <div
                  key={id}
                  style={{
                    padding: "4px 8px",
                    border: "1px solid #444",
                    borderRadius: 12,
                    backgroundColor: "#bb86fc", // Цвет для работы
                    color: "#000", // Темный текст на светлом фоне
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {wt.name} (x{count})
                  <span
                    style={{ cursor: "pointer", fontWeight: 'bold' }}
                    onClick={() => removeWorkType(id)}
                  >
                    ×
                  </span>
                </div>
              );
            });
          })()}
        </div>
        <SearchableWorkTypeSelect
          availableWorkTypes={workTypesList}
          onSelect={addWorkType}
          selectedWorkTypeIds={form.work_types_ids} // Не используется в фильтрации, так как разрешено дублирование
        />

       <label>
          Тип назначения
          <select
            value={form.assignment_type}
            onChange={(e) => setField("assignment_type", e.target.value)}
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid #444",
              backgroundColor: "#1a1a1a",
              color: "#e0e0e0",
            }}
          >
            <option value="broadcast">broadcast</option>
            <option value="individual">assigned</option>
          </select>
        </label>

        {/* ===== НАЗНАЧИТЬ МОНТАЖНИКА (новая логика, условный рендер) ===== */}
        {/* ✅ Поле "Назначить монтажника" отображается только если тип назначения "assigned" */}
        {form.assignment_type === "individual" && (
          <div>
            <label>
              Назначить монтажника
            </label>
            {/* --- Отображение выбранного монтажника --- */}
            {form.assigned_user_id && (
              <div style={{ padding: '4px 8px', marginBottom: '8px', border: '1px solid #444', borderRadius: '4px', backgroundColor: '#2a2a2a', color: '#e0e0e0' }}>
                {/* ✅ Отображаем только имя и фамилию, без ID */}
                Выбран: {montajniks.find(m => m.id === form.assigned_user_id)?.name || ''} {montajniks.find(m => m.id === form.assigned_user_id)?.lastname || ''}
                <button
                  type="button"
                  onClick={() => setField("assigned_user_id", null)}
                  style={{ marginLeft: '8px', padding: '2px 4px', backgroundColor: '#cf6679', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  ×
                </button>
              </div>
            )}
            {/* --- Выбор нового монтажника через SearchableSelect --- */}
            <SearchableMontajnikSelect
              availableMontajniks={montajniks}
              onSelect={(userId) => setField("assigned_user_id", userId)}
              selectedUserId={form.assigned_user_id}
            />
          </div>
        )}

        

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            checked={form.photo_required}
            onChange={(e) => setField("photo_required", e.target.checked)}
          />
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