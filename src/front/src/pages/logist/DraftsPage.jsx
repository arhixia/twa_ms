import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllDrafts, deleteDraft } from "../../api";
import TaskCard from "../../components/TaskCard"; // Импортируем TaskCard
import AddTaskModal from "./_AddTaskModal";
import "../../styles/LogistPage.css";

export default function DraftsPage() {
  const [drafts, setDrafts] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadDrafts();
  }, []);

  async function loadDrafts() {
    setLoading(true);
    try {
      const res = await getAllDrafts();
      setDrafts(res || []);
    } catch (e) {
      console.error("Ошибка загрузки черновиков", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Удалить черновик?")) return;
    try {
      await deleteDraft(id);
      await loadDrafts();
    } catch (e) {
      console.error(e);
      alert("Ошибка удаления");
    }
  }

  const handleTaskCardClick = (task) => {
    navigate(`/logist/drafts/${task.id}`);
  };

  // Функция для преобразования данных черновика в формат, подходящий для TaskCard
  const transformDraftToTaskFormat = (draft) => {
    // Используем client_name как в других компонентах, если в данных есть client
    const clientName = draft.client_name || draft.client || "—";
    
    return {
      ...draft,
      status: "draft", // Добавляем статус для отображения в TaskCard
      client_name: clientName, // Убедимся, что используем правильное поле
    };
  };

  return (
    <div className="logist-main">
      <div className="page">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: '20px' }}>
          <h1 className="page-title">Черновики</h1>
          <button 
            onClick={() => setOpen(true)}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: '600',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              background: 'linear-gradient(135deg, #10b981, #2563eb)', // зелёно-синий градиент
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '10px'
            }}
          >
            ➕ Новый черновик
          </button>
        </div>

        {loading ? (
          <div className="empty">Загрузка...</div>
        ) : drafts.length === 0 ? (
          <div className="empty">Черновиков пока нет — создайте новый.</div>
        ) : (
          <div className="cards">
            {drafts.map((d) => {
              // Преобразуем черновик в формат задачи
              const taskFormat = transformDraftToTaskFormat(d);
              
              return (
                <TaskCard 
                  key={d.id} 
                  task={taskFormat} 
                  onClick={handleTaskCardClick}
                  onDelete={handleDelete}
                />
              );
            })}
          </div>
        )}

        {open && (
          <AddTaskModal
            open={true}
            onClose={() => setOpen(false)}
            onSaved={() => {
              setOpen(false);
              loadDrafts();
            }}
            allowSaveOnlyDraft={true}
          />
        )}
      </div>
    </div>
  );
}