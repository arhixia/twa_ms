import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminEquipmentList,
  adminAddEquipment,
  getAdminWorkTypesList,
  adminAddWorkType,
} from "../../api";
import "../../styles/LogistPage.css";

export default function AdminWorkPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Состояния для оборудования
  const [showAddEquipmentModal, setShowAddEquipmentModal] = useState(false);
  const [newEquipmentName, setNewEquipmentName] = useState("");
  const [newEquipmentCategory, setNewEquipmentCategory] = useState("");
  const [newEquipmentPrice, setNewEquipmentPrice] = useState("");
  const [categories, setCategories] = useState([]);
  const [equipments, setEquipments] = useState([]);

  // Состояния для видов работ
  const [showAddWorkTypeModal, setShowAddWorkTypeModal] = useState(false);
  const [newWorkTypeName, setNewWorkTypeName] = useState("");
  const [newWorkTypePrice, setNewWorkTypePrice] = useState("");
  const [newWorkTypeTechSupp, setNewWorkTypeTechSupp] = useState(false);
  const [workTypes, setWorkTypes] = useState([]);

  useEffect(() => {
    loadRefs();
    loadWorkTypes();
    loadEquipment();
  }, []);

  async function loadRefs() {
    try {
      setLoading(true);
      const eqRes = await getAdminEquipmentList();
      const equipmentList = eqRes || [];
      const uniqueCategories = [...new Set(equipmentList.map((e) => e.category))];
      setCategories(uniqueCategories);
    } catch (e) {
      console.error("Ошибка загрузки справочников:", e);
      setError("Ошибка загрузки справочников");
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkTypes() {
    try {
      setLoading(true);
      const data = await getAdminWorkTypesList();
      setWorkTypes(data || []);
    } catch (err) {
      console.error("Ошибка загрузки видов работ:", err);
      setError("Ошибка загрузки видов работ");
    } finally {
      setLoading(false);
    }
  }

  async function loadEquipment() {
    try {
      setLoading(true);
      const data = await getAdminEquipmentList();
      setEquipments(data || []);
    } catch (err) {
      console.error("Ошибка загрузки оборудования:", err);
      setError("Ошибка загрузки оборудования");
    } finally {
      setLoading(false);
    }
  }

  const handleAddEquipment = async () => {
    if (!newEquipmentName.trim() || !newEquipmentCategory.trim() || !newEquipmentPrice.trim()) {
      alert("Заполните все поля");
      return;
    }
    const priceNum = parseFloat(newEquipmentPrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      alert("Цена должна быть положительной");
      return;
    }
    try {
      const result = await adminAddEquipment({
        name: newEquipmentName.trim(),
        category: newEquipmentCategory.trim(),
        price: priceNum,
      });
      alert(`Оборудование "${result.name}" добавлено`);
      setNewEquipmentName("");
      setNewEquipmentCategory("");
      setNewEquipmentPrice("");
      setShowAddEquipmentModal(false);
      loadRefs(); // Перезагрузим категории
      loadEquipment(); // Перезагрузим список
    } catch (err) {
      alert(err.response?.data?.detail || "Ошибка добавления оборудования");
    }
  };

  const handleAddWorkType = async () => {
    if (!newWorkTypeName.trim() || !newWorkTypePrice.trim()) {
      alert("Заполните все поля");
      return;
    }
    const priceNum = parseFloat(newWorkTypePrice);
    if (isNaN(priceNum) || priceNum <= 0) {
      alert("Цена должна быть положительной");
      return;
    }
    try {
      const result = await adminAddWorkType({
        name: newWorkTypeName.trim(),
        price: priceNum,
        tech_supp_require: newWorkTypeTechSupp,
      });
      alert(`Вид работы "${result.name}" добавлен`);
      setNewWorkTypeName("");
      setNewWorkTypePrice("");
      setNewWorkTypeTechSupp(false);
      setShowAddWorkTypeModal(false);
      loadWorkTypes(); // Перезагрузим список
    } catch (err) {
      alert(err.response?.data?.detail || "Ошибка добавления вида работы");
    }
  };

  if (loading) return <div className="logist-main"><div className="empty">Загрузка...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1>Работа</h1>
          <button className="add-btn" onClick={() => navigate(-1)}> ⬅️ Назад</button>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button className="add-btn" onClick={() => setShowAddEquipmentModal(true)}>+ Оборудование</button>
          <button className="add-btn" onClick={() => setShowAddWorkTypeModal(true)}>+ Вид работ</button>
        </div>

        {/* === Оборудование === */}
        <div className="section">
          <h3>Оборудование</h3>
          {equipments.length > 0 ? (
            <div className="history-list">
              {equipments.map(eq => (
                <div key={eq.id} className="history-item" style={{ padding: "8px", borderBottom: "1px solid #30363d" }}>
                  <p><b>{eq.name}</b></p>
                  <p>Категория: {eq.category || "—"}</p>
                  <p>Цена: {eq.price || "—"}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">Список оборудования пуст</div>
          )}
        </div>

        {/* === Виды работ === */}
        <div className="section">
          <h3>Виды работ</h3>
          {workTypes.length > 0 ? (
            <div className="history-list">
              {workTypes.map(wt => (
                <div key={wt.id} className="history-item" style={{ padding: "8px", borderBottom: "1px solid #30363d" }}>
                  <p><b>{wt.name}</b></p>
                  <p>Цена: {wt.price || "—"}</p>
                  <p>Требует проверки тех.спеца: {wt.tech_supp_require ? "Да" : "Нет"}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">Список видов работ пуст</div>
          )}
        </div>

        {/* === Модальное окно добавления оборудования === */}
        {showAddEquipmentModal && (
          <div className="modal-backdrop" onClick={() => setShowAddEquipmentModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Добавить оборудование</h3>
                <button className="add-btn" style={{ padding: '4px 8px' }} onClick={(e) => { e.stopPropagation(); setShowAddEquipmentModal(false); }}>×</button>
              </div>
              <div className="modal-body">
                <label className="dark-label">
                  Название
                  <input
                    type="text"
                    value={newEquipmentName}
                    onChange={(e) => setNewEquipmentName(e.target.value)}
                    placeholder="Введите название"
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #444",
                      backgroundColor: "#1a1a1a",
                      color: "#e0e0e0",
                    }}
                  />
                </label>
                <label className="dark-label">
                  Категория
                  <select
                    value={newEquipmentCategory}
                    onChange={(e) => setNewEquipmentCategory(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #444",
                      backgroundColor: "#1a1a1a",
                      color: "#e0e0e0",
                    }}
                  >
                    <option value="">Выберите категорию</option>
                    {categories.map((cat, i) => (
                      <option key={i} value={cat}>{cat}</option>
                    ))}
                  </select>
                </label>
                <label className="dark-label">
                  Цена
                  <input
                    type="number"
                    value={newEquipmentPrice}
                    onChange={(e) => setNewEquipmentPrice(e.target.value)}
                    placeholder="Введите цену"
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #444",
                      backgroundColor: "#1a1a1a",
                      color: "#e0e0e0",
                    }}
                  />
                </label>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '15px' }}>
                  <button className="add-btn" style={{ backgroundColor: '#6c757d' }} onClick={(e) => { e.stopPropagation(); setShowAddEquipmentModal(false); }}>Отмена</button>
                  <button className="add-btn" onClick={(e) => { e.stopPropagation(); handleAddEquipment(); }}>Сохранить</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === Модальное окно добавления вида работ === */}
        {showAddWorkTypeModal && (
          <div className="modal-backdrop" onClick={() => setShowAddWorkTypeModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Добавить вид работ</h3>
                <button className="add-btn" style={{ padding: '4px 8px' }} onClick={(e) => { e.stopPropagation(); setShowAddWorkTypeModal(false); }}>×</button>
              </div>
              <div className="modal-body">
                <label className="dark-label">
                  Название
                  <input
                    type="text"
                    value={newWorkTypeName}
                    onChange={(e) => setNewWorkTypeName(e.target.value)}
                    placeholder="Введите название"
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #444",
                      backgroundColor: "#1a1a1a",
                      color: "#e0e0e0",
                    }}
                  />
                </label>
                <label className="dark-label">
                  Цена
                  <input
                    type="number"
                    value={newWorkTypePrice}
                    onChange={(e) => setNewWorkTypePrice(e.target.value)}
                    placeholder="Введите цену"
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #444",
                      backgroundColor: "#1a1a1a",
                      color: "#e0e0e0",
                    }}
                  />
                </label>
                <label className="dark-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={newWorkTypeTechSupp}
                    onChange={(e) => setNewWorkTypeTechSupp(e.target.checked)}
                    style={{ margin: 0 }}
                  />
                  Требуется проверка тех.специалиста?
                </label>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '15px' }}>
                  <button className="add-btn" style={{ backgroundColor: '#6c757d' }} onClick={(e) => { e.stopPropagation(); setShowAddWorkTypeModal(false); }}>Отмена</button>
                  <button className="add-btn" onClick={(e) => { e.stopPropagation(); handleAddWorkType(); }}>Сохранить</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}