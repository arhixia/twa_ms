// front/src/pages/admin/AdminContactsPage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAdminCompaniesList,
  adminAddCompany,
  adminAddContactPerson,
  getAdminContactPersonsByCompany,
} from "../../api";
import "../../styles/LogistPage.css";

// Компонент автодополнения для компании
function CompanyInput({ value, onChange, companies, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const [filteredCompanies, setFilteredCompanies] = useState(companies);

  useEffect(() => {
    if (!value.trim()) {
      setFilteredCompanies(companies);
    } else {
      const termLower = value.toLowerCase();
      setFilteredCompanies(
        companies.filter(company => company.name.toLowerCase().includes(termLower))
      );
    }
  }, [value, companies]);

  const handleInputChange = (e) => {
    onChange(e.target.value);
    setIsOpen(true);
  };

  const handleCompanySelect = (company) => {
    onChange(company.name);
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
      {isOpen && filteredCompanies.length > 0 && (
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
          {filteredCompanies.map((company) => (
            <li
              key={company.id}
              onClick={() => handleCompanySelect(company)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                color: '#e0e0e0',
                backgroundColor: '#2a2a2a',
                borderBottom: '1px solid #3a3a3a',
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {company.name}
            </li>
          ))}
        </ul>
      )}
      {isOpen && filteredCompanies.length === 0 && value.trim() !== '' && (
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

export default function AdminContactsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Состояния для компаний
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [companies, setCompanies] = useState([]);
  const [filteredCompanies, setFilteredCompanies] = useState([]);
  const [companySearchTerm, setCompanySearchTerm] = useState("");

  // Состояния для контактов
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactPosition, setNewContactPosition] = useState("");
  const [newContactCompanyName, setNewContactCompanyName] = useState(""); // Для автодополнения
  const [contacts, setContacts] = useState({});
  const [loadingContacts, setLoadingContacts] = useState({});

  const [expandedCompanyIds, setExpandedCompanyIds] = useState(new Set());

  useEffect(() => {
    loadCompanies();
  }, []);

  useEffect(() => {
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
    if (loadingContacts[companyId]) return;

    if (contacts[companyId]) {
      setExpandedCompanyIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(companyId)) {
          newSet.delete(companyId);
        } else {
          newSet.add(companyId);
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
      setExpandedCompanyIds(prev => new Set(prev).add(companyId));
    } catch (err) {
      console.error(`Ошибка загрузки контактов для компании ${companyId}:`, err);
      setContacts(prev => ({
        ...prev,
        [companyId]: [],
      }));
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
    if (!newContactName.trim() || !newContactCompanyName.trim()) {
      alert("Заполните ФИО и компанию");
      return;
    }

    // Проверяем, существует ли компания
    const existingCompany = companies.find(c => c.name.toLowerCase() === newContactCompanyName.toLowerCase());
    let companyId;

    if (existingCompany) {
      companyId = existingCompany.id;
    } else {
      // Создаём новую компанию
      try {
        const newCompany = await adminAddCompany({ name: newContactCompanyName.trim() });
        companyId = newCompany.id;
        // Обновляем список компаний
        setCompanies(prev => [...prev, newCompany]);
      } catch (err) {
        console.error("Ошибка добавления компании:", err);
        const errorMsg = err.response?.data?.detail || "Не удалось добавить компанию.";
        alert(`Ошибка: ${errorMsg}`);
        return;
      }
    }

    try {
      const result = await adminAddContactPerson(companyId, {
        name: newContactName.trim(),
        phone: newContactPhone.trim(),
        position: newContactPosition.trim(),
      });
      alert(`Контакт "${result.name}" добавлен (ID: ${result.id})`);
      setNewContactName("");
      setNewContactPhone("");
      setNewContactPosition("");
      setNewContactCompanyName("");
      setShowAddContactModal(false);

      if (contacts[companyId]) {
        setContacts(prev => ({
          ...prev,
          [companyId]: [...(prev[companyId] || []), result]
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
                          marginTop: "-1px",
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
                  <CompanyInput
                    value={newContactCompanyName}
                    onChange={setNewContactCompanyName}
                    companies={companies}
                    placeholder="Введите или выберите компанию"
                  />
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

//edit