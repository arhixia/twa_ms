import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllDrafts, deleteDraft } from "../../api";
import TaskCard from "../../components/TaskCard";
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

  const transformDraftToTaskFormat = (draft) => {
    const clientName = draft.client_name || draft.client || "—";
    
    return {
      ...draft,
      status: "draft",
      client_name: clientName,
    };
  };

  return (
    <div className="logist-main">
      <div className="page">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
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
              background: 'linear-gradient(135deg, #10b981, #2563eb)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus" viewBox="0 0 16 16">
  <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4" stroke="currentColor" strokeWidth="2" fill="none"/>
</svg>
            Новый черновик
          </button>
        </div>

        {loading ? (
          <div className="empty">Загрузка...</div>
        ) : drafts.length === 0 ? (
          <div className="empty">Черновиков пока нет — создайте новый.</div>
        ) : (
          <div className="cards">
            {drafts.map((d) => {
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