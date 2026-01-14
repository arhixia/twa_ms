import React, { useState, useEffect } from "react";
import { uploadFallback, deletePendingAttachment } from "../api";

// Функция для сжатия изображения
async function compressImage(file, maxWidth = 1024, maxHeight = 1024, quality = 0.7) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = () => {
            // Вычисляем новые размеры, сохраняя пропорции
            let { width, height } = img;
            if (width > height) {
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = (width * maxHeight) / height;
                    height = maxHeight;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            
            // Рисуем изображение на canvas с сглаживанием
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            
            // Конвертируем обратно в Blob
            canvas.toBlob(resolve, 'image/jpeg', quality);
        };
        
        img.src = URL.createObjectURL(file);
    });
}

export default function FileUploader({ onUploaded, onUploading, onUploadError, onRemoved, taskId, reportId = null, maxFiles = 15 }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
 

  useEffect(() => {
    // При изменении reportId можно обновить существующие файлы, если нужно
  }, [reportId]);

  async function handleFile(e) {
    const selectedFiles = Array.from(e.target.files);
    
    if (selectedFiles.length === 0) return;

    // Проверяем количество файлов
    if (files.length + selectedFiles.length > maxFiles) {
        const remainingSlots = maxFiles - files.length;
        if (remainingSlots <= 0) {
            if (window.Telegram?.WebApp) {
                window.Telegram.WebApp.showAlert("⚠️ Достигнут лимит файлов");
            } else {
                alert("⚠️ Достигнут лимит файлов");
            }
            return;
        }
        selectedFiles.splice(remainingSlots);
    }

    const newFilesToProcess = [];

    for (const f of selectedFiles) {
        // Проверяем тип файла
        if (!["image/jpeg", "image/png", "image/webp", "image/jpg"].includes(f.type)) {
            if (window.Telegram?.WebApp) {
                window.Telegram.WebApp.showAlert(`❌ Файл ${f.name} неподдерживаемого типа`);
            } else {
                alert(`❌ Файл ${f.name} неподдерживаемого типа`);
            }
            continue;
        }

        // Сжимаем изображение
        try {
            console.log(`[COMPRESS] Original: ${f.name}, size: ${(f.size/1024).toFixed(1)}KB, type: ${f.type}`);
            
            let compressedFile = f;
            
            // Для PNG конвертируем в JPEG
            if (f.type === 'image/png') {
                compressedFile = await compressImage(f, 1024, 1024, 0.7);
                compressedFile.name = f.name.replace(/\.[^/.]+$/, ".jpg"); // меняем расширение
            } else {
                compressedFile = await compressImage(f, 1024, 1024, 0.7);
                compressedFile.name = f.name;
            }
            
            console.log(`[COMPRESS] After 1st compression: ${(compressedFile.size/1024).toFixed(1)}KB`);
            
            // Проверяем размер и при необходимости сжимаем дальше
            let quality = 0.7;
            let maxWidth = 1024;
            
            // Если все еще больше 200KB, пробуем уменьшить качество и размер
            while (compressedFile.size > 200 * 1024 && (quality > 0.2 || maxWidth > 640)) {
                if (quality > 0.2) {
                    quality -= 0.1;
                } else if (maxWidth > 640) {
                    maxWidth -= 128;
                }
                
                compressedFile = await compressImage(f, maxWidth, maxWidth, quality);
                console.log(`[COMPRESS] Retry: size=${(compressedFile.size/1024).toFixed(1)}KB, quality=${quality}, max=${maxWidth}`);
            }
            
            // Финальная проверка
            if (compressedFile.size > 200 * 1024) {
                if (window.Telegram?.WebApp) {
                    window.Telegram.WebApp.showAlert(`❌ Файл ${f.name} после сжатия все равно слишком большой (${(compressedFile.size/1024).toFixed(1)}KB). Максимум: 200KB`);
                } else {
                    alert(`❌ Файл ${f.name} после сжатия все равно слишком большой (${(compressedFile.size/1024).toFixed(1)}KB). Максимум: 200KB`);
                }
                continue;
            }

            // Создаем превью
            const preview = URL.createObjectURL(compressedFile);
            const fileId = `tmp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const placeholder = {
                id: fileId,
                name: compressedFile.name,
                preview,
                uploading: true,
                uploadProgress: 0,
                error: null,
            };
            newFilesToProcess.push({ file: compressedFile, placeholder });
        } catch (error) {
            console.error('Error compressing file:', error);
            if (window.Telegram?.WebApp) {
                window.Telegram.WebApp.showAlert(`❌ Ошибка сжатия файла ${f.name}`);
            }
            continue;
        }
    }

    if (newFilesToProcess.length === 0) return;

    if (!taskId) {
        if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.showAlert("❌ Невозможно загрузить файлы: задача не создана");
        } else {
            alert("❌ Невозможно загрузить файлы: задача не создана");
        }
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
                tmpId: placeholder.id,
                storage_key: res.storage_key,
                name: file.name,
                preview: placeholder.preview,
                uploading: false
            };

            setFiles((s) => s.map(x => (x.id === placeholder.id ? item : x)));
            if (onUploaded) onUploaded(item);
        } catch (err) {
            console.error('Upload error:', err);
            
            let errorMsg = 'Ошибка загрузки';
            if (err.response?.status === 413) {
                errorMsg = 'Файл слишком большой';
            } else if (err.response?.status === 401 || err.response?.status === 403) {
                errorMsg = 'Ошибка авторизации';
            } else if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
                errorMsg = 'Время ожидания истекло';
            } else if (err.response?.data?.detail) {
                errorMsg = err.response.data.detail;
            }
            
            setFiles((s) => s.map(x => (x.id === placeholder.id ? { ...x, uploading: false, error: errorMsg } : x)));
            if (onUploadError) onUploadError(placeholder.id, errorMsg);
        }
    }

    setLoading(false);
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
          multiple
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