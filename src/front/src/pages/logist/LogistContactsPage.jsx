// front/src/pages/logist/LogistContactsPage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getCompaniesList,
  addContactPerson,
  logistUpdateCompany,
  logistUpdateContactPerson,
  getContactPersonsByCompany,
  // Импортируем эндпоинт для добавления компании
  addCompany as logistAddCompany,
} from "../../api";
import "../../styles/LogistPage.css";

// Компонент автодополнения для компании (скопирован из AdminContactsPage)
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

// --- КОМПОНЕНТ: Модальное окно редактирования компании ---
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
          <h2>Редактировать компанию</h2>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
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
    
    // Если компания не выбрана, но введено имя - создаем новую
    if (!companyId && companyName.trim()) {
      const existingCompany = companies.find(c => c.name.toLowerCase() === companyName.toLowerCase());
      if (existingCompany) {
        finalCompanyId = existingCompany.id;
      } else {
        try {
          const newCompany = await logistAddCompany({ name: companyName.trim() });
          finalCompanyId = newCompany.id;
          // Обновляем список компаний через родительский компонент
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
          <h2>Редактировать контактное лицо</h2>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <label className="dark-label">
            ФИО
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Введите ФИО"
              className="dark-select"
            />
          </label>
          <label className="dark-label">
            Должность
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="Введите должность (необязательно)"
              className="dark-select"
            />
          </label>
          <label className="dark-label">
            Телефон
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Введите телефон (необязательно)"
              className="dark-select"
            />
          </label>
          <label className="dark-label">
            Компания
            <CompanyInput
              value={companyName}
              onChange={handleCompanyChange}
              companies={companies}
              placeholder="Выберите или создайте компанию"
              onAddNew={handleAddNewCompany}
            />
          </label>
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
  const [newContactCompanyName, setNewContactCompanyName] = useState("");
  const [contacts, setContacts] = useState({});
  const [loadingContacts, setLoadingContacts] = useState({});

  const [expandedCompanyIds, setExpandedCompanyIds] = useState(new Set());

  // Состояния для модальных окон редактирования
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
      const data = await getCompaniesList(); // Используем логистский эндпоинт
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
      const data = await getContactPersonsByCompany(companyId); // Используем логистский эндпоинт
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

  // --- ИСПРАВЛЕНАЯ ФУНКЦИЯ handleAddCompany ---
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
      // Перезагружаем список компаний
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
    // Обновляем список контактов для компании
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
          {/* Возвращаем кнопку "Добавить компанию" */}
          <button className="gradient-button" onClick={() => setShowAddCompanyModal(true)}>+ Компания</button>
          <button className="gradient-button" onClick={() => setShowAddContactModal(true)}>+ Контакт</button>
        </div>

        <div style={{ marginBottom: '16px', maxWidth: '100%' }}>
          <label className="dark-label">Поиск по компаниям</label>
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
                          ✏️
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
                                  e.stopPropagation(); // <-- Останавливаем всплытие, чтобы не вызвать loadContactsForCompany
                                  openEditContactModal(contact); // <-- Открываем модальное окно редактирования
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

        {/* === Модальное окно добавления компании === */}
        {showAddCompanyModal && (
          <div className="modal-backdrop" onClick={() => setShowAddCompanyModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Добавить компанию</h2>
                <button className="close" onClick={(e) => { e.stopPropagation(); setShowAddCompanyModal(false); }}>×</button>
              </div>
              <div className="modal-body">
                <label className="dark-label">
                  Название
                  <input
                    type="text"
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    placeholder="Введите название"
                    className="dark-select"
                  />
                </label>
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
                <h2>Добавить контактное лицо</h2>
                <button className="close" onClick={(e) => { e.stopPropagation(); setShowAddContactModal(false); }}>×</button>
              </div>
              <div className="modal-body">
                <label className="dark-label">
                  ФИО
                  <input
                    type="text"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="Введите ФИО"
                    className="dark-select"
                  />
                </label>
                <label className="dark-label">
                  Должность
                  <input
                    type="text"
                    value={newContactPosition}
                    onChange={(e) => setNewContactPosition(e.target.value)}
                    placeholder="Введите должность (необязательно)"
                    className="dark-select"
                  />
                </label>
                <label className="dark-label">
                  Телефон
                  <input
                    type="text"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    placeholder="Введите телефон (необязательно)"
                    className="dark-select"
                  />
                </label>
                <label className="dark-label">
                  Компания
                  <CompanyInput
                    value={newContactCompanyName}
                    onChange={setNewContactCompanyName}
                    companies={companies}
                    placeholder="Выберите компанию"
                  />
                </label>
              </div>
              <div className="modal-actions">
                <button className="gradient-button" onClick={(e) => { e.stopPropagation(); handleAddContact(); }}>
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        )}

        {/* === Модальное окно редактирования компании === */}
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

        {/* === Модальное окно редактирования контакта === */}
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