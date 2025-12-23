// src/pages/montajnik/AssignedTaskDetailPage.jsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchAssignedMontTaskDetail, acceptTask, rejectTask, getEquipmentList, getWorkTypes } from "../../api";
import { getMontCompaniesList, getMontContactPersonsByCompany, getMontContactPersonPhone } from "../../api";


export default function AssignedTaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [equipment, setEquipment] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  
  const [companies, setCompanies] = useState([]);
  const [contactPersons, setContactPersons] = useState([]);
  const [contactPersonPhone, setContactPersonPhone] = useState(null);

  useEffect(() => {
    loadRefs();
    loadTask();
  }, [id]);

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

  async function loadTask() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAssignedMontTaskDetail(id);
      setTask(data);

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
      if (err.response?.status === 404 || err.response?.status === 403) {
         navigate("/montajnik/tasks/assigned");
      }
    } finally {
      setLoading(false);
    }
  }

  const handleAcceptTask = async () => {
    if (!window.confirm(`Вы уверены, что хотите принять задачу #${id}?`)) return;
    try {
      setAccepting(true);
      await acceptTask(id);
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Задача принята!");
      } else {
        alert("Задача принята!");
      }
      navigate("/montajnik/tasks/mine");
    } catch (err) {
      console.error("Ошибка принятия задачи:", err);
      const errorMessage = err.response?.data?.detail || "Не удалось принять задачу.";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`Ошибка: ${errorMessage}`);
      } else {
        alert(`Ошибка: ${errorMessage}`);
      }
    } finally {
      setAccepting(false);
    }
  };

  const handleRejectTask = async () => {
    try {
      setRejecting(true);
      await rejectTask(id, rejectComment || null);
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Задача отклонена!");
      } else {
        alert("Задача отклонена!");
      }
      setShowRejectModal(false);
      setRejectComment("");
      navigate("/montajnik/tasks/assigned");
    } catch (err) {
      console.error("Ошибка отклонения задачи:", err);
      const errorMessage = err.response?.data?.detail || "Не удалось отклонить задачу.";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`Ошибка: ${errorMessage}`);
      } else {
        alert(`Ошибка: ${errorMessage}`);
      }
    } finally {
      setRejecting(false);
    }
  };

  if (loading) {
    return (
      <div className="logist-main">
        <div className="empty">
          Загрузка задачи #{id}...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="logist-main">
        <div className="error">
          {error}
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="logist-main">
        <div className="empty">
          Задача не найдена.
        </div>
      </div>
    );
  }

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
          <button 
            className="gradient-button" 
            onClick={handleAcceptTask}
            disabled={accepting}
            style={{ flex: '0 0 auto', minWidth: '150px' }}
          >
            {accepting ? 'Принятие...' : '✅ Принять задачу'}
          </button>
          
          <button 
            className="gradient-button" 
            onClick={() => setShowRejectModal(true)}
            style={{ flex: '0 0 auto', minWidth: '150px' }}
          >
            ❌ Отклонить задачу
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
            <p><b>Гос. номер:</b> {task.gos_number || "—"}</p>
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
            <p><b>Комментарий:</b> {task.comment || "—"}</p>
            <p><b>Монтажник:</b> {task.assigned_user_name || task.assigned_user_id || "—"}</p>
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
          </div>
        </div>
      </div>

      {/* Модалка отклонения */}
      {showRejectModal && (
        <div className="modal-backdrop" onClick={() => setShowRejectModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Отклонить задачу #{id}</h2>
              <button className="close" onClick={() => setShowRejectModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="section">
                <label className="dark-label">
                  Причина отклонения (необязательно):
                </label>
                <textarea
                  value={rejectComment}
                  onChange={(e) => setRejectComment(e.target.value)}
                  rows="3"
                  placeholder="Можно оставить пустым..."
                  className="dark-select"
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>
            </div>
            <div className="modal-actions">
              <button
                className="gradient-button"
                onClick={handleRejectTask}
                disabled={rejecting}
                style={{ background: 'linear-gradient(to right, #ef4444, #dc2626)' }}
              >
                {rejecting ? 'Отклонение...' : 'Подтвердить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}