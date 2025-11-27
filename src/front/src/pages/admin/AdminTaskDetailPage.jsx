// front/src/pages/admin/AdminTaskDetailPage.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  adminGetTaskById,
  adminUpdateTask,
  adminDeleteTask,
  getEquipmentList,
  getWorkTypes,
  getAdminCompaniesList,
  getAdminContactPersonsByCompany,
  getAdminContactPersonPhone,
  getActiveMontajniks,
  listReportAttachments,
  getAttachmentUrl,
} from '../../api'; // Убедитесь, что путь к API корректен
import "../../styles/LogistPage.css"; // Предполагаем, что стили подходят


function useReportAttachments(reportId) {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!reportId) {
      setAttachments([]);
      return;
    }
    const fetchAttachments = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listReportAttachments(reportId);
        setAttachments(data);
      } catch (err) {
        console.error("Ошибка загрузки вложений отчёта:", err);
        setError(err.response?.data?.detail || "Ошибка загрузки вложений");
      } finally {
        setLoading(false);
      }
    };

    fetchAttachments();
  }, [reportId]);

  return { attachments, loading, error };
}


export default function AdminTaskDetailPage() {
  const { id: taskIdStr } = useParams();
  const taskId = parseInt(taskIdStr, 10);
  const navigate = useNavigate();

  const [task, setTask] = useState(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [equipment, setEquipment] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [contactPersons, setContactPersons] = useState([]); // Состояние для списка контактных лиц
  const [contactPersonPhone, setContactPersonPhone] = useState(null);
  const [loadingPhone, setLoadingPhone] = useState(false);
  const [montajniks, setMontajniks] = useState([]);
  const [reportAttachmentsMap, setReportAttachmentsMap] = useState({});

  useEffect(() => {
    if (isNaN(taskId)) {
      alert("Неверный ID задачи");
      navigate("/admin/tasks"); // Перенаправляем на список, если ID некорректен
      return;
    }
    loadRefs();
    loadTask();
  }, [taskId, navigate]);

  async function loadRefs() {
    try {
      const [eqRes, wtRes, compRes,montRes] = await Promise.allSettled([
        getEquipmentList(),
        getWorkTypes(),
        getAdminCompaniesList(),
        getActiveMontajniks(),
      ]);

      setEquipment(eqRes.status === 'fulfilled' ? eqRes.value || [] : []);
      setWorkTypes(wtRes.status === 'fulfilled' ? wtRes.value || [] : []);
      setCompanies(compRes.status === 'fulfilled' ? compRes.value || [] : []);
      setMontajniks(montRes.status === 'fulfilled' ? montRes.value || [] : []);
    } catch (e) {
      console.error("Ошибка загрузки справочников", e);
    }
  }

  function clearAssignedUserAndSetBroadcast() { // <--- Добавлено
    setField("assigned_user_id", null);
    setField("assignment_type", "broadcast");
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
      // Показываем всё оборудование (разрешено дублирование)
      setFilteredEquipment(availableEquipment);
    } else {
      const termLower = searchTerm.toLowerCase();
      setFilteredEquipment(
        availableEquipment.filter(eq =>
          eq.name.toLowerCase().includes(termLower) // Ищем в любом месте названия
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
              onMouseDown={(e) => e.preventDefault()} // Предотвращает потерю фокуса у input
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

// --- КОМПОНЕНТ: Умный поиск для видов работ (из TaskDetailPage) ---
function SearchableWorkTypeSelect({ availableWorkTypes, onSelect, selectedWorkTypeIds }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredWorkTypes, setFilteredWorkTypes] = useState(availableWorkTypes);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!searchTerm.trim()) {
      // Показываем все виды работ (разрешено дублирование)
      setFilteredWorkTypes(availableWorkTypes);
    } else {
      const termLower = searchTerm.toLowerCase();
      setFilteredWorkTypes(
        availableWorkTypes.filter(wt =>
          wt.name.toLowerCase().includes(termLower) // Ищем в любом месте названия
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
              onMouseDown={(e) => e.preventDefault()} // Предотвращает потерю фокуса у input
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

  const loadReportAttachments = async (reportId) => {
    try {
      const data = await listReportAttachments(reportId);
      setReportAttachmentsMap(prev => ({
        ...prev,
        [reportId]: data
      }));
    } catch (err) {
      console.error(`Ошибка загрузки вложений отчёта ${reportId}:`, err);
    }
  };

  async function loadTask() {
    if (isNaN(taskId)) return;
    setLoading(true);
    try {
      const data = await adminGetTaskById(taskId);

      // --- НОВАЯ ЛОГИКА ОБРАБОТКИ equipment и work_types ---
      const processedEquipment = (data.equipment || []).map(e => ({
        equipment_id: e.equipment_id,
        serial_number: e.serial_number || "",
        quantity: e.quantity || 1,
      }));

      const processedWorkTypesForView = (data.work_types || []).map(wt => ({
        work_type_id: wt.work_type_id,
        quantity: wt.quantity
      }));

      const t = {
        ...data,
        equipment: processedEquipment,
        work_types: processedWorkTypesForView,
        history: data.history || [],
        reports: data.reports || [],
        attachments: data.attachments || [],
      };

      setTask(t);

      // --- ИНИЦИАЛИЗАЦИЯ form ДЛЯ РЕДАКТИРОВАНИЯ ---
      const formEquipment = t.equipment.map(e => ({
        equipment_id: e.equipment_id,
        serial_number: e.serial_number || "",
      }));

      const formWorkTypesIds = [];
      (data.work_types || []).forEach(wtItem => {
        for (let i = 0; i < wtItem.quantity; i++) {
          formWorkTypesIds.push(wtItem.work_type_id);
        }
      });

      const initialForm = {
        ...t,
        equipment: formEquipment,
        work_types_ids: formWorkTypesIds,
        gos_number: t.gos_number || "",
        contact_person_phone: t.contact_person_phone || null,
        assigned_user_id: t.assigned_user_id || null,
      };

      setForm(initialForm); // <-- initialForm установлен

      // --- ЗАГРУЗКА ТЕЛЕФОНА КОНТАКТНОГО ЛИЦА ДЛЯ РЕЖИМА ПРОСМОТРА ---
      if (t.contact_person_id && !t.contact_person_phone) {
         try {
            const { phone } = await getAdminContactPersonPhone(t.contact_person_id);
            setContactPersonPhone(phone);
         } catch (err) {
            console.error("Ошибка загрузки телефона контактного лица:", err);
            setContactPersonPhone(null);
         }
      } else {
        setContactPersonPhone(t.contact_person_phone || null);
      }

      // --- ИНИЦИАЛИЗАЦИЯ КОНТАКТНЫХ ЛИЦ И ВЫБОРА КОНТАКТНОГО ЛИЦА ДЛЯ РЕЖИМА РЕДАКТИРОВАНИЯ ---
      // Проверяем, была ли выбрана компания в initialForm
      if (initialForm.company_id) {
        try {
          // Загружаем список контактных лиц для выбранной компании
          const contacts = await getAdminContactPersonsByCompany(initialForm.company_id);
          setContactPersons(contacts || []); // <-- Устанавливаем список

          // Если в initialForm был выбран контакт, устанавливаем его в form
          if (initialForm.contact_person_id) {
            setField("contact_person_id", initialForm.contact_person_id); // <-- Устанавливаем выбранный ID
            // При желании, можно сразу подгрузить телефон, если его нет в initialForm
            if (!initialForm.contact_person_phone) {
                try {
                    const { phone } = await getAdminContactPersonPhone(initialForm.contact_person_id);
                    setField("contact_person_phone", phone);
                    // setContactPersonPhone(phone); // Опционально: обновить и state для просмотра
                } catch (phoneErr) {
                    console.error("Ошибка загрузки телефона контактного лица при инициализации:", phoneErr);
                    setField("contact_person_phone", null);
                    // setContactPersonPhone(null); // Опционально: обновить и state для просмотра
                }
            }
          } else {
             // Если contact_person_id не был установлен, но компания есть, можно сбросить телефон
             setField("contact_person_phone", null);
          }
        } catch (e) {
          console.error("Ошибка загрузки контактных лиц при инициализации задачи (админ):", e);
          setContactPersons([]);
          // Если не удалось загрузить, сбрасываем выбор контактного лица и телефона
          setField("contact_person_id", null);
          setField("contact_person_phone", null);
        }
      } else {
        // Если компания не была выбрана, сбрасываем список и выбор
        setContactPersons([]);
        setField("contact_person_id", null);
        setField("contact_person_phone", null);
      }
      // --- КОНЕЦ НОВОГО БЛОКА --- 

      if (t.reports) {
        t.reports.forEach(r => {
          loadReportAttachments(r.id);
        });
      }
      

    } catch (err) {
      console.error("Ошибка загрузки задачи:", err);
      alert("Ошибка загрузки задачи");
    } finally {
      setLoading(false);
    }
  }

  function setField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // ✅ Загрузка контактных лиц при выборе компании в форме редактирования
  async function handleCompanyChangeForForm(companyId) {
    if (!companyId) {
      setContactPersons([]);
      setField("contact_person_id", null);
      setField("contact_person_phone", null);
      return;
    }
    try {
      setLoadingPhone(true);
      const contacts = await getAdminContactPersonsByCompany(companyId);
      setContactPersons(contacts || []);
      // Сбрасываем выбор контактного лица при смене компании
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

  // ✅ Новая функция для загрузки телефона контактного лица в форме редактирования
  async function handleContactPersonChangeForForm(contactPersonId) {
    const val = contactPersonId ? parseInt(contactPersonId, 10) : null;
    setField("contact_person_id", val);

    if (val) {
      setLoadingPhone(true);
      try {
        const { phone } = await getAdminContactPersonPhone(val);
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

  // --- НОВАЯ ЛОГИКА ДЛЯ РАБОТЫ С ОБОРУДОВАНИЕМ ---
  function addEquipmentItemToForm(equipmentId) {
    if (!equipmentId) return;
    const eq = equipment.find(e => e.id === equipmentId);
    if (!eq) return;

    const newItem = {
      equipment_id: equipmentId,
      serial_number: "",
    };
    setForm((prevForm) => ({
      ...prevForm,
      equipment: [...(prevForm.equipment || []), newItem],
    }));
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

  // --- НОВАЯ ЛОГИКА ДЛЯ РАБОТЫ С ТИПАМИ РАБОТ ---
  function addWorkTypeItemToForm(workTypeId) {
    if (!workTypeId) return;
    setForm((prevForm) => ({
      ...prevForm,
      work_types_ids: [...(prevForm.work_types_ids || []), workTypeId],
    }));
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
    if (isNaN(taskId)) return;
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
      await adminUpdateTask(taskId, payload);
      alert("✅ Изменения сохранены");
      setEdit(false);
      loadTask(); // Перезагружаем данные после сохранения
    } catch (err) {
      console.error(err);
      alert("Ошибка при сохранении");
    }
  }

  async function handleDelete() {
    if (isNaN(taskId)) return;
    if (!window.confirm("Вы уверены, что хотите удалить задачу?")) return;
    try {
      await adminDeleteTask(taskId);
      alert("✅ Задача удалена");
      navigate("/admin/tasks"); // Перенаправляем на список задач после удаления
    } catch (err) {
      console.error("Ошибка при удалении:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось удалить задачу.";
      alert(`Ошибка: ${errorMsg}`);
    }
  }

  function handleUploaded(file) {
    setForm((f) => ({ ...f, attachments: [...(f.attachments || []), file] }));
  }

  if (loading) {
    return (
      <div className="page">
        <h1>Загрузка задачи #{taskId}...</h1>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="page">
        <h1>Задача не найдена</h1>
        <button onClick={() => navigate("/admin/tasks")}>Назад к списку</button>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Задача #{task.id}</h1>
        {!edit ? (
          <>
            <button className="add-btn" onClick={() => setEdit(true)}>
              ✏️ Редактировать
            </button>
            <button className="add-btn" style={{ backgroundColor: '#ef4444' }} onClick={handleDelete}>
              🗑 Удалить
            </button>
          </>
        ) : (
          <>
            <button className="add-btn" onClick={saveEdit}>
              💾 Сохранить
            </button>
            <button className="add-btn" onClick={() => setEdit(false)}>
              ❌ Отмена
            </button>
          </>
        )}
      </div>

      <div className="task-detail">
        {edit ? (
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
                    handleCompanyChangeForForm(val);
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

            {/* ===== Контактное лицо ===== */}
            <label>
              Контактное лицо
              <select
                value={form.contact_person_id || ""}
                onChange={(e) => handleContactPersonChangeForForm(e.target.value)}
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

            {/* ===== ТЕЛЕФОН КОНТАКТНОГО ЛИЦА ===== */}
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
                    backgroundColor: "#1a1a1a",
                    color: "#e0e0e0",
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
                    color: '#1e88e5',
                    textDecoration: 'none',
                  }}
                >
                </a>
              )}
            </label>

            <label>
              ТС 
              <input value={form.vehicle_info || ""} onChange={(e) => setField("vehicle_info", e.target.value)} style={{
                    width: "100%",
                    padding: "8px",
                    borderRadius: "4px",
                    border: "1px solid #444",
                    backgroundColor: "#1a1a1a",
                    color: "#e0e0e0",
                  }} />
            </label>

            {/* ===== ГОС. НОМЕР ===== */}
            <label>
              Гос. номер
              <input value={form.gos_number || ""} onChange={(e) => setField("gos_number", e.target.value)} style={{
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
              <input
                type="datetime-local"
                value={form.scheduled_at ? new Date(form.scheduled_at).toISOString().slice(0, 16) : ""}
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
            
            <label>
                Тип назначения
                <select
                  value={form.assignment_type || ""}
                  onChange={(e) => {
                    const newType = e.target.value;
                    setField("assignment_type", newType);
                    // Если тип меняется на broadcast, сбрасываем назначенного монтажника
                    if (newType === "broadcast") {
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
                        onClick={clearAssignedUserAndSetBroadcast} // <--- Используем новую функцию
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

            {/* Цены — не редактируются */}


        

            {/* ===== Оборудование (редактирование) ===== */}
            <label>
        Оборудование
      </label>
      {/* --- Список выбранных элементов (название - поле серийного номера) --- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '10px' }}>
        {(form.equipment || []).map((item, index) => {
          const eq = equipment.find((e) => e.id === item.equipment_id); // <--- Используем equipment из state
          return (
            <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* Название оборудования */}
              <div style={{ flex: 1, padding: '8px', border: '1px solid #444', borderRadius: '4px', backgroundColor: '#2a2a2a', color: '#e0e0e0' }}>
                {eq?.name || `ID ${item.equipment_id}`}
              </div>
              {/* Поле ввода серийного номера */}
              <div style={{ flex: 1 }}>
                <input
                  type="text"
                  placeholder="Серийный номер"
                  value={item.serial_number || ""}
                  onChange={(e) => updateEquipmentItemInForm(index, "serial_number", e.target.value)}
                  style={{ width: '100%', padding: '8px', border: '1px solid #444', borderRadius: '4px', backgroundColor: '#1a1a1a', color: '#e0e0e0' }}
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
      {/* --- Выбор нового оборудования через SearchableSelect --- */}
      <SearchableEquipmentSelect
        availableEquipment={equipment} // <--- Передаём весь список оборудования
        onSelect={addEquipmentItemToForm} // <--- Передаём функцию добавления
        selectedItems={form.equipment} // <--- Передаём уже выбранные элементы (не используется в фильтрации, т.к. разрешено дублирование)
      />

      {/* ===== Виды работ (редактирование с умным поиском) ===== */}
      <label>
        Виды работ
      </label>
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
            const wt = workTypes.find((w) => w.id === id); // <--- Используем workTypes из state
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
                  style={{ cursor: "pointer", fontWeight: 'bold' }}
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
        availableWorkTypes={workTypes} // <--- Передаём весь список видов работ
        onSelect={addWorkTypeItemToForm} // <--- Передаём функцию добавления
        selectedWorkTypeIds={form.work_types_ids} // <--- Передаём уже выбранные ID (не используется в фильтрации, т.к. разрешено дублирование)
      />

       <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            <p><b>Компания:</b> {task.company_name || "—"}</p>
            <p><b>Контактное лицо:</b> {task.contact_person_name || "—"}</p>
            {/* ===== ТЕЛЕФОН КОНТАКТНОГО ЛИЦА ===== */}
            <p>
  <b>Телефон контактного лица:</b>{" "}
  {contactPersonPhone || task.contact_person_phone || "—"}
  {(contactPersonPhone || task.contact_person_phone) && (
    <button
      onClick={() => {
        const phone = contactPersonPhone || task.contact_person_phone;
        const telUrl = `tel:${phone}`;

        // Если внутри Telegram Mini App
        if (window.Telegram?.WebApp) {
          // Попробуем открыть в внешнем браузере
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

            <p><b>ТС:</b> {task.vehicle_info || "—"}</p>
            {/* ===== ГОС. НОМЕР ===== */}
            <p><b>Гос. номер:</b> {task.gos_number || "—"}</p>
            <p><b>Дата:</b> {task.scheduled_at ? new Date(task.scheduled_at).toLocaleString() : "—"}</p>
            <p><b>Статус:</b> {task.status || "—"}</p>
            <p><b>Монтажник:</b> {task.assigned_user_name || task.assigned_user_id || "—"}</p>
            <p>
                <b>Место/Адрес:</b>{" "}
                {task.location ? (
                  <a
                    href={`https://2gis.ru/search/${encodeURIComponent(task.location)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#1e88e5',
                      textDecoration: 'none',
                      fontWeight: 'bold'
                    }}
                  >
                    {task.location}
                  </a>
                ) : "—"}
              </p>
            <p><b>Комментарий:</b> {task.comment || "—"}</p>
            <p><b>Цена клиента:</b> {task.client_price || "—"}</p>
            <p><b>Награда монтажнику:</b> {task.montajnik_reward || "—"}</p>
            <p><b>Фото обязательно:</b> {task.photo_required ? "Да" : "Нет"}</p>

            {/* ===== Оборудование (отображение) ===== */}
            <p>
              <b>Оборудование:</b>{" "}
              {(task.equipment || [])
                .map((e) => {
                  const eqName = equipment.find((eq) => eq.id === e.equipment_id)?.name;
                  return `${eqName || e.equipment_id}${e.serial_number ? ` (SN: ${e.serial_number})` : ''} x${e.quantity}`;
                })
                .join(", ") || "—"}
            </p>

            {/* ===== Виды работ (отображение) ===== */}
            <p>
              <b>Виды работ:</b>{" "}
              {task.work_types && task.work_types.length > 0 ? (
                task.work_types.map(wt => {
                  const wtObj = workTypes.find(w => w.id === wt.work_type_id);
                  const name = wtObj?.name || wt.work_type_id;
                  const count = wt.quantity || 1;
                  return `${name} (x${count})`;
                }).join(", ")
              ) : "—"}
            </p>
          </div>
        )}
        {!edit && (
          <>
         <div className="section">
          <h3>История</h3>
          {/* Кнопка "Подробнее" теперь ведёт на отдельную страницу истории */}
          <button className="add-btn" onClick={() => navigate(`/admin/tasks/${task.id}/history`)}>
            Подробнее
          </button>
        </div>

        <div className="section">
          <h3>Отчёты монтажников</h3>
          {(task.reports || []).length ? (
            task.reports.map((r) => {
              // --- ИЗМЕНЕНО: Извлечение выполненных работ и комментария ---
              let performedWorks = "";
              let comment = "";
              if (r.text) {
                const lines = r.text.split("\n\n");
                if (lines[0].startsWith("Выполнено: ")) {
                  performedWorks = lines[0].substring("Выполнено: ".length);
                }
                if (lines.length > 1) {
                  comment = lines.slice(1).join("\n\n");
                } else if (!r.text.startsWith("Выполнено: ")) {
                  comment = r.text;
                }
              }

              // --- ИЗМЕНЕНО: Получение вложений из reportAttachmentsMap ---
              const reportAttachments = reportAttachmentsMap[r.id] || [];
              const reportAttachmentsLoading = !reportAttachmentsMap.hasOwnProperty(r.id);

              return (
                <div key={r.id} className="report">
                  {/* #37: Выполнено: {типы работ} */}
                  <p>
                    <b>#{r.id}:</b> {performedWorks ? `Выполнено: ${performedWorks}` : "Нет выполненных работ"}
                  </p>
                  {/* С новой строки — комментарий монтажника */}
                  {comment && (
                    <p>{comment}</p>
                  )}
                  {/* СО СЛЕДУЮЩЕЙ СТРОКИ — вложения */}
                  {reportAttachmentsLoading ? (
                    <p>Загрузка вложений...</p>
                  ) : reportAttachments.length > 0 ? (
                    <div className="attached-list">
                      {reportAttachments.map((att, idx) => {
                        const originalUrl = att.presigned_url || getAttachmentUrl(att.storage_key);
                        const thumbUrl = att.thumb_key
                          ? getAttachmentUrl(att.thumb_key)
                          : originalUrl;

                        return (
                          <a
                            key={att.id}
                            href={originalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <img
                              src={thumbUrl}
                              alt={`Report attachment ${idx}`}
                              style={{ maxHeight: 100 }}
                            />
                          </a>
                        );
                      })}
                    </div>
                  ) : (
                    <p>Вложений нет</p>
                  )}
                  {/* СО СЛЕДУЮЩЕЙ СТРОКИ — статусы проверки */}
                  <p>
                    logist: <b>{r.approval_logist || "—"}</b> | tech:{" "}
                    <b>{r.approval_tech || "—"}</b>
                  </p>
                </div>
              );
            })
          ) : (
            <div className="empty">Отчётов пока нет</div>
          )}
        </div>
         </>
          )}
      </div>
    </div>
  );
}