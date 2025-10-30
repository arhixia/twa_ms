// front/src/pages/admin/EditTaskModal.jsx
import React, { useState, useEffect } from 'react';
import { adminUpdateTask, getEquipmentList, getWorkTypes } from '../api';

function EditTaskModal({ task, onClose, onSave }) {
  const [formData, setFormData] = useState({
    scheduled_at: task.scheduled_at || '',
    location: task.location || '',
    client: task.client || '',
    vehicle_info: task.vehicle_info || '',
    comment: task.comment || '',
    client_price: task.client_price || '',
    montajnik_reward: task.montajnik_reward || '',
    assignment_type: task.assignment_type || 'broadcast',
    assigned_user_id: task.assigned_user_id || '',
    equipment_ids: task.equipment?.map(e => e.equipment_id) || [],
    work_types_ids: task.work_types || [],
  });

  const [equipment, setEquipment] = useState([]);
  const [workTypes, setWorkTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRefs() {
      try {
        const eq = await getEquipmentList();
        const wt = await getWorkTypes();
        setEquipment(eq || []);
        setWorkTypes(wt || []);
      } catch (err) {
        alert('Ошибка загрузки справочников');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadRefs();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSelectChange = (e, field) => {
    const options = Array.from(e.target.selectedOptions, (o) => Number(o.value));
    setFormData({ ...formData, [field]: options });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        equipment: (formData.equipment_ids || []).map(id => ({ equipment_id: id, quantity: 1 })),
        work_types: formData.work_types_ids || [],
      };
      // Удаляем лишние поля
      delete payload.equipment_ids;
      delete payload.work_types_ids;

      const updatedTask = await adminUpdateTask(task.id, payload);
      onSave(updatedTask);
    } catch (err) {
      alert('Ошибка при обновлении задачи');
    }
  };

  if (loading) return <div className="modal-body">Загрузка...</div>;

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h3>Редактировать задачу #{task.id}</h3>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-grid">
            <label>
              Клиент
              <input type="text" name="client" value={formData.client} onChange={handleChange} />
            </label>
            <label>
              ТС
              <input type="text" name="vehicle_info" value={formData.vehicle_info} onChange={handleChange} />
            </label>
            <label>
              Дата и время
              <input
                type="datetime-local"
                name="scheduled_at"
                value={formData.scheduled_at?.replace('Z', '') || ''}
                onChange={handleChange}
              />
            </label>
            <label>
              Место
              <input type="text" name="location" value={formData.location} onChange={handleChange} />
            </label>
            <label className="full-row">
              Комментарий
              <textarea name="comment" value={formData.comment} onChange={handleChange}></textarea>
            </label>
            <label>
              Цена клиента
              <input type="number" step="0.01" name="client_price" value={formData.client_price} onChange={handleChange} />
            </label>
            <label>
              Награда монтажнику
              <input type="number" step="0.01" name="montajnik_reward" value={formData.montajnik_reward} onChange={handleChange} />
            </label>
            <label>
              Тип назначения
              <select name="assignment_type" value={formData.assignment_type} onChange={handleChange}>
                <option value="broadcast">broadcast</option>
                <option value="individual">individual</option>
              </select>
            </label>
            <label>
              ID монтажника (если individual)
              <input type="number" name="assigned_user_id" value={formData.assigned_user_id} onChange={handleChange} />
            </label>

            <label>
              Оборудование
              <select
                multiple
                value={formData.equipment_ids || []}
                onChange={(e) => handleSelectChange(e, 'equipment_ids')}
              >
                {equipment.map(eq => (
                  <option key={eq.id} value={eq.id}>{eq.name}</option>
                ))}
              </select>
            </label>

            <label>
              Виды работ
              <select
                multiple
                value={formData.work_types_ids || []}
                onChange={(e) => handleSelectChange(e, 'work_types_ids')}
              >
                {workTypes.map(wt => (
                  <option key={wt.id} value={wt.id}>{wt.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="primary">Сохранить</button>
            <button type="button" onClick={onClose}>Отмена</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditTaskModal;