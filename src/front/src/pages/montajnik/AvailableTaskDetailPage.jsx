import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchAvailableMontTaskDetail, acceptTask, getEquipmentList, getWorkTypes } from "../../api";
// ✅ Импортируем функции для получения данных о компаниях и контактных лицах
import { getMontCompaniesList, getMontContactPersonsByCompany } from "../../api"; // Убедитесь, что путь верный
import "../../styles/LogistPage.css";

export default function AvailableTaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [accepting, setAccepting] = useState(false);
  const [equipment, setEquipment] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  
  const [companies, setCompanies] = useState([]);
  const [contactPersons, setContactPersons] = useState([]);

  useEffect(() => {
    loadRefs(); // Загружаем справочники
    loadTask(); // Загружаем задачу
  }, [id]);

  // ✅ Обновляем loadRefs, чтобы загружать компании
  async function loadRefs() {
    try {
      const eq = await getEquipmentList();
      const wt = await getWorkTypes();
      const comps = await getMontCompaniesList(); // ✅ Используем эндпоинт монтажника
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
      const data = await fetchAvailableMontTaskDetail(id);
      // Нет необходимости изменять структуру данных задачи, так как это только просмотр
      setTask(data);
    } catch (err) {
      console.error("Ошибка загрузки задачи:", err);
      setError(err.response?.data?.detail || err.message || "Ошибка загрузки задачи");
      if (err.response?.status === 404 || err.response?.status === 403) {
         navigate("/montajnik/tasks/available");
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
      alert("Задача принята!");
      navigate("/montajnik/tasks/mine");
    } catch (err) {
      console.error("Ошибка принятия задачи:", err);
      const errorMessage = err.response?.data?.detail || "Не удалось принять задачу.";
      alert(`Ошибка: ${errorMessage}`);
    } finally {
      setAccepting(false);
    }
  };

  // ✅ Улучшенная функция отображения вложений
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
            if (a.url && typeof a.url === "string" && (a.url.startsWith("http://") || a.url.startsWith("https://"))) {
              src = a.url;
            } else if (a.storage_key && typeof a.storage_key === "string") {
              src = `${import.meta.env.VITE_API_URL}/attachments/${a.storage_key}`;
            }
            key = a.id ? `id-${a.id}` : a.storage_key ? `sk-${a.storage_key}` : `index-${index}`;
          } else if (typeof a === "string") {
            src = `${import.meta.env.VITE_API_URL}/attachments/${a}`;
            key = `str-${a}`;
          }

          if (src) {
            return (
              <div className="attached" key={key} style={{ minWidth: '100px', minHeight: '100px', border: '1px dashed #ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px' }}>
                <img
                  src={src}
                  alt={`Attachment ${index}`}
                  style={{ maxHeight: 100, maxWidth: '100%', objectFit: 'contain' }}
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.parentElement.innerHTML = `<span style="font-size: 12px; text-align: center;">Img Err (${index})</span>`;
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

  const isTaskAcceptable = task.status === 'new';

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1>Задача #{task.id} (Предпросмотр)</h1>
          <button className="add-btn" onClick={() => navigate("/montajnik/tasks/available")}>
            ⬅️ Назад к списку
          </button>
        </div>

        <div className="task-detail">
          <div className="task-view">
            {/* ❌ Удаляем строку с клиентом */}
            {/* <p><b>Клиент:</b> {task.client || "—"}</p> */}
            
            {/* ✅ Добавляем строки с компанией и контактным лицом */}
            <p><b>Компания:</b> {task.company_name || "—"}</p>
            <p><b>Контактное лицо:</b> {task.contact_person_name || "—"}</p>
            <p><b>ТС:</b> {task.vehicle_info || "—"}</p>
            <p><b>Дата:</b> {task.scheduled_at ? new Date(task.scheduled_at).toLocaleString() : "—"}</p>
            <p><b>Место:</b> {task.location || "—"}</p>
            <p><b>Статус:</b> {task.status || "—"}</p>
            <p><b>Комментарий:</b> {task.comment || "—"}</p>
            <p><b>Цена клиента:</b> {task.client_price || "—"}</p>
            <p><b>Награда монтажнику:</b> {task.montajnik_reward || "—"}</p>
            
            <p>
              <b>Оборудование:</b>{" "}
              {(task.equipment || [])
                .map((e) =>
                  equipment.find((eq) => eq.id === e.equipment_id)?.name ||
                  e.equipment_id
                )
                .join(", ") || "—"}
            </p>

            <p>
              <b>Виды работ:</b>{" "}
              {(task.work_types || [])
                .map((wtId) =>
                  workTypes.find((wt) => wt.id === wtId)?.name ||
                  wtId
                )
                .join(", ") || "—"}</p>
            <p><b>Фото обязательно:</b> {task.photo_required ? "Да" : "Нет"}</p>
            
            <div className="section">
              <h3>Вложения</h3>
              {renderAttachments(task.attachments)}
            </div>

            <div className="section">
              <h3>История</h3>
              <button className="add-btn" onClick={() => navigate(`/montajnik/tasks/${id}/history`)}>
                Подробнее
              </button>
            </div>

            <div className="section">
              <h3>Отчёты</h3>
              {(task.reports && task.reports.length > 0) ? (
                task.reports.map(r => (
                  <div key={r.id} className="report">
                    <p>#{r.id}: {r.text || "—"} (Логист: {r.approval_logist || "—"}, Тех: {r.approval_tech || "—"})</p>
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
                <p>Отчётов пока нет</p>
              )}
            </div>
          </div>

          {isTaskAcceptable && (
            <div className="section" style={{ marginTop: '20px' }}>
              <button
                className="primary"
                onClick={handleAcceptTask}
                disabled={accepting}
              >
                {accepting ? 'Принятие...' : '✅ Принять задачу'}
              </button>
            </div>
          )}
          {!isTaskAcceptable && (
             <div className="section" style={{ marginTop: '20px', padding: '10px', backgroundColor: '#161b22', borderRadius: '5px' }}>
               <p style={{ margin: 0, color: '#e6eef8' }}>
                 Задача в процессе работы <br></br>
                 Статус задачи ({task.status}).
               </p>
             </div>
           )}
        </div>
      </div>
    </div>
  );
}