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
      <label className="uploader-label" style={{ 
        display: 'block', 
        padding: '8px 12px', 
        backgroundColor: '#161b22', 
        border: '1px solid #30363d', 
        borderRadius: '4px', 
        cursor: 'pointer',
        color: 'white',
        textAlign: 'center',
        fontSize: '14px',
        marginBottom: '8px'
      }}>
        + Загрузить фото
        <input
          type="file"
          accept="image/*"
          onChange={handleFile}
          disabled={loading || !taskId}
          multiple // <--- ДОБАВЛЕН АТРИБУТ multiple
          style={{ display: 'none' }} // Скрываем оригинальный input
        />
      </label>

      <div className="thumbs" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
        {files.map((f) => (
          <div className="thumb" key={f.id} style={{ 
            position: 'relative', 
            width: '80px', 
            height: '80px', 
            border: '1px solid #30363d',
            borderRadius: '4px',
            overflow: 'hidden'
          }}>
            <img 
              src={f.preview} 
              alt={f.name || "preview"} 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {f.uploading && (
              <div className="upload-progress-overlay" style={{ 
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                borderRadius: 'inherit'
              }}>
                <div className="spinner" style={{ 
                  width: '20px',
                  height: '20px',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTop: '2px solid #ffffff',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
              </div>
            )}
            {f.error && (
              <div className="upload-error-message" style={{ 
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: 'rgba(255, 0, 0, 0.7)',
                color: 'white',
                padding: '2px',
                fontSize: '0.7em',
                textAlign: 'center',
                borderBottomLeftRadius: 'inherit',
                borderBottomRightRadius: 'inherit',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                <span>{f.error}</span>
              </div>
            )}
            {/* --- Кнопка удаления появляется только если НЕ загружается --- */}
            {!f.uploading && (
              <button 
                className="thumb-remove" 
                onClick={() => removeLocal(f.id)}
                style={{
                  position: 'absolute',
                  top: '2px',
                  right: '2px',
                  background: 'rgba(0, 0, 0, 0.7)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '50%',
                  width: '16px',
                  height: '16px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  padding: 0
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}