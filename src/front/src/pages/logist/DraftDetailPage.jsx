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
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            className="icon-button"
            title="Назад"
            onClick={() => navigate(-1)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M3.86 8.753l5.482 4.796c.646.566 1.658.106 1.658-.753V3.204a1 1 0 0 0-1.659-.753l-5.48 4.796a1 1 0 0 0 0 1.506z"/>
            </svg>
          </button>
          <h1 className="page-title">Черновик #{draft.id}</h1>
        </div>
        {!edit ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Иконка "Редактировать" */}
            <button
              className="icon-button"
              title="Редактировать"
              onClick={() => setEdit(true)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M12.854.146a.5.5 0 0 0-.707 0L10.5 1.793 14.207 5.5l1.647-1.646a.5.5 0 0 0 0-.708zm.646 6.061L9.793 2.5 3.293 9H3.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.207zm-7.468 7.468A.5.5 0 0 1 6 13.5V13h-.5a.5.5 0 0 1-.5-.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.5-.5V10h-.5a.5.5 0 0 1-.175-.032l-.179.178a.5.5 0 0 0-.11.168l-2 5a.5.5 0 0 0 .65.65l5-2a.5.5 0 0 0 .168-.11z"/>
              </svg>
            </button>
            {/* Иконка "Опубликовать" */}
            <button
  className="icon-button"
  title="Опубликовать"
  onClick={handlePublish}
  style={{
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }}
>
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
    <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5"/>
    <path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708z"/>
  </svg>
</button>
            {/* Иконка "Удалить" */}
            <button
              className="icon-button"
              title="Удалить"
              onClick={handleDelete}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/>
                <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/>
              </svg>
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
      {/* ===== Компания ===== */}
      <label className="dark-label">
        Компания
        {/* --- 1. Поле поиска --- */}
        <SearchableCompanySelect
          availableCompanies={companies}
          onSelect={(companyId) => {
            setField("company_id", companyId);
            if (companyId) {
              handleCompanyChangeForForm(companyId); // Загружаем контактные лица
            } else {
              setContactPersons([]);
              setField("contact_person_id", null);
              setField("contact_person_phone", null);
            }
          }}
          selectedCompanyId={form.company_id} // Не используется в этом компоненте, но передаём для совместимости
        />
        {/* --- 2. Отображение выбранной компании --- */}
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
      
      {/* --- Контактное лицо --- */}
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
          disabled={!form.company_id} // Отключаем, если не выбрана компания
          className="dark-select"
        >
          <option value="">Выберите контактное лицо</option>
          {contactPersons.map(cp => (
            <option key={cp.id} value={cp.id}>{cp.name}</option>
          ))}
        </select>
        {loadingPhone && <span style={{ fontSize: '0.8em', color: '#888' }}>Загрузка телефона...</span>}
      </label>
      
      {/* ===== ТЕЛЕФОН КОНТАКТНОГО ЛИЦА ===== */}
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
          value={
            form.scheduled_at
              ? (() => {
                  const date = new Date(form.scheduled_at); 
                  const year = date.getFullYear();
                  const month = String(date.getMonth() + 1).padStart(2, '0');
                  const day = String(date.getDate()).padStart(2, '0');
                  const hours = String(date.getHours()).padStart(2, '0');
                  const minutes = String(date.getMinutes()).padStart(2, '0');
                  return `${year}-${month}-${day}T${hours}:${minutes}`;
                })()
              : ""
          }
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
      
      {/* Цены — только для отображения, не редактируются */}
      {/* ===== Оборудование (редактирование с умным поиском) ===== */}
      <label className="dark-label">Оборудование</label>
      {/* --- Список выбранных элементов (название - поле серийного номера) --- */}
      <div className="equipment-list-container">
        {(form.equipment || []).map((item, index) => {
          const eq = equipment.find((e) => e.id === item.equipment_id);
          return (
            <div key={index} className="equipment-item-row">
              {/* Название оборудования */}
              <div className="equipment-item-name">
                {eq?.name || `ID ${item.equipment_id}`}
              </div>
              {/* Поле ввода серийного номера */}
              <div>
                <input
                  type="text"
                  placeholder="Серийный номер"
                  value={item.serial_number || ""}
                  onChange={(e) => updateEquipmentItemInForm(index, "serial_number", e.target.value)}
                  className="equipment-item-serial"
                />
              </div>
              {/* Кнопка удаления (удаляет конкретную строку/единицу) */}
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
      {/* --- Выбор нового оборудования через SearchableSelect --- */}
      <SearchableEquipmentSelect
        availableEquipment={equipment}
        onSelect={addEquipmentItemToForm}
        selectedItems={form.equipment} // Не используется в фильтрации, т.к. разрешено дублирование
      />
      
      {/* ===== Виды работ (редактирование с умным поиском) ===== */}
      <label className="dark-label">Виды работ</label>
      {/* --- Отображение выбранных типов работ с количеством --- */}
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
                {wt.name} (x{count}) {/* ✅ Отображаем название и количество */}
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
      {/* --- Выбор нового типа работы через SearchableSelect --- */}
      <SearchableWorkTypeSelect
        availableWorkTypes={workTypes}
        onSelect={addWorkTypeItemToForm}
        selectedWorkTypeIds={form.work_types_ids} // Не используется в фильтрации, т.к. разрешено дублирование
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
          {/* --- Отображение выбранного монтажника --- */}
          {form.assigned_user_id && (
            <div style={{ padding: '4px 8px', marginBottom: '8px', border: '1px solid #30363d', borderRadius: '4px', backgroundColor: '#161b22', color: '#c9d1d9' }}>
              {/* ✅ Отображаем имя и фамилию монтажника */}
              Выбран: {montajniks.find(m => m.id === form.assigned_user_id)?.name || 'ID:'} {montajniks.find(m => m.id === form.assigned_user_id)?.lastname || form.assigned_user_id}
              <button
                type="button"
                // ✅ ИСПРАВЛЕНО: вызываем новую функцию
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
            {/* === ОСНОВНАЯ ИНФОРМАЦИЯ === */}
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
                  Компания:
                </div>
                <div className="task-field-value">
                  {draft.company_name || "—"}
                </div>
              </div>
              <div className="task-field">
                <div className="task-field-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                  </svg>
                  Контактное лицо:
                </div>
                <div className="task-field-value">
                  {draft.contact_person_name || "—"}
                </div>
              </div>
              <div className="task-field">
                <div className="task-field-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                  </svg>
                  Телефон:
                </div>
                <div className="task-field-value phone">
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
                    >
                    Позвонить
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* === АДРЕС И СТАТУС === */}
            <div className="task-section">
              <div className="task-section-header">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                  <circle cx="12" cy="10" r="3"></circle>
                </svg>
                <span>Адрес</span>
              </div>
              <div className="task-field">
                <div className="task-field-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  Место/Адрес:
                </div>
                <div className="task-field-value">
                  {draft.location ? (
                    <a href={`https://2gis.ru/search/${encodeURIComponent(draft.location)}`} target="_blank" rel="noopener noreferrer">
                      {draft.location}
                    </a>
                  ) : "—"}
                </div>
              </div>
              <div className="task-field">
                <div className="task-field-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  Дата:
                </div>
                <div className="task-field-value">
                  {draft.scheduled_at ? new Date(draft.scheduled_at).toLocaleString() : "—"}
                </div>
              </div>
            </div>

            <div className="task-section">
  <div className="task-section-header">
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" className="bi bi-car-front" viewBox="0 0 16 16">
      <path d="M4 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0m10 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0M6 8a1 1 0 0 0 0 2h4a1 1 0 1 0 0-2zM4.862 4.276 3.906 6.19a.51.51 0 0 0 .497.731c.91-.073 2.35-.17 3.597-.17s2.688.097 3.597.17a.51.51 0 0 0 .497-.731l-.956-1.913A.5.5 0 0 0 10.691 4H5.309a.5.5 0 0 0-.447.276" />
      <path d="M2.52 3.515A2.5 2.5 0 0 1 4.82 2h6.362c1 0 1.904.596 2.298 1.515l.792 1.848c.075.175.21.319.38.404.5.25.855.715.965 1.262l.335 1.679q.05.242.049.49v.413c0 .814-.39 1.543-1 1.997V13.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-1.338c-1.292.048-2.745.088-4 .088s-2.708-.04-4-.088V13.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-1.892c-.61-.454-1-1.183-1-1.997v-.413a2.5 2.5 0 0 1 .049-.49l.335-1.68c.11-.546.465-1.012.964-1.261a.8.8 0 0 0 .381-.404l.792-1.848ZM4.82 3a1.5 1.5 0 0 0-1.379.91l-.792 1.847a1.8 1.8 0 0 1-.853.904.8.8 0 0 0-.43.564L1.03 8.904a1.5 1.5 0 0 0-.03.294v.413c0 .796.62 1.448 1.408 1.484 1.555.07 3.786.155 5.592.155s4.037-.084 5.592-.155A1.48 1.48 0 0 0 15 9.611v-.413q0-.148-.03-.294l-.335-1.68a.8.8 0 0 0-.43-.563 1.8 1.8 0 0 1-.853-.904l-.792-1.848A1.5 1.5 0 0 0 11.18 3z" />
    </svg>
    <span>Транспорт</span>
  </div>
  <div className="task-field">
    <div className="task-field-label">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-car-front" viewBox="0 0 16 16">
        <path d="M4 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0m10 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0M6 8a1 1 0 0 0 0 2h4a1 1 0 1 0 0-2zM4.862 4.276 3.906 6.19a.51.51 0 0 0 .497.731c.91-.073 2.35-.17 3.597-.17s2.688.097 3.597.17a.51.51 0 0 0 .497-.731l-.956-1.913A.5.5 0 0 0 10.691 4H5.309a.5.5 0 0 0-.447.276" />
        <path d="M2.52 3.515A2.5 2.5 0 0 1 4.82 2h6.362c1 0 1.904.596 2.298 1.515l.792 1.848c.075.175.21.319.38.404.5.25.855.715.965 1.262l.335 1.679q.05.242.049.49v.413c0 .814-.39 1.543-1 1.997V13.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-1.338c-1.292.048-2.745.088-4 .088s-2.708-.04-4-.088V13.5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5v-1.892c-.61-.454-1-1.183-1-1.997v-.413a2.5 2.5 0 0 1 .049-.49l.335-1.68c.11-.546.465-1.012.964-1.261a.8.8 0 0 0 .381-.404l.792-1.848ZM4.82 3a1.5 1.5 0 0 0-1.379.91l-.792 1.847a1.8 1.8 0 0 1-.853.904.8.8 0 0 0-.43.564L1.03 8.904a1.5 1.5 0 0 0-.03.294v.413c0 .796.62 1.448 1.408 1.484 1.555.07 3.786.155 5.592.155s4.037-.084 5.592-.155A1.48 1.48 0 0 0 15 9.611v-.413q0-.148-.03-.294l-.335-1.68a.8.8 0 0 0-.43-.563 1.8 1.8 0 0 1-.853-.904l-.792-1.848A1.5 1.5 0 0 0 11.18 3z" />
      </svg>
      ТС
    </div>
    <div className="task-field-value">
      {draft.vehicle_info || "—"}
    </div>
  </div>
  <div className="task-field">
    <div className="task-field-label">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-record-circle" viewBox="0 0 16 16">
        <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16" />
        <path d="M11 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0" />
      </svg>
      Гос. номер
    </div>
    <div className="task-field-value">
      {draft.gos_number || "—"}
    </div>
  </div>
</div>

            {/* === ФИНАНСЫ === */}
            <div className="task-section">
              <div className="task-section-header">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="8" y1="3" x2="8" y2="21" />
                  <path d="M8 3h6a4 4 0 0 1 0 8H8" />
                  <line x1="6" y1="14" x2="14" y2="14" />
                  <line x1="6" y1="18" x2="14" y2="18" />
                </svg>
                <span>Цена</span>
              </div>
              <div className="task-field">
                <div className="task-field-label">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="8" y1="3" x2="8" y2="21" />
                    <path d="M8 3h6a4 4 0 0 1 0 8H8" />
                    <line x1="6" y1="14" x2="14" y2="14" />
                    <line x1="6" y1="18" x2="14" y2="18" />
                  </svg>
                  Цена клиента:
                </div>
                <div className="task-field-value price">
                  {draft.client_price || "—"} ₽
                </div>
              </div>
              <div className="task-field">
                <div className="task-field-label">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="8" y1="3" x2="8" y2="21" />
                    <path d="M8 3h6a4 4 0 0 1 0 8H8" />
                    <line x1="6" y1="14" x2="14" y2="14" />
                    <line x1="6" y1="18" x2="14" y2="18" />
                  </svg>
                  Награда монтажнику:
                </div>
                <div className="task-field-value price">
                  {draft.montajnik_reward || "—"} ₽
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
                  Оборудование:
                </div>
                <div className="task-field-value">
                  {draft.equipment && draft.equipment.length > 0 ? (
                    <div className="task-equipment-list">
                      {draft.equipment.map((e, index) => {
                        const eqName = equipment.find((eq) => eq.id === e.equipment_id)?.name;
                        return (
                          <div key={index} className="task-equipment-item">
                            {eqName || e.equipment_id}
                            {e.serial_number && ` (СН: ${e.serial_number})`}
                            {` x${e.quantity}`}
                          </div>
                        );
                      })}
                    </div>
                  ) : "—"}
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
                  Виды работ:
                </div>
                <div className="task-field-value">
                  {draft.work_types && draft.work_types.length > 0 ? (
                    <div className="task-work-types-list">
                      {draft.work_types.map((wt, index) => {
                        const wtObj = workTypes.find(w => w.id === wt.work_type_id);
                        const name = wtObj?.name || wt.work_type_id;
                        const count = wt.quantity || 1;
                        return (
                          <div key={index} className="task-work-type-item">
                            {name} (x{count})
                          </div>
                        );
                      })}
                    </div>
                  ) : "—"}
                </div>
              </div>
              <div className="task-field">
                <div className="task-field-label">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                    <circle cx="12" cy="10" r="3"></circle>
                  </svg>
                  Фото обязательно:
                </div>
                <div className="task-field-value">
                  {draft.photo_required ? "Да" : "Нет"}
                </div>
              </div>
            </div>

            {/* === МОНТАЖНИК === */}
            <div className="task-field">
              <div className="task-field-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                </svg>
                Монтажник:
              </div>
              <div className="task-field-value">
                {draft.assigned_user_name || draft.assigned_user_id || "—"}
              </div>
            </div>
            {/* === КОММЕНТАРИЙ === */}
            <div className="task-field">
              <div className="task-field-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                Комментарий:
              </div>
              <div className="task-field-value">
                {draft.comment || "—"}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
);
}