// front/src/components/TaskHistoryModal.jsx
import React, { useEffect, useState } from "react";
import { fetchTaskFullHistory, getEquipmentList, getWorkTypes } from "../api"; // ✅ Добавлены справочники
import "../styles/LogistPage.css";

export default function TaskHistoryModal({ taskId, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [equipment, setEquipment] = useState([]); // ✅ Справочник оборудования
  const [workTypes, setWorkTypes] = useState([]); // ✅ Справочник видов работ

  useEffect(() => {
    loadRefs(); // ✅ Загружаем справочники
    loadHistory();
  }, [taskId]);

  async function loadRefs() {
    try {
      const eq = await getEquipmentList();
      const wt = await getWorkTypes();
      setEquipment(eq || []);
      setWorkTypes(wt || []);
    } catch (e) {
      console.error("Ошибка загрузки справочников", e);
    }
  }

  async function loadHistory() {
    setLoading(true);
    try {
      const data = await fetchTaskFullHistory(taskId);
      setHistory(data || []);
    } catch (err) {
      console.error("Ошибка загрузки истории:", err);
      alert("Ошибка загрузки истории");
      onClose(); // Закрываем модалку при ошибке
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="modal-body">Загрузка истории задачи #{taskId}...</div>;

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: '90%', maxWidth: '800px' }}>
        <div className="modal-header">
          <h3>История задачи #{taskId}</h3>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {history.length > 0 ? (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {history.map((h) => {
                // --- Безопасное извлечение даты ---
                let dateStr = "Invalid Date";
                try {
                  if (h.timestamp) {
                    dateStr = new Date(h.timestamp).toLocaleString();
                  }
                } catch (e) {
                  console.warn(`[WARN] Некорректная дата в записи истории ${h.id}:`, h.timestamp);
                }

                // --- Безопасное извлечение пользователя ---
                const userStr = h.user_id ? `Пользователь ${h.user_id}` : "Система";

                // --- Безопасное извлечение типа события ---
                const eventTypeStr = h.event_type || h.action || "—";

                // --- Безопасное извлечение комментария ---
                let commentElement = "—";
                if (h.comment) {
                  try {
                    // Попробуем распарсить JSON
                    const parsed = JSON.parse(h.comment);
                    if (Array.isArray(parsed)) {
                      commentElement = (
                        <ul style={{ margin: 0, paddingLeft: '16px' }}>
                          {parsed.map((item, idx) => (
                            <li key={idx}>
                              <b>{item.field || item.action || "—"}</b>: "{item.old || "—"}" → "{item.new || "—"}"
                            </li>
                          ))}
                        </ul>
                      );
                    } else {
                      commentElement = <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{h.comment}</pre>;
                    }
                  } catch (e) {
                    // Если не JSON — просто текст
                    commentElement = <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{h.comment}</pre>;
                  }
                }

                // --- Безопасное извлечение equipment и work_types ---
                let equipmentStr = "—";
                let workTypesStr = "—";
                try {
                  if (h.equipment_ids) {
                    // h.equipment_ids — это JSON-строка с массивом ID
                    const ids = JSON.parse(h.equipment_ids);
                    if (Array.isArray(ids)) {
                      equipmentStr = ids
                        .map(id => {
                          const eq = equipment.find(e => e.id === id);
                          return eq ? eq.name : `ID ${id}`;
                        })
                        .join(", ");
                    }
                  }
                } catch (e) {
                  console.warn(`[WARN] Ошибка парсинга equipment_ids в записи истории ${h.id}:`, h.equipment_ids);
                  equipmentStr = "Ошибка парсинга";
                }

                try {
                  if (h.work_types_ids) {
                    // h.work_types_ids — это JSON-строка с массивом ID
                    const ids = JSON.parse(h.work_types_ids);
                    if (Array.isArray(ids)) {
                      workTypesStr = ids
                        .map(id => {
                          const wt = workTypes.find(w => w.id === id);
                          return wt ? wt.name : `ID ${id}`;
                        })
                        .join(", ");
                    }
                  }
                } catch (e) {
                  console.warn(`[WARN] Ошибка парсинга work_types_ids в записи истории ${h.id}:`, h.work_types_ids);
                  workTypesStr = "Ошибка парсинга";
                }

                return (
                  <li key={h.id} style={{ padding: '16px 0', borderBottom: '1px solid #eee' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <b>{dateStr}</b> — {userStr}
                      </div>
                      <div style={{ fontSize: '0.9em', color: '#888' }}>
                        {eventTypeStr}
                      </div>
                    </div>
                    <div style={{ marginTop: '8px' }}>
                      {commentElement}
                    </div>

                    {/* --- Дополнительные поля --- */}
                    {(h.field_name || h.old_value || h.new_value) && (
                      <div style={{ marginTop: '8px', fontSize: '0.9em' }}>
                        <b>Поле:</b> {h.field_name || "—"} | <b>Старое:</b> {h.old_value || "—"} | <b>Новое:</b> {h.new_value || "—"}
                      </div>
                    )}
                    {(h.related_entity_type || h.related_entity_id) && (
                      <div style={{ marginTop: '8px', fontSize: '0.9em' }}>
                        <b>Сущность:</b> {h.related_entity_type || "—"} (ID: {h.related_entity_id || "—"})
                      </div>
                    )}

                    {/* ✅ Отображение equipment и work_types */}
                    <div style={{ marginTop: '12px', padding: '8px', backgroundColor: '#161b22', borderRadius: '4px', color: '#e6eef8' }}>
                      <b>Состояние задачи:</b>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '4px' }}>
                        <div><b>Клиент:</b> {h.client || "—"}</div>
                        <div><b>ТС:</b> {h.vehicle_info || "—"}</div>
                        <div><b>Дата:</b> {h.scheduled_at ? new Date(h.scheduled_at).toLocaleString() : "—"}</div>
                        <div><b>Место:</b> {h.location || "—"}</div>
                        <div><b>Статус:</b> {h.status || "—"}</div>
                        <div><b>Монтажник:</b> {h.assigned_user_id || "—"}</div>
                        <div><b>Комментарий:</b> {h.comment_field || "—"}</div>
                        <div><b>Цена клиента:</b> {h.client_price || "—"}</div>
                        <div><b>Награда монтажнику:</b> {h.montajnik_reward || "—"}</div>
                        <div><b>Фото обязательно:</b> {h.photo_required ? "Да" : "Нет"}</div>
                        <div><b>Тип назначения:</b> {h.assignment_type || "—"}</div>
                        {/* ✅ Оборудование и виды работ */}
                        <div><b>Оборудование:</b> {equipmentStr}</div>
                        <div><b>Виды работ:</b> {workTypesStr}</div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty">История задачи #{taskId} пуста</div>
          )}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}