import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllDrafts, deleteDraft } from "../../api";
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

  return (
    <div className="page">
      <div className="page-header">
        <h1>Черновики</h1>
        <button className="add-btn" onClick={() => setOpen(true)}>
          ➕ Новый черновик
        </button>
      </div>

      {loading ? (
        <div>Загрузка...</div>
      ) : drafts.length === 0 ? (
        <div className="empty">Черновиков пока нет — создайте новый.</div>
      ) : (
        <div className="cards">
          {drafts.map((d) => (
            <div key={d.id} className="task-card" onClick={() => navigate(`/logist/drafts/${d.id}`)}>
              <div className="task-row">
                <div className="task-title">
                  #{d.id} — {d.client || "Без клиента"}
                </div>
              </div>
              <div className="task-meta">
                {d.scheduled_at ? new Date(d.scheduled_at).toLocaleString() : "—"}
              </div>
              <button
                className="delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(d.id);
                }}
              >
                🗑
              </button>
            </div>
          ))}
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
  );
}
