import React, { useState, useEffect } from "react";
import { uploadFallback } from "../api";

export default function FileUploader({ onUploaded, onPending, taskId, reportId, maxFiles = 15 }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  // Обновляемся, когда меняется reportId
  useEffect(() => {
    // При изменении reportId можно обновить существующие файлы, если нужно
  }, [reportId]);

  async function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;

    if (!["image/jpeg", "image/png", "image/webp", "image/jpg"].includes(f.type)) {
      alert("❌ Неподдерживаемый тип файла");
      return;
    }

    if (files.length >= maxFiles) {
      alert("⚠️ Достигнут лимит файлов");
      return;
    }

    const preview = URL.createObjectURL(f);
    const placeholder = { id: `tmp-${Date.now()}`, preview, uploading: true };
    setFiles((s) => [...s, placeholder]);

    // если задача ещё не создана — просто кладём файл в pendingUploads
    if (!taskId) {
      onPending && onPending(f);
      setFiles((s) =>
        s.map((x) =>
          x.id === placeholder.id ? { ...x, uploading: false, pending: true } : x
        )
      );
      return;
    }

    setLoading(true);
    try {
      // Используем обновлённую функцию с reportId
      const res = await uploadFallback(f, taskId, reportId);
      
      const item = { id: res.attachment_id, storage_key: res.storage_key, preview };
      setFiles((s) => s.map((x) => (x.id === placeholder.id ? item : x)));
      onUploaded && onUploaded(item);
    } catch (err) {
      console.error(err);
      alert("Ошибка загрузки: " + (err.response?.data?.detail || err.message));
      setFiles((s) => s.filter((x) => x.id !== placeholder.id));
    } finally {
      setLoading(false);
    }
  }

  const removeLocal = (id) => {
    setFiles((s) => s.filter((x) => x.id !== id));
  };

  return (
    <div className="uploader">
      <label className="uploader-label">
        + Загрузить фото
        <input type="file" accept="image/*" onChange={handleFile} disabled={loading} />
      </label>

      <div className="thumbs">
        {files.map((f) => (
          <div className="thumb" key={f.id}>
            <img src={f.preview} alt="preview" />
            {f.uploading && <span className="loading">⏳</span>}
            {f.pending && <span className="pending">🕓 (ожидание задачи)</span>}
            <button className="thumb-remove" onClick={() => removeLocal(f.id)}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}