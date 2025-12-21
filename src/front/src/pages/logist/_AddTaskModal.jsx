// front/src/pages/logist/_AddTaskModal.jsx
import React, { useState, useEffect } from "react";
import {
  createDraft,
  publishTask,
  getEquipmentList,
  getWorkTypes,
  getCompaniesList,
  getContactPersonsByCompany,
  getContactPersonPhone, 
  getActiveMontajniks,
} from "../../api";
import useAuthStore from "@/store/useAuthStore";

export default function AddTaskModal({ open, onClose, onSaved, allowSaveOnlyDraft = false }) {
  const [form, setForm] = useState({
    company_id: null,
    contact_person_id: null,
    contact_person_phone: null,
    vehicle_info: "",
    scheduled_at: "", 
    location: "",
    comment: "",
    assignment_type: "broadcast",
    assigned_user_id: null,
    photo_required: true,
    gos_number: "",
    equipment: [],
    work_types_ids: [],
  });

  const [equipmentList, setEquipmentList] = useState([]); 
  const [workTypesList, setWorkTypesList] = useState([]); 
  const [companies, setCompanies] = useState([]);
  const [montajniks, setMontajniks] = useState([]);
  const [contactPersons, setContactPersons] = useState([]);
  const [saving, setSaving] = useState(false);
  const [taskId, setTaskId] = useState(null);
  const [loadingPhone, setLoadingPhone] = useState(false);

  useEffect(() => {
    if (open) {
      loadRefs();
    } else {
      setTaskId(null);
    }
  }, [open]);

  async function loadRefs() {
    try {
      const [eqRes, wtRes, compRes, montRes] = await Promise.allSettled([
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

  function SearchableCompanySelect({ availableCompanies, onSelect, selectedCompanyId }) {
    const [searchTerm, setSearchTerm] = useState("");
    const [filteredCompanies, setFilteredCompanies] = useState(availableCompanies);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
      if (!searchTerm.trim()) {
        setFilteredCompanies(availableCompanies);
      } else {
        const termLower = searchTerm.toLowerCase();
        setFilteredCompanies(
          availableCompanies.filter(c =>
            c.name.toLowerCase().includes(termLower)
          )
        );
      }
    }, [searchTerm, availableCompanies]);

    const handleInputChange = (e) => {
      setSearchTerm(e.target.value);
      setIsOpen(true);
    };

    const handleItemClick = (company) => {
      onSelect(company.id);
      setSearchTerm(company.name);
      setIsOpen(false);
    };

    const handleInputFocus = () => setIsOpen(true);
    const handleInputBlur = () => setTimeout(() => setIsOpen(false), 150);

    return (
      <div className="searchable-select-container">
        <input
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder="🔍 Поиск компании..."
          className="searchable-select-input"
        />
        {isOpen && filteredCompanies.length > 0 && (
          <ul className="searchable-select-dropdown">
            {filteredCompanies.map((c) => (
              <li
                key={c.id}
                onClick={() => handleItemClick(c)}
                className="searchable-select-option"
                onMouseDown={(e) => e.preventDefault()}
              >
                {c.name}
              </li>
            ))}
          </ul>
        )}
        {isOpen && filteredCompanies.length === 0 && searchTerm.trim() !== '' && (
          <ul className="searchable-select-dropdown">
            <li className="searchable-select-no-results">
              Ничего не найдено
            </li>
          </ul>
        )}
      </div>
    );
  }

  function SelectedCompanyDisplay({ company, onRemove }) {
    if (!company) return null;

    return (
      <div className="selected-company-display">
        <span>{company.name}</span>
        <button
          type="button"
          onClick={onRemove}
          className="selected-company-remove"
        >
          ×
        </button>
      </div>
    );
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
            (m.id && m.id.toString().includes(termLower)) 
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
      <div className="searchable-select-container">
        <input
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder="🔍 Поиск монтажника (имя, фамилия, ID)..."
          className="searchable-select-input"
        />
        {isOpen && filteredMontajniks.length > 0 && (
          <ul className="searchable-select-dropdown">
            {filteredMontajniks.map((m) => (
              <li
                key={m.id}
                onClick={() => handleItemClick(m)}
                className="searchable-select-option"
                onMouseDown={(e) => e.preventDefault()}
              >
                {m.name} {m.lastname} (ID: {m.id})
              </li>
            ))}
          </ul>
        )}
        {isOpen && filteredMontajniks.length === 0 && searchTerm.trim() !== '' && (
          <ul className="searchable-select-dropdown">
            <li className="searchable-select-no-results">
              Ничего не найдено
            </li>
          </ul>
        )}
      </div>
    );
  }

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
      setField("contact_person_id", null); 
      setField("contact_person_phone", null);
    } catch (e) {
      console.error("Ошибка загрузки контактных лиц:", e);
      setContactPersons([]);
      setField("contact_person_id", null);
      setField("contact_person_phone", null);
    }
  }

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
        contact_person_phone: undefined,
      };

      let result;
      if (asPublish) {
        result = await publishTask(payload);
        if (window.Telegram?.WebApp) {
          window.Telegram.WebApp.showAlert("✅ Опубликовано");
        } else {
          alert("✅ Опубликовано");
        }
        useAuthStore.getState().updateActiveTasksCount();
      } else {
        result = await createDraft(payload);
        if (window.Telegram?.WebApp) {
          window.Telegram.WebApp.showAlert("💾 Сохранено черновиком");
        } else {
          alert("💾 Сохранено черновиком");
        }
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
      const errorMsg = e.response?.data?.detail || e.message || "Ошибка при сохранении";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(errorMsg);
      } else {
        alert(errorMsg);
      }
    } finally {
      setSaving(false);
    }
  }

  function addEquipmentItem(equipmentId) {
    if (!equipmentId) return;
    const eq = equipmentList.find(e => e.id === equipmentId);
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
      <div className="searchable-select-container">
        <input
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder="🔍 Поиск оборудования..."
          className="searchable-select-input"
        />
        {isOpen && filteredEquipment.length > 0 && (
          <ul className="searchable-select-dropdown">
            {filteredEquipment.map((eq) => (
              <li
                key={eq.id}
                onClick={() => handleItemClick(eq)}
                className="searchable-select-option"
                onMouseDown={(e) => e.preventDefault()}
              >
                {eq.name}
              </li>
            ))}
          </ul>
        )}
        {isOpen && filteredEquipment.length === 0 && searchTerm.trim() !== '' && (
          <ul className="searchable-select-dropdown">
            <li className="searchable-select-no-results">
              Ничего не найдено
            </li>
          </ul>
        )}
      </div>
    );
  }

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
      <div className="searchable-select-container">
        <input
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder="🔍 Поиск вида работ..."
          className="searchable-select-input"
        />
        {isOpen && filteredWorkTypes.length > 0 && (
          <ul className="searchable-select-dropdown">
            {filteredWorkTypes.map((wt) => (
              <li
                key={wt.id}
                onClick={() => handleItemClick(wt)}
                className="searchable-select-option"
                onMouseDown={(e) => e.preventDefault()}
              >
                {wt.name}
              </li>
            ))}
          </ul>
        )}
        {isOpen && filteredWorkTypes.length === 0 && searchTerm.trim() !== '' && (
          <ul className="searchable-select-dropdown">
            <li className="searchable-select-no-results">
              Ничего не найдено
            </li>
          </ul>
        )}
      </div>
    );
  }

  const assignmentTypeOptions = [
    { value: "broadcast", display: "В эфир" },
    { value: "individual", display: "Персональная" }
  ];

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Добавить задачу</h2>
          <button className="close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="form-grid">
            <label className="dark-label">
              Компания
              <SearchableCompanySelect
                availableCompanies={companies}
                onSelect={(companyId) => {
                  setField("company_id", companyId);
                  if (companyId) {
                    handleCompanyChange(companyId); 
                  } else {
                    setContactPersons([]);
                    setField("contact_person_id", null);
                    setField("contact_person_phone", null);
                  }
                }}
                selectedCompanyId={form.company_id} 
              />
              {form.company_id && (
                <SelectedCompanyDisplay
                  company={companies.find(c => c.id === form.company_id)}
                  onRemove={() => {
                    setField("company_id", null);
                    setContactPersons([]);
                    setField("contact_person_id", null);
                    setField("contact_person_phone", null);
                  }}
                />
              )}
            </label>

            <label className="dark-label">
              Контактное лицо
              <select
                value={form.contact_person_id || ""}
                onChange={(e) => {
                  const val = e.target.value ? parseInt(e.target.value, 10) : null;
                  setField("contact_person_id", val);
                  if (val) {
                    handleContactPersonChange(val);
                  } else {
                    setField("contact_person_phone", null);
                  }
                }}
                disabled={!form.company_id} 
                className="dark-select"
              >
                <option value="">Выберите контактное лицо</option>
                {contactPersons.map(cp => (
                  <option key={cp.id} value={cp.id}>{cp.name}</option>
                ))}
              </select>
              {loadingPhone && <span style={{ fontSize: '0.8em', color: '#888' }}>Загрузка телефона...</span>}
            </label>

            <label className="dark-label">
              Телефон контактного лица
              <input
                type="text"
                value={form.contact_person_phone || ""}
                readOnly
                placeholder="Выберите контактное лицо"
                className="dark-select"
                style={{ cursor: "not-allowed" }}
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

            <label className="dark-label">
              ТС
              <input
                value={form.vehicle_info}
                onChange={(e) => setField("vehicle_info", e.target.value)}
                className="dark-select"
              />
            </label>

            <label className="dark-label">
              Гос. номер
              <input
                value={form.gos_number || ""}
                onChange={(e) => setField("gos_number", e.target.value)}
                className="dark-select"
              />
            </label>

            <label className="dark-label">
              Дата и время
              <input
                type="datetime-local"
                value={form.scheduled_at}
                onChange={(e) => setField("scheduled_at", e.target.value)}
                className="dark-select"
              />
            </label>

            <label className="dark-label">
              Место/адрес
              <textarea
                value={form.location || ""}
                onChange={(e) => setField("location", e.target.value)}
                rows="3"
                className="dark-select"
                style={{ resize: "vertical", marginTop: "4px" }}
              />
            </label>

            <label className="dark-label">
              Комментарий
              <textarea
                value={form.comment || ""}
                onChange={(e) => setField("comment", e.target.value)}
                rows="3"
                className="dark-select"
                style={{ resize: "vertical", marginTop: "4px" }}
              />
            </label>

            <label className="dark-label">Оборудование</label>
            <div className="equipment-list-container">
              {form.equipment.map((item, index) => {
                const eq = equipmentList.find((e) => e.id === item.equipment_id);
                return (
                  <div key={index} className="equipment-item-row">
                    <div className="equipment-item-name">
                      {eq?.name || `ID ${item.equipment_id}`}
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Серийный номер"
                        value={item.serial_number || ""}
                        onChange={(e) => updateEquipmentItem(index, "serial_number", e.target.value)}
                        className="equipment-item-serial"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeEquipmentItem(index)}
                      className="equipment-item-remove"
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
              selectedItems={form.equipment} 
            />

            <label className="dark-label">Виды работ</label>
            <div className="work-types-container">
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
                    <div key={id} className="work-type-tag">
                      {wt.name} (x{count})
                      <span className="work-type-tag-remove" onClick={() => removeWorkType(id)}>
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
              selectedWorkTypeIds={form.work_types_ids} 
            />

            <label className="dark-label">
              Тип назначения
              <select
                value={form.assignment_type}
                onChange={(e) => setField("assignment_type", e.target.value)}
                className="dark-select"
              >
                {assignmentTypeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.display}
                  </option>
                ))}
              </select>
            </label>

            {form.assignment_type === "individual" && (
              <div>
                <label className="dark-label">
                  Назначить монтажника
                </label>
                {form.assigned_user_id && (
                  <div style={{ padding: '4px 8px', marginBottom: '8px', border: '1px solid #30363d', borderRadius: '4px', backgroundColor: '#161b22', color: '#c9d1d9' }}>
                    Выбран: {montajniks.find(m => m.id === form.assigned_user_id)?.name || ''} {montajniks.find(m => m.id === form.assigned_user_id)?.lastname || ''}
                    <button
                      type="button"
                      onClick={() => setField("assigned_user_id", null)}
                      style={{ marginLeft: '8px', padding: '2px 4px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      ×
                    </button>
                  </div>
                )}
                <SearchableMontajnikSelect
                  availableMontajniks={montajniks}
                  onSelect={(userId) => setField("assigned_user_id", userId)}
                  selectedUserId={form.assigned_user_id}
                />
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button 
            onClick={() => saveDraft(false)} 
            disabled={saving} 
            className="gradient-button"
          >
            {saving ? 'Сохранение...' : '💾 Сохранить как черновик'}
          </button>
          {!allowSaveOnlyDraft && (
            <button 
              onClick={() => saveDraft(true)} 
              disabled={saving} 
              className="gradient-button"
            >
              {saving ? 'Публикация...' : '📤 Опубликовать'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}