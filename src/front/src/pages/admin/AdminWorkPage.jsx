import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminWorkTypesList,
  adminAddWorkType,
  adminUpdateWorkType
} from "../../api";
import "../../styles/LogistPage.css";
import { showAlert } from "../../utils/notify";

const WorkIcon = () => (
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

const TechSupportIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" fill="#94a3b8"/>
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

function EditWorkTypeModal({ workType, onClose, onSave, workTypeCategories }) {
  const [name, setName] = useState(workType.name);
  const [category, setCategory] = useState(workType.category || "");
  const [clientPrice, setClientPrice] = useState(parseFloat(workType.client_price));
  const [montPrice, setMontPrice] = useState(parseFloat(workType.mont_price));
  const [techSuppRequire, setTechSuppRequire] = useState(workType.tech_supp_require);
  const [logistPrice, setLogistPrice] = useState(workType.logist_price ? parseFloat(workType.logist_price) : "");
  const [saving, setSaving] = useState(false);


  const handleSubmit = async () => {
    if (!name.trim() || !category.trim() || clientPrice === null || montPrice === null) {
      showAlert("Заполните все обязательные поля")
      return;
    }
    if (isNaN(clientPrice) || clientPrice <= 0 || isNaN(montPrice) || montPrice <= 0) {
      showAlert("Цены должны быть положительными числами")
      return;
    }

    setSaving(true);
    try {
      const updated = await adminUpdateWorkType(workType.id, {
        name,
        category,
        client_price: clientPrice,
        logist_price: logistPrice || null,
        mont_price: montPrice,
        tech_supp_require: techSuppRequire
      });
      onSave(updated);
      onClose();
    } catch (err) {
       showAlert(err.response?.data?.detail || "Ошибка обновления вида работы")
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="task-section-header">
            <WorkIcon />
            <span>Редактировать вид работ</span>
          </div>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="task-field">
            <div className="task-field-label">
              <WorkIcon />
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
                categories={workTypeCategories}
                placeholder="Введите или выберите категорию"
              />
            </div>
          </div>
          
          <div className="task-field">
            <div className="task-field-label">
              <PriceIcon />
              Цена клиента:
            </div>
            <div className="task-field-value">
              <input
                type="number"
                value={clientPrice}
                onChange={(e) => setClientPrice(parseFloat(e.target.value) || 0)}
                placeholder="Введите цену клиента"
                className="dark-select"
              />
            </div>
          </div>
          
          <div className="task-field">
            <div className="task-field-label">
              <PriceIcon />
              Цена монтажника:
            </div>
            <div className="task-field-value">
              <input
                type="number"
                value={montPrice}
                onChange={(e) => setMontPrice(parseFloat(e.target.value) || 0)}
                placeholder="Введите цену монтажника"
                className="dark-select"
              />
            </div>
          </div>

          <div className="task-field">
            <div className="task-field-label">
              <PriceIcon />
              Цена логиста:
            </div>
            <div className="task-field-value">
              <input
                type="number"
                value={logistPrice}
                onChange={(e) => setLogistPrice(parseFloat(e.target.value) || 0)}
                placeholder="Введите цену логиста"
                className="dark-select"
              />
            </div>
          </div>

          
          <div className="task-field">
            <div className="task-field-label">
              <TechSupportIcon />
              Требуется проверка тех.специалиста?
            </div>
            <div className="task-field-value">
              <label className="dark-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  checked={techSuppRequire}
                  onChange={(e) => setTechSuppRequire(e.target.checked)}
                  style={{ margin: 0 }}
                />
                Да
              </label>
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

export default function AdminWorkPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
  const [newWorkTypeLogistPrice, setNewWorkTypeLogistPrice] = useState("");

  // Состояния для отслеживания раскрытых/скрытых категорий
  const [expandedCategories, setExpandedCategories] = useState(new Set());

  // Состояния для модальных окон редактирования
  const [showEditWorkTypeModal, setShowEditWorkTypeModal] = useState(false);
  const [editingWorkType, setEditingWorkType] = useState(null);

  const [workTypesByCategory, setWorkTypesByCategory] = useState([]);

  useEffect(() => {
    loadWorkTypes();
    loadRefsForWorkTypes(); 
  }, []);

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

 const handleAddWorkType = async () => {
  if (!newWorkTypeName.trim() || !newWorkTypeClientPrice.trim() || !newWorkTypeMontPrice.trim()) {
    showAlert("Заполните все поля (название, цена клиента, цена монтажника)")
    return;
  }
  const clientPriceNum = parseFloat(newWorkTypeClientPrice);
  const montPriceNum = parseFloat(newWorkTypeMontPrice);
  if (isNaN(clientPriceNum) || clientPriceNum <= 0 || isNaN(montPriceNum) || montPriceNum <= 0) {
    showAlert("Цены должны быть положительными числами")
    return;
  }
  try {
    const result = await adminAddWorkType({
      name: newWorkTypeName.trim(),
      client_price: clientPriceNum,
      mont_price: montPriceNum,
      logist_price: parseFloat(newWorkTypeLogistPrice) || null,
      tech_supp_require: newWorkTypeTechSupp,
      category: newWorkTypeCategory.trim() || null
    });
    showAlert(`Вид работы "${result.name}" добавлен`)
    setNewWorkTypeName("");
    setNewWorkTypeClientPrice("");
    setNewWorkTypeMontPrice("");
    setNewWorkTypeLogistPrice("");
    setNewWorkTypeTechSupp(false);
    setNewWorkTypeCategory("");
    setShowAddWorkTypeModal(false);
    loadWorkTypes();
    loadRefsForWorkTypes();
  } catch (err) {
    showAlert(err.response?.data?.detail || "Ошибка добавления вида работы")
  }
};

  const openEditWorkTypeModal = (workType) => {
    setEditingWorkType(workType);
    setShowEditWorkTypeModal(true);
  };

  const handleWorkTypeSave = (updatedWorkType) => {
    setWorkTypes(prev => prev.map(wt => wt.id === updatedWorkType.id ? updatedWorkType : wt));
    loadRefsForWorkTypes();
  };

  if (loading) return <div className="logist-main"><div className="empty">Загрузка...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Виды работ</h1>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button className="gradient-button" onClick={() => setShowAddWorkTypeModal(true)}><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus" viewBox="0 0 16 16">
  <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4" stroke="currentColor" strokeWidth="2" fill="none"/>
</svg> Вид работ</button>
        </div>

        {/* === Виды работ (с категориями) === */}
        <div className="section">
  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '10px' }}>
    <label className="dark-label" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, sans-serif' }}>
  Поиск по видам работ
</label>
    <input
      type="text"
      value={workTypeSearchTerm}
      onChange={(e) => setWorkTypeSearchTerm(e.target.value)}
      placeholder="🔍 Поиск..."
      className="dark-select"
    />
  </div>
  {workTypesByCategory.length > 0 ? (
    <div className="history-list">
      {workTypesByCategory.map(([category, workTypesInCat]) => {
        const isExpanded = expandedCategories.has(category);

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
              onClick={() => toggleCategory(category)}
            >
              <p style={{ margin: "0", fontWeight: "bold", fontSize: "0.9em", display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{category}</span>
                <span>{isExpanded ? '▼' : '▶'}</span>
              </p>
            </div>
            {isExpanded && (
              <div style={{ paddingLeft: '10px' }}>
                {workTypesInCat.map(wt => (
  <div
  key={wt.id}
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
    openEditWorkTypeModal(wt);
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
    {wt.name}
  </span>
  <span
    style={{
      fontSize: "0.90em",
      color: "#c7ced9",
      whiteSpace: "nowrap",     
      flexShrink: 0             
    }}
  >
    {wt.logist_price && (
  <span style={{
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2px 10px',
    borderRadius: '20px',
    border: '2px solid #22c55e',
    color: '#22c55e',
    fontWeight: '600',
    fontSize: '0.85em',
    whiteSpace: 'nowrap',
    marginRight: '6px'
  }}>
    {parseFloat(wt.logist_price).toFixed(2)} ₽
  </span>
)}
    <span style={{
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2px 10px',
  borderRadius: '20px',
  border: '2px solid #f5c518',
  color: '#e6cb69',
  fontWeight: '600',
  fontSize: '0.85em',
  marginRight: '6px',
  whiteSpace: 'nowrap'
}}>
  {parseFloat(wt.mont_price).toFixed(2)} ₽
</span>
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
  {parseFloat(wt.client_price).toFixed(2)} ₽
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
    <div className="empty">Список видов работ пуст</div>
  )}
</div>

        {/* === Модальное окно добавления вида работ === */}
        {showAddWorkTypeModal && (
          <div className="modal-backdrop" onClick={() => setShowAddWorkTypeModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="task-section-header">
                  <WorkIcon />
                  <span>Добавить вид работ</span>
                </div>
                <button className="close" onClick={(e) => { e.stopPropagation(); setShowAddWorkTypeModal(false); }}>×</button>
              </div>
              <div className="modal-body">
                <div className="task-field">
                  <div className="task-field-label">
                    <WorkIcon />
                    Название:
                  </div>
                  <div className="task-field-value">
                    <input
                      type="text"
                      value={newWorkTypeName}
                      onChange={(e) => setNewWorkTypeName(e.target.value)}
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
                      value={newWorkTypeCategory}
                      onChange={setNewWorkTypeCategory}
                      categories={workTypeCategories}
                      placeholder="Введите или выберите категорию"
                    />
                  </div>
                </div>
                
                <div className="task-field">
                  <div className="task-field-label">
                    <PriceIcon />
                    Цена клиента:
                  </div>
                  <div className="task-field-value">
                    <input
                      type="number"
                      value={newWorkTypeClientPrice}
                      onChange={(e) => setNewWorkTypeClientPrice(e.target.value)}
                      placeholder="Введите цену клиента"
                      className="dark-select"
                    />
                  </div>
                </div>
                
                <div className="task-field">
                  <div className="task-field-label">
                    <PriceIcon />
                    Цена монтажника:
                  </div>
                  <div className="task-field-value">
                    <input
                      type="number"
                      value={newWorkTypeMontPrice}
                      onChange={(e) => setNewWorkTypeMontPrice(e.target.value)}
                      placeholder="Введите цену монтажника"
                      className="dark-select"
                    />
                  </div>
                </div>

                <div className="task-field">
              <div className="task-field-label">
                <PriceIcon />
                Цена логиста:
              </div>
              <div className="task-field-value">
                <input
                  type="number"
                  value={newWorkTypeLogistPrice}
                  onChange={(e) => setNewWorkTypeLogistPrice(e.target.value)}
                  placeholder="Введите цену логиста"
                  className="dark-select"
                />
              </div>
            </div>
                
                <div className="task-field">
                  <div className="task-field-label">
                    <TechSupportIcon />
                    Требуется проверка тех.специалиста?
                  </div>
                  <div className="task-field-value">
                    <label className="dark-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={newWorkTypeTechSupp}
                        onChange={(e) => setNewWorkTypeTechSupp(e.target.checked)}
                        style={{ margin: 0 }}
                      />
                      Да
                    </label>
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button className="gradient-button" style={{ background: 'linear-gradient(to right, #6c757d, #495057)' }} onClick={(e) => { e.stopPropagation(); setShowAddWorkTypeModal(false); }}>Отмена</button>
                <button className="gradient-button" onClick={(e) => { e.stopPropagation(); handleAddWorkType(); }}>Сохранить</button>
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
      </div>
    </div>
  );
}