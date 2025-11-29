// front/src/pages/admin/AdminCompletedTaskDetailPage.jsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  adminCompletedTaskDetail,
  getAdminEquipmentList,
  getAdminWorkTypesList,
  // --- ИМПОРТЫ ДЛЯ ВЛОЖЕНИЙ ОТЧЁТОВ ---
  listReportAttachments,
  getAttachmentUrl,
} from "../../api";
import "../../styles/LogistPage.css";
import ImageModal from "../../components/ImageModal";

// --- НОВОЕ: Хук для загрузки вложений отчёта ---
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

export default function AdminCompletedTaskDetailPage() {
  const { id } = useParams(); // ID задачи из URL
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // --- Состояния для справочников ---
  const [equipmentList, setEquipmentList] = useState([]);
  const [workTypesList, setWorkTypesList] = useState([]);

  // --- Состояние для вложений отчётов ---
  const [reportAttachmentsMap, setReportAttachmentsMap] = useState({});

  // --- Состояние для открытого изображения ---
  const [openImage, setOpenImage] = useState(null);

  useEffect(() => {
    loadRefs(); // Загружаем справочники
    loadTask();
  }, [id]);

  // --- Функция для загрузки вложений отчётов ---
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

  // --- НОВАЯ ФУНКЦИЯ: Загрузка справочников ---
  async function loadRefs() {
    try {
      const [eqRes, wtRes] = await Promise.allSettled([
        getAdminEquipmentList(),
        getAdminWorkTypesList(),
      ]);
      setEquipmentList(eqRes.status === 'fulfilled' ? eqRes.value || [] : []);
      setWorkTypesList(wtRes.status === 'fulfilled' ? wtRes.value || [] : []);
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



  async function loadTask() {
    setLoading(true);
    setError(null);
    try {
      const data = await adminCompletedTaskDetail(id); // Вызываем API метод

      // Обработка данных, если нужно (например, для equipment и work_types)
      // const processedEquipment = (data.equipment || []).map(e => ({ ... }));
      // const processedWorkTypes = (data.work_types || []).map(wt => ({ ... }));
      const t = {
        ...data,
        // equipment: processedEquipment,
        // work_types: processedWorkTypes,
        reports: data.reports || [],
      };

      setTask(t);

      // --- НОВОЕ: Загрузка вложений для всех отчётов ---
      if (t.reports) {
        t.reports.forEach(r => {
          loadReportAttachments(r.id);
        });
      }

    } catch (err) {
      console.error("Ошибка загрузки завершенной задачи администратора:", err);
      setError(err.response?.data?.detail || err.message || "Ошибка загрузки задачи");
      if (err.response?.status === 403 || err.response?.status === 404) {
        // Перенаправляем на профиль, если доступа нет или задача не найдена
        navigate("/admin/profile");
      }
    } finally {
      setLoading(false);
    }
  }

  // --- Обработчики для модального окна ---
  const handleImageClick = (imageUrl) => {
    setOpenImage(imageUrl);
  };

  const closeModal = () => {
    setOpenImage(null);
  };

  if (loading) return <div className="logist-main"><div className="empty">Загрузка задачи #{id}...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;
  if (!task) return <div className="logist-main"><div className="empty">Задача не найдена</div></div>;

  // --- Функции для отображения имён ---
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
            <p><b>Цена клиента:</b> {task.client_price || "—"}</p>
            <p><b>Награда монтажнику:</b> {task.montajnik_reward || "—"}</p>

            {/* === Оборудование (с именами) === */}
            <p>
              <b>Оборудование:</b>{" "}
              {(task.equipment || [])
                .map((e) => {
                  const eqName = getEquipmentNameById(e.equipment_id);
                  return `${eqName} x${e.quantity} (СН: ${e.serial_number || 'N/A'})`;
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
              <button className="add-btn" onClick={() => navigate(`/admin/tasks/${task.id}/history`)}>
                Подробнее
              </button>
            </div>

            {/* === Отчёты === */}
            <div className="section">
              <h3>Отчёты монтажника</h3>
              {(task.reports && task.reports.length > 0) ? (
                task.reports.map(r => {
                  // --- ИЗМЕНЕНО: Извлечение выполненных работ и комментария ---
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

                  // --- ИЗМЕНЕНО: Получение вложений из reportAttachmentsMap ---
                  const reportAttachments = reportAttachmentsMap[r.id] || [];
                  const reportAttachmentsLoading = !reportAttachmentsMap.hasOwnProperty(r.id);

                  return (
                    <div key={r.id} className="report">
                      {/* #37: Выполнено: {типы работ} */}
                      <p>
                        <b>#{r.id}:</b> {performedWorks ? `Выполнено: ${performedWorks}` : "Нет выполненных работ"}
                      </p>
                      {/* С новой строки — комментарий монтажника */}
                      {comment && (
                        <p>{comment}</p>
                      )}
                       <p>
        <b>Логист:</b> {getReportApprovalDisplayName(r.approval_logist) || "—"} {/* <--- Используем новую функцию */}
        {task.requires_tech_supp === true && (
          <>
            {" "} | <b>Тех.спец:</b> {getReportApprovalDisplayName(r.approval_tech) || "—"} {/* <--- Используем новую функцию */}
          </>
        )}
      </p>
                      {/* СО СЛЕДУЮЩЕЙ СТРОКИ — вложения */}
                      {reportAttachmentsLoading ? (
                        <p>Загрузка вложений...</p>
                      ) : reportAttachments.length > 0 ? (
                        <div className="attached-list">
                          {reportAttachments.map((att, idx) => {
                            // --- ИЗМЕНЕНО: Используем presigned_url или getAttachmentUrl ---
                            const originalUrl = att.presigned_url || getAttachmentUrl(att.storage_key);
                            const thumbUrl = att.thumb_key
                              ? getAttachmentUrl(att.thumb_key) // <--- Используем миниатюру
                              : originalUrl; // <--- Или оригинал

                            return (
                              // --- ИЗМЕНЕНО: Убираем <a> и оборачиваем img в div с onClick ---
                              <div
                                key={att.id}
                                style={{ cursor: 'zoom-in' }} // Меняем курсор
                                onClick={() => handleImageClick(originalUrl)} // Обработчик клика
                              >
                                <img
                                  src={thumbUrl} // <--- Отображаем миниатюру
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
                    </div>
                  );
                })
              ) : (
                <div className="empty">Отчётов нет</div>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* --- Рендерим модальное окно --- */}
      <ImageModal
        isOpen={!!openImage} // Передаём true/false
        onClose={closeModal}
        imageUrl={openImage} // Передаём URL изображения
        altText="Вложение отчёта" // Опционально: текст по умолчанию
      />
    </div>
  );
}