// front/src/pages/montajnik/MontajnikTaskDetailPage.jsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
// Убираем acceptTask, так как задача уже принята
// Добавляем reviewReport для новой логики ревью
import {
  fetchMontTaskDetail,
  changeTaskStatus,
  createReport,
  submitReportForReview,
  fetchMontajnikReportReviews, // Добавить импорт
  getEquipmentList,
  getWorkTypes,
  // ✅ Импортируем функции для получения данных о компаниях и контактных лицах и телефона
  getMontCompaniesList,
  getMontContactPersonsByCompany,
  getMontContactPersonPhone,
  rejectTask,
} from "../../api";
import FileUploader from "../../components/FileUploader";
import "../../styles/LogistPage.css";

// --- Новый компонент: Модальное окно изменения статуса ---
function ChangeStatusModal({ taskId, currentStatus, onClose, onSubmitSuccess, taskWorkTypeIds, allWorkTypes }) {
  const [selectedStatus, setSelectedStatus] = useState("");
  const [changing, setChanging] = useState(false);
  

  // Ограниченный список статусов
  const statusOptions = [
    // { value: "accepted", label: "✅ Принять" }, // Принимается через отдельный эндпоинт /accept
    { value: "on_the_road", label: "🚗 Выехал" },
    { value: "on_site", label: "📍 Прибыл" },
    { value: "started", label: "🔧 Начал выполнение" },
    // { value: "completed", label: "✅ Завершить" }, // Завершается через отдельный UI или кнопку "Добавить отчет" -> "Отправить на проверку"
  ];

  const handleSubmit = async () => {
    if (!selectedStatus) {
      alert("Пожалуйста, выберите статус.");
      return;
    }
    if (!window.confirm(`Вы уверены, что хотите изменить статус на '${selectedStatus}'?`)) return;

    setChanging(true);
    try {
      // ✅ ИСПРАВЛЕНО: Передаём только строку статуса
      await changeTaskStatus(taskId, selectedStatus);
      alert("Статус обновлён");
      onSubmitSuccess && onSubmitSuccess();
      onClose();
    } catch (err) {
      console.error("Ошибка изменения статуса:", err);
      const errorMessage = err.response?.data?.detail || "Ошибка при смене статуса";
      alert(`Ошибка: ${errorMessage}`);
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>Изменить статус задачи #{taskId}</h2>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <label style={{ color: 'white' }}> {/* Белый текст на черном фоне */}
              Новый статус:
              <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)} style={{ backgroundColor: '#1a1a1a', color: 'white' }}>
                <option value="" style={{ backgroundColor: '#1a1a1a', color: 'white' }}>-- Выберите статус --</option>
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value} style={{ backgroundColor: '#1a1a1a', color: 'white' }}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="modal-actions">
          <button className="primary" onClick={handleSubmit} disabled={changing || !selectedStatus}>
            {changing ? 'Изменение...' : 'Изменить'}
          </button>
          <button onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

// --- Новый компонент: Модальное окно создания отчёта ---
function CreateReportModal({ taskId, taskWorkTypes, allWorkTypes, onClose, onSubmitSuccess }) {
  // taskWorkTypes - это массив ID, назначенных задаче (например, [3])
  // allWorkTypes - это полный список WorkType из справочника (например, [{id: 1, name: "A"}, {id: 2, name: "B"}, ...])
  const [selectedWorkTypes, setSelectedWorkTypes] = useState([]); // Массив ID выбранных для отчёта
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState([]); // Массив объектов файлов/ключей
  const [submitting, setSubmitting] = useState(false);
useEffect(() => {
  setSelectedWorkTypes(taskWorkTypes);
}, [taskWorkTypes]);

  
  const handleWorkTypeChange = (wtId) => {
    setSelectedWorkTypes(prev =>
      prev.includes(wtId)
        ? prev.filter(id => id !== wtId)
        : [...prev, wtId]
    );
  };

  const handlePhotoUpload = (file) => {
    setPhotos(prev => [...prev, file]);
  };

  const handleRemovePhoto = (indexToRemove) => {
    setPhotos(prev => prev.filter((_, index) => index !== indexToRemove));
  };

  const handleSubmit = async () => {
    // Формируем текст отчёта только из выбранных работ
    const performedWorksText = selectedWorkTypes
      .map(id => allWorkTypes.find(wt => wt.id === id)?.name || `ID ${id}`)
      .join(", ");

    // Комбинируем выполненные работы и комментарий
    let fullComment = "";
    if (performedWorksText) {
        fullComment += `Выполнено: ${performedWorksText}`;
    }
    if (comment.trim()) {
        fullComment += fullComment ? `\n\n${comment}` : comment; // Добавляем пустую строку между "Выполнено" и комментарием
    }


    if (!fullComment.trim() && photos.length === 0) {
      alert("Добавьте выполненные работы, комментарий или фото.");
      return;
    }

    setSubmitting(true);
    try {
      const photoKeys = photos.map(p => p.storage_key).filter(sk => sk);

      const createRes = await createReport(taskId, fullComment, photoKeys);
      const reportId = createRes.report_id;

      await submitReportForReview(taskId, reportId);

      alert("Отчёт создан и отправлен на проверку!");
      onSubmitSuccess && onSubmitSuccess();
      onClose();
    } catch (err) {
      console.error("Ошибка при создании/отправке отчёта:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось создать или отправить отчёт.";
      alert(`Ошибка: ${errorMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  // Фильтруем allWorkTypes, оставляя только те, чей id есть в taskWorkTypes (массиве ID)
  const relevantWorkTypes = allWorkTypes.filter(wt => taskWorkTypes.includes(wt.id));

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: '700px' }}>
        <div className="modal-header">
          <h2>Добавить отчёт по задаче #{taskId}</h2>
          <button className="close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Выбор выполненных работ (только из назначенных задаче) */}
          <div className="section">
            <h3 style={{ color: 'white' }}> {/* Белый текст на черном фоне */}
              Выполненные работы:
            </h3>
            <div style={{ maxHeight: '150px', overflowY: 'auto', border: '1px solid #ccc', padding: '5px', borderRadius: '4px', backgroundColor: '#1a1a1a' }}>
              {relevantWorkTypes.length > 0 ? (
                relevantWorkTypes.map(wt => (
                  <div key={wt.id} style={{ marginBottom: '5px', color: 'white' }}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedWorkTypes.includes(wt.id)}
                        onChange={() => handleWorkTypeChange(wt.id)}
                        style={{ marginRight: '5px' }}
                      />
                      {wt.name}
                    </label>
                  </div>
                ))
              ) : (
                <p style={{ color: 'white' }}>Нет назначенных видов работ для этой задачи.</p>
              )}
            </div>
          </div>

          {/* Комментарий */}
          <div className="section">
            <label style={{ color: 'white' }}> {/* Белый текст на черном фоне */}
              Комментарий:
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows="4"
                placeholder="Дополнительная информация..."
                style={{ backgroundColor: '#1a1a1a', color: 'white', border: '1px solid #555' }} // Стили для textarea
              />
            </label>
          </div>

          {/* Фото */}
          <div className="section">
            <label style={{ color: 'white' }}>Фото:</label>
            <FileUploader onUploaded={handlePhotoUpload} />
            <div className="attached-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
              {photos.map((photo, index) => (
                <div key={index} style={{ position: 'relative', display: 'inline-block' }}>
                  <img
                    src={photo.preview || `${import.meta.env.VITE_API_URL}/attachments/${photo.storage_key}`}
                    alt={`Preview ${index}`}
                    style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '4px' }}
                  />
                  <button
                    onClick={() => handleRemovePhoto(index)}
                    style={{
                      position: 'absolute',
                      top: '-5px',
                      right: '-5px',
                      background: 'red',
                      color: 'white',
                      border: 'none',
                      borderRadius: '50%',
                      width: '20px',
                      height: '20px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>
        <div className="modal-actions">
          <button className="primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Отправка...' : 'Отправить на проверку'}
          </button>
          <button onClick={onClose}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

// --- Основной компонент страницы ---
export default function MontajnikTaskDetailPage() {
  const { id } = useParams(); // ID задачи из URL
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [workTypes, setWorkTypes] = useState([]); // Все WorkTypes
  const [reportReviews, setReportReviews] = useState([]); // Добавить состояние
  // ✅ Новые состояния для компаний и контактных лиц (для справочника, если понадобится)
  const [companies, setCompanies] = useState([]);
  const [contactPersons, setContactPersons] = useState([]);
  // ✅ Состояние для хранения телефона контактного лица
  const [contactPersonPhone, setContactPersonPhone] = useState(null); // <--- Добавлено

  // --- Состояния для модальных окон ---
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectComment, setRejectComment] = useState("");


  useEffect(() => {
    loadRefs();
    loadTask();
    loadReportReviews(); // Вызвать новую функцию
  }, [id]);

  // Новая функция для загрузки отзывов
  async function loadReportReviews() {
    try {
      const reviews = await fetchMontajnikReportReviews();
      // Фильтруем отзывы, относящиеся к текущей задаче
      const taskReviews = reviews.filter(review => review.task_id === parseInt(id, 10));
      setReportReviews(taskReviews);
    } catch (err) {
      console.error("Ошибка загрузки отзывов на отчёты:", err);
      // alert("Ошибка загрузки отзывов на отчёты");
      // Не критично, можно не показывать алерт
    }
  }

  async function loadRefs() {
    try {
      const eq = await getEquipmentList();
      const wt = await getWorkTypes(); // Загружаем ВСЕ WorkTypes
      // ✅ Загружаем компании для монтажника
      const comps = await getMontCompaniesList();
      setEquipment(eq || []);
      setWorkTypes(wt || []);
      setCompanies(comps || []); // ✅ Сохраняем компании
    } catch (e) {
      console.error("Ошибка загрузки справочников", e);
    }
  }

  async function loadTask() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMontTaskDetail(id);

      // безопасная инициализация полей
      const t = {
        ...data,
        equipment: data.equipment || [],
        work_types: data.work_types || [],
        history: data.history || [],
        reports: data.reports || [],
        attachments: data.attachments || [],
      };

      // Извлекаем ID для редактирования, как в TaskDetailPage
      t.equipment_ids = t.equipment.map((e) => e.equipment_id);
      // t.work_types_ids = t.work_types; // <-- НЕПРАВИЛЬНО
      t.work_types_ids = t.work_types.map(wt => wt.work_type_id); // <-- ПРАВИЛЬНО: извлекаем work_type_id

      setTask(t);
      // При загрузке задачи, устанавливаем form в состояние задачи (включая *_ids)
      // setForm(t); // Убираем, так как у монтажника нет редактирования задачи

      // ✅ Загружаем телефон контактного лица, если contact_person_id есть в данных задачи
      if (data.contact_person_id) {
         try {
            const { phone } = await getMontContactPersonPhone(data.contact_person_id); // <--- Вызываем эндпоинт
            setContactPersonPhone(phone); // <--- Устанавливаем телефон
         } catch (err) {
            console.error("Ошибка загрузки телефона контактного лица:", err);
            setContactPersonPhone(null); // <--- Сброс при ошибке
         }
      } else {
        setContactPersonPhone(null); // <--- Сброс если contact_person_id нет
      }

    } catch (err) {
      console.error("Ошибка загрузки задачи:", err);
      setError(err.response?.data?.detail || err.message || "Ошибка загрузки задачи");
      if (err.response?.status === 403 || err.response?.status === 404) {
        // Перенаправляем на "Мои задачи" если доступа нет или задача не найдена
        // (возможно, задача была завершена или отозвана)
        navigate("/montajnik/tasks/mine");
      }
    } finally {
      setLoading(false);
    }
  }


  

  if (loading)
    return (
      <div className="logist-main">
        <div className="empty">
          Загрузка задачи #{id}...
        </div>
      </div>
    );
  if (error)
    return (
      <div className="logist-main">
        <div className="error">
          {error}
        </div>
      </div>
    );
  if (!task)
    return (
      <div className="logist-main">
        <div className="empty">
          Задача не найдена
        </div>
      </div>
    );

  // Получаем ID назначенных работ для задачи
  // const taskWorkTypeIds = (task.work_types || []).map(wt => wt); // <-- НЕПРАВИЛЬНО: извлекает объекты
  const taskWorkTypeIds = (task?.work_types || []).map(wt => wt.work_type_id); // <-- ПРАВИЛЬНО: извлекает work_type_id

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1>Задача #{task.id}</h1>
        </div>

        <div className="task-detail">
          <div className="task-view">


            {/* ✅ Добавляем строки с компанией и контактным лицом */}
            <p><b>Компания:</b> {task.company_name || "—"}</p>
            <p><b>Контактное лицо:</b> {task.contact_person_name || "—"}</p>
            {/* ===== НОВОЕ ПОЛЕ: ТЕЛЕФОН КОНТАКТНОГО ЛИЦА ===== */}
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
            <p><b>Награда за работу:</b> {task.montajnik_reward || "—"}</p>
            
            {/* === Оборудование === */}
            <p>
              <b>Оборудование:</b>{" "}
              {(task.equipment || [])
                .map((e) => {
                  const eqName = equipment.find((eq) => eq.id === e.equipment_id)?.name;
                  // ✅ Отображаем serial_number и quantity
                  return `${eqName || e.equipment_id}${e.serial_number ? ` (SN: ${e.serial_number})` : ''} x${e.quantity}`;
                })
                .join(", ") || "—"}
            </p>

            <p>
                <b>Виды работ:</b>{" "}
                {task.work_types && task.work_types.length > 0 ? (
                  task.work_types.map(wt => {
                    const wtObj = workTypes.find(w => w.id === wt.work_type_id);
                    const name = wtObj?.name || wt.work_type_id;
                    const count = wt.quantity || 1; // Берём quantity из объекта
                    return `${name} (x${count})`;
                  }).join(", ")
                ) : "—"}
              </p>
            <p><b>Фото обязательно:</b> {task.photo_required ? "Да" : "Нет"}</p>

        

            {/* История */}
            <div className="section">
              <h3>История</h3>
              <button className="add-btn" onClick={() => navigate(`/montajnik/tasks/${id}/history`)}>
                Подробнее
              </button>
            </div>

            {/* --- НОВАЯ СЕКЦИЯ: Отзывы на отчёты по этой задаче --- */}
            <div className="section">
              <h3>Ответы на отчёты</h3>
              {reportReviews.length > 0 ? (
                reportReviews.map((review, index) => (
                  <div key={`${review.report_id}-${review.reviewer_role}-${index}`} className="report-review">
                    <p><b>Отчёт #{review.report_id} (от {new Date(review.reviewed_at || review.created_at).toLocaleString()})</b></p>
                    <p><b>Проверяющий:</b> {review.reviewer_role === 'logist' ? 'Логист' : 'Тех.спец'}</p>
                    <p><b>Статус:</b> <span style={{ color: review.approval_status === "approved" ? "green" : review.approval_status === "rejected" ? "red" : "orange" }}>
                      {review.approval_status}
                    </span></p>
                    {review.review_comment && (
                      <p><b>Комментарий:</b> <span style={{ color: "white" }}>{review.review_comment}</span></p>
                    )}
                    {review.review_photos && review.review_photos.length > 0 && (
                      <div className="attached-list">
                        <p><b>Фото от проверяющего:</b></p>
                        {review.review_photos.map((photoUrl, idx) => (
                          <a key={idx} href={photoUrl} target="_blank" rel="noopener noreferrer">
                            <img src={photoUrl} alt={`Review photo ${idx}`} style={{ maxHeight: 100 }} />
                          </a>
                        ))}
                      </div>
                    )}
                    <details>
                      <summary>Оригинальный отчёт</summary>
                      <p>{review.original_report_text || "—"}</p>
                      {review.original_report_photos && review.original_report_photos.length > 0 && (
                        <div className="attached-list">
                          {review.original_report_photos.map((photoUrl, idx) => (
                            <a key={idx} href={photoUrl} target="_blank" rel="noopener noreferrer">
                              <img src={photoUrl} alt={`Original report photo ${idx}`} style={{ maxHeight: 100 }} />
                            </a>
                          ))}
                        </div>
                      )}
                    </details>
                  </div>
                ))
              ) : (
                <div className="empty">Ответов на отчёты пока нет</div>
              )}
            </div>
            {/* --- КОНЕЦ НОВОЙ СЕКЦИИ --- */}

            {/* Отчёты */}
            <div className="section">
              <h3>Отчёты</h3>
              {(task.reports && task.reports.length > 0) ? (
                task.reports.map(r => (
                  <div key={r.id} className="report">
                    <p>#{r.id}: {r.text || "—"}</p>
                    {/* Отображаем статусы approval_logist и approval_tech */}
                    <p>
                      <b>Логист:</b> <span style={{ color: r.approval_logist === "approved" ? "green" : r.approval_logist === "rejected" ? "red" : "orange" }}>
                        {r.approval_logist || "—"}
                      </span> | 
                      {task.requires_tech_supp === true && (
  <>
    {" "} | 
    <b>Тех.спец:</b>{" "}
    <span style={{
      color: r.approval_tech === "approved"
        ? "green"
        : r.approval_tech === "rejected"
        ? "red"
        : "orange"
    }}>
      {r.approval_tech || "waiting"}
    </span>
  </>
)}

                    </p>
                    {/* Отображаем комментарий отклонения, если есть */}
                    {r.review_comment && (
                      <p><b>Комментарий отклонения:</b> <span style={{ color: "red" }}>{r.review_comment}</span></p>
                    )}
                    {r.photos && r.photos.length > 0 && (
                      <div className="attached-list">
                        {r.photos.map((photoUrl, idx) => (
                          <a key={idx} href={photoUrl} target="_blank" rel="noopener noreferrer">
                            <img src={photoUrl} alt={`Report photo ${idx}`} style={{ maxHeight: 100 }} />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="empty">Отчётов пока нет</div>
              )}

              {/* Форма создания нового отчёта */}
              <div className="report-form">
                {task.status !== "completed" && (
                    <div className="report-form">
                      <h4>Создать новый отчёт</h4>
                      <button className="add-btn" onClick={() => setShowReportModal(true)}>
                        📝 Добавить отчёт
                      </button>
                    </div>
                  )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Кнопки действий перемещены сюда */}
      <div className="section" style={{ marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
  {(() => {
    const statusFlow = {
      accepted: { next: "on_the_road", label: "🚗 Выехал" },
      on_the_road: { next: "on_site", label: "📍 На месте" },
      on_site: { next: "started", label: "🔧 Начал выполнение" },
    };
    const current = task.status;
    const nextAction = statusFlow[current];

    if (!nextAction) return null; // если нет следующего статуса — не показываем кнопку

    const handleStatusChange = async () => {
      if (!window.confirm(`Подтвердить действие: "${nextAction.label}"?`)) return;
      try {
        await changeTaskStatus(task.id, nextAction.next);
        alert(`Статус изменён на ${nextAction.next}`);
        await loadTask();
      } catch (err) {
        console.error(err);
        alert(err.response?.data?.detail || "Ошибка при смене статуса");
      }
    };

    return (
      <button className="primary" onClick={handleStatusChange}>
        {nextAction.label}
      </button>
    );
  })()}
</div>

{["accepted", "on_the_road", "on_site"].includes(task.status) && (
  <button
    className="danger-btn"
    onClick={() => setShowRejectModal(true)}
    style={{ background: "#b60205", color: "white" }}
  >
    Отклонить
  </button>
)}



      

      {/* Модальное окно изменения статуса */}
      {showStatusModal && (
        <ChangeStatusModal
          taskId={parseInt(id, 10)}
          currentStatus={task.status}
          onClose={() => setShowStatusModal(false)}
          onSubmitSuccess={loadTask}
          taskWorkTypeIds={taskWorkTypeIds}
          allWorkTypes={workTypes} // Передаем все WorkTypes для фильтрации внутри модалки, если нужно
        />
      )}

      {/* Модальное окно создания отчёта */}
      {showReportModal && (
        <CreateReportModal
          taskId={parseInt(id, 10)}
          taskWorkTypes={taskWorkTypeIds} // Передаем ID назначенных работ
          allWorkTypes={workTypes}       // Передаем полный список WorkTypes
          onClose={() => setShowReportModal(false)}
          onSubmitSuccess={loadTask}
        />
      )}

      {showRejectModal && (
  <div className="modal-backdrop">
    <div className="modal" style={{ maxWidth: "500px" }}>
      <div className="modal-header">
        <h3>Отклонить задачу #{task.id}</h3>
        <button className="close" onClick={() => setShowRejectModal(false)}>×</button>
      </div>

      <div className="modal-body">
        <label style={{ color: "white" }}>
          Причина отклонения (необязательно):
          <textarea
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            placeholder="Можно оставить пустым..."
            style={{
              width: "100%",
              minHeight: "80px",
              backgroundColor: "#1a1a1a",
              color: "white",
              border: "1px solid #30363d",
              borderRadius: "8px",
              padding: "8px",
            }}
          />
        </label>
      </div>

      <div className="modal-actions">
        <button
          className="primary"
          onClick={async () => {
            try {
              await rejectTask(task.id, rejectComment || null);
              alert("Задача отклонена. Возврат в эфир.");
              setShowRejectModal(false);
              setRejectComment("");
              await loadTask();
            } catch (err) {
              console.error(err);
              alert("Ошибка при отклонении задачи");
            }
          }}
          style={{ background: "#b60205", color: "white" }}
        >
          Подтвердить
        </button>

        <button onClick={() => setShowRejectModal(false)}>Отмена</button>
      </div>
    </div>
  </div>
)}




    </div>
  );
}


//фронт доделать