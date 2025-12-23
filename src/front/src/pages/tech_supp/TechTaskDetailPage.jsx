// front/src/pages/tech/TechTaskDetailPage.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchTechTaskDetail,
  reviewTechReport,
  getEquipmentList,
  getWorkTypes,
  getTechCompaniesList,
  getTechContactPersonsByCompany,
  getTechContactPersonPhone,
  listReportAttachments,
  getAttachmentUrl,
} from "../../api";
import "../../styles/LogistPage.css";
import ImageModal from "../../components/ImageModal";

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

export default function TechTaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rejectModal, setRejectModal] = useState({ open: false, taskId: null, reportId: null });
  const [rejectComment, setRejectComment] = useState("");
  const [equipment, setEquipment] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [contactPersons, setContactPersons] = useState([]);
  const [contactPersonPhone, setContactPersonPhone] = useState(null);
  const [openImage, setOpenImage] = useState(null);
  const [reportAttachmentsMap, setReportAttachmentsMap] = useState({});

  useEffect(() => {
    loadRefs();
    loadTask();
  }, [id]);

  async function loadRefs() {
    try {
      const [eqRes, wtRes, compRes] = await Promise.allSettled([
        getEquipmentList(),
        getWorkTypes(),
        getTechCompaniesList(),
      ]);

      setEquipment(eqRes.status === "fulfilled" ? eqRes.value || [] : []);
      setWorkTypes(wtRes.status === "fulfilled" ? wtRes.value || [] : []);
      setCompanies(compRes.status === "fulfilled" ? compRes.value || [] : []);
    } catch (e) {
      console.error("Ошибка загрузки справочников", e);
    }
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

  const handleImageClick = (imageUrl) => {
    setOpenImage(imageUrl);
  };

  const closeModal = () => {
    setOpenImage(null);
  };

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
      const data = await fetchTechTaskDetail(id);

      const t = {
        ...data,
        equipment: data.equipment || [],
        work_types: data.work_types || [],
        history: data.history || [],
        reports: data.reports || [],
        attachments: data.attachments || [],
      };

      t.equipment_ids = t.equipment.map((e) => e.equipment_id);
      t.work_types_ids = t.work_types;

      setTask(t);

      if (t.contact_person_id && !t.contact_person_phone) {
         try {
            const { phone } = await getTechContactPersonPhone(t.contact_person_id);
            setContactPersonPhone(phone);
         } catch (err) {
            console.error("Ошибка загрузки телефона при инициализации задачи:", err);
            setContactPersonPhone(null);
         }
      } else {
        setContactPersonPhone(t.contact_person_phone || null);
      }

      if (t.reports) {
        t.reports.forEach(r => {
          loadReportAttachments(r.id);
        });
      }

    } catch (err) {
      console.error("Ошибка загрузки задачи:", err);
      setError(err.response?.data?.detail || err.message || "Ошибка загрузки задачи");
      if (err.response?.status === 403 || err.response?.status === 404) {
        navigate(-1);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleTechApprove(taskId, reportId) {
    if (!window.confirm("Принять отчёт как тех.специалист?")) return;
    try {
      await reviewTechReport(taskId, reportId, { approval: "approved", comment: "" });
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("✅ Отчёт принят тех.специалистом");
      } else {
        alert("✅ Отчёт принят тех.специалистом");
      }
      loadTask();
    } catch (err) {
      console.error("Ошибка принятия отчёта:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось принять отчёт.";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`Ошибка: ${errorMsg}`);
      } else {
        alert(`Ошибка: ${errorMsg}`);
      }
    }
  }

  function handleRejectTechReport(taskId, reportId) {
    setRejectModal({ open: true, taskId, reportId });
  }

  function closeRejectModal() {
    setRejectModal({ open: false, taskId: null, reportId: null });
    setRejectComment("");
  }

  if (loading) return <div className="logist-main"><div className="empty">Загрузка задачи #{id}...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;
  if (!task) return <div className="logist-main"><div className="empty">Задача не найдена</div></div>;

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
            <p><b>Гос. номер</b> {task.gos_number || "—"}</p>
            <p><b>Дата:</b> {task.scheduled_at ? new Date(task.scheduled_at).toLocaleString() : "—"}</p>
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
            <p><b>Статус:</b> {getStatusDisplayName(task.status)}</p>
            <p><b>Монтажник:</b> {task.assigned_user_name || task.assigned_user_id || "—"}</p>
            <p><b>Комментарий:</b> {task.comment || "—"}</p>
            <p><b>Цена клиента:</b> {task.client_price || "—"}</p>
            <p><b>Награда монтажнику:</b> {task.montajnik_reward || "—"}</p>
            <p><b>Фото обязательно:</b> {task.photo_required ? "Да" : "Нет"}</p>
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
          </div>

          <div className="section">
            <h3>История</h3>
            <button className="gradient-button" onClick={() => navigate(`/tech_supp/tasks/${id}/history`)}>
              Подробнее
            </button>
          </div>

          <div className="section">
            <h3>Отчёты монтажников</h3>
            {(task.reports || []).length ? (
              task.reports.map((r) => {
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

                const reportAttachments = reportAttachmentsMap[r.id] || [];
                const reportAttachmentsLoading = !reportAttachmentsMap.hasOwnProperty(r.id);

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
                    
                    <div className="report-actions">
                      {r.approval_tech === "waiting" && (
                        <button className="gradient-button" onClick={() => handleTechApprove(task.id, r.id)}>✅ Принять (Тех)</button>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty">Отчётов пока нет</div>
            )}
          </div>
        </div>
      </div>
            
            <ImageModal
        isOpen={!!openImage}
        onClose={closeModal}
        imageUrl={openImage}
        altText="Вложение отчёта"
      />

    </div>
  );
}