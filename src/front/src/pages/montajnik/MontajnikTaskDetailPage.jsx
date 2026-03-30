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
  deletePendingAttachment
} from "../../api";
import FileUploader from "../../components/FileUploader";
import "../../styles/LogistPage.css";
import ImageModal from "../../components/ImageModal";
import LazyImage from "../../components/LazyImage";
import { showAlert,showConfirm } from "../../utils/notify";

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
      showAlert("Пожалуйста, выберите статус.");
      return;
    }
    const confirmed = await showConfirm(`Вы уверены, что хотите изменить статус на '${selectedStatus}'?`);
    if (!confirmed) return;

    setChanging(true);
    try {
      await changeTaskStatus(taskId, selectedStatus);
      showAlert("✅ Статус обновлён!");
      onSubmitSuccess && onSubmitSuccess();
      onClose();
    } catch (err) {
      console.error("Ошибка изменения статуса:", err);
      const errorMessage = err.response?.data?.detail || "Ошибка при смене статуса";
      showAlert(`Ошибка: ${errorMessage}`);
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

function CreateReportModal({ taskId, taskWorkTypes, allWorkTypes, onClose, onSubmitSuccess }) {
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadedAttachments, setUploadedAttachments] = useState([]);

  // Функция для очистки вложений
  const cleanupAttachments = async () => {
    const attachmentsToDelete = uploadedAttachments.filter(att => !att.uploading && !att.error);
    if (attachmentsToDelete.length > 0) {
      console.log(`[CLEANUP] Attempting to delete ${attachmentsToDelete.length} attachments on modal close.`);
      // ИСПРАВЛЕНО: используем for...of вместо forEach для корректной обработки async/await
      for (const attachment of attachmentsToDelete) {
        try {
          console.log(`[CLEANUP] Deleting attachment: ${attachment.storage_key}`);
          // ИСПРАВЛЕНО: используем напрямую импортированную функцию deletePendingAttachment
          // Убедитесь, что вы импортировали её в этом файле (в том же файле, где CreateReportModal)
          // import { deletePendingAttachment } from "../api"; // или путь к api файлу
          await deletePendingAttachment(attachment.storage_key);
          console.log(`[CLEANUP] Successfully deleted attachment: ${attachment.storage_key}`);
        } catch (err) {
          console.error(`[CLEANUP] Failed to delete attachment: ${attachment.storage_key}`, err);
          // В реальном приложении можно добавить уведомление пользователю об ошибке удаления
          // Но мы всё равно продолжим процесс закрытия
        }
      }
      // Очищаем состояние после попытки удаления
      setUploadedAttachments([]);
      console.log('[CLEANUP] State cleared after deletion attempts.');
    } else {
      console.log('[CLEANUP] No attachments to delete.');
    }
  };

  // Функция для безопасного закрытия с очисткой
  const safeClose = async () => {
    await cleanupAttachments(); // Ждем завершения очистки
    onClose(); // Теперь закрываем модальное окно
  };

  // Измененный handleClose: проверяем наличие вложений и спрашиваем подтверждение
  const handleClose = async () => {
    const completedUploads = uploadedAttachments.filter(att => !att.uploading && !att.error);
    if (completedUploads.length > 0) {
      const confirmMessage = `⚠️ У вас есть ${completedUploads.length} загруженных фото. Закрыть без создания отчета?`;
      const confirmed = window.confirm(confirmMessage);
      if (confirmed) {
        await safeClose(); // Выполняем очистку и закрытие, если подтверждено
      }
    } else {
      
      await safeClose();
    }
  };


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
      showAlert(`⚠️ Подождите, идёт загрузка ${pendingUploads.length} вложений.`);
      return;
    }

    const failedUploads = uploadedAttachments.filter(att => att.error);
    if (failedUploads.length > 0) {
      showAlert(`❌ Некоторые вложения не были загружены: ${failedUploads.length}. Пожалуйста, удалите их и попробуйте снова.`);
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
      showAlert("Пожалуйста, добавьте комментарий к отчёту.");
      return;
    }

    setSubmitting(true);
    try {
      const attachmentKeysToBind = uploadedAttachments.map(att => att.storage_key);
      const createRes = await createReport(taskId, fullComment, attachmentKeysToBind);
      const reportId = createRes.report_id;

      await submitReportForReview(taskId, reportId);

      showAlert("✅ Отчёт создан и отправлен на проверку!");
      onSubmitSuccess && onSubmitSuccess();
      onClose(); // onClose вызовет useEffect cleanup - НЕТ, теперь onClose просто закрывает без очистки, потому что при успешной отправке вложения становятся частью отчета
    } catch (err) {
      console.error("Ошибка при создании/отправке отчёта:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось создать или отправить отчёт.";
      showAlert(`Ошибка: ${errorMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const pendingUploads = uploadedAttachments.filter(att => att.uploading);
  const hasErrors = uploadedAttachments.some(att => att.error);
  const successfulUploadsCount = uploadedAttachments.filter(att => !att.uploading && !att.error).length;

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Добавить отчёт по задаче #{taskId}</h2>
          <button className="close" onClick={handleClose}>×</button> {/* Используем handleClose */}
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
  const [imageModalState, setImageModalState] = useState({
    isOpen: false,
    currentIndex: 0,
    attachments: [], 
  });
  const [currentOpenReportModal, setCurrentOpenReportModal] = useState(null);

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
      {/* Заголовок с ID задачи слева и иконками справа */}
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
        <button
          className="icon-button"
          title="История изменений"
          onClick={() => navigate(`/montajnik/tasks/${id}/history`)}
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
      </div>

      {/* Кнопки действия под заголовком */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
  {showAddReportButton && (
  <button
    className="gradient-button"
    onClick={() => {
      setShowReportModal(true);
      setCurrentOpenReportModal(parseInt(id, 10)); // Запоминаем ID задачи
    }}
    style={{ flex: '0 0 auto', minWidth: '150px', display: 'flex', alignItems: 'center', gap: '6px' }}
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
    Добавить отчет
  </button>
)}
  
  {(() => {
    const statusFlow = {
      accepted: { next: "on_the_road", label: "Выехал", icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-shift" viewBox="0 0 16 16">
  <path d="M7.27 2.047a1 1 0 0 1 1.46 0l6.345 6.77c.6.638.146 1.683-.73 1.683H11.5v3a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-3H1.654C.78 10.5.326 9.455.924 8.816zM14.346 9.5 8 2.731 1.654 9.5H4.5a1 1 0 0 1 1 1v3h5v-3a1 1 0 0 1 1-1z"/>
</svg>
      )},
      on_the_road: { next: "on_site", label: "На месте", icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-sign-stop" viewBox="0 0 16 16">
  <path d="M3.16 10.08c-.931 0-1.447-.493-1.494-1.132h.653c.065.346.396.583.891.583.524 0 .83-.246.83-.62 0-.303-.203-.467-.637-.572l-.656-.164c-.61-.147-.978-.51-.978-1.078 0-.706.597-1.184 1.444-1.184.853 0 1.386.475 1.436 1.087h-.645c-.064-.32-.352-.542-.797-.542-.472 0-.77.246-.77.6 0 .261.196.437.553.522l.654.161c.673.164 1.06.487 1.06 1.11 0 .736-.574 1.228-1.544 1.228Zm3.427-3.51V10h-.665V6.57H4.753V6h3.006v.568H6.587Z"/>
  <path fill-rule="evenodd" d="M11.045 7.73v.544c0 1.131-.636 1.805-1.661 1.805-1.026 0-1.664-.674-1.664-1.805V7.73c0-1.136.638-1.807 1.664-1.807s1.66.674 1.66 1.807Zm-.674.547v-.553c0-.827-.422-1.234-.987-1.234-.572 0-.99.407-.99 1.234v.553c0 .83.418 1.237.99 1.237.565 0 .987-.408.987-1.237m1.15-2.276h1.535c.82 0 1.316.55 1.316 1.292 0 .747-.501 1.289-1.321 1.289h-.865V10h-.665zm1.436 2.036c.463 0 .735-.272.735-.744s-.272-.741-.735-.741h-.774v1.485z"/>
  <path fill-rule="evenodd" d="M4.893 0a.5.5 0 0 0-.353.146L.146 4.54A.5.5 0 0 0 0 4.893v6.214a.5.5 0 0 0 .146.353l4.394 4.394a.5.5 0 0 0 .353.146h6.214a.5.5 0 0 0 .353-.146l4.394-4.394a.5.5 0 0 0 .146-.353V4.893a.5.5 0 0 0-.146-.353L11.46.146A.5.5 0 0 0 11.107 0zM1 5.1 5.1 1h5.8L15 5.1v5.8L10.9 15H5.1L1 10.9z"/>
</svg>
      )},
      on_site: { next: "started", label: "Начал выполнение", icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-hammer" viewBox="0 0 16 16">
  <path d="M9.972 2.508a.5.5 0 0 0-.16-.556l-.178-.129a5 5 0 0 0-2.076-.783C6.215.862 4.504 1.229 2.84 3.133H1.786a.5.5 0 0 0-.354.147L.146 4.567a.5.5 0 0 0 0 .706l2.571 2.579a.5.5 0 0 0 .708 0l1.286-1.29a.5.5 0 0 0 .146-.353V5.57l8.387 8.873A.5.5 0 0 0 14 14.5l1.5-1.5a.5.5 0 0 0 .017-.689l-9.129-8.63c.747-.456 1.772-.839 3.112-.839a.5.5 0 0 0 .472-.334"/>
</svg>
      )},
    };
    const current = task.status;
    const nextAction = statusFlow[current];

    if (!nextAction) return null;

    const handleStatusChange = async () => {
      const confirmed = await showConfirm(`Подтвердить действие: "${nextAction.label}"?`);
      if (!confirmed) return;
      try {
        await changeTaskStatus(task.id, nextAction.next);
        showAlert("Статус изменён");
        await loadTask();
      } catch (err) {
        console.error(err);
        const errorMsg = err.response?.data?.detail || "Ошибка при смене статуса";
        showAlert(`Ошибка: ${errorMsg}`);
      }
    };

    return (
      <button 
        className="gradient-button" 
        onClick={handleStatusChange}
        style={{ flex: '0 0 auto', minWidth: '150px', display: 'flex', alignItems: 'center', gap: '6px' }}
      >
        {nextAction.icon}
        {nextAction.label}
      </button>
    );
  })()}
</div> 

      <div className="task-detail">
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
                {task.contact_person_position && ` - ${task.contact_person_position}`}
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
                Награда за работу:
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

        {/* === РАЗДЕЛИТЕЛЬНАЯ ЛИНИЯ === */}
        <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.35)', margin: '16px 0' }}></div>

        {/* === БЛОК ОТВЕТОВ НА ОТЧЁТЫ === */}
        <div className="section">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: 'bold', fontSize: '1.2em', marginBottom: '12px' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            Ответы на отчёты
          </h3>
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

        {/* === РАЗДЕЛИТЕЛЬНАЯ ЛИНИЯ === */}
        <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.35)', margin: '16px 0' }}></div>

       <div className="section">
  <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: 'bold', fontSize: '1.2em', marginBottom: '12px' }}>
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
    Отчёты
  </h3>
  {(task.reports && task.reports.length > 0) ? (
    task.reports.map(r => {
      const reportAttachments = reportAttachmentsMap[r.id] || [];
      const reportAttachmentsLoading = !reportAttachmentsMap.hasOwnProperty(r.id);

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

      // --- Определение цвета для статуса ---
      const statusColors = {
        waiting: '#FFC107',    // Проверяется
        approved: '#4CAF50',   // Принято
        rejected: '#F44336'    // Отклонено
      };

      return (
        <div key={r.id} className="report" style={{ padding: '12px', borderRadius: '8px', marginBottom: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
          {/* Номер задачи */}
          <p>
            <b>#{r.id}</b>
          </p>
          
          {/* Комментарий монтажника */}
          <p><b>Ваш комментарий:</b> {displayComment}</p>
          
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
                    style={{ cursor: 'zoom-in' }}
                    onClick={() => handleImageClick(originalUrl, reportAttachments)}
                  >
                    <LazyImage
                      src={originalUrl} 
                      thumbSrc={thumbUrl} 
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
          
          {/* Статусы проверки */}
          <p>
            <b>Логист:</b> <span style={{ color: statusColors[r.approval_logist] || '#e0e0e0', fontWeight: 'bold' }}>{getReportApprovalDisplayName(r.approval_logist) || "—"}</span>
            {task.requires_tech_supp === true && (
              <>
                {" "} | <b>Тех.спец:</b> <span style={{ color: statusColors[r.approval_tech] || '#e0e0e0', fontWeight: 'bold' }}>{getReportApprovalDisplayName(r.approval_tech) || "—"}</span>
              </>
            )}
          </p>
          
          {/* Комментарий отклонения */}
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

    <ImageModal
      isOpen={imageModalState.isOpen}
      onClose={closeModal}
      attachments={imageModalState.attachments} // Передаем список
      currentIndex={imageModalState.currentIndex} // Передаем индекс
      onPrev={goToPrevImage} // Передаем функцию
      onNext={goToNextImage} // Передаем функцию
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
    onClose={() => {
      setShowReportModal(false);
      setCurrentOpenReportModal(null); // Очищаем ID задачи
    }}
    onSubmitSuccess={loadTask}
  />
)}

  </div>
);
}