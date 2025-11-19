// front/src/pages/logist/TaskDetailPage.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchTaskDetail,
  editTask,
  reviewReport,
  getEquipmentList,
  getWorkTypes,
  getCompaniesList,
  getContactPersonsByCompany,
  getContactPersonPhone, // <--- Импорт
  getActiveMontajniks,
  archiveTask,
} from "../../api";
import "../../styles/LogistPage.css";
import useAuthStore from "@/store/useAuthStore";

function RejectReportModal({ taskId, reportId, onClose, onSubmitSuccess }) {
  const [comment, setComment] = useState("");

  const handleSubmit = async () => {
    if (!comment.trim()) {
      alert("Введите комментарий причины отклонения");
      return;
    }
    try {
      await reviewReport(taskId, reportId, { approval: "rejected", comment, photos: [] });
      alert("❌ Отчёт отклонён");
      onSubmitSuccess && onSubmitSuccess();
      onClose();
    } catch (err) {
      console.error("Ошибка отклонения отчёта:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось отклонить отчёт.";
      alert(`Ошибка: ${errorMsg}`);
    } finally {
      // setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>Отклонить отчёт #{reportId} по задаче #{taskId}</h2>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <label>
              Комментарий:
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows="4"
                placeholder="Причина отклонения..."
              />
            </label>
          </div>
        </div>
        <div className="modal-actions">
          {/* ❌ Убираем состояние submitting из кнопки */}
          <button className="primary" onClick={handleSubmit} /*disabled={submitting}*/>
            Отправить
          </button>
          <button onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}



// --- КОМПОНЕНТ: Умный поиск для оборудования ---
function SearchableEquipmentSelect({ availableEquipment, onSelect, selectedItems }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredEquipment, setFilteredEquipment] = useState(availableEquipment);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!searchTerm.trim()) {
      // Если поле пустое, показываем всё
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

export default function TaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [equipmentList, setEquipmentList] = useState([]);
  const [workTypesList, setWorkTypesList] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [contactPersons, setContactPersons] = useState([]);
  const [contactPersonPhone, setContactPersonPhone] = useState(null); // <--- Для просмотра
  const [loadingPhone, setLoadingPhone] = useState(false); // <--- Для редактирования
  const [rejectModal, setRejectModal] = useState({ open: false, taskId: null, reportId: null });
  const [montajniks, setMontajniks] = useState([]); // <--- Список монтажников

  useEffect(() => {
    loadRefs();
    loadTask();
  }, [id]);


  async function handleArchiveTask() {
    if (!task || task.is_draft) {
        alert("Нельзя архивировать черновик через эту кнопку.");
        return;
    }
    // Также можно проверить, что статус не 'archived', чтобы не архивировать повторно
    if (task.status === "archived") {
        alert("Задача уже архивирована.");
        return;
    }
    if (!window.confirm(`Вы уверены, что хотите архивировать задачу #${task.id}?`)) return;
    try {
      await archiveTask(task.id); // Вызываем API функцию
      alert("✅ Задача архивирована");
      useAuthStore.getState().updateActiveTasksCount();
      navigate("/logist/tasks/active");
      loadTask(); // Перезагружаем данные задачи
    } catch (err) {
      console.error("Ошибка архивации задачи:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось архивировать задачу.";
      alert(`Ошибка: ${errorMsg}`);
    }
  }


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

  async function loadTask() {
    setLoading(true);
    try {
      const data = await fetchTaskDetail(id);

      // --- Обработка equipment и work_types ---
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
      };

      setTask(t);

      // --- ИНИЦИАЛИЗАЦИЯ form ДЛЯ РЕДАКТИРОВАНИЯ ---
      const formEquipment = t.equipment.map(e => ({
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
        ...t,
        equipment: formEquipment,
        work_types_ids: formWorkTypesIds,
        contact_person_phone: t.contact_person_phone || null,
        assignment_type: t.assignment_type,
        assigned_user_id: t.assigned_user_id || null,
      };

      setForm(initialForm);

      // --- ЗАГРУЗКА ТЕЛЕФОНА КОНТАКТНОГО ЛИЦА ДЛЯ РЕЖИМА ПРОСМОТРА ---
      if (t.contact_person_id && !t.contact_person_phone) {
         try {
            const { phone } = await getContactPersonPhone(t.contact_person_id);
            setContactPersonPhone(phone);
         } catch (err) {
            console.error("Ошибка загрузки телефона при инициализации задачи:", err);
            setContactPersonPhone(null);
         }
      } else {
        setContactPersonPhone(t.contact_person_phone || null);
      }

      // --- ЗАГРУЗКА КОНТАКТНЫХ ЛИЦ ДЛЯ КОМПАНИИ ЗАДАЧИ ---
      if (initialForm.company_id) {
        try {
          const contacts = await getContactPersonsByCompany(initialForm.company_id);
          setContactPersons(contacts || []);
          if (initialForm.contact_person_id) {
            setField("contact_person_id", initialForm.contact_person_id);
            if (!initialForm.contact_person_phone) {
                try {
                    const { phone } = await getContactPersonPhone(initialForm.contact_person_id);
                    setField("contact_person_phone", phone);
                    setContactPersonPhone(phone);
                } catch (phoneErr) {
                    console.error("Ошибка загрузки телефона контактного лица при инициализации:", phoneErr);
                    setField("contact_person_phone", null);
                    setContactPersonPhone(null);
                }
            }
          }
        } catch (err) {
          console.error("Ошибка загрузки контактных лиц при инициализации задачи:", err);
          setContactPersons([]);
        }
      } else {
        setContactPersons([]);
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

  // --- ЛОГИКА ДЛЯ РАБОТЫ С ОБОРУДОВАНИЕМ ---
  function addEquipmentItemToForm(equipmentId) {
    if (!equipmentId) return;
    const eq = equipmentList.find(e => e.id === equipmentId);
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

  // --- ЛОГИКА ДЛЯ РАБОТЫ С ТИПАМИ РАБОТ ---
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


   function setAssignedUser(userId) {
    setField("assigned_user_id", userId);
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

  // ✅ Новая функция для загрузки телефона контактного лица в форме редактирования
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
        contact_person_phone: undefined, // Не отправляем, сервер сам возьмёт по contact_person_id
        assigned_user_name: undefined,
      };
      await editTask(id, payload);
      alert("✅ Изменения сохранены");
      setEdit(false);
      loadTask(); // Перезагружаем данные
    } catch (err) {
      console.error(err);
      alert("Ошибка при сохранении");
    }
  }

  // --- Отчёт: принять / отклонить ---
  async function handleApproveReport(taskId, reportId) {
    if (!window.confirm("Принять отчёт?")) return;
    try {
      await reviewReport(taskId, reportId, { approval: "approved", comment: "", photos: [] });
      alert("✅ Отчёт принят");
      loadTask();
    } catch (err) {
      console.error("Ошибка принятия отчёта:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось принять отчёт.";
      alert(`Ошибка: ${errorMsg}`);
    }
  }

  function handleRejectReport(taskId, reportId) {
    setRejectModal({ open: true, taskId, reportId });
  }

  function closeRejectModal() {
    setRejectModal({ open: false, taskId: null, reportId: null });
  }

  function handleRejectSuccess() {
    loadTask();
  }

  function clearAssignedUserAndSetBroadcast() {
    setField("assigned_user_id", null);
    // setField("assigned_user_name", null); // assigned_user_name нет в form
    setField("assignment_type", "broadcast"); // <--- Меняем тип на broadcast
  }

  function renderAttachments(attachments) {
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return <span>Нет вложений</span>;
    }

    return (
      <div className="attached-list" style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {attachments.map((a, index) => {
          let src = "";
          let key = `attachment-${index}`;

          if (a && typeof a === "object") {
            if (a.presigned_url) {
              src = a.presigned_url;
            } else if (a.storage_key) {
              src = `https://s3.storage.selcloud.ru/mobile-service-testing/${a.storage_key}`;
            }
            key = a.id ? `id-${a.id}` : a.storage_key ? `sk-${a.storage_key}` : `index-${index}`;
          } else if (typeof a === "string") {
            src = `https://s3.storage.selcloud.ru/mobile-service-testing/${a}`;
            key = `str-${a}`;
          }

          if (src) {
            return (
              <div className="attached" key={key} style={{ minWidth: '100px', minHeight: '100px', border: '1px dashed #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px' }}>
                <img
                  src={src}
                  alt={`Attachment ${index}`}
                  style={{ maxHeight: 100, maxWidth: '100%', objectFit: 'contain' }}
                  onLoad={() => console.log(`✅ IMG Loaded: ${src}`)}
                  onError={(e) => {
                    console.error(`❌ IMG Error: ${src}`, e);
                    e.target.onerror = null;
                    e.target.parentElement.innerHTML = `<span style={{ fontSize: 12px, textAlign: 'center' }}>Img Err (${index})</span>`;
                  }}
                />
              </div>
            );
          } else {
            return (
              <div className="attached" key={key} style={{ minWidth: '100px', minHeight: '100px', border: '1px dashed #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px' }}>
                <span style={{ fontSize: '12px', textAlign: 'center' }}>Вложение (${index})</span>
              </div>
            );
          }
        })}
      </div>
    );
  }

  if (loading) return <div className="logist-main"><div className="empty">Загрузка задачи #{id}...</div></div>;
  if (!task) return <div className="logist-main"><div className="empty">Задача не найдена</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1>Задача #{task.id}</h1>
          {!edit ? (
            <>
              <button className="add-btn" onClick={() => setEdit(true)}>
                ✏️ Редактировать
              </button>
              {task.status !== "archived" && !task.is_draft && ( // <--- Условный рендер: не архивирована и не черновик
                <button className="add-btn" style={{ backgroundColor: '#ff9800' }} onClick={handleArchiveTask}> {/* <--- Стиль и обработчик */}
                  🗃 Архивировать
                </button>
              )}
            </>
          ) : (
            <>
              <button type="button" className="add-btn" onClick={saveEdit}>
                💾 Сохранить
              </button>
              <button type="button" className="add-btn" onClick={() => setEdit(false)}>
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
                Компания:
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
                Контактное лицо:
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
                Телефон контактного лица:
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
                  value={form.vehicle_info || ""}
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
              <label>
                Место/адрес
                <textarea
                  value={form.location || ""}
                  onChange={(e) => setField("location", e.target.value)}
                  rows="3"
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
                Комментарий
                <textarea
                  value={form.comment || ""}
                  onChange={(e) => setField("comment", e.target.value)}
                  rows="3"
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
              {/* Цены — только для отображения, не редактируются */}
              

              {/* ===== Оборудование (редактирование с умным поиском) ===== */}
              <label>Оборудование</label>
              {/* --- Список выбранных элементов (название - поле серийного номера) --- */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '10px' }}>
                {(form.equipment || []).map((item, index) => {
                  const eq = equipmentList.find((e) => e.id === item.equipment_id);
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
                availableEquipment={equipmentList}
                onSelect={addEquipmentItemToForm}
                selectedItems={form.equipment} // Не используется в фильтрации, т.к. разрешено дублирование
              />

              {/* ===== Виды работ (редактирование с умным поиском) ===== */}
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
                availableWorkTypes={workTypesList}
                onSelect={addWorkTypeItemToForm}
                selectedWorkTypeIds={form.work_types_ids} // Не используется в фильтрации, т.к. разрешено дублирование
              />

               <label>
                Тип назначения
                <select
                  value={form.assignment_type || ""}
                  // ❌ Убираем onChange, чтобы не мешал сбросу из функции clearAssignedUserAndSetBroadcast
                  // onChange={(e) => { ... }}
                  onChange={(e) => {
                     const newType = e.target.value;
                     setField("assignment_type", newType);
                     // Если тип меняется на broadcast, сбрасываем назначенного монтажника
                     if (newType === "broadcast") {
                        setField("assigned_user_id", null);
                        // setField("assigned_user_name", null); // assigned_user_name нет в form
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
              {/* ✅ Поле "Назначить монтажника" отображается только если тип "assigned" */}
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
                        // ✅ ИСПРАВЛЕНО: вызываем новую функцию
                        onClick={clearAssignedUserAndSetBroadcast}
                        style={{ marginLeft: '8px', padding: '2px 4px', backgroundColor: '#cf6679', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        ×
                      </button>
                    </div>
                  )}
                  {/* --- Выбор нового монтажника через SearchableSelect --- */}
                  <SearchableMontajnikSelect
                    availableMontajniks={montajniks}
                    onSelect={(userId) => {
                       setField("assigned_user_id", userId);
                       // setField("assigned_user_name", ...); // assigned_user_name нет в form, сервер сам возьмёт
                       // Убедимся, что тип назначения - individual, если был broadcast
                       if (form.assignment_type !== "individual") {
                          setField("assignment_type", "individual");
                       }
                    }}
                    selectedUserId={form.assigned_user_id}
                  />
                </div>
              )}

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
              <p><b>Гос. номер:</b> {task.gos_number || "—"}</p>
              <p><b>Дата:</b> {task.scheduled_at ? new Date(task.scheduled_at).toLocaleString() : "—"}</p>
              <p><b>Статус:</b> {task.status || "—"}</p>
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
              <p><b>Монтажник:</b> {task.assigned_user_name || task.assigned_user_id || "—"}</p>
              <p><b>Комментарий:</b> {task.comment || "—"}</p>
              <p><b>Цена клиента:</b> {task.client_price || "—"}</p>
              <p><b>Награда монтажнику:</b> {task.montajnik_reward || "—"}</p>
              <p>
                <b>Оборудование:</b>{" "}
                {(task.equipment || [])
                  .map((e) => {
                    const eqName = equipmentList.find((eq) => eq.id === e.equipment_id)?.name;
                    return `${eqName || e.equipment_id}${e.serial_number ? ` (SN: ${e.serial_number})` : ''} x${e.quantity}`;
                  })
                  .join(", ") || "—"}
              </p>

              {/* ===== ИЗМЕНЁННОЕ ОТОБРАЖЕНИЕ ВИДОВ РАБОТ ===== */}
              <p>
                <b>Виды работ:</b>{" "}
                {task.work_types && task.work_types.length > 0 ? (
                  task.work_types.map(wt => {
                    const wtObj = workTypesList.find(w => w.id === wt.work_type_id);
                    const name = wtObj?.name || wt.work_type_id;
                    const count = wt.quantity || 1;
                    return `${name} (x${count})`;
                  }).join(", ")
                ) : "—"}
              </p>
              <p><b>Фото обязательно:</b> {task.photo_required ? "Да" : "Нет"}</p>
            </div>
          )}

          {/* === БЛОК ИСТОРИИ === */}
          {!edit && (
            <>
              <div className="section">
                <h3>История</h3>
                <button type="button" className="add-btn" onClick={() => navigate(`/logist/tasks/${id}/history`)}>
                  Подробнее
                </button>
              </div>

              <div className="section">
  <h3>Отчёты монтажников</h3>

  {(task.reports || []).length ? (
    task.reports.map((r) => (
      <div key={r.id} className="report">
        <p>
          #{r.id}: {r.text || "—"}
        </p>

        <p>
          <b>Логист:</b> {r.approval_logist || "—"}
          {task.requires_tech_supp === true && (
            <>
              {" "} | <b>Тех.спец:</b> {r.approval_tech || "—"}
            </>
          )}
        </p>

        {task.requires_tech_supp === true &&
          (r.approval_tech !== "waiting" &&
            r.approval_tech !== "rejected") && (
            <p
              style={{
                color:
                  r.approval_tech === "approved"
                    ? "green"
                    : r.approval_tech === "rejected"
                    ? "red"
                    : "orange",
              }}
            >
              <b>Тех.спец:</b> {r.approval_tech}
              {r.review_comment &&
                r.approval_tech === "rejected" &&
                ` - ${r.review_comment}`}
            </p>
          )}

        <div className="report-actions">
          {r.approval_logist === "waiting" ? (
            <>
              <button
                type="button"
                onClick={() => handleApproveReport(task.id, r.id)}
              >
                ✅ Принять
              </button>
              <button
                type="button"
                onClick={() => handleRejectReport(task.id, r.id)}
              >
                ❌ Отклонить
              </button>
            </>
          ) : null}
        </div>

        {r.photos && r.photos.length > 0 && (
          <div className="attached-list">{renderAttachments(r.photos)}</div>
        )}
      </div>
    ))
  ) : (
    <div className="empty">Отчётов пока нет</div>
  )}
</div>

            </>
          )}
        </div>
      </div>

      {rejectModal.open && (
        <RejectReportModal
          taskId={rejectModal.taskId}
          reportId={rejectModal.reportId}
          onClose={closeRejectModal}
          onSubmitSuccess={handleRejectSuccess}
        />
      )}
    </div>
  );
}