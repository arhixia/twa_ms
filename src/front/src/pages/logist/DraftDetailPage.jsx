// front/src/pages/logist/DraftDetailPage.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
// ✅ Добавим импорт для получения списка компаний и контактных лиц и телефона
import {
  getDraft,
  patchDraft,
  deleteDraft,
  publishTask,
  getEquipmentList,
  getWorkTypes,
  getCompaniesList,
  getContactPersonsByCompany,
  getContactPersonPhone, // <--- Новый импорт
  getActiveMontajniks
} from "../../api";
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
  // ✅ Состояние для загрузки телефона в режиме редактирования
  const [loadingPhone, setLoadingPhone] = useState(false); // <--- Добавлено
  const [montajniks, setMontajniks] = useState([]); // <--- Список монтажников

  useEffect(() => {
    loadRefs();
    loadDraft();
  }, [id]);

  // ✅ Загружаем компании
  async function loadRefs() {
    try {
      const [eqRes, wtRes, compRes, montRes] = await Promise.allSettled([
        getEquipmentList(),
        getWorkTypes(),
        getCompaniesList(),
        getActiveMontajniks(), // <--- Загружаем монтажников
      ]);

      setEquipment(eqRes.status === 'fulfilled' ? eqRes.value || [] : []);
      setWorkTypes(wtRes.status === 'fulfilled' ? wtRes.value || [] : []);
      setCompanies(compRes.status === 'fulfilled' ? compRes.value || [] : []);
      // ✅ Сохраняем список монтажников
      setMontajniks(montRes.status === 'fulfilled' ? montRes.value || [] : []); // <--- Добавлено
    } catch (e) {
      console.error("Ошибка загрузки справочников", e);
    }
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

  function SearchableEquipmentSelect({ availableEquipment, onSelect, selectedItems }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredEquipment, setFilteredEquipment] = useState(availableEquipment);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!searchTerm.trim()) {
      // Показываем всё оборудование, если поле пустое
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
            boxShadow: '0 4px 6px rgba(0,0,0,0.5)',
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
            boxShadow: '0 4px 6px rgba(0,0,0,0.5)',
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
      // Показываем все виды работ, если поле пустое
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
            boxShadow: '0 4px 6px rgba(0,0,0,0.5)',
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
            boxShadow: '0 4px 6px rgba(0,0,0,0.5)',
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
        // ✅ Инициализируем contact_person_phone в форме
        contact_person_phone: d.contact_person_phone || null, // <--- Добавлено

      };

      setDraft(processedDraftForView); // Для отображения в task-view
      setForm(initialForm); // Для редактирования

      // --- ЗАГРУЗКА КОНТАКТНЫХ ЛИЦ ДЛЯ КОМПАНИИ ЧЕРНОВИКА ---
      if (initialForm.company_id) {
        try {
          const contactsForDraftCompany = await getContactPersonsByCompany(initialForm.company_id);
          setContactPersons(contactsForDraftCompany || []);
        } catch (err) {
          console.error("Ошибка загрузки контактных лиц при инициализации черновика:", err);
          setContactPersons([]);
        }
      } else {
        setContactPersons([]);
      }
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

  function clearAssignedUserAndSetBroadcast() {
    setField("assigned_user_id", null);
    setField("assignment_type", "broadcast");
  }

  // ✅ Загрузка контактных лиц при выборе компании в форме
  async function loadContactPersonsForFormCompany(companyId) {
    if (!companyId) {
      setContactPersons([]);
      setField("contact_person_id", null);
      // ✅ Сбрасываем телефон
      setField("contact_person_phone", null); // <--- Добавлено
      return;
    }
    try {
      setLoadingRefs(true); // Показываем индикатор загрузки
      const contacts = await getContactPersonsByCompany(companyId);
      setContactPersons(contacts || []);
      // Сбрасываем выбор контактного лица при смене компании
      setField("contact_person_id", null);
      // ✅ Сбрасываем телефон
      setField("contact_person_phone", null); // <--- Добавлено
    } catch (e) {
      console.error("Ошибка загрузки контактных лиц:", e);
      setContactPersons([]);
      setField("contact_person_id", null);
      // ✅ Сбрасываем телефон
      setField("contact_person_phone", null); // <--- Добавлено
      alert("Ошибка загрузки контактных лиц");
    } finally {
      setLoadingRefs(false); // Скрываем индикатор
    }
  }

  // ✅ Новая функция для загрузки телефона контактного лица в форме редактирования
  async function handleContactPersonChangeForForm(contactPersonId) { // <--- Добавлено
    const val = contactPersonId ? parseInt(contactPersonId, 10) : null;
    setField("contact_person_id", val);

    if (val) {
      setLoadingPhone(true); // <--- Показываем индикатор загрузки телефона
      try {
        const { phone } = await getContactPersonPhone(val); // <--- Вызываем отдельный эндпоинт
        setField("contact_person_phone", phone); // <--- Устанавливаем телефон
      } catch (e) {
        console.error("Ошибка загрузки телефона контактного лица:", e);
        setField("contact_person_phone", null); // <--- Сброс при ошибке
      } finally {
        setLoadingPhone(false); // <--- Скрываем индикатор
      }
    } else {
      setField("contact_person_phone", null); // <--- Сброс если нет выбора
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
        // ❌ contact_person_phone не отправляем, сервер сам его возьмёт по contact_person_id
        contact_person_phone: undefined, // <--- Добавлено для ясности
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
        // ❌ contact_person_phone не отправляем
        contact_person_phone: undefined, // <--- Добавлено для ясности
      };
      await publishTask(publishPayload);
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
                  // ✅ Сбрасываем телефон
                  setField("contact_person_phone", null); // <--- Добавлено
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

          {/* ✅ Новое поле "Контактное лицо" */}
          <label>
            Контактное лицо
            <select
              value={form.contact_person_id || ""}
              // ✅ Используем новую функцию
              onChange={(e) => handleContactPersonChangeForForm(e.target.value)} // <--- Изменено
              disabled={!form.company_id} // доступно только если выбрана компания
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
            {/* ✅ Индикатор загрузки телефона */}
            {loadingPhone && <span style={{ fontSize: '0.8em', color: '#888' }}>Загрузка телефона...</span>} {/* <--- Добавлено */}
          </label>

          {/* ===== НОВОЕ ПОЛЕ: ТЕЛЕФОН КОНТАКТНОГО ЛИЦА (в режиме редактирования) ===== */}
          <label>
            Телефон контактного лица
            <input
              type="text"
              value={form.contact_person_phone || ""}
              // ✅ Поле только для чтения, заполняется автоматически
              readOnly // <--- Изменено с disabled на readOnly
              placeholder="Выберите контактное лицо"
              style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #444",
                    backgroundColor: "#1a1a1a",
                    color: "#e0e0e0",
                    cursor: "not-allowed",
                  }}
            />
            {/* ✅ Ссылка для вызова, если телефон есть */}
            {form.contact_person_phone && ( // <--- Добавлено
              <a
                href={`tel:${form.contact_person_phone}`}
                style={{  
                   display: 'inline-block',
                      marginLeft: '8px',
                      fontSize: '0.9em',
                      color: '#bb86fc',
                      textDecoration: 'none',
                    
                }}
                onClick={(e) => {
                  // Предотвращаем отправку формы, если это внутри label
                  e.preventDefault();
                  window.location.href = `tel:${form.contact_person_phone}`;
                }}
              >
                📞 Позвонить
              </a>
            )}
          </label>

          <label>
            ТС
            <input value={form.vehicle_info || ""} onChange={(e) => setField("vehicle_info", e.target.value)}  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #444",
                    backgroundColor: "#1a1a1a",
                    color: "#e0e0e0",
                  }} />
          </label>

          {/* ===== НОВОЕ ПОЛЕ: ГОС. НОМЕР ===== */}
          <label>
            Гос. номер
            <input value={form.gos_number || ""} onChange={(e) => setField("gos_number", e.target.value)}  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #444",
                    backgroundColor: "#1a1a1a",
                    color: "#e0e0e0",
                  }}/>
          </label>

          <label>
            Дата и время
            <input type="datetime-local" value={form.scheduled_at || ""} onChange={(e) => setField("scheduled_at", e.target.value)}  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #444",
                    backgroundColor: "#1a1a1a",
                    color: "#e0e0e0",
                  }}/>
          </label>
          <label className="full-row">
            Место {/* ✅ Исправлено: было "Место", теперь соответствует полю 'location' */}
            <textarea value={form.location || ""} onChange={(e) => setField("location", e.target.value)}  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #444",
                    backgroundColor: "#1a1a1a",
                    color: "#e0e0e0",
                  }}/>
          </label>

          <label className="full-row">
            Комментарий
            <textarea value={form.comment || ""} onChange={(e) => setField("comment", e.target.value)}  style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #444",
                    backgroundColor: "#1a1a1a",
                    color: "#e0e0e0",
                  }}/>
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
                    style={{ padding: '8px', backgroundColor: '#cf6679', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
          {/* --- Выбор нового оборудования из списка --- */}
          <SearchableEquipmentSelect
            availableEquipment={equipment}
            onSelect={addEquipmentItemToForm}
            selectedItems={form.equipment} // Не используется в фильтрации, т.к. разрешено дублирование
          />

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
                          border: "1px solid #444",
                          borderRadius: 12,
                          backgroundColor: "#bb86fc", // Цвет для работы
                          color: "#000", // Темный текст на светлом фоне
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
          <SearchableWorkTypeSelect
            availableWorkTypes={workTypes}
            onSelect={addWorkTypeItemToForm}
            selectedWorkTypeIds={form.work_types_ids} // Не используется в фильтрации, т.к. разрешено дублирование
          />
          
  
          <label>
                Тип назначения
                <select
                  value={form.assignment_type || ""}
                  onChange={(e) => {
                    const newType = e.target.value;
                    setField("assignment_type", newType);
                    // Если тип меняется на broadcast, сбрасываем назначенного монтажника
                    if (newType === "broadcast") {
                      // ✅ Используем новую функцию, если она определена, или просто сброс
                      setField("assigned_user_id", null);
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
                  <option value="broadcast">broadcast</option>
                  <option value="individual">assigned</option>
                </select>
              </label>

              {/* ===== НАЗНАЧИТЬ МОНТАЖНИКА (новая логика, условный рендер) ===== */}
              {/* Поле "Назначить монтажника" отображается только если тип "assigned" */}
              {form.assignment_type === "individual" && (
                <div>
                  <label>
                    Назначить монтажника
                  </label>
                  {/* --- Отображение выбранного монтажника --- */}
                  {form.assigned_user_id && (
                    <div style={{ padding: '4px 8px', marginBottom: '8px', border: '1px solid #444', borderRadius: '4px', backgroundColor: '#2a2a2a', color: '#e0e0e0' }}>
                      {/* ✅ Отображаем имя и фамилию монтажника */}
                      Выбран: {montajniks.find(m => m.id === form.assigned_user_id)?.name || 'ID:'} {montajniks.find(m => m.id === form.assigned_user_id)?.lastname || form.assigned_user_id}
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
                    availableMontajniks={montajniks} // <--- Передаём список монтажников
                    onSelect={(userId) => setField("assigned_user_id", userId)}
                    selectedUserId={form.assigned_user_id}
                  />
                </div>
              )}

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}> {/* <--- Стиль для чекбокса */}
        <input
          type="checkbox"
          checked={form.photo_required || false}
          onChange={(e) => setField("photo_required", e.target.checked)}
        />{" "}
        Фото обязательно
      </label>


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
          {/* ===== НОВОЕ ПОЛЕ: ТЕЛЕФОН КОНТАКТНОГО ЛИЦА (в режиме просмотра) ===== */}
         <p>
  <b>Телефон контактного лица:</b>{" "}
  {draft.contact_person_phone || "—"}
  {draft.contact_person_phone && (
    <button
      onClick={() => {
        const phone = draft.contact_person_phone;
        const telUrl = `tel:${phone}`;

        // Если внутри Telegram Mini App
        if (window.Telegram?.WebApp) {
          // Попробуем открыть во внешнем браузере
          window.open(telUrl, "_blank");
        } else {
          // Обычный браузер
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

          <p>
            <b>ТС:</b> {draft.vehicle_info || "—"}
          </p>
          {/* ===== Отображение гос. номера ===== */}
          <p><b>Гос. номер:</b> {draft.gos_number || "—"}</p>
          <p>
            <b>Дата:</b> {draft.scheduled_at ? new Date(draft.scheduled_at).toLocaleString() : "—"}
          </p>
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
          <p>
            <b>Комментарий:</b> {draft.comment || "—"}
          </p>
          <p><b>Фото обязательно:</b> {draft.photo_required ? "Да" : "Нет"}</p>
          {/* ✅ Оставляем отображение цен */}
          <p>
            <b>Цена клиента:</b> {draft.client_price || "—"}
          </p>
          <p>
            <b>Награда монтажнику:</b> {draft.montajnik_reward || "—"}
          </p>
          <p><b>Монтажник:</b> {draft.assigned_user_name || draft.assigned_user_id || "—"}</p>
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
              draft.work_types.map(wt => {
                const wtObj = workTypes.find(w => w.id === wt.work_type_id);
                const name = wtObj?.name || wt.work_type_id;
                const count = wt.quantity || 1;
                return `${name} (x${count})`;
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
            {/* ✅ Показываем индикатор загрузки при выборе компании или телефона */}
            {(loadingRefs || loadingPhone) && <span>Загрузка...</span>} {/* <--- Обновлено */}
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


//исправить черновик монтажник