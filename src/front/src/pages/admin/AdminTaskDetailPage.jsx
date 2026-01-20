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
import "../../styles/LogistPage.css"; // Используем общие стили
import ImageModal from '../../components/ImageModal.jsx';

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
  //const [openImage, setOpenImage] = useState(null);
  const [imageModalState, setImageModalState] = useState({
      isOpen: false,
      currentIndex: 0,
      attachments: [], 
    });
  

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
      const [eqRes, wtRes, compRes, montRes] = await Promise.allSettled([
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

  function clearAssignedUserAndSetBroadcast() {
    setField("assigned_user_id", null);
    setField("assignment_type", "broadcast");
  }

  const STATUS_TRANSLATIONS = {
    new: "Создана",
    accepted: "Принята монтажником",
    on_the_road: "Выехал на работу",
    started: "В процессе выполнения",
    on_site: "Прибыл на место",
    completed: "Завершена",
    inspection: "На проверке",
    returned: "Возвращена на доработку",
    archived: "В архиве",
    assigned: "Назначена", // Возможно, не используется в статусах задачи, но оставим для полноты
  };

  const handleImageClick = (clickedImageUrl, reportAttachments) => {
      const attachments = Array.isArray(reportAttachments) ? reportAttachments : [];
      const clickedIndex = attachments.findIndex(att => {
        const originalUrl = att.presigned_url || getAttachmentUrl(att.storage_key);
        return originalUrl === clickedImageUrl;
      });
    
      if (clickedIndex === -1) {
        console.warn("Clicked image not found in attachments list.");
        // Возможно, установить первый элемент или игнорировать
        if (attachments.length > 0) {
          setImageModalState({
            isOpen: true,
            currentIndex: 0,
            attachments: attachments,
          });
        }
      } else {
        setImageModalState({
          isOpen: true,
          currentIndex: clickedIndex,
          attachments: attachments,
        });
      }
    };
    
    // НОВАЯ функция для закрытия модального окна
    const closeModal = () => {
      setImageModalState({ isOpen: false, currentIndex: 0, attachments: [] });
    };
    
    // НОВАЯ функция для перехода к следующему изображению
    const goToNextImage = () => {
      if (imageModalState.attachments.length === 0) return;
      setImageModalState(prev => {
        const nextIndex = (prev.currentIndex + 1) % prev.attachments.length; // Зацикливание
        return { ...prev, currentIndex: nextIndex };
      });
    };
    
    // НОВАЯ функция для перехода к предыдущему изображению
    const goToPrevImage = () => {
      if (imageModalState.attachments.length === 0) return;
      setImageModalState(prev => {
        const prevIndex = (prev.currentIndex - 1 + prev.attachments.length) % prev.attachments.length; // Зацикливание
        return { ...prev, currentIndex: prevIndex };
      });
    };

  // --- НОВАЯ ФУНКЦЯ ДЛЯ ПОЛУЧЕНИЯ РУССКОГО НАЗВАНИЯ СТАТУСА ---
  function getStatusDisplayName(statusKey) {
    return STATUS_TRANSLATIONS[statusKey] || statusKey || "—"; // Возврат "—" если statusKey null/undefined, иначе сам ключ, если перевод не найден
  }

  const REPORT_APPROVAL_TRANSLATIONS = {
    waiting: "Проверяется",
    approved: "Принято",
    rejected: "Отклонено",
  };

  function getReportApprovalDisplayName(approvalKey) {
    return REPORT_APPROVAL_TRANSLATIONS[approvalKey] || approvalKey || "—";
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
      setSearchTerm(company.name); // Отображаем имя компании в инпуте после выбора
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
                onMouseDown={(e) => e.preventDefault()} // Предотвращает потерю фокуса у input
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
                onMouseDown={(e) => e.preventDefault()} // Предотвращает потерю фокуса у input
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
                onMouseDown={(e) => e.preventDefault()} // Предотвращает потерю фокуса у input
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

      // --- ИСПРАВЛЕНАЯ ЛОГИКА ИНИЦИАЛИЗАЦИИ ФОРМЫ ---
      // Если тип "individual", но нет назначенного пользователя, считаем это "broadcast"
      const initialAssignmentType = (data.assignment_type === "individual" && !data.assigned_user_id) ? "broadcast" : data.assignment_type;
      const hasAssignedUser = !!data.assigned_user_id;

      const initialForm = {
        ...t,
        equipment: formEquipment,
        work_types_ids: formWorkTypesIds,
        gos_number: t.gos_number || "",
        contact_person_phone: t.contact_person_phone || null,
        assigned_user_id: hasAssignedUser ? data.assigned_user_id : null,
        assignment_type: hasAssignedUser ? "individual" : "broadcast",
        photo_required: true,
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
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("✅ Изменения сохранены");
      } else {
        alert("✅ Изменения сохранены");
      }
      setEdit(false);
      loadTask();
    } catch (err) {
  console.error(err);
  const errorMsg = err.response?.data?.detail || "Ошибка при сохранении";
  if (window.Telegram?.WebApp) {
    window.Telegram.WebApp.showAlert(errorMsg);
  } else {
    alert(errorMsg);
  }
  }
  }

  // --- НОВАЯ ФУНКЦИЯ ДЛЯ УДАЛЕНИЯ ЗАДАЧИ ---
  async function handleDelete() {
    if (isNaN(taskId)) return;

    // Показываем подтверждение в виде Telegram алерта
    let confirmed;
    if (window.Telegram?.WebApp) {
      // Для Telegram WebApp используем встроенный метод подтверждения
      window.Telegram.WebApp.showConfirm("Вы действительно хотите удалить задачу?", (result) => {
        confirmed = result;
        if (confirmed) {
          performDelete();
        }
      });
    } else {
      // Резервный вариант для обычного браузера
      confirmed = window.confirm("Вы действительно хотите удалить задачу?");
      if (confirmed) {
        performDelete();
      }
    }

    async function performDelete() {
      try {
        await adminDeleteTask(taskId);
        if (window.Telegram?.WebApp) {
          window.Telegram.WebApp.showAlert("✅ Задача удалена");
        } else {
          alert("✅ Задача удалена");
        }
        navigate("/admin/tasks"); // Перенаправляем на список задач после удаления
      } catch (err) {
        console.error("Ошибка при удалении:", err);
        const errorMsg = err.response?.data?.detail || "Не удалось удалить задачу.";
        if (window.Telegram?.WebApp) {
          window.Telegram.WebApp.showAlert(`Ошибка: ${errorMsg}`);
        } else {
          alert(`Ошибка: ${errorMsg}`);
        }
      }
    }
  }

  if (loading) {
    return (
      <div className="logist-main">
        <div className="empty">Загрузка задачи #{taskId}...</div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="logist-main">
        <div className="empty">Задача не найдена</div>
      </div>
    );
  }

  const assignmentTypeOptions = [
    { value: "broadcast", display: "В эфир" },
    { value: "individual", display: "Персональная" }
  ];

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
            <h1 className="page-title">Задача #{task.id}</h1>
          </div>
          {!edit ? (
            <div style={{ display: 'flex', gap: '8px' }}>
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
              {/* Иконка "Редактировать" */}
              <button
                className="icon-button"
                title="История изменений"
                onClick={() => navigate(`/admin/tasks/${task.id}/history`)}
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
                  <path d="M8.515 1.019A7 7 0 0 0 8 1V0a8 8 0 0 1 .589.022zm2.004.45a7 7 0 0 0-.985-.299l.219-.976q.576.129 1.126.342zm1.37.71a7 7 0 0 0-.439-.27l.493-.87a8 8 0 0 1 .979.654l-.615.789a7 7 0 0 0-.418-.302zm1.834 1.79a7 7 0 0 0-.653-.796l.724-.69q.406.429.747.91zm.744 1.352a7 7 0 0 0-.214-.468l.893-.45a8 8 0 0 1 .45 1.088l-.95.313a7 7 0 0 0-.179-.483m.53 2.507a7 7 0 0 0-.1-1.025l.985-.17q.1.58.116 1.17zm-.131 1.538q.05-.254.081-.51l.993.123a8 8 0 0 1-.23 1.155l-.964-.267q.069-.247.12-.501m-.952 2.379q.276-.436.486-.908l.914.405q-.24.54-.555 1.038zm-.964 1.205q.183-.183.35-.378l.758.653a8 8 0 0 1-.401.432z"/>
                  <path d="M8 1a7 7 0 1 0 4.95 11.95l.707.707A8.001 8.001 0 1 1 8 0z"/>
                  <path d="M7.5 3a.5.5 0 0 1 .5.5v5.21l3.248 1.856a.5.5 0 0 1-.496.868l-3.5-2A.5.5 0 0 1 7 9V3.5a.5.5 0 0 1 .5-.5"/>
                </svg>
              </button>

              {/* --- ИКОНКА УДАЛЕНИЯ --- */}
              <button
                className="icon-button"
                title="Удалить задачу"
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
                  <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                  <path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                </svg>
              </button>
              {/* --- КОНЕЦ ИКОНКИ УДАЛЕНИЯ --- */}

            </div>
          ) : (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="gradient-button"
                onClick={saveEdit}
                style={{ width: 'auto' }}
              >
                💾 Сохранить
              </button>
              <button
                type="button"
                className="gradient-button"
                onClick={() => setEdit(false)}
                style={{ width: 'auto', backgroundColor: '#6c757d' }}
              >
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

              {/* ===== ГОС. НОМЕР ===== */}
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

              <label className="dark-label">
                Оборудование
              </label>
              {/* --- Список выбранных элементов (название - поле серийного номера) --- */}
              <div className="equipment-list-container">
                {(form.equipment || []).map((item, index) => {
                  const eq = equipment.find((e) => e.id === item.equipment_id); // <--- Используем equipment из state
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
                availableEquipment={equipment} // <--- Передаём весь список оборудования
                onSelect={addEquipmentItemToForm} // <--- Передаём функцию добавления
                selectedItems={form.equipment} // <--- Передаём уже выбранные элементы (не используется в фильтрации, т.к. разрешено дублирование)
              />

              {/* ===== Виды работ (редактирование с умным поиском) ===== */}
              <label className="dark-label">
                Виды работ
              </label>
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
                    const wt = workTypes.find((w) => w.id === id); // <--- Используем workTypes из state
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
                availableWorkTypes={workTypes} // <--- Передаём весь список видов работ
                onSelect={addWorkTypeItemToForm} // <--- Передаём функцию добавления
                selectedWorkTypeIds={form.work_types_ids} // <--- Передаём уже выбранные ID (не используется в фильтрации, т.к. разрешено дублирование)
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

              {/* ===== НАЗНАЧИТЬ МОНТАЖНИКА (новая логика, условный рендер) ===== */}
              {/* ✅ Поле "Назначить монтажника" отображается только если тип "assigned" */}
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
                    {task.company_name || "—"}
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
                    {task.contact_person_name || "—"}
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
                  <span>Адрес и статус</span>
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
                    {task.location ? (
                      <a href={`https://2gis.ru/search/${encodeURIComponent(task.location)}`} target="_blank" rel="noopener noreferrer">
                        {task.location}
                      </a>
                    ) : "—"}
                  </div>
                </div>
                <div className="task-field">
                  <div className="task-field-label">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 11 12 14 22 4"></polyline>
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                    </svg>
                    Статус:
                  </div>
                  <div className={`task-field-value ${task.status === 'completed' ? 'status-ok' : task.status === 'new' ? 'status-pending' : 'status-error'}`}>
                    {getStatusDisplayName(task.status)}
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
                    {task.scheduled_at ? new Date(task.scheduled_at).toLocaleString() : "—"}
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
      {task.vehicle_info || "—"}
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
      {task.gos_number || "—"}
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
                    {task.client_price || "—"} ₽
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
                    {task.montajnik_reward || "—"} ₽
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
                    {task.equipment && task.equipment.length > 0 ? (
                      <div className="task-equipment-list">
                        {task.equipment.map((e, index) => {
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
                    {task.work_types && task.work_types.length > 0 ? (
                      <div className="task-work-types-list">
                        {task.work_types.map((wt, index) => {
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
                    {task.photo_required ? "Да" : "Нет"}
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
                  {task.assigned_user_name || task.assigned_user_id || "—"}
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
                  {task.comment || "—"}
                </div>
              </div>
            </div>
          )}
          {!edit && (
            <>
              {/* === РАЗДЕЛИТЕЛЬНАЯ ЛИНИЯ === */}
              <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.35)', margin: '16px 0' }}></div>
            <div className="section">
  {/* --- ЗАГОЛОВОК С ИКОНКОЙ --- */}
  <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#4CAF50', fontWeight: 'bold', fontSize: '1.2em', marginBottom: '12px' }}>
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
    Отчёты монтажников
  </h3>
  {(task.reports || []).length ? (
    task.reports.map((r) => {
      // --- Извлечение комментария из текста ---
      let comment = "";
      if (r.text) {
        // Проверяем формат: "Выполнено: [типы работ]\n\n[комментарий]"
        if (r.text.includes("Выполнено:")) {
          const parts = r.text.split("Выполнено:");
          if (parts.length > 1) {
            const afterPerformed = parts[1]; // Все после "Выполнено:"
            
            // Разбиваем по двойному переносу строки (стандартный формат при создании отчета)
            const sections = afterPerformed.split(/\n\s*\n/);
            
            // Если есть вторая секция (после двойного переноса строк), это комментарий
            if (sections.length > 1) {
              comment = sections[1].trim();
            } else {
              // Если нет двойного переноса, значит комментария нет
              comment = "Комментариев нет";
            }
          }
        } else {
          // Если нет "Выполнено:", то весь текст - это комментарий
          comment = r.text.trim();
        }
        
        // Убираем лишние пробелы и очищаем комментарий
        comment = comment.replace(/^\s+|\s+$/g, '');
      }

      // Если комментарий пустой, показываем "Комментариев нет"
      const displayComment = comment ? comment : "Комментариев нет";

      // --- Получение вложений из reportAttachmentsMap ---
      const reportAttachments = reportAttachmentsMap[r.id] || [];
      const reportAttachmentsLoading = !reportAttachmentsMap.hasOwnProperty(r.id);

      // --- Определение цвета для статуса ---
      const statusColors = {
        waiting: '#FFC107',
        approved: '#4CAF50',
        rejected: '#F44336'
      };

      return (
        <div key={r.id} className="report" style={{ padding: '12px', borderRadius: '8px', marginBottom: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
          {/* Номер задачи */}
          <p>
            <b>#{r.id}</b>
          </p>
          
          {/* Комментарий монтажника */}
          <p><b>Комментарий монтажника:</b> {displayComment}</p>
          
          {/* Вложения */}
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
                  <div
                    key={att.id}
                    style={{ cursor: 'zoom-in' }} // Меняем курсор
                     onClick={() => handleImageClick(originalUrl, reportAttachments)}
                  >
                    <img
                      src={thumbUrl}
                      alt={`Report attachment ${idx}`}
                      style={{ maxHeight: 100 }}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <p>Вложений нет</p>
          )}
          <p>
            <b>Логист:</b> <span style={{ color: statusColors[r.approval_logist] || '#e0e0e0', fontWeight: 'bold' }}>{getReportApprovalDisplayName(r.approval_logist) || "—"}</span>
            {task.requires_tech_supp === true && (
              <>
                {" "} | <b>Тех.спец:</b> <span style={{ color: statusColors[r.approval_tech] || '#e0e0e0', fontWeight: 'bold' }}>{getReportApprovalDisplayName(r.approval_tech) || "—"}</span>
              </>
            )}
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
      <ImageModal
      isOpen={imageModalState.isOpen}
      onClose={closeModal}
      attachments={imageModalState.attachments} // Передаем список
      currentIndex={imageModalState.currentIndex} // Передаем индекс
      onPrev={goToPrevImage} // Передаем функцию
      onNext={goToNextImage} // Передаем функцию
    />
    </div>
  );
}