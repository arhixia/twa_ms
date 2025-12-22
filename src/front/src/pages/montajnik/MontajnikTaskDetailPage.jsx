// front/src/pages/montajnik/MontajnikTaskDetailPage.jsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchMontTaskDetail,
  changeTaskStatus,
  createReport,
  submitReportForReview,
  fetchMontajnikReportReviews,
  getEquipmentList,
  getWorkTypes,
  getMontCompaniesList,
  getMontContactPersonsByCompany,
  getMontContactPersonPhone,
  listReportAttachments,
  getAttachmentUrl,
} from "../../api";
import FileUploader from "../../components/FileUploader";
import "../../styles/LogistPage.css";
import ImageModal from "../../components/ImageModal";

// --- Новый компонент: Модальное окно изменения статуса ---
function ChangeStatusModal({ taskId, currentStatus, onClose, onSubmitSuccess, taskWorkTypeIds, allWorkTypes }) {
  const [selectedStatus, setSelectedStatus] = useState("");
  const [changing, setChanging] = useState(false);

  const statusOptions = [
    { value: "on_the_road", label: "🚗 Выехал" },
    { value: "on_site", label: "📍 Прибыл" },
    { value: "started", label: "🔧 Начал выполнение" },
  ];

  const handleSubmit = async () => {
    if (!selectedStatus) {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Пожалуйста, выберите статус.");
      } else {
        alert("Пожалуйста, выберите статус.");
      }
      return;
    }
    if (!window.confirm(`Вы уверены, что хотите изменить статус на '${selectedStatus}'?`)) return;

    setChanging(true);
    try {
      await changeTaskStatus(taskId, selectedStatus);
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Статус обновлён");
      } else {
        alert("Статус обновлён");
      }
      onSubmitSuccess && onSubmitSuccess();
      onClose();
    } catch (err) {
      console.error("Ошибка изменения статуса:", err);
      const errorMessage = err.response?.data?.detail || "Ошибка при смене статуса";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`Ошибка: ${errorMessage}`);
      } else {
        alert(`Ошибка: ${errorMessage}`);
      }
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Изменить статус задачи #{taskId}</h2>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <label className="dark-label">
              Новый статус:
              <select 
                value={selectedStatus} 
                onChange={(e) => setSelectedStatus(e.target.value)} 
                className="dark-select"
              >
                <option value="">-- Выберите статус --</option>
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="modal-actions">
          <button 
            className="gradient-button" 
            onClick={handleSubmit} 
            disabled={changing || !selectedStatus}
          >
            {changing ? 'Изменение...' : 'Изменить'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Новый компонент: Модальное окно создания отчёта ---
function CreateReportModal({ taskId, taskWorkTypes, allWorkTypes, onClose, onSubmitSuccess }) {
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadedAttachments, setUploadedAttachments] = useState([]);

  const handleAttachmentUploaded = (attachmentData) => {
    setUploadedAttachments(prev => [
      ...prev.filter(att => att.id !== attachmentData.tmpId),
      { 
        id: attachmentData.id,
        storage_key: attachmentData.storage_key,
        uploading: false,
        error: null
      }
    ]);
  };

  const handleAttachmentRemoved = (storageKey) => {
    setUploadedAttachments(prev => prev.filter(att => att.storage_key !== storageKey));
  };

  const handleAttachmentUploading = (fileId) => {
    setUploadedAttachments(prev => [
      ...prev.filter(att => att.id !== fileId),
      { id: fileId, uploading: true, error: null }
    ]);
  };

  const handleAttachmentUploadError = (fileId, error) => {
    setUploadedAttachments(prev => [
      ...prev.filter(att => att.id !== fileId),
      { id: fileId, uploading: false, error: error }
    ]);
  };

  const handleSubmit = async () => {
    const pendingUploads = uploadedAttachments.filter(att => att.uploading);
    if (pendingUploads.length > 0) {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`⚠️ Подождите, идёт загрузка ${pendingUploads.length} вложений.`);
      } else {
        alert(`⚠️ Подождите, идёт загрузка ${pendingUploads.length} вложений.`);
      }
      return;
    }

    const failedUploads = uploadedAttachments.filter(att => att.error);
    if (failedUploads.length > 0) {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`❌ Некоторые вложения не были загружены: ${failedUploads.length}.`);
      } else {
        alert(`❌ Некоторые вложения не были загружены: ${failedUploads.length}.`);
      }
      console.error("Failed uploads:", failedUploads);
      return;
    }

    const performedWorksText = taskWorkTypes
      .map(id => allWorkTypes.find(wt => wt.id === id)?.name || `ID ${id}`)
      .join(", ");

    let fullComment = "";
    if (performedWorksText) {
        fullComment += `Выполнено: ${performedWorksText}`;
    }
    if (comment.trim()) {
        fullComment += fullComment ? `\n\n${comment}` : comment;
    }

    if (!fullComment.trim()) {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Добавьте комментарий.");
      } else {
        alert("Добавьте комментарий.");
      }
      return;
    }

    setSubmitting(true);
    try {
      const attachmentKeysToBind = uploadedAttachments.map(att => att.storage_key);
      const createRes = await createReport(taskId, fullComment, attachmentKeysToBind);
      const reportId = createRes.report_id;

      await submitReportForReview(taskId, reportId);

      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Отчёт создан и отправлен на проверку!");
      } else {
        alert("Отчёт создан и отправлен на проверку!");
      }
      onSubmitSuccess && onSubmitSuccess();
      onClose();
    } catch (err) {
      console.error("Ошибка при создании/отправке отчёта:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось создать или отправить отчёт.";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`Ошибка: ${errorMsg}`);
      } else {
        alert(`Ошибка: ${errorMsg}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const pendingUploads = uploadedAttachments.filter(att => att.uploading);
  const hasErrors = uploadedAttachments.some(att => att.error);
  const successfulUploadsCount = uploadedAttachments.filter(att => !att.uploading && !att.error).length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Добавить отчёт по задаче #{taskId}</h2>
          <button className="close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="section">
            <label className="dark-label">
              Комментарий:
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows="3"
              placeholder="Дополнительная информация..."
              className="dark-select"
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          <div className="section">
            <label className="dark-label">Фото:</label>
            <FileUploader 
              onUploaded={handleAttachmentUploaded}
              onUploading={handleAttachmentUploading}
              onUploadError={handleAttachmentUploadError}
              onRemoved={handleAttachmentRemoved}
              taskId={taskId} 
              reportId={null}
            />
            <p style={{ color: 'orange', fontSize: '0.9em', marginTop: '5px', marginBottom: '5px' }}>
              ⚠️Фото будут привязаны к отчёту при его создании.
            </p>
            {pendingUploads.length > 0 && (
              <p style={{ color: 'yellow', fontSize: '0.9em', marginTop: '5px' }}>
                🔄 Загружается вложений: {pendingUploads.length}
              </p>
            )}
            {hasErrors && (
              <p style={{ color: 'red', fontSize: '0.9em', marginTop: '5px' }}>
                ❗ Обнаружены ошибки загрузки.
              </p>
            )}
            {successfulUploadsCount > 0 && (
              <p style={{ color: '#4caf50', fontSize: '0.9em', marginTop: '5px' }}>
                ✅ Загружено вложений: {successfulUploadsCount}
              </p>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button
            className="gradient-button"
            onClick={handleSubmit}
            disabled={submitting || pendingUploads.length > 0 || hasErrors}
          >
            {submitting ? 'Создание...' : 'Создать отчёт'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Основной компонент страницы ---
export default function MontajnikTaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  const [reportReviews, setReportReviews] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [contactPersons, setContactPersons] = useState([]);
  const [contactPersonPhone, setContactPersonPhone] = useState(null);

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [reportAttachmentsMap, setReportAttachmentsMap] = useState({});
  const [openImage, setOpenImage] = useState(null);

  const isReportInReview = (report) => {
    const logistWaiting = report.approval_logist === null || report.approval_logist === 'waiting';
    const techWaiting = report.approval_tech === null || report.approval_tech === 'waiting';
    const logistApproved = report.approval_logist === 'approved';
    const techApproved = report.approval_tech === 'approved';

    if (logistApproved && techApproved) {
      return false;
    }
    if (report.approval_logist === 'rejected' || report.approval_tech === 'rejected') {
      return false;
    }
    return logistWaiting || techWaiting;
  };

  const isReportRejected = (report) => {
    return report.approval_logist === 'rejected' || report.approval_tech === 'rejected';
  };

  useEffect(() => {
    loadRefs();
    loadTask();
    loadReportReviews();
  }, [id]);

  async function loadReportReviews() {
    try {
      const reviews = await fetchMontajnikReportReviews();
      const taskReviews = reviews.filter(review => review.task_id === parseInt(id, 10));
      setReportReviews(taskReviews);
    } catch (err) {
      console.error("Ошибка загрузки отзывов на отчёты:", err);
    }
  }

  async function loadRefs() {
    try {
      const eq = await getEquipmentList();
      const wt = await getWorkTypes();
      const comps = await getMontCompaniesList();
      setEquipment(eq || []);
      setWorkTypes(wt || []);
      setCompanies(comps || []);
    } catch (e) {
      console.error("Ошибка загрузки справочников", e);
    }
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
    assigned: "Назначена",
  };

  function getStatusDisplayName(statusKey) {
    return STATUS_TRANSLATIONS[statusKey] || statusKey || "—";
  }

  const REPORT_APPROVAL_TRANSLATIONS = {
    waiting: "Проверяется",
    approved: "Принято",
    rejected: "Отклонено",
  };

  function getReportApprovalDisplayName(approvalKey) {
    return REPORT_APPROVAL_TRANSLATIONS[approvalKey] || approvalKey || "—";
  }

  async function loadTask() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMontTaskDetail(id);

      const t = {
        ...data,
        equipment: data.equipment || [],
        work_types: data.work_types || [],
        history: data.history || [],
        reports: data.reports || [],
        attachments: data.attachments || [],
      };

      t.equipment_ids = t.equipment.map((e) => e.equipment_id);
      t.work_types_ids = t.work_types.map(wt => wt.work_type_id);

      setTask(t);
      setAttachments(t.attachments || []);

      if (data.contact_person_id) {
         try {
            const { phone } = await getMontContactPersonPhone(data.contact_person_id);
            setContactPersonPhone(phone);
         } catch (err) {
            console.error("Ошибка загрузки телефона контактного лица:", err);
            setContactPersonPhone(null);
         }
      } else {
        setContactPersonPhone(null);
      }

    } catch (err) {
      console.error("Ошибка загрузки задачи:", err);
      setError(err.response?.data?.detail || err.message || "Ошибка загрузки задачи");
      if (err.response?.status === 403 || err.response?.status === 404) {
        navigate("/montajnik/tasks/mine");
      }
    } finally {
      setLoading(false);
    }
  }

  const handleImageClick = (imageUrl) => {
    setOpenImage(imageUrl);
  };

  const closeModal = () => {
    setOpenImage(null);
  };

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

  useEffect(() => {
    if (task && task.reports) {
      task.reports.forEach(r => {
        loadReportAttachments(r.id);
      });
    }
  }, [task]);

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

  const showAddReportButton = task.status !== "completed" && (() => {
    const hasReportInReview = task.reports && task.reports.some(r => isReportInReview(r));
    const hasRejectedReport = task.reports && task.reports.some(r => isReportRejected(r));
    return !hasReportInReview;
  })();

  const taskWorkTypeIds = (task?.work_types || []).map(wt => wt.work_type_id);

  return (
    <div className="logist-main">
      <div className="page">
        {/* Заголовок с ID задачи слева и кнопкой Назад справа */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h1 className="page-title">Задача #{task.id}</h1>
          <button 
            onClick={() => navigate(-1)} 
            style={{ 
              background: 'linear-gradient(to right, #10b981, #2563eb)', 
              color: 'white', 
              border: 'none', 
              borderRadius: '6px', 
              padding: '8px 16px', 
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            ← Назад
          </button>
        </div>

        {/* Кнопки действия под заголовком */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {showAddReportButton && (
            <button 
              className="gradient-button" 
              onClick={() => setShowReportModal(true)}
              style={{ flex: '0 0 auto', minWidth: '150px' }}
            >
              📝 Добавить отчет
            </button>
          )}
          
          {(() => {
            const statusFlow = {
              accepted: { next: "on_the_road", label: "🚗 Выехал" },
              on_the_road: { next: "on_site", label: "📍 На месте" },
              on_site: { next: "started", label: "🔧 Начал выполнение" },
            };
            const current = task.status;
            const nextAction = statusFlow[current];

            if (!nextAction) return null;

            const handleStatusChange = async () => {
              if (!window.confirm(`Подтвердить действие: "${nextAction.label}"?`)) return;
              try {
                await changeTaskStatus(task.id, nextAction.next);
                if (window.Telegram?.WebApp) {
                  window.Telegram.WebApp.showAlert(`Статус изменён`);
                } else {
                  alert(`Статус изменён`);
                }
                await loadTask();
              } catch (err) {
                console.error(err);
                const errorMsg = err.response?.data?.detail || "Ошибка при смене статуса";
                if (window.Telegram?.WebApp) {
                  window.Telegram.WebApp.showAlert(`Ошибка: ${errorMsg}`);
                } else {
                  alert(`Ошибка: ${errorMsg}`);
                }
              }
            };

            return (
              <button 
                className="gradient-button" 
                onClick={handleStatusChange}
                style={{ flex: '0 0 auto', minWidth: '150px' }}
              >
                {nextAction.label}
              </button>
            );
          })()}
        </div>

        <div className="task-detail">
          <div className="task-view">
            <p><b>Компания:</b> {task.company_name || "—"}</p>
            <p><b>Контактное лицо:</b> {task.contact_person_name || "—"}{task.contact_person_position ? ` - ${task.contact_person_position}` : ""}</p>
            <p>
              <b>Телефон контактного лица:</b>{" "}
              {contactPersonPhone || task.contact_person_phone || "—"}
              {(contactPersonPhone || task.contact_person_phone) && (
                <button
                  onClick={() => {
                    const phone = contactPersonPhone || task.contact_person_phone;
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

            <p><b>ТС:</b> {task.vehicle_info || "—"}</p>
            <p><b>Гос. номер:</b> {task.gos_number || "—"}</p>
            <p><b>Дата:</b> {task.scheduled_at ? new Date(task.scheduled_at).toLocaleString() : "—"}</p>
            <p><b>Статус:</b> {getStatusDisplayName(task.status)}</p>
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
            
            <p>
              <b>Оборудование:</b>{" "}
              {(task.equipment || [])
                .map((e) => {
                  const eqName = equipment.find((eq) => eq.id === e.equipment_id)?.name;
                  return `${eqName || e.equipment_id}${e.serial_number ? ` (СН: ${e.serial_number})` : ''} x${e.quantity}`;
                })
                .join(", ") || "—"}
            </p>

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
            <p><b>Фото обязательно:</b> {task.photo_required ? "Да" : "Нет"}</p>

            <div className="section">
              <h3>История</h3>
              <button className="gradient-button" onClick={() => navigate(`/montajnik/tasks/${id}/history`)}>
                Подробнее
              </button>
            </div>

            <div className="section">
  <h3 style={{ color: '#10b981' }}>Ответы на отчеты</h3>
  {reportReviews.length > 0 ? (
    (() => {
      const groupedReviews = reportReviews.reduce((acc, review) => {
        if (!acc[review.report_id]) {
          acc[review.report_id] = {};
        }
        acc[review.report_id][review.reviewer_role] = review;
        return acc;
      }, {});

      const sortedReportIds = Object.keys(groupedReviews).sort((a, b) => parseInt(a) - parseInt(b));

      return sortedReportIds.map((reportId, reportIndex) => {
        const reportGroup = groupedReviews[reportId];
        const logistReview = reportGroup.logist;
        const techReview = reportGroup.tech_supp;

        const showDivider = reportIndex > 0;

        return (
          <React.Fragment key={reportId}>
            {showDivider && <hr style={{ borderTop: '1px dashed #555', margin: '16px 0' }} />}
            
            <div className="report-review-group">
    
              <p><b>Отчёт #{reportId} </b></p>

              <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexDirection: 'column' }}>
                
                <div className="reviewer-response" style={{ border: '1px solid #444', borderRadius: '4px', padding: '8px', backgroundColor: '#1a1a1a' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '1em', color: '#e0e0e0' }}>Логист</h4>
                  {logistReview ? (
                    <>
                      <p style={{ margin: '4px 0', fontSize: '0.9em', color: '#888' }}>
                        <b>Время ответа:</b> {new Date(logistReview.reviewed_at_logist).toLocaleString()}
                      </p>
                      <p style={{ margin: '4px 0' }}>
                        <b>Статус:</b> <span style={{ color: logistReview.approval_status === "approved" ? "green" : logistReview.approval_status === "rejected" ? "red" : "orange" }}>
                          {getReportApprovalDisplayName(logistReview.approval_status)}
                        </span>
                      </p>
                      {logistReview.review_comment && (
                        <p style={{ margin: '4px 0' }}><b>Комментарий:</b> <span style={{ color: "white" }}>{logistReview.review_comment}</span></p>
                      )}
                    </>
                  ) : (
                    <p style={{ margin: '4px 0', fontStyle: 'italic', color: '#888' }}>Ответ отсутствует</p>
                  )}
                </div>

                <div className="reviewer-response" style={{ border: '1px solid #444', borderRadius: '4px', padding: '8px', backgroundColor: '#1a1a1a' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '1em', color: '#e0e0e0' }}>Тех.спец</h4>
                  {techReview ? (
                    <>
                      <p style={{ margin: '4px 0', fontSize: '0.9em', color: '#888' }}>
                        <b>Время ответа:</b> {new Date(techReview.reviewed_at_tech_supp).toLocaleString()}
                      </p>
                      <p style={{ margin: '4px 0' }}>
                        <b>Статус:</b> <span style={{ color: techReview.approval_status === "approved" ? "green" : techReview.approval_status === "rejected" ? "red" : "orange" }}>
                          {getReportApprovalDisplayName(techReview.approval_status)}
                        </span>
                      </p>
                    </>
                  ) : (
                    <p style={{ margin: '4px 0', fontStyle: 'italic', color: '#888' }}>Ответ отсутствует</p>
                  )}
                </div>

              </div>
            </div>
          </React.Fragment>
        );
      });
    })()
  ) : (
    <div className="empty">Ответов на отчёты пока нет</div>
  )}
</div>

            <div className="section">
  <h3 style={{ color: '#10b981' }}>Отчеты</h3>
  {(task.reports && task.reports.length > 0) ? (
    task.reports.map(r => {
      const reportAttachments = reportAttachmentsMap[r.id] || [];
      const reportAttachmentsLoading = !reportAttachmentsMap.hasOwnProperty(r.id);

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

      return (
        <div key={r.id} className="report">
          <p>
            <b>#{r.id}:</b> {performedWorks ? `Выполнено: ${performedWorks}` : "Нет выполненных работ"}
          </p>
          
          {comment && (
            <p>{comment}</p>
          )}
          
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
                                style={{ cursor: 'zoom-in' }}
                                onClick={() => handleImageClick(originalUrl)}
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
        <b>Логист:</b> {getReportApprovalDisplayName(r.approval_logist) || "—"}
        {task.requires_tech_supp === true && (
          <>
            {" "} | <b>Тех.спец:</b> {getReportApprovalDisplayName(r.approval_tech) || "—"}
          </>
        )}
      </p>
          
          {r.review_comment && (
            <p><b>Комментарий отклонения:</b> <span style={{ color: "red" }}>{r.review_comment}</span></p>
          )}
        </div>
      );
    })
  ) : (
    <div className="empty">Отчётов пока нет</div>
  )}

              {!showAddReportButton && task.status !== "completed" && (() => {
                const reportInReview = task.reports && task.reports.find(r => isReportInReview(r));
                if (reportInReview) {
                  return <p style={{ color: '#b8c61dff' }}>Отчёт #{reportInReview.id} находится на проверке.</p>;
                }
                return null;
              })()}

</div>

          </div>
        </div>
      </div>

  <ImageModal
        isOpen={!!openImage}
        onClose={closeModal}
        imageUrl={openImage}
        altText="Вложение отчёта"
      />

      {showStatusModal && (
        <ChangeStatusModal
          taskId={parseInt(id, 10)}
          currentStatus={task.status}
          onClose={() => setShowStatusModal(false)}
          onSubmitSuccess={loadTask}
          taskWorkTypeIds={taskWorkTypeIds}
          allWorkTypes={workTypes} 
        />
      )}

      {showReportModal && (
        <CreateReportModal
          taskId={parseInt(id, 10)}
          taskWorkTypes={taskWorkTypeIds}
          allWorkTypes={workTypes}
          onClose={() => setShowReportModal(false)}
          onSubmitSuccess={loadTask}
        />
      )}

    </div>
  );
}