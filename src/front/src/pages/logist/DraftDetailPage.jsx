// front/src/pages/logist/DraftDetailPage.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getDraft,
  patchDraft,
  deleteDraft,
  getEquipmentList,
  getWorkTypes,
  getCompaniesList,
  getContactPersonsByCompany,
  getContactPersonPhone,
  getActiveMontajniks,
  publishTask,
} from "../../api";
import "../../styles/LogistPage.css";
import useAuthStore from "@/store/useAuthStore";

export default function DraftDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [equipment, setEquipment] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [contactPersons, setContactPersons] = useState([]);
  const [loadingRefs, setLoadingRefs] = useState(false);
  const [loadingPhone, setLoadingPhone] = useState(false);
  const [montajniks, setMontajniks] = useState([]);

  useEffect(() => {
    loadRefs();
    loadDraft();
  }, [id]);

  async function loadRefs() {
    setLoadingRefs(true);
    try {
      const [eqRes, wtRes, compRes, montRes] = await Promise.allSettled([
        getEquipmentList(),
        getWorkTypes(),
        getCompaniesList(),
        getActiveMontajniks(),
      ]);
      setEquipment(eqRes.status === 'fulfilled' ? eqRes.value || [] : []);
      setWorkTypes(wtRes.status === 'fulfilled' ? wtRes.value || [] : []);
      setCompanies(compRes.status === 'fulfilled' ? compRes.value || [] : []);
      setMontajniks(montRes.status === 'fulfilled' ? montRes.value || [] : []);
    } catch (e) {
      console.error("Ошибка загрузки справочников", e);
    } finally {
      setLoadingRefs(false);
    }
  }

  async function loadDraft() {
    setLoading(true);
    try {
      const res = await getDraft(id);
      const d = { id: res.draft_id, ...res.data };

      const processedEquipment = (d.equipment || []).map(e => ({
        equipment_id: e.equipment_id,
        serial_number: e.serial_number || "",
      }));

      const processedWorkTypesForView = (d.work_types || []).map(wt => ({
        work_type_id: wt.work_type_id,
        quantity: wt.quantity
      }));

      const processedDraftForView = {
        ...d,
        equipment: processedEquipment.map(e => ({
          equipment_id: e.equipment_id,
          serial_number: e.serial_number,
          quantity: 1,
        })),
        work_types: processedWorkTypesForView,
      };

      setDraft(processedDraftForView);

      const formEquipment = processedDraftForView.equipment.map(e => ({
        equipment_id: e.equipment_id,
        serial_number: e.serial_number,
      }));

      const formWorkTypesIds = [];
      processedWorkTypesForView.forEach(item => {
        for (let i = 0; i < item.quantity; i++) {
          formWorkTypesIds.push(item.work_type_id);
        }
      });

      const initialForm = {
        ...processedDraftForView,
        equipment: formEquipment,
        work_types_ids: formWorkTypesIds,
        contact_person_phone: processedDraftForView.contact_person_phone || null,
        assignment_type: processedDraftForView.assignment_type,
        assigned_user_id: processedDraftForView.assigned_user_id || null,
        photo_required: true,
      };

      setForm(initialForm);

      if (initialForm.company_id) {
        try {
          const contacts = await getContactPersonsByCompany(initialForm.company_id);
          setContactPersons(contacts || []);
          if (initialForm.contact_person_id && !initialForm.contact_person_phone) {
            try {
              const { phone } = await getContactPersonPhone(initialForm.contact_person_id);
              setForm(prev => ({ ...prev, contact_person_phone: phone }));
            } catch (phoneErr) {
              console.error("Ошибка загрузки телефона контактного лица:", phoneErr);
              setForm(prev => ({ ...prev, contact_person_phone: null }));
            }
          }
        } catch (err) {
          console.error("Ошибка загрузки контактных лиц:", err);
          setContactPersons([]);
        }
      } else {
        setContactPersons([]);
      }
    } catch (err) {
      console.error("Ошибка загрузки черновика:", err);
      alert("Ошибка загрузки черновика");
    } finally {
      setLoading(false);
    }
  }

  function setField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleCompanyChangeForForm(companyId) {
    if (!companyId) {
      setContactPersons([]);
      setField("contact_person_id", null);
      setField("contact_person_phone", null);
      return;
    }
    try {
      setLoadingPhone(true);
      const contacts = await getContactPersonsByCompany(companyId);
      setContactPersons(contacts || []);
      setField("contact_person_id", null);
      setField("contact_person_phone", null);
    } catch (e) {
      console.error("Ошибка загрузки контактных лиц:", e);
      setContactPersons([]);
      setField("contact_person_id", null);
      setField("contact_person_phone", null);
      alert("Ошибка загрузки контактных лиц");
    } finally {
      setLoadingPhone(false);
    }
  }

  async function handleContactPersonChangeForForm(contactPersonId) {
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

  async function saveEdit() {
    try {
      const payload = {
        ...form,
        equipment: form.equipment || [],
        work_types: form.work_types_ids || [],
        client_price: undefined,
        montajnik_reward: undefined,
        gos_number: form.gos_number || null,
        contact_person_phone: undefined,
        assigned_user_name: undefined,
      };
      await patchDraft(id, payload);
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("💾 Изменения сохранены");
      } else {
        alert("💾 Изменения сохранены");
      }
      setEdit(false);
      await loadDraft();
    } catch (e) {
      console.error(e);
      const errorMsg = e.response?.data?.detail || "Ошибка при сохранении";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(errorMsg);
      } else {
        alert(errorMsg);
      }
    }
  }

  async function handlePublish() {
    if (!window.confirm("Опубликовать черновик?")) return;
    try {
      await publishTask({ draft_id: draft.id });
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("✅ Опубликовано");
      } else {
        alert("✅ Опубликовано");
      }
      useAuthStore.getState().updateActiveTasksCount();
      navigate("/logist/tasks/active");
    } catch (err) {
      console.error("Ошибка публикации:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось опубликовать.";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`Ошибка: ${errorMsg}`);
      } else {
        alert(`Ошибка: ${errorMsg}`);
      }
    }
  }

  async function handleDelete() {
    if (!window.confirm("Удалить черновик?")) return;
    try {
      await deleteDraft(id);
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("🗑 Черновик удалён");
      } else {
        alert("🗑 Черновик удалён");
      }
      navigate("/logist/drafts");
    } catch (err) {
      console.error("Ошибка удаления:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось удалить.";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`Ошибка: ${errorMsg}`);
      } else {
        alert(`Ошибка: ${errorMsg}`);
      }
    }
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

  function addEquipmentItemToForm(equipmentId) {
    if (!equipmentId) return;
    const eq = equipment.find(e => e.id === equipmentId);
    if (!eq) return;

    const newItem = {
      equipment_id: equipmentId,
      serial_number: "",
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

  function clearAssignedUserAndSetBroadcast() {
    setField("assigned_user_id", null);
    setField("assignment_type", "broadcast");
  }

  const assignmentTypeOptions = [
    { value: "broadcast", display: "В эфир" },
    { value: "individual", display: "Персональная" }
  ];

  if (loading) return <div className="logist-main"><div className="empty">Загрузка черновика #{id}...</div></div>;
  if (!draft) return <div className="logist-main"><div className="empty">Черновик не найден</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1>Черновик #{draft.id}</h1>
          {!edit ? (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="gradient-button" onClick={() => setEdit(true)}>
                ✏️ Редактировать
              </button>
              <button className="gradient-button" style={{ backgroundColor: '#2563eb' }} onClick={handlePublish}>
                📤 Опубликовать
              </button>
              <button 
  className="gradient-button" 
  style={{ 
    background: 'linear-gradient(to right, #ef4444, )',
    backgroundImage: 'linear-gradient(to right, #ef4444)'
  }} 
  onClick={handleDelete}
>
  🗑 Удалить
</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="gradient-button" onClick={saveEdit}>
                💾 Сохранить
              </button>
              <button type="button" className="gradient-button" style={{ backgroundColor: '#6c757d' }} onClick={() => setEdit(false)}>
                ❌ Отмена
              </button>
            </div>
          )}
        </div>
        <div className="task-detail">
          {edit ? (
            <div className="form-grid">
              <label className="dark-label">
                Компания
                <SearchableCompanySelect
                  availableCompanies={companies}
                  onSelect={(companyId) => {
                    setField("company_id", companyId);
                    if (companyId) {
                      handleCompanyChangeForForm(companyId);
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
                      handleContactPersonChangeForForm(val);
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
                Телефон контактного лица:
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
                  value={form.vehicle_info || ""}
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
                  value={form.scheduled_at ? new Date(form.scheduled_at).toISOString().slice(0, 16) : ""}
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
                {(form.equipment || []).map((item, index) => {
                  const eq = equipment.find((e) => e.id === item.equipment_id);
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
                          onChange={(e) => updateEquipmentItemInForm(index, "serial_number", e.target.value)}
                          className="equipment-item-serial"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeEquipmentItemFromForm(index)}
                        className="equipment-item-remove"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
              <SearchableEquipmentSelect
                availableEquipment={equipment}
                onSelect={addEquipmentItemToForm}
                selectedItems={form.equipment}
              />
              <label className="dark-label">Виды работ</label>
              <div className="work-types-container">
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
                        className="work-type-tag"
                      >
                        {wt.name} (x{count})
                        <span
                          className="work-type-tag-remove"
                          onClick={() => removeWorkTypeItemFromForm(id)}
                        >
                          ×
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
              <SearchableWorkTypeSelect
                availableWorkTypes={workTypes}
                onSelect={addWorkTypeItemToForm}
                selectedWorkTypeIds={form.work_types_ids}
              />
              <label className="dark-label">
                Тип назначения
                <select
                  value={form.assignment_type || ""}
                  onChange={(e) => {
                    const newType = e.target.value;
                    setField("assignment_type", newType);
                    if (newType === "broadcast") {
                      setField("assigned_user_id", null);
                    }
                  }}
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
                      Выбран: {montajniks.find(m => m.id === form.assigned_user_id)?.name || 'ID:'} {montajniks.find(m => m.id === form.assigned_user_id)?.lastname || form.assigned_user_id}
                      <button
                        type="button"
                        onClick={clearAssignedUserAndSetBroadcast}
                        style={{ marginLeft: '8px', padding: '2px 4px', backgroundColor: '#ef4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        ×
                      </button>
                    </div>
                  )}
                  <SearchableMontajnikSelect
                    availableMontajniks={montajniks}
                    onSelect={(userId) => {
                      setField("assigned_user_id", userId);
                      if (form.assignment_type !== "individual") {
                        setField("assignment_type", "individual");
                      }
                    }}
                    selectedUserId={form.assigned_user_id}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="task-view">
              <p><b>Компания:</b> {draft.company_name || "—"}</p>
              <p><b>Контактное лицо:</b> {draft.contact_person_name || "—"}</p>
              <p>
                <b>Телефон контактного лица:</b>{" "}
                {draft.contact_person_phone || "—"}
                {draft.contact_person_phone && (
                  <button
                    onClick={() => {
                      const phone = draft.contact_person_phone;
                      const telUrl = `tel:${phone}`;
                      if (window.Telegram?.WebApp) {
                        window.open(telUrl, "_blank");
                      } else {
                        window.location.href = telUrl;
                      }
                    }}
                    style={{
                      marginLeft: '8px',
                      fontSize: '0.9em',
                      color: '#1e88e5',
                      background: 'none',
                      border: 'none',
                      textDecoration: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    📞 Позвонить
                  </button>
                )}
              </p>
              <p><b>ТС:</b> {draft.vehicle_info || "—"}</p>
              <p><b>Гос. номер:</b> {draft.gos_number || "—"}</p>
              <p><b>Дата:</b> {draft.scheduled_at ? new Date(draft.scheduled_at).toLocaleString() : "—"}</p>
              <p>
                <b>Место/Адрес:</b>{" "}
                {draft.location ? (
                  <a
                    href={`https://2gis.ru/search/${encodeURIComponent(draft.location)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#1e88e5',
                      textDecoration: 'none',
                      fontWeight: 'bold'
                    }}
                  >
                    {draft.location}
                  </a>
                ) : "—"}
              </p>
              <p><b>Монтажник:</b> {draft.assigned_user_name || draft.assigned_user_id || "—"}</p>
              <p><b>Комментарий:</b> {draft.comment || "—"}</p>
              <p><b>Цена клиента:</b> {draft.client_price || "—"}</p>
              <p><b>Награда монтажнику:</b> {draft.montajnik_reward || "—"}</p>
              <p>
                <b>Оборудование:</b> {(draft.equipment || [])
                  .map((e) => {
                    const eqName = equipment.find((eq) => eq.id === e.equipment_id)?.name;
                    return `${eqName || e.equipment_id}${e.serial_number ? ` (СН: ${e.serial_number})` : ''} x${e.quantity}`;
                  })
                  .join(", ") || "—"}
              </p>
              <p>
                <b>Виды работ:</b> {draft.work_types && draft.work_types.length > 0 ? draft.work_types.map(wt => {
                  const wtObj = workTypes.find(w => w.id === wt.work_type_id);
                  const name = wtObj?.name || wt.work_type_id;
                  const count = wt.quantity || 1;
                  return `${name} (x${count})`;
                }).join(", ") : "—"}
              </p>
              <p><b>Фото обязательно:</b> {draft.photo_required ? "Да" : "Нет"}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}