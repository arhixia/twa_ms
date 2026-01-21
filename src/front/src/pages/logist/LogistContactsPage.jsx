import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCompaniesList,
  addContactPerson,
  logistUpdateCompany,
  logistUpdateContactPerson,
  getContactPersonsByCompany,
  addCompany as logistAddCompany,
} from "../../api";
import "../../styles/LogistPage.css";

// SVG Icons
const CompanyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-people" viewBox="0 0 16 16">
  <path d="M15 14s1 0 1-1-1-4-5-4-5 3-5 4 1 1 1 1zm-7.978-1L7 12.996c.001-.264.167-1.03.76-1.72C8.312 10.629 9.282 10 11 10c1.717 0 2.687.63 3.24 1.276.593.69.758 1.457.76 1.72l-.008.002-.014.002zM11 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4m3-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0M6.936 9.28a6 6 0 0 0-1.23-.247A7 7 0 0 0 5 9c-4 0-5 3-5 4q0 1 1 1h4.216A2.24 2.24 0 0 1 5 13c0-1.01.377-2.042 1.09-2.904.243-.294.526-.569.846-.816M4.92 10A5.5 5.5 0 0 0 4 13H1c0-.26.164-1.03.76-1.724.545-.636 1.492-1.256 3.16-1.275ZM1.5 5.5a3 3 0 1 1 6 0 3 3 0 0 1-6 0m3-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4"/>
</svg>
);

const PersonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" fill="#94a3b8"/>
  </svg>
);

const PositionIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" fill="#94a3b8"/>
  </svg>
);

const PhoneIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6.62 10.79C8.06 13.62 10.38 15.94 13.21 17.38L15.41 15.18C15.69 14.9 16.08 14.82 16.43 14.93C17.55 15.3 18.75 15.5 20 15.5C20.55 15.5 21 15.95 21 16.5V20C21 20.55 20.55 21 20 21C10.61 21 3 13.39 3 4C3 3.45 3.45 3 4 3H7.5C8.05 3 8.5 3.45 8.5 4C8.5 5.25 8.7 6.45 9.07 7.57C9.18 7.92 9.1 8.31 8.82 8.59L6.62 10.79Z" fill="#94a3b8"/>
  </svg>
);

function CompanyInput({ value, onChange, companies, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const [filteredCompanies, setFilteredCompanies] = useState(companies);
  const [inputValue, setInputValue] = useState(value);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    if (!inputValue.trim()) {
      setFilteredCompanies(companies);
    } else {
      const termLower = inputValue.toLowerCase();
      setFilteredCompanies(
        companies.filter(company => company.name.toLowerCase().includes(termLower))
      );
    }
  }, [inputValue, companies]);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
    setIsOpen(true);
  };

  const handleCompanySelect = (company) => {
    setInputValue(company.name);
    onChange(company.name);
    setIsOpen(false);
  };

  const handleInputFocus = () => setIsOpen(true);
  const handleInputBlur = () => setTimeout(() => setIsOpen(false), 150);

  return (
    <div className="searchable-select-container">
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        placeholder={placeholder}
        className="searchable-select-input"
      />
      {isOpen && filteredCompanies.length > 0 && (
        <ul className="searchable-select-dropdown">
          {filteredCompanies.map((company) => (
            <li
              key={company.id}
              onClick={() => handleCompanySelect(company)}
              className="searchable-select-option"
              onMouseDown={(e) => e.preventDefault()}
            >
              {company.name}
            </li>
          ))}
        </ul>
      )}
      {isOpen && filteredCompanies.length === 0 && inputValue.trim() !== '' && (
        <ul className="searchable-select-dropdown">
          <li className="searchable-select-no-results">
            Ничего не найдено
          </li>
        </ul>
      )}
    </div>
  );
}

function EditCompanyModal({ company, onClose, onSave }) {
  const [name, setName] = useState(company.name);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Введите название компании");
      } else {
        alert("Введите название компании");
      }
      return;
    }

    setSaving(true);
    try {
      const updated = await logistUpdateCompany(company.id, { name });
      onSave(updated);
      onClose();
    } catch (err) {
      const errorMsg = err.response?.data?.detail || "Ошибка обновления компании";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`Ошибка: ${errorMsg}`);
      } else {
        alert(`Ошибка: ${errorMsg}`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="task-section-header">
            <CompanyIcon />
            <span>Редактировать компанию</span>
          </div>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="task-field">
            <div className="task-field-label">
              <CompanyIcon />
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
        </div>
        <div className="modal-actions">
          <button 
            className="gradient-button" 
            onClick={handleSubmit} 
            disabled={saving}
            style={{
              background: saving ? 'linear-gradient(to right, #94a3b8, #64748b)' : 'linear-gradient(to right, #10b981, #2563eb)'
            }}
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditContactPersonModal({ contact, onClose, onSave, companies, onAddNewCompany }) {
  const [name, setName] = useState(contact.name);
  const [position, setPosition] = useState(contact.position || "");
  const [phone, setPhone] = useState(contact.phone);
  const [companyId, setCompanyId] = useState(contact.company_id);
  const [companyName, setCompanyName] = useState(companies.find(c => c.id === contact.company_id)?.name || "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || (!companyId && !companyName.trim())) {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Заполните ФИО и выберите/создайте компанию");
      } else {
        alert("Заполните ФИО и выберите/создайте компанию");
      }
      return;
    }

    let finalCompanyId = companyId;
    
    if (!companyId && companyName.trim()) {
      const existingCompany = companies.find(c => c.name.toLowerCase() === companyName.toLowerCase());
      if (existingCompany) {
        finalCompanyId = existingCompany.id;
      } else {
        try {
          const newCompany = await logistAddCompany({ name: companyName.trim() });
          finalCompanyId = newCompany.id;
          if (onAddNewCompany) onAddNewCompany(newCompany);
        } catch (err) {
          const errorMsg = err.response?.data?.detail || "Ошибка создания компании";
          if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.showAlert(`Ошибка создания компании: ${errorMsg}`);
          } else {
            alert(`Ошибка создания компании: ${errorMsg}`);
          }
          return;
        }
      }
    }

    setSaving(true);
    try {
      const updated = await logistUpdateContactPerson(contact.id, {
        name,
        position: position.trim() || null,
        phone: phone.trim() || null,
        company_id: finalCompanyId
      });
      onSave(updated);
      onClose();
    } catch (err) {
      const errorMsg = err.response?.data?.detail || "Ошибка обновления контакта";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`Ошибка: ${errorMsg}`);
      } else {
        alert(`Ошибка: ${errorMsg}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCompanyChange = (selectedCompanyName) => {
    setCompanyName(selectedCompanyName);
    const selectedCompany = companies.find(c => c.name === selectedCompanyName);
    if (selectedCompany) {
      setCompanyId(selectedCompany.id);
    } else {
      setCompanyId(null);
    }
  };

  const handleAddNewCompany = async (newCompanyName) => {
    try {
      const newCompany = await logistAddCompany({ name: newCompanyName });
      setCompanyName(newCompany.name);
      setCompanyId(newCompany.id);
      if (onAddNewCompany) onAddNewCompany(newCompany);
    } catch (err) {
      const errorMsg = err.response?.data?.detail || "Ошибка создания компании";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`Ошибка: ${errorMsg}`);
      } else {
        alert(`Ошибка: ${errorMsg}`);
      }
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="task-section-header">
            <PersonIcon />
            <span>Редактировать контактное лицо</span>
          </div>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="task-field">
            <div className="task-field-label">
              <PersonIcon />
              ФИО:
            </div>
            <div className="task-field-value">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Введите ФИО"
                className="dark-select"
              />
            </div>
          </div>
          
          <div className="task-field">
            <div className="task-field-label">
              <PositionIcon />
              Должность:
            </div>
            <div className="task-field-value">
              <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="Введите должность (необязательно)"
                className="dark-select"
              />
            </div>
          </div>
          
          <div className="task-field">
            <div className="task-field-label">
              <PhoneIcon />
              Телефон:
            </div>
            <div className="task-field-value">
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Введите телефон (необязательно)"
                className="dark-select"
              />
            </div>
          </div>
          
          <div className="task-field">
            <div className="task-field-label">
              <CompanyIcon />
              Компания:
            </div>
            <div className="task-field-value">
              <CompanyInput
                value={companyName}
                onChange={handleCompanyChange}
                companies={companies}
                placeholder="Выберите или создайте компанию"
                onAddNew={handleAddNewCompany}
              />
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button 
            className="gradient-button" 
            onClick={handleSubmit} 
            disabled={saving}
            style={{
              background: saving ? 'linear-gradient(to right, #94a3b8, #64748b)' : 'linear-gradient(to right, #10b981, #2563eb)'
            }}
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LogistContactsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [companies, setCompanies] = useState([]);
  const [filteredCompanies, setFilteredCompanies] = useState([]);
  const [companySearchTerm, setCompanySearchTerm] = useState("");

  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactPosition, setNewContactPosition] = useState("");
  const [newContactCompanyName, setNewContactCompanyName] = useState("");
  const [contacts, setContacts] = useState({});
  const [loadingContacts, setLoadingContacts] = useState({});

  const [expandedCompanyIds, setExpandedCompanyIds] = useState(new Set());

  const [showEditCompanyModal, setShowEditCompanyModal] = useState(false);
  const [showEditContactModal, setShowEditContactModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [editingContact, setEditingContact] = useState(null);

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
      const data = await getCompaniesList();
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
      const data = await getContactPersonsByCompany(companyId);
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
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Введите название компании");
      } else {
        alert("Введите название компании");
      }
      return;
    }
    try {
      const result = await logistAddCompany({ name: newCompanyName.trim() });
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`Компания "${result.name}" добавлена`);
      } else {
        alert(`Компания "${result.name}" добавлена`);
      }
      setNewCompanyName("");
      setShowAddCompanyModal(false);
      loadCompanies();
    } catch (err) {
      const errorMsg = err.response?.data?.detail || "Ошибка добавления компании";
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`Ошибка: ${errorMsg}`);
      } else {
        alert(`Ошибка: ${errorMsg}`);
      }
    }
  };

  const handleAddContact = async () => {
    if (!newContactName.trim() || !newContactCompanyName.trim()) {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert("Заполните ФИО и компанию");
      } else {
        alert("Заполните ФИО и компанию");
      }
      return;
    }

    const existingCompany = companies.find(c => c.name.toLowerCase() === newContactCompanyName.toLowerCase());
    let companyId;

    if (!existingCompany) {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`Компания "${newContactCompanyName}" не найдена.`);
      } else {
        alert(`Компания "${newContactCompanyName}" не найдена.`);
      }
      return;
    }

    companyId = existingCompany.id;

    try {
      const result = await addContactPerson(companyId, {
        name: newContactName.trim(),
        phone: newContactPhone.trim(),
        position: newContactPosition.trim(),
      });
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`Контакт "${result.name}" добавлен (ID: ${result.id})`);
      } else {
        alert(`Контакт "${result.name}" добавлен (ID: ${result.id})`);
      }
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
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.showAlert(`Ошибка: ${errorMsg}`);
      } else {
        alert(`Ошибка: ${errorMsg}`);
      }
    }
  };

  const openEditCompanyModal = (company) => {
    setEditingCompany(company);
    setShowEditCompanyModal(true);
  };

  const openEditContactModal = (contact) => {
    setEditingContact(contact);
    setShowEditContactModal(true);
  };

  const handleCompanySave = (updatedCompany) => {
    setCompanies(prev => prev.map(c => c.id === updatedCompany.id ? updatedCompany : c));
  };

  const handleContactSave = (updatedContact) => {
    setContacts(prev => {
      const companyContacts = prev[updatedContact.company_id] || [];
      const updatedList = companyContacts.map(c => 
        c.id === updatedContact.id ? updatedContact : c
      );
      return {
        ...prev,
        [updatedContact.company_id]: updatedList
      };
    });
  };

  if (loading) return <div className="logist-main"><div className="empty">Загрузка...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Контакты</h1>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button className="gradient-button" onClick={() => setShowAddCompanyModal(true)}>+ Компания</button>
          <button className="gradient-button" onClick={() => setShowAddContactModal(true)}>+ Контакт</button>
        </div>

        <div style={{ marginBottom: '16px', maxWidth: '100%' }}>
          <label className="dark-label" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, sans-serif' }}>
  Поиск по компаниям
</label>
          <input
            type="text"
            className="dark-select"
            placeholder="Поиск..."
            value={companySearchTerm}
            onChange={e => setCompanySearchTerm(e.target.value)}
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
                      className="profile-card clickable-history-item"
                      style={{
                        padding: "12px",
                        cursor: "pointer",
                        borderRadius: "8px",
                        transition: "background-color 0.2s ease",
                        border: "1px solid rgba(255,255,255,0.08)",
                        backgroundColor: "#1b2c3c",
                      }}
                      onClick={() => loadContactsForCompany(company.id)}
                    >
                      <p style={{ margin: "0", fontWeight: "bold", fontSize: "0.9em", display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{company.name}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditCompanyModal(company);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#8b949e',
                            cursor: 'pointer',
                            fontSize: '1em',
                            padding: '0 4px'
                          }}
                          title="Редактировать"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-pencil" viewBox="0 0 16 16">
  <path d="M12.146.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12.5V12h-.5a.5.5 0 0 1-.5-.5V11h-.5a.5.5 0 0 1-.468-.325"/>
</svg>
                        </button>
                      </p>
                    </div>
                    {isExpanded && (
                      <div
                        style={{
                          padding: "12px",
                          backgroundColor: "#161b22",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "0 0 8px 8px",
                          marginTop: "-1px",
                        }}
                      >
                        {isLoading ? (
                          <p style={{ margin: "0", fontStyle: "italic", color: "#888" }}>Загрузка...</p>
                        ) : companyContacts.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {companyContacts.map(contact => (
                              <div
                                key={contact.id}
                                className="profile-card"
                                style={{ 
                                  padding: '8px', 
                                  cursor: 'pointer',
                                  border: "1px solid rgba(255,255,255,0.08)",
                                  backgroundColor: "#1b2c3c",
                                }}
                                onClick={(e) => { 
                                  e.stopPropagation();
                                  openEditContactModal(contact);
                                }}
                              >
                                <p style={{ margin: '0 0 4px 0', fontWeight: 'bold', fontSize: '0.95em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span>{contact.name}</span>
                                </p>
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
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="task-section-header">
                  <CompanyIcon />
                  <span>Добавить компанию</span>
                </div>
                <button className="close" onClick={(e) => { e.stopPropagation(); setShowAddCompanyModal(false); }}>×</button>
              </div>
              <div className="modal-body">
                <div className="task-field">
                  <div className="task-field-label">
                    <CompanyIcon />
                    Название:
                  </div>
                  <div className="task-field-value">
                    <input
                      type="text"
                      value={newCompanyName}
                      onChange={(e) => setNewCompanyName(e.target.value)}
                      placeholder="Введите название"
                      className="dark-select"
                    />
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button className="gradient-button" onClick={(e) => { e.stopPropagation(); handleAddCompany(); }}>
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        )}

        {showAddContactModal && (
          <div className="modal-backdrop" onClick={() => setShowAddContactModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="task-section-header">
                  <PersonIcon />
                  <span>Добавить контактное лицо</span>
                </div>
                <button className="close" onClick={(e) => { e.stopPropagation(); setShowAddContactModal(false); }}>×</button>
              </div>
              <div className="modal-body">
                <div className="task-field">
                  <div className="task-field-label">
                    <PersonIcon />
                    ФИО:
                  </div>
                  <div className="task-field-value">
                    <input
                      type="text"
                      value={newContactName}
                      onChange={(e) => setNewContactName(e.target.value)}
                      placeholder="Введите ФИО"
                      className="dark-select"
                    />
                  </div>
                </div>
                
                <div className="task-field">
                  <div className="task-field-label">
                    <PositionIcon />
                    Должность:
                  </div>
                  <div className="task-field-value">
                    <input
                      type="text"
                      value={newContactPosition}
                      onChange={(e) => setNewContactPosition(e.target.value)}
                      placeholder="Введите должность (необязательно)"
                      className="dark-select"
                    />
                  </div>
                </div>
                
                <div className="task-field">
                  <div className="task-field-label">
                    <PhoneIcon />
                    Телефон:
                  </div>
                  <div className="task-field-value">
                    <input
                      type="text"
                      value={newContactPhone}
                      onChange={(e) => setNewContactPhone(e.target.value)}
                      placeholder="Введите телефон (необязательно)"
                      className="dark-select"
                    />
                  </div>
                </div>
                
                <div className="task-field">
                  <div className="task-field-label">
                    <CompanyIcon />
                    Компания:
                  </div>
                  <div className="task-field-value">
                    <CompanyInput
                      value={newContactCompanyName}
                      onChange={setNewContactCompanyName}
                      companies={companies}
                      placeholder="Выберите компанию"
                    />
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button className="gradient-button" onClick={(e) => { e.stopPropagation(); handleAddContact(); }}>
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        )}

        {showEditCompanyModal && editingCompany && (
          <EditCompanyModal
            company={editingCompany}
            onClose={() => {
              setShowEditCompanyModal(false);
              setEditingCompany(null);
            }}
            onSave={handleCompanySave}
          />
        )}

        {showEditContactModal && editingContact && (
          <EditContactPersonModal
            contact={editingContact}
            onClose={() => {
              setShowEditContactModal(false);
              setEditingContact(null);
            }}
            onSave={handleContactSave}
            companies={companies}
            onAddNewCompany={(newCompany) => {
              setCompanies(prev => [...prev, newCompany]);
            }}
          />
        )}
      </div>
    </div>
  );
}