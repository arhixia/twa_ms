// front/src/pages/admin/AdminWorkPage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminEquipmentList,
  adminAddEquipment,
  getAdminWorkTypesList,
  adminAddWorkType,
  adminUpdateWorkType,
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
      {/* Используем className="dark-select" для соответствия другим полям в модалке */}
      <input
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        placeholder={placeholder}
        className="dark-select" // <--- Добавлен класс
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

function EditWorkTypeModal({ workType, onClose, onSave, workTypeCategories }) {
  const [name, setName] = useState(workType.name);
  const [category, setCategory] = useState(workType.category || "");
  const [clientPrice, setClientPrice] = useState(parseFloat(workType.client_price));
  const [montPrice, setMontPrice] = useState(parseFloat(workType.mont_price));
  const [techSuppRequire, setTechSuppRequire] = useState(workType.tech_supp_require);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !category.trim() || clientPrice === null || montPrice === null) {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Заполните все обязательные поля");
      } else {
        alert("Заполните все обязательные поля");
      }
      return;
    }
    if (isNaN(clientPrice) || clientPrice <= 0 || isNaN(montPrice) || montPrice <= 0) {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Цены должны быть положительными числами");
      } else {
        alert("Цены должны быть положительными числами");
      }
      return;
    }

    setSaving(true);
    try {
      const updated = await adminUpdateWorkType(workType.id, {
        name,
        category,
        client_price: clientPrice,
        mont_price: montPrice,
        tech_supp_require: techSuppRequire
      });
      onSave(updated);
      onClose();
    } catch (err) {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(err.response?.data?.detail || "Ошибка обновления вида работы");
      } else {
        alert(err.response?.data?.detail || "Ошибка обновления вида работы");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Редактировать вид работ</h2>
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
                categories={workTypeCategories}
                placeholder="Введите или выберите категорию"
              />
            </label>
            <label className="dark-label">
              Цена клиента
              <input
                type="number"
                value={clientPrice}
                onChange={(e) => setClientPrice(parseFloat(e.target.value) || 0)}
                placeholder="Введите цену клиента"
                className="dark-select"
              />
            </label>
            <label className="dark-label">
              Цена монтажника
              <input
                type="number"
                value={montPrice}
                onChange={(e) => setMontPrice(parseFloat(e.target.value) || 0)}
                placeholder="Введите цену монтажника"
                className="dark-select"
              />
            </label>
            <label className="dark-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={techSuppRequire}
                onChange={(e) => setTechSuppRequire(e.target.checked)}
                style={{ margin: 0 }}
              />
              Требуется проверка тех.специалиста?
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
  const [equipmentSearchTerm, setEquipmentSearchTerm] = useState("");

  // Состояния для видов работ
  const [showAddWorkTypeModal, setShowAddWorkTypeModal] = useState(false);
  const [newWorkTypeName, setNewWorkTypeName] = useState("");
  const [newWorkTypeClientPrice, setNewWorkTypeClientPrice] = useState("");
  const [newWorkTypeMontPrice, setNewWorkTypeMontPrice] = useState("");
  const [newWorkTypeTechSupp, setNewWorkTypeTechSupp] = useState(false);
  const [workTypes, setWorkTypes] = useState([]);
  const [newWorkTypeCategory, setNewWorkTypeCategory] = useState("");
  const [workTypeSearchTerm, setWorkTypeSearchTerm] = useState("");
  const [workTypeCategories, setWorkTypeCategories] = useState([]);

  // Состояния для отслеживания раскрытых/скрытых категорий
  const [expandedEquipmentCategories, setExpandedEquipmentCategories] = useState(new Set());
  const [expandedCategories, setExpandedCategories] = useState(new Set());

  // Состояния для модальных окон редактирования
  const [showEditWorkTypeModal, setShowEditWorkTypeModal] = useState(false);
  const [showEditEquipmentModal, setShowEditEquipmentModal] = useState(false);
  const [editingWorkType, setEditingWorkType] = useState(null);
  const [editingEquipment, setEditingEquipment] = useState(null);

  useEffect(() => {
    loadRefs();
    loadWorkTypes();
    loadEquipment();
    loadRefsForWorkTypes(); 
  }, []);

  useEffect(() => {
    if (!equipmentSearchTerm.trim()) {
      // Состояние filteredEquipments больше не нужно
    }
  }, [equipmentSearchTerm]);

  useEffect(() => {
    // Группировка и фильтрация видов работ
    let allWorkTypes = workTypes;
    if (workTypeSearchTerm.trim()) {
      const termLower = workTypeSearchTerm.toLowerCase();
      allWorkTypes = workTypes.filter(wt => wt.name.toLowerCase().includes(termLower));
    }
    const grouped = allWorkTypes.reduce((acc, wt) => {
      const cat = wt.category || "Без категории";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(wt);
      return acc;
    }, {});
    const sortedEntries = Object.entries(grouped).sort(([catA], [catB]) => catA.localeCompare(catB));
    setWorkTypesByCategory(sortedEntries);
  }, [workTypes, workTypeSearchTerm]);

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

  const [equipmentByCategory, setEquipmentByCategory] = useState([]);
  const [workTypesByCategory, setWorkTypesByCategory] = useState([]);

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

  const toggleEquipmentCategory = (categoryName) => {
    setExpandedEquipmentCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryName)) newSet.delete(categoryName);
      else newSet.add(categoryName);
      return newSet;
    });
  };

  const toggleCategory = (categoryName) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryName)) newSet.delete(categoryName);
      else newSet.add(categoryName);
      return newSet;
    });
  };

  const loadRefsForWorkTypes = async () => {
    try {
      const wtRes = await getAdminWorkTypesList();
      const workTypeList = wtRes || [];
      const uniqueWorkTypeCategories = [...new Set(workTypeList.map((wt) => wt.category).filter(Boolean))];
      setWorkTypeCategories(uniqueWorkTypeCategories);
    } catch (e) {
      console.error("Ошибка загрузки категорий видов работ:", e);
    }
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

const handleAddWorkType = async () => {
  if (!newWorkTypeName.trim() || !newWorkTypeClientPrice.trim() || !newWorkTypeMontPrice.trim()) {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.showAlert("Заполните все поля (название, цена клиента, цена монтажника)");
    } else {
      alert("Заполните все поля (название, цена клиента, цена монтажника)");
    }
    return;
  }
  const clientPriceNum = parseFloat(newWorkTypeClientPrice);
  const montPriceNum = parseFloat(newWorkTypeMontPrice);
  if (isNaN(clientPriceNum) || clientPriceNum <= 0 || isNaN(montPriceNum) || montPriceNum <= 0) {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.showAlert("Цены должны быть положительными числами");
    } else {
      alert("Цены должны быть положительными числами");
    }
    return;
  }
  try {
    const result = await adminAddWorkType({
      name: newWorkTypeName.trim(),
      client_price: clientPriceNum,
      mont_price: montPriceNum,
      tech_supp_require: newWorkTypeTechSupp,
      category: newWorkTypeCategory.trim() || null
    });
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.showAlert(`Вид работы "${result.name}" добавлен`);
    } else {
      alert(`Вид работы "${result.name}" добавлен`);
    }
    setNewWorkTypeName("");
    setNewWorkTypeClientPrice("");
    setNewWorkTypeMontPrice("");
    setNewWorkTypeTechSupp(false);
    setNewWorkTypeCategory("");
    setShowAddWorkTypeModal(false);
    loadWorkTypes();
    loadRefs();
  } catch (err) {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.showAlert(err.response?.data?.detail || "Ошибка добавления вида работы");
    } else {
      alert(err.response?.data?.detail || "Ошибка добавления вида работы");
    }
  }
};

  const openEditWorkTypeModal = (workType) => {
    setEditingWorkType(workType);
    setShowEditWorkTypeModal(true);
  };

  const openEditEquipmentModal = (equipment) => {
    setEditingEquipment(equipment);
    setShowEditEquipmentModal(true);
  };

  const handleWorkTypeSave = (updatedWorkType) => {
    setWorkTypes(prev => prev.map(wt => wt.id === updatedWorkType.id ? updatedWorkType : wt));
    loadRefsForWorkTypes();
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
          <h1 className="page-title">Работы</h1>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button className="gradient-button" onClick={() => setShowAddEquipmentModal(true)}>+ Оборудование</button>
          <button className="gradient-button" onClick={() => setShowAddWorkTypeModal(true)}>+ Вид работ</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'row', gap: '20px', height: '100%' }}>
          {/* === Оборудование === */}
                    {/* === Оборудование === */}
          <div className="section" style={{ flex: 1, minHeight: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3>Оборудование</h3>
              {/* Поле поиска теперь ближе к заголовку */}
              <div style={{ width: '400px' }}> 
                <input
                  type="text"
                  value={equipmentSearchTerm}
                  onChange={(e) => setEquipmentSearchTerm(e.target.value)}
                  placeholder="🔍 Поиск..."
                  style={{
                    width: '100%',
                    padding: '8px 12px 0px -10px',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    backgroundColor: '#1a1a1a',
                    color: '#e0e0e0',
                    fontSize: '14px',
                  }}
                />
              </div>
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
                          padding: "8px",
                          borderBottom: "1px solid #30363d",
                          backgroundColor: "#0d1117",
                          cursor: "pointer",
                          borderRadius: "8px",
                          transition: "background-color 0.2s ease",
                        }}
                        onClick={() => toggleEquipmentCategory(category)}
                      >
                        <p style={{ margin: "0", fontWeight: "bold", fontSize: "0.9em", display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{category}</span>
                          <span>{isExpanded ? '▼' : '▶'}</span>
                        </p>
                      </div>
                      {isExpanded && (
                        <div style={{ paddingLeft: '16px' }}>
                          {equipmentInCat.map(eq => (
                            <div
                              key={eq.id}
                              className="history-item clickable-history-item"
                              style={{
                                padding: "6px 8px",
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
                              <p style={{ margin: "0", fontSize: "0.85em" }}>
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

          {/* === Виды работ (с категориями) === */}
          <div className="section" style={{ flex: 1, minHeight: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3>Виды работ</h3>
              {/* Поле поиска теперь ближе к заголовку */}
              <div style={{ width: '400px' }}> 
                <input
                  type="text"
                  value={workTypeSearchTerm}
                  onChange={(e) => setWorkTypeSearchTerm(e.target.value)}
                  placeholder="🔍 Поиск..."
                  style={{
                    width: '100%',
                    padding: '8px 12px 0px -10px',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    backgroundColor: '#1a1a1a',
                    color: '#e0e0e0',
                    fontSize: '14px',
                  }}
                />
              </div>
            </div>
            {workTypesByCategory.length > 0 ? (
              <div className="history-list">
                {workTypesByCategory.map(([category, workTypesInCat]) => {
                  const isExpanded = expandedCategories.has(category);

                  return (
                    <React.Fragment key={category}>
                      <div
                        className="history-item clickable-history-item"
                        style={{
                          padding: "8px",
                          borderBottom: "1px solid #30363d",
                          backgroundColor: "#0d1117",
                          cursor: "pointer",
                          borderRadius: "8px",
                          transition: "background-color 0.2s ease",
                        }}
                        onClick={() => toggleCategory(category)}
                      >
                        <p style={{ margin: "0", fontWeight: "bold", fontSize: "0.9em", display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{category}</span>
                          <span>{isExpanded ? '▼' : '▶'}</span>
                        </p>
                      </div>
                      {isExpanded && (
                        <div style={{ paddingLeft: '16px' }}>
                          {workTypesInCat.map(wt => (
                            <div
                              key={wt.id}
                              className="history-item clickable-history-item"
                              style={{
                                padding: "6px 8px",
                                borderBottom: "1px solid #2a2a2a",
                                backgroundColor: "#161b22",
                                cursor: "pointer",
                                borderRadius: "4px",
                                marginTop: '2px',
                                transition: "background-color 0.2s ease",
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditWorkTypeModal(wt);
                              }}
                            >
                              <p style={{ margin: "0", fontSize: "0.85em" }}>
                                {wt.name}
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
              <div className="empty">Список видов работ пуст</div>
            )}
          </div>
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

        {/* === Модальное окно добавления вида работ === */}
        {showAddWorkTypeModal && (
          <div className="modal-backdrop" onClick={() => setShowAddWorkTypeModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Добавить вид работ</h2>
                <button className="close" onClick={(e) => { e.stopPropagation(); setShowAddWorkTypeModal(false); }}>×</button>
              </div>
              <div className="modal-body">
                <div className="form-grid">
                  <label className="dark-label">
                    Название
                    <input
                      type="text"
                      value={newWorkTypeName}
                      onChange={(e) => setNewWorkTypeName(e.target.value)}
                      placeholder="Введите название"
                      className="dark-select"
                    />
                  </label>
                  <label className="dark-label">
                    Категория
                    <CategoryInput
                      value={newWorkTypeCategory}
                      onChange={setNewWorkTypeCategory}
                      categories={workTypeCategories}
                      placeholder="Введите или выберите категорию"
                    />
                  </label>
                  <label className="dark-label">
                    Цена клиента
                    <input
                      type="number"
                      value={newWorkTypeClientPrice}
                      onChange={(e) => setNewWorkTypeClientPrice(e.target.value)}
                      placeholder="Введите цену клиента"
                      className="dark-select"
                    />
                  </label>
                  <label className="dark-label">
                    Цена монтажника
                    <input
                      type="number"
                      value={newWorkTypeMontPrice}
                      onChange={(e) => setNewWorkTypeMontPrice(e.target.value)}
                      placeholder="Введите цену монтажника"
                      className="dark-select"
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
                </div>
                <div className="modal-actions">
                  <button className="gradient-button" style={{ background: 'linear-gradient(to right, #6c757d, #495057)' }} onClick={(e) => { e.stopPropagation(); setShowAddWorkTypeModal(false); }}>Отмена</button>
                  <button className="gradient-button" onClick={(e) => { e.stopPropagation(); handleAddWorkType(); }}>Сохранить</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === Модальное окно редактирования вида работ === */}
        {showEditWorkTypeModal && editingWorkType && (
          <EditWorkTypeModal
            workType={editingWorkType}
            onClose={() => {
              setShowEditWorkTypeModal(false);
              setEditingWorkType(null);
            }}
            onSave={handleWorkTypeSave}
            workTypeCategories={workTypeCategories}
          />
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