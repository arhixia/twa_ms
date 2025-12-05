import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminCompaniesList,
  adminAddCompany,
  adminAddContactPerson,
  getAdminContactPersonsByCompany,
} from "../../api";
import "../../styles/LogistPage.css";

export default function AdminContactsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Состояния для компаний
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [companies, setCompanies] = useState([]);
  const [filteredCompanies, setFilteredCompanies] = useState([]); // Для поиска
  const [companySearchTerm, setCompanySearchTerm] = useState(""); // Для поиска

  // Состояния для контактов
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactPosition, setNewContactPosition] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [contacts, setContacts] = useState({});
  const [loadingContacts, setLoadingContacts] = useState({});

  // Состояния для отображения/скрытия контактов компании
  const [expandedCompanyIds, setExpandedCompanyIds] = useState(new Set());

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
    // Фильтрация компаний при изменении списка или поискового запроса
    if (!companySearchTerm.trim()) {
      setFilteredCompanies(companies);
    } else {
      const termLower = companySearchTerm.toLowerCase();
      setFilteredCompanies(
        companies.filter(company => company.name.toLowerCase().includes(termLower))
      );
    }
  }, [companies, companySearchTerm]);

  async function loadCompanies() {
    try {
      setLoading(true);
      const data = await getAdminCompaniesList();
      setCompanies(data || []);
    } catch (err) {
      console.error("Ошибка загрузки компаний:", err);
      setError("Ошибка загрузки компаний");
    } finally {
      setLoading(false);
    }
  }

  async function loadContactsForCompany(companyId) {
    if (loadingContacts[companyId]) return; // Не грузим повторно, если уже грузим

    // Проверяем, есть ли уже загруженные контакты для этой компании
    if (contacts[companyId]) {
      // Если уже загружены, просто переключаем видимость
      setExpandedCompanyIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(companyId)) {
          newSet.delete(companyId); // Скрываем
        } else {
          newSet.add(companyId); // Показываем
        }
        return newSet;
      });
      return;
    }

    setLoadingContacts(prev => ({ ...prev, [companyId]: true }));
    try {
      const data = await getAdminContactPersonsByCompany(companyId);
      setContacts(prev => ({
        ...prev,
        [companyId]: data || [],
      }));
      // После загрузки показываем контакты
      setExpandedCompanyIds(prev => new Set(prev).add(companyId));
    } catch (err) {
      console.error(`Ошибка загрузки контактов для компании ${companyId}:`, err);
      setContacts(prev => ({
        ...prev,
        [companyId]: [],
      }));
      // Показываем пустой список
      setExpandedCompanyIds(prev => new Set(prev).add(companyId));
    } finally {
      setLoadingContacts(prev => ({ ...prev, [companyId]: false }));
    }
  }

  const handleAddCompany = async () => {
    if (!newCompanyName.trim()) {
      alert("Введите название компании");
      return;
    }
    try {
      const result = await adminAddCompany({ name: newCompanyName.trim() });
      alert(`Компания "${result.name}" добавлена`);
      setNewCompanyName("");
      setShowAddCompanyModal(false);
      loadCompanies();
    } catch (err) {
      alert(err.response?.data?.detail || "Ошибка добавления компании");
    }
  };

  const handleAddContact = async () => {
    if (!newContactName.trim() || !selectedCompanyId) {
      alert("Заполните ФИО и выберите компанию");
      return;
    }
    try {
      const result = await adminAddContactPerson(selectedCompanyId, {
        name: newContactName.trim(),
        phone: newContactPhone.trim(),
        position: newContactPosition.trim(),
      });
      alert(`Контакт "${result.name}" добавлен (ID: ${result.id})`);
      setNewContactName("");
      setNewContactPhone("");
      setNewContactPosition("");
      setSelectedCompanyId("");
      setShowAddContactModal(false);
      // Обновляем список контактов в состоянии
      if (contacts[selectedCompanyId]) {
        setContacts(prev => ({
          ...prev,
          [selectedCompanyId]: [...(prev[selectedCompanyId] || []), result]
        }));
      }
    } catch (err) {
      console.error("Ошибка добавления контактного лица:", err);
      const errorMsg = err.response?.data?.detail || "Не удалось добавить контактное лицо.";
      alert(`Ошибка: ${errorMsg}`);
    }
  };

  if (loading) return <div className="logist-main"><div className="empty">Загрузка...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1>Контакты</h1>
          <button className="add-btn" onClick={() => navigate(-1)}> ⬅️ Назад</button>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button className="add-btn" onClick={() => setShowAddCompanyModal(true)}>+ Компания</button>
          <button className="add-btn" onClick={() => setShowAddContactModal(true)}>+ Контакт</button>
        </div>

        {/* === Поиск по компаниям === */}
        <div style={{ marginBottom: '16px', maxWidth: '100%' }}>
          <label className="dark-label">Поиск по компаниям</label>
          <input
            type="text"
            className="dark-input"
            placeholder="Поиск..."
            value={companySearchTerm}
            onChange={e => setCompanySearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #444',
              borderRadius: '4px',
              backgroundColor: '#1a1a1a',
              color: '#e0e0e0',
              fontSize: '14px',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* === Компании и их контакты === */}
        <div className="section">
          <h3>Компании и контакты</h3>
          {filteredCompanies.length > 0 ? (
            <div className="history-list">
              {filteredCompanies.map(company => {
                const isExpanded = expandedCompanyIds.has(company.id);
                const companyContacts = contacts[company.id] || [];
                const isLoading = loadingContacts[company.id];

                return (
                  <React.Fragment key={company.id}>
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
                      onClick={() => loadContactsForCompany(company.id)}
                    >
                      <p style={{ margin: "0", fontWeight: "bold", fontSize: "0.9em" }}>{company.name}</p>
                    </div>
                    {isExpanded && (
                      <div
                        style={{
                          padding: "8px",
                          backgroundColor: "#161b22",
                          border: "1px solid #30363d",
                          borderRadius: "0 0 8px 8px",
                          marginTop: "-1px", // Слияние границы с карточкой компании
                        }}
                      >
                        {isLoading ? (
                          <p style={{ margin: "0", fontStyle: "italic", color: "#888" }}>Загрузка...</p>
                        ) : companyContacts.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {companyContacts.map(contact => (
                              <div key={contact.id} style={{ padding: '6px', border: '1px solid #444', borderRadius: '4px', backgroundColor: '#1a1a1a' }}>
                                <p style={{ margin: '0 0 4px 0', fontWeight: 'bold', fontSize: '0.95em' }}>{contact.name}</p>
                                <p style={{ margin: '0 0 2px 0', fontSize: '0.9em' }}><b>Должность:</b> {contact.position || "—"}</p>
                                <p style={{ margin: '0', fontSize: '0.9em' }}><b>Телефон:</b> {contact.phone || "—"}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p style={{ margin: "0", fontStyle: "italic", color: "#888" }}>Контакты отсутствуют</p>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          ) : (
            <div className="empty">Список компаний пуст</div>
          )}
        </div>

        {/* === Модальное окно добавления компании === */}
        {showAddCompanyModal && (
          <div className="modal-backdrop" onClick={() => setShowAddCompanyModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
              <div className="modal-header">
                <h3>Добавить компанию</h3>
                <button className="add-btn" style={{ padding: '4px 8px' }} onClick={(e) => { e.stopPropagation(); setShowAddCompanyModal(false); }}>×</button>
              </div>
              <div className="modal-body">
                <label className="dark-label">
                  Название
                  <input
                    type="text"
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
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
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '15px' }}>
                  <button className="add-btn" style={{ backgroundColor: '#6c757d' }} onClick={(e) => { e.stopPropagation(); setShowAddCompanyModal(false); }}>Отмена</button>
                  <button className="add-btn" onClick={(e) => { e.stopPropagation(); handleAddCompany(); }}>Сохранить</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === Модальное окно добавления контактного лица === */}
        {showAddContactModal && (
          <div className="modal-backdrop" onClick={() => setShowAddContactModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
              <div className="modal-header">
                <h3>Добавить контактное лицо</h3>
                <button className="add-btn" style={{ padding: '4px 8px' }} onClick={(e) => { e.stopPropagation(); setShowAddContactModal(false); }}>×</button>
              </div>
              <div className="modal-body">
                <label className="dark-label">
                  ФИО
                  <input
                    type="text"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="Введите ФИО"
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
                  Должность
                  <input
                    type="text"
                    value={newContactPosition}
                    onChange={(e) => setNewContactPosition(e.target.value)}
                    placeholder="Введите должность (необязательно)"
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
                  Телефон
                  <input
                    type="text"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    placeholder="Введите телефон (необязательно)"
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
                  Компания
                  <select
                    value={selectedCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "4px",
                      border: "1px solid #444",
                      backgroundColor: "#1a1a1a",
                      color: "#e0e0e0",
                    }}
                  >
                    <option value="">Выберите компанию</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="modal-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '15px' }}>
                <button className="add-btn" style={{ backgroundColor: '#6c757d' }} onClick={(e) => { e.stopPropagation(); setShowAddContactModal(false); }}>Отмена</button>
                <button className="add-btn" onClick={(e) => { e.stopPropagation(); handleAddContact(); }}>Сохранить</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}