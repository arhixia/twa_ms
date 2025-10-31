// front/src/pages/tech/TechTaskDetailPage.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  fetchTechTaskDetail,
  reviewTechReport,
  getEquipmentList,
  getWorkTypes,
  getTechCompaniesList,      // ✅ Новое
  getTechContactPersonsByCompany, // ✅ Новое
} from "../../api";
import "../../styles/LogistPage.css";

export default function TechTaskDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // --- Состояния для модального окна отклонения отчёта тех.специалистом ---
  const [rejectModal, setRejectModal] = useState({ open: false, taskId: null, reportId: null });
  const [rejectComment, setRejectComment] = useState("");
  const [equipment, setEquipment] = useState([]); // Состояние для списка оборудования
  const [workTypes, setWorkTypes] = useState([]); // Состояние для списка видов работ
  const [companies, setCompanies] = useState([]); // ✅ Новое
  const [contactPersons, setContactPersons] = useState([]); // ✅ Новое

  useEffect(() => {
    loadRefs();
    loadTask();
  }, [id]);

  // --- Функция для загрузки справочников ---
  async function loadRefs() {
    try {
      const [eqRes, wtRes, compRes] = await Promise.allSettled([
        getEquipmentList(),
        getWorkTypes(),
        getTechCompaniesList(), // ✅ Новое
      ]);

      setEquipment(eqRes.status === "fulfilled" ? eqRes.value || [] : []);
      setWorkTypes(wtRes.status === "fulfilled" ? wtRes.value || [] : []);
      setCompanies(compRes.status === "fulfilled" ? compRes.value || [] : []);
    } catch (e) {
      console.error("Ошибка загрузки справочников", e);
    }
  }

  async function loadTask() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTechTaskDetail(id);

      // безопасная инициализация полей
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

  // --- Функция для принятия отчёта тех.специалистом ---
  async function handleTechApprove(taskId, reportId) {
    if (!window.confirm("Принять отчёт как тех.специалист?")) return;
    try {
      // Вызываем НОВУЮ функцию API для ревью с approval: "approved"
      // ❌ Убираем photos из payload
      await reviewTechReport(taskId, reportId, { approval: "approved", comment: "" /*, photos: []*/ });
      alert("✅ Отчёт принят тех.специалистом");
      loadTask(); // Перезагружаем задачу для обновления отображения
    } catch (err) {
      console.error("Ошибка принятия отчёта:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось принять отчёт.";
      alert(`Ошибка: ${errorMsg}`);
    }
  }

  // --- Функции для управления модальным окном отклонения тех.специалистом ---
  function handleRejectTechReport(taskId, reportId) {
    setRejectModal({ open: true, taskId, reportId });
  }

  function closeRejectModal() {
    setRejectModal({ open: false, taskId: null, reportId: null });
    setRejectComment("");
  }

  async function handleRejectTechReportSubmit() {
    if (!rejectComment.trim()) {
      alert("Введите комментарий причины отклонения");
      return;
    }
    try {
      await reviewTechReport(rejectModal.taskId, rejectModal.reportId, {
        approval: "rejected",
        comment: rejectComment,
      });
      alert("❌ Отчёт отклонён тех.специалистом");
      closeRejectModal();
      loadTask(); // Перезагружаем задачу для обновления отображения
    } catch (err) {
      console.error("Ошибка отклонения отчёта:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось отклонить отчёт.";
      alert(`Ошибка: ${errorMsg}`);
    }
  }



  if (loading) return <div className="logist-main"><div className="empty">Загрузка задачи #{id}...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;
  if (!task) return <div className="logist-main"><div className="empty">Задача не найдена</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1>Задача #{task.id}</h1>
          <button className="add-btn" onClick={() => navigate(-1)}>⬅️ Назад</button>
        </div>

        <div className="task-detail">
          <div className="task-view">
            {/* ✅ Заменено client на company_name и contact_person_name */}
            <p><b>Компания:</b> {task.company_name || "—"}</p>
            <p><b>Контактное лицо:</b> {task.contact_person_name || "—"}</p>
            <p><b>ТС:</b> {task.vehicle_info || "—"}</p>
            <p><b>Дата:</b> {task.scheduled_at ? new Date(task.scheduled_at).toLocaleString() : "—"}</p>
            <p><b>Статус:</b> {task.status || "—"}</p>
            <p><b>Монтажник:</b> {task.assigned_user_id || "—"}</p>
            <p><b>Комментарий:</b> {task.comment || "—"}</p>
            <p><b>Цена клиента:</b> {task.client_price || "—"}</p>
            <p><b>Награда монтажнику:</b> {task.montajnik_reward || "—"}</p>
            <p><b>Фото обязательно:</b> {task.photo_required ? "Да" : "Нет"}</p>
            <p>
              <b>Оборудование:</b>{" "}
              {(task.equipment || [])
                .map(
                  (e) =>
                    equipment.find((eq) => eq.id === e.equipment_id)?.name ||
                    e.equipment_id
                )
                .join(", ") || "—"}
            </p>
            <p>
              <b>Виды работ:</b>{" "}
              {(task.work_types || [])
                .map(
                  (wtId) => workTypes.find((wt) => wt.id === wtId)?.name || wtId
                )
                .join(", ") || "—"}
            </p>
           
          </div>

          <div className="section">
            <h3>История</h3>
            <button className="add-btn" onClick={() => navigate(`/tech_supp/tasks/${id}/history`)}>
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
                    logist: <b>{r.approval_logist || "—"}</b> | tech:{" "}
                    <b>{r.approval_tech || "—"}</b>
                  </p>
                  {/* Отображаем статус и комментарий другого проверяющего, если он не waiting и не текущий */}
                  {/* В данном случае, тех.спец видит статус логиста */}
                  {(r.approval_logist !== "waiting" && r.approval_logist !== "rejected") && (
                    <p style={{ color: r.approval_logist === "approved" ? "green" : "orange" }}>
                      <b>Логист:</b> {r.approval_logist} {r.review_comment && r.approval_logist === "rejected" && ` - ${r.review_comment}`}
                    </p>
                  )}
                  <div className="report-actions">
                    {/* Кнопки "Принять" и "Отклонить" отображаются, если статус отчёта для ТЕХ.СПЕЦА == "waiting" */}
                    {r.approval_tech === "waiting" ? (
                      <>
                        <button onClick={() => handleTechApprove(task.id, r.id)}>✅ Принять (Тех)</button>
                        <button
                          style={{ backgroundColor: '#ef4444' }}
                          onClick={() => handleRejectTechReport(task.id, r.id)}
                        >
                          ❌ Отклонить (Тех)
                        </button>
                      </>
                    ) : null}
                  </div>

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
          </div>
        </div>
      </div>

      {/* Модальное окно отклонения отчёта тех.специалистом */}
      {rejectModal.open && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2>Отклонить отчёт #{rejectModal.reportId} по задаче #{rejectModal.taskId}</h2>
              <button className="close" onClick={closeRejectModal}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <label>
                  Комментарий:
                  <textarea
                    value={rejectComment}
                    onChange={(e) => setRejectComment(e.target.value)}
                    rows="4"
                    placeholder="Причина отклонения..."
                  />
                </label>
              </div>
            </div>
            <div className="modal-actions">
              <button className="primary" onClick={handleRejectTechReportSubmit}>
                Отправить
              </button>
              <button onClick={closeRejectModal}>Отмена</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}