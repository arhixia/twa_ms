// front/src/components/FileUploader.jsx
import React, { useState, useEffect } from "react";
import { uploadFallback, deletePendingAttachment } from "../api";

export default function FileUploader({ onUploaded, onUploading, onUploadError, onRemoved, taskId, reportId = null, maxFiles = 15 }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // При изменении reportId можно обновить существующие файлы, если нужно
  }, [reportId]);

  async function handleFile(e) {
    const selectedFiles = Array.from(e.target.files); // Получаем все выбранные файлы
    if (selectedFiles.length === 0) return;

    // Проверяем количество файлов
    if (files.length + selectedFiles.length > maxFiles) {
      const remainingSlots = maxFiles - files.length;
      if (remainingSlots <= 0) {
        alert("⚠️ Достигнут лимит файлов");
        return;
      }
      // Ограничиваем количество файлов до оставшихся слотов
      selectedFiles.splice(remainingSlots);
    }

    const newFilesToProcess = [];

    for (const f of selectedFiles) {
      if (!["image/jpeg", "image/png", "image/webp", "image/jpg"].includes(f.type)) {
        alert(`❌ Файл ${f.name} неподдерживаемого типа`);
        continue;
      }

      const preview = URL.createObjectURL(f);
      const fileId = `tmp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const placeholder = {
        id: fileId,
        name: f.name, // Добавим имя файла для информации
        preview,
        uploading: true,
        uploadProgress: 0,
        error: null,
      };
      newFilesToProcess.push({ file: f, placeholder });
    }

    if (newFilesToProcess.length === 0) return; // Нет подходящих файлов

    if (!taskId) {
      alert("❌ Невозможно загрузить файлы: задача не создана");
      return;
    }

    // Добавляем все подготовленные файлы в состояние
    setFiles((s) => [...s, ...newFilesToProcess.map(item => item.placeholder)]);
    setLoading(true);

    // Загружаем каждый файл асинхронно
    for (const { file, placeholder } of newFilesToProcess) {
      if (onUploading) onUploading(placeholder.id);

      try {
        const res = await uploadFallback(file, taskId, reportId);
        console.log("[DEBUG] uploadFallback response:", res);

        const item = {
          id: res.attachment_id,
          tmpId: placeholder.id,      // Сохраняем временный ID
          storage_key: res.storage_key,
          name: file.name,
          preview: placeholder.preview,
          uploading: false
        };

        setFiles((s) => s.map(x => (x.id === placeholder.id ? item : x)));
        if (onUploaded) onUploaded(item);
      } catch (err) {
        console.error(err);
        const errorMsg = err.response?.data?.detail || err.message || "Ошибка загрузки";
        setFiles((s) => s.map(x => (x.id === placeholder.id ? { ...x, uploading: false, error: errorMsg } : x)));
        if (onUploadError) onUploadError(placeholder.id, errorMsg);
      }
    }

    setLoading(false);
    // Сбросим input, чтобы можно было снова выбрать те же файлы
    e.target.value = '';
  }

  const removeLocal = async (id) => {
    const fileToRemove = files.find(f => f.id === id);
    if (!fileToRemove) return;

    // Если файл уже загружен (id - это attachment_id, а не tmp-id)
    if (fileToRemove.id && fileToRemove.storage_key) {
      try {
        // Вызываем эндпоинт удаления
        await deletePendingAttachment(fileToRemove.storage_key);
        console.log(`[DEBUG] Attachment deleted from DB and S3: ${fileToRemove.storage_key}`);
        // Сообщаем родителю об удалении
        if (onRemoved) onRemoved(fileToRemove.storage_key);
      } catch (err) {
        console.error("Ошибка удаления вложения из БД/S3:", err);
        alert(`Ошибка удаления вложения: ${err.response?.data?.detail || err.message}`);
        return; // Не удаляем из UI, если удаление из БД/S3 не удалось
      }
    }

    // Удаляем из локального состояния
    setFiles((s) => s.filter((x) => x.id !== id));
  };

  return (
    <div className="uploader">
      <label className="uploader-label">
        + Загрузить фото
        <input
          type="file"
          accept="image/*"
          onChange={handleFile}
          disabled={loading || !taskId}
          multiple // <--- ДОБАВЛЕН АТРИБУТ multiple
        />
      </label>

      <div className="thumbs">
        {files.map((f) => (
          <div className="thumb" key={f.id}>
            <img src={f.preview} alt={f.name || "preview"} />
            {f.uploading && (
              <div className="upload-progress-overlay">
                <div className="spinner"></div>
              </div>
            )}
            {f.error && (
              <div className="upload-error-message">
                <span style={{ color: 'red', fontSize: '0.8em' }}>{f.error}</span>
              </div>
            )}
            {/* --- Кнопка удаления появляется только если НЕ загружается --- */}
            {!f.uploading && (
              <button className="thumb-remove" onClick={() => removeLocal(f.id)}>
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Стили ---
const styles = `
  .thumb {
    position: relative;
    display: inline-block;
    margin: 4px;
  }
  .upload-progress-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgba(0, 0, 0, 0.5);
    border-radius: inherit;
  }
  .spinner {
    width: 30px;
    height: 30px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top: 3px solid #ffffff;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
  .upload-error-message {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: rgba(255, 0, 0, 0.7);
    color: white;
    padding: 2px;
    font-size: 0.7em;
    text-align: center;
    border-bottom-left-radius: inherit;
    border-bottom-right-radius: inherit;
  }
  .thumb-remove {
    position: absolute;
    top: 2px;
    right: 2px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    border: none;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
  }
`;

const styleSheet = document.createElement("style");
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);