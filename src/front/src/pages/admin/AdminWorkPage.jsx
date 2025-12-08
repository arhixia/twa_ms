import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminEquipmentList,
  adminAddEquipment,
  getAdminWorkTypesList,
  adminAddWorkType,
} from "../../api";
import "../../styles/LogistPage.css";

// --- КОМПОНЕНТ: Умный поиск для оборудования ---
function SearchableEquipmentSelect({ availableEquipment, onSelect, selectedItems }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredEquipment, setFilteredEquipment] = useState(availableEquipment);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!searchTerm.trim()) {
      // Если поле пустое, показываем всё
      setFilteredEquipment(availableEquipment);
    } else {
      const termLower = searchTerm.toLowerCase();
      setFilteredEquipment(
        availableEquipment.filter(eq =>
          eq.name.toLowerCase().includes(termLower)
        )
      );
    }
  }, [searchTerm, availableEquipment]);

  const handleInputChange = (e) => {
    setSearchTerm(e.target.value);
    setIsOpen(true);
  };

  const handleItemClick = (equipment) => {
    onSelect(equipment.id);
    setSearchTerm("");
  };

  const handleInputFocus = () => setIsOpen(true);
  const handleInputBlur = () => setTimeout(() => setIsOpen(false), 150);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        value={searchTerm}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        placeholder="🔍 Поиск оборудования..."
        style={{
          width: '100%',
          padding: '8px 12px',
          border: '1px solid #444',
          borderRadius: '4px',
          backgroundColor: '#1a1a1a',
          color: '#e0e0e0',
          fontSize: '14px',
        }}
      />
      {isOpen && filteredEquipment.length > 0 && (
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
          {filteredEquipment.map((eq) => (
            <li
              key={eq.id}
              onClick={() => handleItemClick(eq)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                color: '#e0e0e0',
                backgroundColor: '#2a2a2a',
                borderBottom: '1px solid #3a3a3a',
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {eq.name}
            </li>
          ))}
        </ul>
      )}
      {isOpen && filteredEquipment.length === 0 && searchTerm.trim() !== '' && (
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

// --- КОМПОНЕНТ: Умный поиск для видов работ ---
function SearchableWorkTypeSelect({ availableWorkTypes, onSelect, selectedWorkTypeIds }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredWorkTypes, setFilteredWorkTypes] = useState(availableWorkTypes);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredWorkTypes(availableWorkTypes);
    } else {
      const termLower = searchTerm.toLowerCase();
      setFilteredWorkTypes(
        availableWorkTypes.filter(wt =>
          wt.name.toLowerCase().includes(termLower)
        )
      );
    }
  }, [searchTerm, availableWorkTypes]);

  const handleInputChange = (e) => {
    setSearchTerm(e.target.value);
    setIsOpen(true);
  };

  const handleItemClick = (workType) => {
    onSelect(workType.id);
    setSearchTerm("");
  };

  const handleInputFocus = () => setIsOpen(true);
  const handleInputBlur = () => setTimeout(() => setIsOpen(false), 150);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        value={searchTerm}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        placeholder="🔍 Поиск вида работ..."
        style={{
          width: '100%',
          padding: '8px 12px',
          border: '1px solid #444',
          borderRadius: '4px',
          backgroundColor: '#1a1a1a',
          color: '#e0e0e0',
          fontSize: '14px',
        }}
      />
      {isOpen && filteredWorkTypes.length > 0 && (
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
          {filteredWorkTypes.map((wt) => (
            <li
              key={wt.id}
              onClick={() => handleItemClick(wt)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                color: '#e0e0e0',
                backgroundColor: '#2a2a2a',
                borderBottom: '1px solid #3a3a3a',
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {wt.name}
            </li>
          ))}
        </ul>
      )}
      {isOpen && filteredWorkTypes.length === 0 && searchTerm.trim() !== '' && (
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
        style={{
          width: '100%',
          padding: '8px 12px',
          border: '1px solid #444',
          borderRadius: '4px',
          backgroundColor: '#1a1a1a',
          color: '#e0e0e0',
          fontSize: '14px',
        }}
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
  // Состояние для поиска оборудования
  const [equipmentSearchTerm, setEquipmentSearchTerm] = useState("");
  const [filteredEquipments, setFilteredEquipments] = useState([]);

  // Состояния для видов работ
  const [showAddWorkTypeModal, setShowAddWorkTypeModal] = useState(false);
  const [newWorkTypeName, setNewWorkTypeName] = useState("");
  const [newWorkTypeClientPrice, setNewWorkTypeClientPrice] = useState("");
  const [newWorkTypeMontPrice, setNewWorkTypeMontPrice] = useState("");
  const [newWorkTypeTechSupp, setNewWorkTypeTechSupp] = useState(false);
  const [workTypes, setWorkTypes] = useState([]);
  // Состояние для поиска видов работ
  const [workTypeSearchTerm, setWorkTypeSearchTerm] = useState("");
  const [filteredWorkTypes, setFilteredWorkTypes] = useState([]);
  const [workTypesByCategory, setWorkTypesByCategory] = useState([]); // Состояние для сгруппированных данных
  const [filteredWorkTypesByCategory, setFilteredWorkTypesByCategory] = useState([]); // Состояние для отфильтрованных сгруппированных данных
  const [newWorkTypeCategory, setNewWorkTypeCategory] = useState("");
  // Состояния для просмотра карточек
  const [selectedEquipment, setSelectedEquipment] = useState(null);
  const [selectedWorkType, setSelectedWorkType] = useState(null);
  const [workTypeCategories, setWorkTypeCategories] = useState([]);
  const [equipmentByCategory, setEquipmentByCategory] = useState([]);

  // Добавляем состояние для отслеживания раскрытых/скрытых категорий оборудования
  const [expandedEquipmentCategories, setExpandedEquipmentCategories] = useState(new Set());


  // Состояние для отслеживания раскрытых/скрытых категорий
  const [expandedCategories, setExpandedCategories] = useState(new Set());

  useEffect(() => {
    loadRefs();
    loadWorkTypes();
    loadEquipment();
    loadRefsForWorkTypes(); 
  }, []);

  useEffect(() => {
    // Фильтрация оборудования при изменении списка или поискового запроса
    if (!equipmentSearchTerm.trim()) {
      setFilteredEquipments(equipments);
    } else {
      const termLower = equipmentSearchTerm.toLowerCase();
      setFilteredEquipments(
        equipments.filter(eq => eq.name.toLowerCase().includes(termLower))
      );
    }
  }, [equipments, equipmentSearchTerm]);

  useEffect(() => {
    // --- НОВАЯ ЛОГИКА: Группировка и фильтрация видов работ по категориям ---
    let allWorkTypes = workTypes;

    // 1. Фильтруем по названию, если есть поисковый запрос
    if (workTypeSearchTerm.trim()) {
      const termLower = workTypeSearchTerm.toLowerCase();
      allWorkTypes = workTypes.filter(wt => wt.name.toLowerCase().includes(termLower));
    }

    const grouped = allWorkTypes.reduce((acc, wt) => {
      const cat = wt.category || "Без категории";
      if (!acc[cat]) {
        acc[cat] = [];
      }
      acc[cat].push(wt);
      return acc;
    }, {});

    // 3. Преобразуем в массив пар [category, workTypesArray] и сортируем категории
    const sortedEntries = Object.entries(grouped).sort(([catA], [catB]) => catA.localeCompare(catB));

    // 4. Устанавливаем состояние
    if (workTypeSearchTerm.trim()) {
      setFilteredWorkTypesByCategory(sortedEntries);
    } else {
      setWorkTypesByCategory(sortedEntries);
    }
  }, [workTypes, workTypeSearchTerm]);

  useEffect(() => {
    // Группировка и фильтрация оборудования по категориям
    let allEquipment = equipments;

    // 1. Фильтруем по названию, если есть поисковый запрос
    if (equipmentSearchTerm.trim()) {
      const termLower = equipmentSearchTerm.toLowerCase();
      allEquipment = equipments.filter(eq => eq.name.toLowerCase().includes(termLower));
    }

    const grouped = allEquipment.reduce((acc, eq) => {
      const cat = eq.category || "Без категории";
      if (!acc[cat]) {
        acc[cat] = [];
      }
      acc[cat].push(eq);
      return acc;
    }, {});

    // 3. Преобразуем в массив пар [category, equipmentArray] и сортируем категории
    const sortedEntries = Object.entries(grouped).sort(([catA], [catB]) => catA.localeCompare(catB));

    // 4. Устанавливаем состояние
    setEquipmentByCategory(sortedEntries);
}, [equipments, equipmentSearchTerm]);

 async function loadRefs() {
    try {
      setLoading(true);
      const wtRes = await getAdminWorkTypesList();
      const workTypeList = wtRes || [];
      
      // Собираем уникальные категории только из видов работ
      const uniqueWorkTypeCategories = [...new Set(workTypeList.map((wt) => wt.category).filter(Boolean))];
      
      setWorkTypeCategories(uniqueWorkTypeCategories);
    } catch (e) {
      console.error("Ошибка загрузки справочников:", e);
      setError("Ошибка загрузки справочников");
    } finally {
      setLoading(false);
    }
}

async function loadRefs() {
    try {
      setLoading(true);
      const eqRes = await getAdminEquipmentList();
      const equipmentList = eqRes || [];
      
      // Собираем уникальные категории только из оборудования
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
      const data = await getAdminWorkTypesList(); // Убедитесь, что API возвращает поле 'category'
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
      if (newSet.has(categoryName)) {
        newSet.delete(categoryName);
      } else {
        newSet.add(categoryName);
      }
      return newSet;
    });
};


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
    if (!newWorkTypeName.trim() || !newWorkTypeClientPrice.trim() || !newWorkTypeMontPrice.trim()) {
        alert("Заполните все поля (название, цена клиента, цена монтажника)");
        return;
    }
    const clientPriceNum = parseFloat(newWorkTypeClientPrice);
    const montPriceNum = parseFloat(newWorkTypeMontPrice);
    if (isNaN(clientPriceNum) || clientPriceNum <= 0 || isNaN(montPriceNum) || montPriceNum <= 0) {
        alert("Цены должны быть положительными числами");
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
        alert(`Вид работы "${result.name}" добавлен`);
        setNewWorkTypeName("");
        setNewWorkTypeClientPrice("");
        setNewWorkTypeMontPrice("");
        setNewWorkTypeTechSupp(false);
        setNewWorkTypeCategory("");
        setShowAddWorkTypeModal(false);
        loadWorkTypes(); // Перезагрузим список
        loadRefs(); // Перезагрузим категории
    } catch (err) {
        alert(err.response?.data?.detail || "Ошибка добавления вида работы");
    }
};

  // Функция для переключения состояния категории (раскрыта/скрыта)
  const toggleCategory = (categoryName) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryName)) {
        newSet.delete(categoryName);
      } else {
        newSet.add(categoryName);
      }
      return newSet;
    });
  };

  const loadRefsForWorkTypes = async () => {
  try {
    const wtRes = await getAdminWorkTypesList();
    const workTypeList = wtRes || [];
    const uniqueWorkTypeCategories = [...new Set(workTypeList.map((wt) => wt.category).filter(cat => cat))];
    setWorkTypeCategories(uniqueWorkTypeCategories);
  } catch (e) {
    console.error("Ошибка загрузки категорий видов работ:", e);
  }
};

  // Функции для открытия модальных окон просмотра
  const openEquipmentDetails = (equipment) => {
    setSelectedEquipment(equipment);
  };

  const openWorkTypeDetails = (workType) => {
    setSelectedWorkType(workType);
  };

  // Функции для закрытия модальных окон просмотра
  const closeEquipmentDetails = () => {
    setSelectedEquipment(null);
  };

  const closeWorkTypeDetails = () => {
    setSelectedWorkType(null);
  };

  

  if (loading) return <div className="logist-main"><div className="empty">Загрузка...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1>Работы</h1>
          <button className="add-btn" onClick={() => navigate(-1)}> ⬅️ Назад</button>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button className="add-btn" onClick={() => setShowAddEquipmentModal(true)}>+ Оборудование</button>
          <button className="add-btn" onClick={() => setShowAddWorkTypeModal(true)}>+ Вид работ</button>
        </div>

        {/* === Разделение на две колонки === */}
        <div style={{ display: 'flex', flexDirection: 'row', gap: '20px', height: '100%' }}>
          {/* === Оборудование === */}
          <div className="section" style={{ flex: 1, minHeight: '500px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3>Оборудование</h3>
        {/* Поле поиска для оборудования */}
        <div style={{ width: '300px' }}>
            <input
                type="text"
                value={equipmentSearchTerm}
                onChange={(e) => setEquipmentSearchTerm(e.target.value)}
                placeholder="🔍 Поиск..."
                style={{
                    width: '100%',
                    padding: '4px 8px',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    backgroundColor: '#1a1a1a',
                    color: '#e0e0e0',
                    fontSize: '12px',
                }}
            />
        </div>
    </div>
    {/* --- ОТРИСОВКА КАТЕГОРИЙ И ОБОРУДОВАНИЯ --- */}
    {equipmentByCategory.length > 0 ? (
        <div className="history-list">
            {equipmentByCategory.map(([category, equipmentInCat]) => {
                const isExpanded = expandedEquipmentCategories.has(category);

                return (
                    <React.Fragment key={category}>
                        {/* --- Карточка категории --- */}
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
                                <span>{isExpanded ? '▼' : '▶'}</span> {/* Стрелочка */}
                            </p>
                        </div>
                        {/* --- Список оборудования в категории (только если раскрыта) --- */}
                        {isExpanded && (
                            <div style={{ paddingLeft: '16px' }}> {/* Добавляем отступ для вложенности */}
                                {equipmentInCat.map(eq => (
                                    <div
                                        key={eq.id}
                                        className="history-item clickable-history-item"
                                        style={{
                                            padding: "6px 8px", // Уменьшено
                                            borderBottom: "1px solid #2a2a2a", // Сlightly lighter border for sub-items
                                            backgroundColor: "#161b22", // slightly different bg for sub-items
                                            cursor: "pointer",
                                            borderRadius: "4px", // Smaller radius for sub-items
                                            marginTop: '2px', // Small gap between sub-items
                                            transition: "background-color 0.2s ease",
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation(); // Останавливаем всплытие, чтобы не вызвать toggleEquipmentCategory
                                            openEquipmentDetails(eq);
                                        }}
                                    >
                                        <p style={{ margin: "0", fontSize: "0.85em" }}>{eq.name}</p> {/* Ещё меньше шрифт */}
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
              {/* Поле поиска для видов работ */}
              <div style={{ width: '300px' }}>
                <input
                  type="text"
                  value={workTypeSearchTerm}
                  onChange={(e) => setWorkTypeSearchTerm(e.target.value)}
                  placeholder="🔍 Поиск..."
                  style={{
                    width: '100%',
                    padding: '4px 8px',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    backgroundColor: '#1a1a1a',
                    color: '#e0e0e0',
                    fontSize: '12px',
                  }}
                />
              </div>
            </div>
            {/* --- ОТРИСОВКА КАТЕГОРИЙ И ВИДОВ РАБОТ --- */}
            {(workTypeSearchTerm.trim() ? filteredWorkTypesByCategory : workTypesByCategory).length > 0 ? (
              <div className="history-list">
                {(workTypeSearchTerm.trim() ? filteredWorkTypesByCategory : workTypesByCategory).map(([category, workTypesInCat]) => {
                  const isExpanded = expandedCategories.has(category);

                  return (
                    <React.Fragment key={category}>
                      {/* --- Карточка категории --- */}
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
                          <span>{isExpanded ? '▼' : '▶'}</span> {/* Стрелочка */}
                        </p>
                      </div>
                      {/* --- Список видов работ в категории (только если раскрыта) --- */}
                      {isExpanded && (
                        <div style={{ paddingLeft: '16px' }}> {/* Добавляем отступ для вложенности */}
                          {workTypesInCat.map(wt => (
                            <div
                              key={wt.id}
                              className="history-item clickable-history-item"
                              style={{
                                padding: "6px 8px", // Уменьшено
                                borderBottom: "1px solid #2a2a2a", // Сlightly lighter border for sub-items
                                backgroundColor: "#161b22", // slightly different bg for sub-items
                                cursor: "pointer",
                                borderRadius: "4px", // Smaller radius for sub-items
                                marginTop: '2px', // Small gap between sub-items
                                transition: "background-color 0.2s ease",
                              }}
                              onClick={(e) => {
                                e.stopPropagation(); // Останавливаем всплытие, чтобы не вызвать toggleCategory
                                openWorkTypeDetails(wt);
                              }}
                            >
                              <p style={{ margin: "0", fontSize: "0.85em" }}>{wt.name}</p> {/* Ещё меньше шрифт */}
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
          <CategoryInput
            value={newEquipmentCategory}
            onChange={setNewEquipmentCategory}
            categories={categories} // <-- Категории только из оборудования
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
          Категория
          <CategoryInput
            value={newWorkTypeCategory}
            onChange={setNewWorkTypeCategory}
            categories={workTypeCategories} // <-- Передаем только категории из видов работ
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
          Цена монтажника
          <input
            type="number"
            value={newWorkTypeMontPrice}
            onChange={(e) => setNewWorkTypeMontPrice(e.target.value)}
            placeholder="Введите цену монтажника"
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

        {/* === Модальное окно просмотра оборудования === */}
        {selectedEquipment && (
          <div className="modal-backdrop" onClick={closeEquipmentDetails}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', padding: '12px' }}>
              <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 0, marginBottom: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '1.1em' }}>Детали оборудования</h3>
                <button className="add-btn" style={{ padding: '4px 8px', fontSize: '1em' }} onClick={closeEquipmentDetails}>×</button>
              </div>
              <div className="modal-body" style={{ padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <p style={{ margin: 0, fontSize: '0.95em' }}><b>Название:</b> {selectedEquipment.name}</p>
                <p style={{ margin: 0, fontSize: '0.95em' }}><b>Категория:</b> {selectedEquipment.category || "—"}</p>
                <p style={{ margin: 0, fontSize: '0.95em' }}><b>Цена:</b> {selectedEquipment.price || "—"}</p>
              </div>
              <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', padding: 0 }}>
                <button className="add-btn" onClick={closeEquipmentDetails} style={{ padding: '6px 12px', fontSize: '0.9em' }}>Закрыть</button>
              </div>
            </div>
          </div>
        )}
  
        {selectedWorkType && (
  <div className="modal-backdrop" onClick={closeWorkTypeDetails}>
    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', padding: '12px' }}>
      <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 0, marginBottom: '8px' }}>
        <h3 style={{ margin: 0, fontSize: '1.1em' }}>Детали вида работ</h3>
        <button className="add-btn" style={{ padding: '4px 8px', fontSize: '1em' }} onClick={closeWorkTypeDetails}>×</button>
      </div>
      <div className="modal-body" style={{ padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <p style={{ margin: 0, fontSize: '0.95em' }}><b>Название:</b> {selectedWorkType.name}</p>
        <p style={{ margin: 0, fontSize: '0.95em' }}><b>Категория:</b> {selectedWorkType.category || "—"}</p>
        <p style={{ margin: 0, fontSize: '0.95em' }}><b>Цена клиента:</b> {selectedWorkType.client_price || "—"}</p>
        <p style={{ margin: 0, fontSize: '0.95em' }}><b>Цена монтажника:</b> {selectedWorkType.mont_price || "—"}</p>
        <p style={{ margin: 0, fontSize: '0.95em' }}><b>Требует проверки тех.спеца:</b> {selectedWorkType.tech_supp_require ? "Да" : "Нет"}</p>
      </div>
      <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px', padding: 0 }}>
        <button className="add-btn" onClick={closeWorkTypeDetails} style={{ padding: '6px 12px', fontSize: '0.9em' }}>Закрыть</button>
      </div>
    </div>
  </div>
)}

      </div>
    </div>
  );
}