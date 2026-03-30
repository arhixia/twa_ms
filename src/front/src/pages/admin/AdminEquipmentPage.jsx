import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminEquipmentList,
  adminAddEquipment,
  adminUpdateEquipment
} from "../../api";
import "../../styles/LogistPage.css";
import { showAlert } from "../../utils/notify";


const EquipmentIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
    <path d="M9.972 2.508a.5.5 0 0 0-.16-.556l-.178-.129a5 5 0 0 0-2.076-.783C6.215.862 4.504 1.229 2.84 3.133H1.786a.5.5 0 0 0-.354.147L.146 4.567a.5.5 0 0 0 0 .706l2.571 2.579a.5.5 0 0 0 .708 0l1.286-1.2a.5.5 0 0 0 .146-.353V5.57l8.387 8.873A.5.5 0 0 0 14 14.5l1.5-1.5a.5.5 0 0 0 .017-.689l-9.129-8.63c.747-.456 1.772-.839 3.112-.839a.5.5 0 0 0 .472-.334"/>
  </svg>
);

const CategoryIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-body-text" viewBox="0 0 16 16">
  <path fill-rule="evenodd" d="M0 .5A.5.5 0 0 1 .5 0h4a.5.5 0 0 1 0 1h-4A.5.5 0 0 1 0 .5m0 2A.5.5 0 0 1 .5 2h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5m9 0a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m-9 2A.5.5 0 0 1 .5 4h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5m5 0a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m7 0a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5m-12 2A.5.5 0 0 1 .5 6h6a.5.5 0 0 1 0 1h-6a.5.5 0 0 1-.5-.5m8 0a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m-8 2A.5.5 0 0 1 .5 8h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5m7 0a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5m-7 2a.5.5 0 0 1 .5-.5h8a.5.5 0 0 1 0 1h-8a.5.5 0 0 1-.5-.5m0 2a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1-.5-.5m0 2a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 0 1h-2a.5.5 0 0 1-.5-.5"/>
</svg>
);

const PriceIcon = () => (
  <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="8" y1="3" x2="8" y2="21" />
      <path d="M8 3h6a4 4 0 0 1 0 8H8" />
      <line x1="6" y1="14" x2="14" y2="14" />
      <line x1="6" y1="18" x2="14" y2="18" />
    </svg>
);

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
    <div className="searchable-select-container">
      <input
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        placeholder={placeholder}
        className="searchable-select-input"
      />
      {isOpen && filteredCategories.length > 0 && (
        <ul className="searchable-select-dropdown">
          {filteredCategories.map((cat, index) => (
            <li
              key={index}
              onClick={() => handleCategorySelect(cat)}
              className="searchable-select-option"
              onMouseDown={(e) => e.preventDefault()}
            >
              {cat}
            </li>
          ))}
        </ul>
      )}
      {isOpen && filteredCategories.length === 0 && value.trim() !== '' && (
        <ul className="searchable-select-dropdown">
          <li className="searchable-select-no-results">
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
      showAlert("Заполните все обязательные поля"); 
      return;
    }
    if (isNaN(price) || price <= 0) {
      showAlert("Цена должна быть положительным числом");
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
      const errorMsg = err.response?.data?.detail || "Ошибка обновления оборудования";
      showAlert(`Ошибка: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="task-section-header">
            <EquipmentIcon />
            <span>Редактировать оборудование</span>
          </div>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="task-field">
            <div className="task-field-label">
              <EquipmentIcon />
              Название:
            </div>
            <div className="task-field-value">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Введите название"
                className="dark-select"
              />
            </div>
          </div>
          
          <div className="task-field">
            <div className="task-field-label">
              <CategoryIcon />
              Категория:
            </div>
            <div className="task-field-value">
              <CategoryInput
                value={category}
                onChange={setCategory}
                categories={categories}
                placeholder="Введите или выберите категорию"
              />
            </div>
          </div>
          
          <div className="task-field">
            <div className="task-field-label">
              <PriceIcon />
              Цена:
            </div>
            <div className="task-field-value">
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                placeholder="Введите цену"
                className="dark-select"
              />
            </div>
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
    showAlert("Заполните все поля");
    return;
  }
  const priceNum = parseFloat(newEquipmentPrice);
  if (isNaN(priceNum) || priceNum <= 0) {
    showAlert("Цена должна быть положительной");
    return;
  }
  try {
    const result = await adminAddEquipment({
      name: newEquipmentName.trim(),
      category: newEquipmentCategory.trim(),
      price: priceNum,
    });
    showAlert(`Оборудование "${result.name}" добавлено`);
    setNewEquipmentName("");
    setNewEquipmentCategory("");
    setNewEquipmentPrice("");
    setShowAddEquipmentModal(false);
    loadRefs();
    loadEquipment();
  } catch (err) {
    showAlert(err.response?.data?.detail || "Ошибка добавления оборудования");
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
          <button className="gradient-button" onClick={() => setShowAddEquipmentModal(true)}><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus" viewBox="0 0 16 16">
  <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4" stroke="currentColor" strokeWidth="2" fill="none"/>
</svg>Оборудование</button>
        </div>

        {/* === Оборудование === */}
        <div className="section">
  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '10px' }}>
    <label className="dark-label" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, sans-serif' }}>
  Поиск по оборудованию
</label>
    <input
      type="text"
      value={equipmentSearchTerm}
      onChange={(e) => setEquipmentSearchTerm(e.target.value)}
      placeholder="🔍 Поиск..."
      className="dark-select"
    />
  </div>
  {equipmentByCategory.length > 0 ? (
    <div className="history-list">
      {equipmentByCategory.map(([category, equipmentInCat]) => {
        const isExpanded = expandedEquipmentCategories.has(category);

        return (
          <React.Fragment key={category}>
            <div
              className="profile-card clickable-history-item"
              style={{
                padding: "12px",
                cursor: "pointer",
                borderRadius: "8px",
                transition: "background-color 0.2s ease",
                border: "1px solid rgba(255,255,255,0.08)",
                backgroundColor: "#1b2c3c",
              }}
              onClick={() => toggleEquipmentCategory(category)}
            >
              <p style={{ margin: "0", fontWeight: "bold", fontSize: "0.9em", display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{category}</span>
                <span>{isExpanded ? '▼' : '▶'}</span>
              </p>
            </div>
            {isExpanded && (
              <div style={{ paddingLeft: '10px' }}>
                {equipmentInCat.map(eq => (
  <div
    key={eq.id}
    className="profile-card"
    style={{
      padding: "8px",
      borderBottom: "1px solid #2a2a2a",
      backgroundColor: "#161b22",
      cursor: "pointer",
      borderRadius: "4px",
      marginTop: '2px',
      transition: "background-color 0.2s ease",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "6px"
    }}
    onClick={(e) => {
      e.stopPropagation();
      openEditEquipmentModal(eq);
    }}
  >
    <span
      style={{
        fontSize: "0.9em",
        fontWeight: "500",
        flex: "1 1 auto",
        minWidth: 0,
        wordBreak: "break-word",
        overflowWrap: "anywhere"
      }}
    >
      {eq.name}
    </span>
    <span
      style={{
        fontSize: "0.90em",
        color: "#c7ced9",
        whiteSpace: "nowrap",
        flexShrink: 0
      }}
    >
      <span style={{
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2px 10px',
  borderRadius: '20px',
  border: '2px solid #3b82f6',
  color: '#3b82f6',
  fontWeight: '600',
  fontSize: '0.85em',
  whiteSpace: 'nowrap'
}}>
  {parseFloat(eq.price).toFixed(2)} ₽
</span>
    </span>
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
                <div className="task-section-header">
                  <EquipmentIcon />
                  <span>Добавить оборудование</span>
                </div>
                <button className="close" onClick={(e) => { e.stopPropagation(); setShowAddEquipmentModal(false); }}>×</button>
              </div>
              <div className="modal-body">
                <div className="task-field">
                  <div className="task-field-label">
                    <EquipmentIcon />
                    Название:
                  </div>
                  <div className="task-field-value">
                    <input
                      type="text"
                      value={newEquipmentName}
                      onChange={(e) => setNewEquipmentName(e.target.value)}
                      placeholder="Введите название"
                      className="dark-select"
                    />
                  </div>
                </div>
                
                <div className="task-field">
                  <div className="task-field-label">
                    <CategoryIcon />
                    Категория:
                  </div>
                  <div className="task-field-value">
                    <CategoryInput
                      value={newEquipmentCategory}
                      onChange={setNewEquipmentCategory}
                      categories={categories}
                      placeholder="Введите или выберите категорию"
                    />
                  </div>
                </div>
                
                <div className="task-field">
                  <div className="task-field-label">
                    <PriceIcon />
                    Цена:
                  </div>
                  <div className="task-field-value">
                    <input
                      type="number"
                      value={newEquipmentPrice}
                      onChange={(e) => setNewEquipmentPrice(e.target.value)}
                      placeholder="Введите цену"
                      className="dark-select"
                    />
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button className="gradient-button" style={{ background: 'linear-gradient(to right, #6c757d, #495057)' }} onClick={(e) => { e.stopPropagation(); setShowAddEquipmentModal(false); }}>Отмена</button>
                <button className="gradient-button" onClick={(e) => { e.stopPropagation(); handleAddEquipment(); }}>Сохранить</button>
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