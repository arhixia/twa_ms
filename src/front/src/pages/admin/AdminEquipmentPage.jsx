// front/src/pages/admin/AdminEquipmentPage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminEquipmentList,
  adminAddEquipment,
  adminUpdateEquipment
} from "../../api";
import "../../styles/LogistPage.css";

function CategoryInput({ value, onChange, categories, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const [filteredCategories, setFilteredCategories] = useState(categories);

  useEffect(() => {
    if (!value.trim()) {
      setFilteredCategories(categories);
    } else {
        const termLower = value.toLowerCase();
        setFilteredCategories(
            categories.filter(cat => cat.toLowerCase().includes(termLower))
        );
    }
  }, [value, categories]);

  const handleInputChange = (e) => {
    onChange(e.target.value);
    setIsOpen(true);
  };

  const handleCategorySelect = (category) => {
    onChange(category);
    setIsOpen(false);
  };

  const handleInputFocus = () => setIsOpen(true);
  const handleInputBlur = () => setTimeout(() => setIsOpen(false), 150);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        placeholder={placeholder}
        className="dark-select"
      />
      {isOpen && filteredCategories.length > 0 && (
        <ul
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 100,
            maxHeight: '200px',
            overflowY: 'auto',
            listStyle: 'none',
            margin: 0,
            padding: 0,
            backgroundColor: '#1a1a1a',
            border: '1px solid #444',
            borderTop: 'none',
            borderRadius: '0 0 4px 4px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.5)',
          }}
        >
          {filteredCategories.map((cat, index) => (
            <li
              key={index}
              onClick={() => handleCategorySelect(cat)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                color: '#e0e0e0',
                backgroundColor: '#2a2a2a',
                borderBottom: '1px solid #3a3a3a',
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {cat}
            </li>
          ))}
        </ul>
      )}
      {isOpen && filteredCategories.length === 0 && value.trim() !== '' && (
        <ul
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 100,
            maxHeight: '200px',
            overflowY: 'auto',
            listStyle: 'none',
            margin: 0,
            padding: 0,
            backgroundColor: '#1a1a1a',
            border: '1px solid #444',
            borderTop: 'none',
            borderRadius: '0 0 4px 4px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.5)',
          }}
        >
          <li style={{ padding: '8px 12px', color: '#888', fontStyle: 'italic' }}>
            Ничего не найдено
          </li>
        </ul>
      )}
    </div>
  );
}

function EditEquipmentModal({ equipment, onClose, onSave, categories }) {
  const [name, setName] = useState(equipment.name);
  const [category, setCategory] = useState(equipment.category);
  const [price, setPrice] = useState(parseFloat(equipment.price));
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !category.trim() || price === null) {
      alert("Заполните все обязательные поля");
      return;
    }
    if (isNaN(price) || price <= 0) {
      alert("Цена должна быть положительным числом");
      return;
    }

    setSaving(true);
    try {
      const updated = await adminUpdateEquipment(equipment.id, {
        name,
        category,
        price
      });
      onSave(updated);
      onClose();
    } catch (err) {
      alert(err.response?.data?.detail || "Ошибка обновления оборудования");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Редактировать оборудование</h2>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <label className="dark-label">
              Название
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Введите название"
                className="dark-select"
              />
            </label>
            <label className="dark-label">
              Категория
              <CategoryInput
                value={category}
                onChange={setCategory}
                categories={categories}
                placeholder="Введите или выберите категорию"
              />
            </label>
            <label className="dark-label">
              Цена
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                placeholder="Введите цену"
                className="dark-select"
              />
            </label>
          </div>
        </div>
        <div className="modal-actions">
          <button className="gradient-button" style={{ background: 'linear-gradient(to right, #6c757d, #495057)' }} onClick={onClose}>Отмена</button>
          <button className="gradient-button" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminEquipmentPage() {
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
  const [equipmentSearchTerm, setEquipmentSearchTerm] = useState("");

  // Состояния для отслеживания раскрытых/скрытых категорий
  const [expandedEquipmentCategories, setExpandedEquipmentCategories] = useState(new Set());

  // Состояния для модальных окон редактирования
  const [showEditEquipmentModal, setShowEditEquipmentModal] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState(null);

  const [equipmentByCategory, setEquipmentByCategory] = useState([]);

  useEffect(() => {
    loadRefs();
    loadEquipment();
  }, []);

  useEffect(() => {
    let allEquipment = equipments;
    if (equipmentSearchTerm.trim()) {
      const termLower = equipmentSearchTerm.toLowerCase();
      allEquipment = equipments.filter(eq => eq.name.toLowerCase().includes(termLower));
    }
    const grouped = allEquipment.reduce((acc, eq) => {
      const cat = eq.category || "Без категории";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(eq);
      return acc;
    }, {});
    const sortedEntries = Object.entries(grouped).sort(([catA], [catB]) => catA.localeCompare(catB));
    setEquipmentByCategory(sortedEntries);
  }, [equipments, equipmentSearchTerm]);

  async function loadRefs() {
    try {
      setLoading(true);
      const eqRes = await getAdminEquipmentList();
      const equipmentList = eqRes || [];
      const uniqueEquipmentCategories = [...new Set(equipmentList.map((e) => e.category).filter(Boolean))];
      setCategories(uniqueEquipmentCategories);
    } catch (e) {
      console.error("Ошибка загрузки справочников:", e);
      setError("Ошибка загрузки справочников");
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

  const toggleEquipmentCategory = (categoryName) => {
    setExpandedEquipmentCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryName)) newSet.delete(categoryName);
      else newSet.add(categoryName);
      return newSet;
    });
  };

 const handleAddEquipment = async () => {
  if (!newEquipmentName.trim() || !newEquipmentCategory.trim() || !newEquipmentPrice.trim()) {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.showAlert("Заполните все поля");
    } else {
      alert("Заполните все поля");
    }
    return;
  }
  const priceNum = parseFloat(newEquipmentPrice);
  if (isNaN(priceNum) || priceNum <= 0) {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.showAlert("Цена должна быть положительной");
    } else {
      alert("Цена должна быть положительной");
    }
    return;
  }
  try {
    const result = await adminAddEquipment({
      name: newEquipmentName.trim(),
      category: newEquipmentCategory.trim(),
      price: priceNum,
    });
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.showAlert(`Оборудование "${result.name}" добавлено`);
    } else {
      alert(`Оборудование "${result.name}" добавлено`);
    }
    setNewEquipmentName("");
    setNewEquipmentCategory("");
    setNewEquipmentPrice("");
    setShowAddEquipmentModal(false);
    loadRefs();
    loadEquipment();
  } catch (err) {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.showAlert(err.response?.data?.detail || "Ошибка добавления оборудования");
    } else {
      alert(err.response?.data?.detail || "Ошибка добавления оборудования");
    }
  }
};

  const openEditEquipmentModal = (equipment) => {
    setEditingEquipment(equipment);
    setShowEditEquipmentModal(true);
  };

  const handleEquipmentSave = (updatedEquipment) => {
    setEquipments(prev => prev.map(eq => eq.id === updatedEquipment.id ? updatedEquipment : eq));
    loadRefs();
  };

  if (loading) return <div className="logist-main"><div className="empty">Загрузка...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Оборудование</h1>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button className="gradient-button" onClick={() => setShowAddEquipmentModal(true)}>+ Оборудование</button>
        </div>

        {/* === Оборудование === */}
        <div className="section">
  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '10px' }}>
    <input
      type="text"
      value={equipmentSearchTerm}
      onChange={(e) => setEquipmentSearchTerm(e.target.value)}
      placeholder="🔍 Поиск..."
      style={{
        width: '100%',
        padding: '10px',
        border: '1px solid #444',
        borderRadius: '4px',
        backgroundColor: '#1a1a1a',
        color: '#e0e0e0',
        fontSize: '14px',
        boxSizing: 'border-box'
      }}
    />
  </div>
  {equipmentByCategory.length > 0 ? (
    <div className="history-list">
      {equipmentByCategory.map(([category, equipmentInCat]) => {
        const isExpanded = expandedEquipmentCategories.has(category);

        return (
          <React.Fragment key={category}>
            <div
              className="history-item clickable-history-item"
              style={{
                padding: "10px",
                borderBottom: "1px solid #30363d",
                backgroundColor: "#0d1117",
                cursor: "pointer",
                borderRadius: "8px",
                transition: "background-color 0.2s ease",
              }}
              onClick={() => toggleEquipmentCategory(category)}
            >
              <p style={{ margin: "0", fontWeight: "bold", fontSize: "1em", display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{category}</span>
                <span>{isExpanded ? '▼' : '▶'}</span>
              </p>
            </div>
            {isExpanded && (
              <div style={{ paddingLeft: '10px' }}>
                {equipmentInCat.map(eq => (
                  <div
                    key={eq.id}
                    className="history-item clickable-history-item"
                    style={{
                      padding: "8px",
                      borderBottom: "1px solid #2a2a2a",
                      backgroundColor: "#161b22",
                      cursor: "pointer",
                      borderRadius: "4px",
                      marginTop: '2px',
                      transition: "background-color 0.2s ease",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditEquipmentModal(eq);
                    }}
                  >
                    <p style={{ margin: "0", fontSize: "0.9em" }}>
                      {eq.name}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  ) : (
    <div className="empty">Список оборудования пуст</div>
  )}
</div>

        {/* === Модальное окно добавления оборудования === */}
        {showAddEquipmentModal && (
          <div className="modal-backdrop" onClick={() => setShowAddEquipmentModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Добавить оборудование</h2>
                <button className="close" onClick={(e) => { e.stopPropagation(); setShowAddEquipmentModal(false); }}>×</button>
              </div>
              <div className="modal-body">
                <div className="form-grid">
                  <label className="dark-label">
                    Название
                    <input
                      type="text"
                      value={newEquipmentName}
                      onChange={(e) => setNewEquipmentName(e.target.value)}
                      placeholder="Введите название"
                      className="dark-select"
                    />
                  </label>
                  <label className="dark-label">
                    Категория
                    <CategoryInput
                      value={newEquipmentCategory}
                      onChange={setNewEquipmentCategory}
                      categories={categories}
                      placeholder="Введите или выберите категорию"
                    />
                  </label>
                  <label className="dark-label">
                    Цена
                    <input
                      type="number"
                      value={newEquipmentPrice}
                      onChange={(e) => setNewEquipmentPrice(e.target.value)}
                      placeholder="Введите цену"
                      className="dark-select"
                    />
                  </label>
                </div>
                <div className="modal-actions">
                  <button className="gradient-button" style={{ background: 'linear-gradient(to right, #6c757d, #495057)' }} onClick={(e) => { e.stopPropagation(); setShowAddEquipmentModal(false); }}>Отмена</button>
                  <button className="gradient-button" onClick={(e) => { e.stopPropagation(); handleAddEquipment(); }}>Сохранить</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === Модальное окно редактирования оборудования === */}
        {showEditEquipmentModal && editingEquipment && (
          <EditEquipmentModal
            equipment={editingEquipment}
            onClose={() => {
              setShowEditEquipmentModal(false);
              setEditingEquipment(null);
            }}
            onSave={handleEquipmentSave}
            categories={categories}
          />
        )}
      </div>
    </div>
  );
}