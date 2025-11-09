// front/src/pages/montajnik/AvailableTaskDetailPage.jsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { fetchAvailableMontTaskDetail, acceptTask, getEquipmentList, getWorkTypes } from "../../api";
// ✅ Импортируем функции для получения данных о компаниях и контактных лицах и телефона
import { getMontCompaniesList, getMontContactPersonsByCompany, getMontContactPersonPhone } from "../../api"; // Убедитесь, что путь верный
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
  // ✅ Состояние для хранения телефона контактного лица
  const [contactPersonPhone, setContactPersonPhone] = useState(null); // <--- Добавлено

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
            <p><b>Статус:</b> {task.status || "—"}</p>
            <p><b>Комментарий:</b> {task.comment || "—"}</p>
            <p><b>Монтажник:</b> {task.assigned_user_name || task.assigned_user_id || "—"}</p>
            <p><b>Награда за работу:</b> {task.montajnik_reward || "—"}</p>
            
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
            

            <div className="section">
              <h3>История</h3>
              <button className="add-btn" onClick={() => navigate(`/montajnik/tasks/${id}/history`)}>
                Подробнее
              </button>
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