import React, { useEffect, useState } from "react";
import { getAssignedTasks, acceptTask, rejectTask } from "../../api";
import TaskCard from "../../components/TaskCard";

export default function AssignedTasksPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [rejectTaskId, setRejectTaskId] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await getAssignedTasks();
      setTasks(res);
    } catch (e) {
      console.error("Ошибка загрузки назначенных задач:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept(taskId) {
    setActionLoading(taskId);
    try {
      await acceptTask(taskId);
      await load();
    } catch (e) {
      console.error("Ошибка при принятии задачи:", e);
    } finally {
      setActionLoading(null);
    }
  }

  function openRejectModal(taskId) {
    setRejectTaskId(taskId);
    setRejectComment("");
    setShowRejectModal(true);
  }

  async function handleRejectConfirm() {
    if (!rejectTaskId) return;
    setActionLoading(rejectTaskId);
    try {
      await rejectTask(rejectTaskId, rejectComment || null);
      setShowRejectModal(false);
      setRejectComment("");
      setRejectTaskId(null);
      await load();
    } catch (err) {
      console.error(err);
      alert("Ошибка при отклонении задачи");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Назначенные задачи</h1>
      </div>

      <div className="cards">
        {loading ? (
          <div>Загрузка...</div>
        ) : tasks.length ? (
          tasks.map((task) => (
            <div
  key={task.id}
  className="task-card-wrapper"
  style={{
    position: "relative",
    marginBottom: "16px",
    borderRadius: "12px",
    overflow: "hidden",
    boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    minHeight: "150px", // фиксированная высота
  }}
>
  <TaskCard task={task} />

  {/* Кнопки */}
  <div
    className="task-actions"
    style={{
      display: "flex",
      justifyContent: "space-between",
      padding: "8px",
      background: "#121212",
      marginTop: "auto", // обязательно, чтобы кнопки прижимались к низу
    }}
  >
    <button
      disabled={actionLoading === task.id}
      onClick={() => openRejectModal(task.id)}
      style={{
        backgroundColor: "#dc3545",
        color: "white",
        padding: "8px 16px",
        borderRadius: "12px",
        flex: 1,
        marginRight: "8px",
        fontWeight: "bold",
        cursor: actionLoading === task.id ? "not-allowed" : "pointer",
      }}
    >
      {actionLoading === task.id ? "..." : "Отклонить"}
    </button>
    <button
      disabled={actionLoading === task.id}
      onClick={() => handleAccept(task.id)}
      style={{
        backgroundColor: "#28a745",
        color: "white",
        padding: "8px 16px",
        borderRadius: "12px",
        flex: 1,
        marginLeft: "8px",
        fontWeight: "bold",
        cursor: actionLoading === task.id ? "not-allowed" : "pointer",
      }}
    >
      {actionLoading === task.id ? "..." : "Принять"}
    </button>
  </div>
</div>
          ))
        ) : (
          <div className="empty">Нет назначенных задач</div>
        )}
      </div>

      {/* Модалка отклонения */}
      {showRejectModal && (
        <div
          className="modal-backdrop"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
          }}
        >
          <div
            className="modal"
            style={{
              maxWidth: "500px",
              background: "#0d1117",
              borderRadius: "8px",
              padding: "16px",
              color: "white",
            }}
          >
            <div
              className="modal-header"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <h3>Отклонить задачу #{rejectTaskId}</h3>
              <button
                className="close"
                onClick={() => setShowRejectModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  fontSize: "1.5em",
                  color: "white",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>

            <div className="modal-body" style={{ marginTop: "8px" }}>
              <label style={{ display: "block", color: "white" }}>
                Причина отклонения (необязательно):
                <textarea
                  value={rejectComment}
                  onChange={(e) => setRejectComment(e.target.value)}
                  placeholder="Можно оставить пустым..."
                  style={{
                    width: "100%",
                    minHeight: "80px",
                    backgroundColor: "#1a1a1a",
                    color: "white",
                    border: "1px solid #30363d",
                    borderRadius: "8px",
                    padding: "8px",
                    marginTop: "4px",
                  }}
                />
              </label>
            </div>

            <div
              className="modal-actions"
              style={{
                marginTop: "12px",
                display: "flex",
                justifyContent: "flex-end",
                gap: "8px",
              }}
            >
              <button
                className="primary"
                onClick={handleRejectConfirm}
                disabled={actionLoading === rejectTaskId}
                style={{
                  background: "#b60205",
                  color: "white",
                  padding: "6px 12px",
                  borderRadius: "4px",
                }}
              >
                {actionLoading === rejectTaskId ? "..." : "Подтвердить"}
              </button>
              <button
                onClick={() => setShowRejectModal(false)}
                style={{
                  background: "#444",
                  color: "white",
                  padding: "6px 12px",
                  borderRadius: "4px",
                }}
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
