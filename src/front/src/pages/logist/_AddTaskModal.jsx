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

  function SearchableContactPersonSelect({ availableContactPersons, onSelect, selectedContactPersonId }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredPersons, setFilteredPersons] = useState(availableContactPersons);
  const [isOpen, setIsOpen] = useState(false);

  // Обновляем список при изменении доступных контактных лиц
  useEffect(() => {
    setFilteredPersons(availableContactPersons);
    // Если выбран человек, и он есть в новом списке, отображаем его имя
    if (selectedContactPersonId) {
      const person = availableContactPersons.find(p => p.id === selectedContactPersonId);
      if (person) {
        setSearchTerm(person.name);
      } else {
        setSearchTerm("");
      }
    } else {
      setSearchTerm("");
    }
  }, [availableContactPersons, selectedContactPersonId]);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredPersons(availableContactPersons);
    } else {
      const termLower = searchTerm.toLowerCase();
      setFilteredPersons(
        availableContactPersons.filter(cp =>
          cp.name.toLowerCase().includes(termLower)
        )
      );
    }
  }, [searchTerm, availableContactPersons]);

  const handleInputChange = (e) => {
    setSearchTerm(e.target.value);
    setIsOpen(true);
  };

  const handleItemClick = (person) => {
    onSelect(person.id);
    setSearchTerm(person.name); // Показываем имя в поле
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
        placeholder="🔍 Поиск контактного лица..."
        className="searchable-select-input"
        disabled={availableContactPersons.length === 0}
      />
      {isOpen && filteredPersons.length > 0 && (
        <ul className="searchable-select-dropdown">
          {filteredPersons.map((cp) => (
            <li
              key={cp.id}
              onClick={() => handleItemClick(cp)}
              className="searchable-select-option"
              onMouseDown={(e) => e.preventDefault()}
            >
              {cp.name}
            </li>
          ))}
        </ul>
      )}
      {isOpen && filteredPersons.length === 0 && searchTerm.trim() !== '' && (
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
        <div className="task-view" style={{ padding: '0' }}>
          {/* === КЛИЕНТ === */}
          <div className="task-section">
            <div className="task-section-header">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
              <span>Клиент</span>
            </div>

            <div className="task-field">
              <div className="task-field-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                Компания
              </div>
              <div className="task-field-value">
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
              </div>
            </div>

            <div className="task-field">
  <div className="task-field-label">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-person-circle" viewBox="0 0 16 16">
  <path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0"/>
  <path fill-rule="evenodd" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8m8-7a7 7 0 0 0-5.468 11.37C3.242 11.226 4.805 10 8 10s4.757 1.225 5.468 2.37A7 7 0 0 0 8 1"/>
</svg>
    Контактное лицо
  </div>
  <div className="task-field-value">
    <SearchableContactPersonSelect
      availableContactPersons={contactPersons}
      onSelect={(personId) => {
        setField("contact_person_id", personId);
        handleContactPersonChange(personId);
      }}
      selectedContactPersonId={form.contact_person_id}
    />
    {loadingPhone && <span style={{ fontSize: '0.8em', color: '#888' }}>Загрузка телефона...</span>}
  </div>
</div>

            <div className="task-field">
              <div className="task-field-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                </svg>
                Телефон
              </div>
              <div className="task-field-value phone">
                <input
                  type="text"
                  value={form.contact_person_phone || ""}
                  readOnly
                  placeholder="Выберите контактное лицо"
                  className="dark-select"
                  style={{ width: '100%', cursor: "not-allowed" }}
                />
                {form.contact_person_phone && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      window.location.href = `tel:${form.contact_person_phone}`;
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#1e88e5',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      padding: 0,
                      fontSize: '0.9em',
                      alignSelf: 'flex-start',
                    }}
                  >
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* === АДРЕС И ВРЕМЯ === */}
                    {/* === АДРЕС И ВРЕМЯ === */}
          <div className="task-section">
            <div className="task-section-header">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              <span>Адрес и время</span>
            </div>

            <div className="task-field">
              <div className="task-field-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                Место/Адрес
              </div>
              <div className="task-field-value">
                <textarea
                  value={form.location || ""}
                  onChange={(e) => setField("location", e.target.value)}
                  rows="2"
                  className="dark-select"
                  style={{ width: '100%', resize: "vertical" }}
                />
              </div>
            </div>

            <div className="task-field">
              <div className="task-field-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                Дата и время
              </div>
              <div className="task-field-value">
                <input
                  type="datetime-local"
                  value={form.scheduled_at}
                  onChange={(e) => setField("scheduled_at", e.target.value)}
                  className="dark-select"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>

          {/* === ТРАНСПОРТ === */}
          <div className="task-section">
            <div className="task-section-header">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-car-front" viewBox="0 0 16 16">
  <path d="M4 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0m10 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0M6 8a1 1 0 0 0 0 2h4a1 1 0 1 0 0-2zM4.862 4.276 3.906 6.19a.51.51 0 0 0 .497.731c.91-.073 2.35-.17 3.597-.17s2.688.097 3.597.17a.51.51 0 0 0 .497-.731l-.956-1.913A.5.5 0 0 0 10.691 4H5.309a.5.5 0 0 0-.447.276"/>
  <path d="M2.52 3.515A2.5 2.5 0 0 1 4.82 2h6.362c1 0 1.904.596 2.298 1.515l.792 1.848c.075.175.21.319.38.404.5.25.855.715.965 1.262l.335 1.679q.05.242.049.49v.413c0 .814-.39 1.543-1 1.997V13.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-1.338c-1.292.048-2.745.088-4 .088s-2.708-.04-4-.088V13.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-1.892c-.61-.454-1-1.183-1-1.997v-.413a2.5 2.5 0 0 1 .049-.49l.335-1.68c.11-.546.465-1.012.964-1.261a.8.8 0 0 0 .381-.404l.792-1.848ZM4.82 3a1.5 1.5 0 0 0-1.379.91l-.792 1.847a1.8 1.8 0 0 1-.853.904.8.8 0 0 0-.43.564L1.03 8.904a1.5 1.5 0 0 0-.03.294v.413c0 .796.62 1.448 1.408 1.484 1.555.07 3.786.155 5.592.155s4.037-.084 5.592-.155A1.48 1.48 0 0 0 15 9.611v-.413q0-.148-.03-.294l-.335-1.68a.8.8 0 0 0-.43-.563 1.8 1.8 0 0 1-.853-.904l-.792-1.848A1.5 1.5 0 0 0 11.18 3z"/>
</svg>
              <span>Транспорт</span>
            </div>

            <div className="task-field">
              <div className="task-field-label">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-car-front" viewBox="0 0 16 16">
  <path d="M4 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0m10 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0M6 8a1 1 0 0 0 0 2h4a1 1 0 1 0 0-2zM4.862 4.276 3.906 6.19a.51.51 0 0 0 .497.731c.91-.073 2.35-.17 3.597-.17s2.688.097 3.597.17a.51.51 0 0 0 .497-.731l-.956-1.913A.5.5 0 0 0 10.691 4H5.309a.5.5 0 0 0-.447.276"/>
  <path d="M2.52 3.515A2.5 2.5 0 0 1 4.82 2h6.362c1 0 1.904.596 2.298 1.515l.792 1.848c.075.175.21.319.38.404.5.25.855.715.965 1.262l.335 1.679q.05.242.049.49v.413c0 .814-.39 1.543-1 1.997V13.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-1.338c-1.292.048-2.745.088-4 .088s-2.708-.04-4-.088V13.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-1.892c-.61-.454-1-1.183-1-1.997v-.413a2.5 2.5 0 0 1 .049-.49l.335-1.68c.11-.546.465-1.012.964-1.261a.8.8 0 0 0 .381-.404l.792-1.848ZM4.82 3a1.5 1.5 0 0 0-1.379.91l-.792 1.847a1.8 1.8 0 0 1-.853.904.8.8 0 0 0-.43.564L1.03 8.904a1.5 1.5 0 0 0-.03.294v.413c0 .796.62 1.448 1.408 1.484 1.555.07 3.786.155 5.592.155s4.037-.084 5.592-.155A1.48 1.48 0 0 0 15 9.611v-.413q0-.148-.03-.294l-.335-1.68a.8.8 0 0 0-.43-.563 1.8 1.8 0 0 1-.853-.904l-.792-1.848A1.5 1.5 0 0 0 11.18 3z"/>
</svg>
                ТС
              </div>
              <div className="task-field-value">
                <input
                  value={form.vehicle_info}
                  onChange={(e) => setField("vehicle_info", e.target.value)}
                  className="dark-select"
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div className="task-field">
              <div className="task-field-label">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-record-circle" viewBox="0 0 16 16">
  <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/>
  <path d="M11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0"/>
</svg> 
                Гос. номер
              </div>
              <div className="task-field-value">
                <input
                  value={form.gos_number || ""}
                  onChange={(e) => setField("gos_number", e.target.value)}
                  className="dark-select"
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>

          {/* === РАБОТА И ОБОРУДОВАНИЕ === */}
          <div className="task-section">
            <div className="task-section-header">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                <path d="M9.972 2.508a.5.5 0 0 0-.16-.556l-.178-.129a5 5 0 0 0-2.076-.783C6.215.862 4.504 1.229 2.84 3.133H1.786a.5.5 0 0 0-.354.147L.146 4.567a.5.5 0 0 0 0 .706l2.571 2.579a.5.5 0 0 0 .708 0l1.286-1.2a.5.5 0 0 0 .146-.353V5.57l8.387 8.873A.5.5 0 0 0 14 14.5l1.5-1.5a.5.5 0 0 0 .017-.689l-9.129-8.63c.747-.456 1.772-.839 3.112-.839a.5.5 0 0 0 .472-.334"/>
              </svg>
              <span>Работа и оборудование</span>
            </div>

            <div className="task-field">
  <div className="task-field-label">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
      <path d="M9.972 2.508a.5.5 0 0 0-.16-.556l-.178-.129a5 5 0 0 0-2.076-.783C6.215.862 4.504 1.229 2.84 3.133H1.786a.5.5 0 0 0-.354.147L.146 4.567a.5.5 0 0 0 0 .706l2.571 2.579a.5.5 0 0 0 .708 0l1.286-1.2a.5.5 0 0 0 .146-.353V5.57l8.387 8.873A.5.5 0 0 0 14 14.5l1.5-1.5a.5.5 0 0 0 .017-.689l-9.129-8.63c.747-.456 1.772-.839 3.112-.839a.5.5 0 0 0 .472-.334"/>
    </svg>
    Оборудование
  </div>
  <div className="task-field-value">
    <div className="equipment-list-container" style={{ marginBottom: '8px' }}>
      {form.equipment.map((item, index) => {
        const eq = equipmentList.find((e) => e.id === item.equipment_id);
        return (
          <div key={index} className="equipment-item-row">
            <div className="equipment-item-name">
              {eq?.name || `ID ${item.equipment_id}`}
            </div>
            <input
              type="text"
              placeholder="Серийный номер"
              value={item.serial_number || ""}
              onChange={(e) => updateEquipmentItem(index, "serial_number", e.target.value)}
              className="equipment-item-serial"
            />
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
  </div>
</div>

            <div className="task-field">
              <div className="task-field-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                Виды работ
              </div>
              <div className="task-field-value">
                <div className="work-types-container" style={{ marginBottom: '8px' }}>
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
                        <div key={id} className="work-type-tag" style={{ display: 'inline-block', margin: '0 4px 4px 0' }}>
                          {wt.name} (x{count})
                          <span
                            className="work-type-tag-remove"
                            onClick={() => removeWorkType(id)}
                            style={{ marginLeft: '4px', cursor: 'pointer' }}
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
                  selectedWorkTypeIds={form.work_types_ids}
                />
              </div>
            </div>

          </div>

          {/* === НАЗНАЧЕНИЕ === */}
          <div className="task-section">
            <div className="task-section-header">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              <span>Назначение</span>
            </div>

            <div className="task-field">
              <div className="task-field-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                Тип назначения
              </div>
              <div className="task-field-value">
                <select
                  value={form.assignment_type}
                  onChange={(e) => setField("assignment_type", e.target.value)}
                  className="dark-select"
                  style={{ width: '100%' }}
                >
                  {assignmentTypeOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.display}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {form.assignment_type === "individual" && (
              <div className="task-field">
                <div className="task-field-label">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-universal-access" viewBox="0 0 16 16">
  <path d="M9.5 1.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0M6 5.5l-4.535-.442A.531.531 0 0 1 1.531 4H14.47a.531.531 0 0 1 .066 1.058L10 5.5V9l.452 6.42a.535.535 0 0 1-1.053.174L8.243 9.97c-.064-.252-.422-.252-.486 0l-1.156 5.624a.535.535 0 0 1-1.053-.174L6 9z"/>
</svg>
                  Монтажник
                </div>
                <div className="task-field-value">
                  {form.assigned_user_id && (
                    <div style={{ padding: '6px 10px', marginBottom: '8px', border: '1px solid #30363d', borderRadius: '4px', backgroundColor: '#161b22', color: '#c9d1d9', display: 'flex', justifyContent: 'space-between' }}>
                      Выбран: {montajniks.find(m => m.id === form.assigned_user_id)?.name || ''} {montajniks.find(m => m.id === form.assigned_user_id)?.lastname || ''}
                      <button
                        type="button"
                        onClick={() => setField("assigned_user_id", null)}
                        style={{ padding: '2px 6px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
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
              </div>
            )}

            <div className="task-field">
              <div className="task-field-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                Комментарий
              </div>
              <div className="task-field-value">
                <textarea
                  value={form.comment || ""}
                  onChange={(e) => setField("comment", e.target.value)}
                  rows="3"
                  className="dark-select"
                  style={{ width: '100%', resize: "vertical" }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="modal-actions">
  <button
    onClick={() => saveDraft(false)}
    disabled={saving}
    className="gradient-button"
  >
    {saving ? 'Сохранение...' : (
      <>
        <svg className="button-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 2H14V14H4V2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M14 4L6 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M6 8H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M6 11H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Сохранить как черновик
      </>
    )}
  </button>
  {!allowSaveOnlyDraft && (
    <button
      onClick={() => saveDraft(true)}
      disabled={saving}
      className="gradient-button"
    >
      {saving ? 'Публикация...' : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-upload" viewBox="0 0 16 16">
  <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5"/>
  <path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708z"/>
</svg>
          Опубликовать
        </>
      )}
    </button>
  )}
</div>
    </div>
  </div>
);
}