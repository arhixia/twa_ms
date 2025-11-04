// front/src/pages/logist/LogistCompletedTaskDetailPage.jsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { logistCompletedTaskDetail, getEquipmentList, getWorkTypes } from "../../api"; // Добавляем импорты справочников
import "../../styles/LogistPage.css";

export default function LogistCompletedTaskDetailPage() {
  const { id } = useParams(); // ID задачи из URL
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // --- НОВОЕ: Состояния для справочников ---
  const [equipmentList, setEquipmentList] = useState([]);
  const [workTypesList, setWorkTypesList] = useState([]);

  useEffect(() => {
    loadRefs(); // Загружаем справочники
    loadTask();
  }, [id]);

  // --- НОВАЯ ФУНКЦИЯ: Загрузка справочников ---
  async function loadRefs() {
    try {
      const [eqRes, wtRes] = await Promise.allSettled([
        getEquipmentList(),
        getWorkTypes(),
      ]);
      setEquipmentList(eqRes.status === 'fulfilled' ? eqRes.value || [] : []);
      setWorkTypesList(wtRes.status === 'fulfilled' ? wtRes.value || [] : []);
    } catch (e) {
      console.error("Ошибка загрузки справочников", e);
    }
  }

  async function loadTask() {
    setLoading(true);
    setError(null);
    try {
      const data = await logistCompletedTaskDetail(id); // Вызываем новый API метод
      setTask(data);
    } catch (err) {
      console.error("Ошибка загрузки завершенной задачи логиста:", err);
      setError(err.response?.data?.detail || err.message || "Ошибка загрузки задачи");
      if (err.response?.status === 403 || err.response?.status === 404) {
        // Перенаправляем на профиль, если доступа нет или задача не найдена
        navigate("/logist/profile");
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="logist-main"><div className="empty">Загрузка задачи #{id}...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;
  if (!task) return <div className="logist-main"><div className="empty">Задача не найдена</div></div>;

  // --- ФУНКЦИИ ДЛЯ ОТОБРАЖЕНИЯ ИМЁН ---
  const getEquipmentNameById = (eqId) => {
    const eq = equipmentList.find(e => e.id === eqId);
    return eq ? eq.name : `ID ${eqId}`;
  };

  const getWorkTypeNameById = (wtId) => {
    const wt = workTypesList.find(w => w.id === wtId);
    return wt ? wt.name : `ID ${wtId}`;
  };

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1>Завершённая задача #{task.id}</h1>
          <button className="add-btn" onClick={() => navigate(-1)}> {/* Кнопка "Назад" */}
            ⬅️ Назад
          </button>
        </div>

        <div className="task-detail">
          <div className="task-view">
            <p><b>Компания:</b> {task.company_name || "—"}</p>
            <p><b>Контактное лицо:</b> {task.contact_person_name || "—"}</p>
            <p><b>Телефон контактного лица:</b> {task.contact_person_phone || "—"}</p>
            <p><b>ТС:</b> {task.vehicle_info || "—"}</p>
            <p><b>Гос. номер:</b> {task.gos_number || "—"}</p>
            <p><b>Дата:</b> {task.scheduled_at ? new Date(task.scheduled_at).toLocaleString() : "—"}</p>
            <p><b>Статус:</b> {task.status || "—"}</p>
            <p><b>Место:</b> {task.location || "—"}</p>
            <p><b>Монтажник:</b> {task.assigned_user_id || "—"}</p>
            <p><b>Комментарий:</b> {task.comment || "—"}</p>
            <p><b>Цена клиента:</b> {task.client_price || "—"}</p>
            <p><b>Награда монтажнику:</b> {task.montajnik_reward || "—"}</p>

            {/* === Оборудование (с именами) === */}
            <p>
              <b>Оборудование:</b>{" "}
              {(task.equipment || [])
                .map((e) => {
                  const eqName = getEquipmentNameById(e.equipment_id);
                  return `${eqName} x${e.quantity} (SN: ${e.serial_number || 'N/A'})`;
                })
                .join(", ") || "—"}
            </p>

            {/* === Виды работ (с именами) === */}
            <p>
              <b>Виды работ:</b>{" "}
              {(task.work_types || [])
                .map((wt) => {
                  const wtName = getWorkTypeNameById(wt.work_type_id);
                  return `${wtName} x${wt.quantity}`;
                })
                .join(", ") || "—"}
            </p>

            <p><b>Фото обязательно:</b> {task.photo_required ? "Да" : "Нет"}</p>

            {/* === История (кнопка) === */}
            <div className="section">
              <h3>История</h3>
              {/* Кнопка "Подробнее" теперь ведёт на отдельную страницу истории */}
              <button className="add-btn" onClick={() => navigate(`/logist/tasks/${task.id}/history`)}>
                Подробнее
              </button>
            </div>

            {/* === Отчёты === */}
            <div className="section">
              <h3>Отчёты монтажника</h3>
              {(task.reports && task.reports.length > 0) ? (
                task.reports.map(r => (
                  <div key={r.id} className="report">
                    <p>#{r.id}: {r.text || "—"}</p>
                    <p>
                      <b>Логист:</b> <span style={{ color: r.approval_logist === "approved" ? "green" : r.approval_logist === "rejected" ? "red" : "orange" }}>
                        {r.approval_logist || "—"}
                      </span> |
                      <b>Тех.спец:</b> <span style={{ color: r.approval_tech === "approved" ? "green" : r.approval_tech === "rejected" ? "red" : "orange" }}>
                        {r.approval_tech || "—"}
                      </span>
                    </p>
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
                <div className="empty">Отчётов нет</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}