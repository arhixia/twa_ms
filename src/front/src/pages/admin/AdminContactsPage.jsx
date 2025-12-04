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

  // Состояния для контактов
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactPosition, setNewContactPosition] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [contacts, setContacts] = useState({});
  const [loadingContacts, setLoadingContacts] = useState({});

  useEffect(() => {
    loadCompanies();
  }, []);

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

    setLoadingContacts(prev => ({ ...prev, [companyId]: true }));
    try {
      const data = await getAdminContactPersonsByCompany(companyId);
      setContacts(prev => ({
        ...prev,
        [companyId]: data || [],
      }));
    } catch (err) {
      console.error(`Ошибка загрузки контактов для компании ${companyId}:`, err);
      setContacts(prev => ({
        ...prev,
        [companyId]: [],
      }));
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
      // Обновляем список контактов для выбранной компании
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

        {/* === Компании и их контакты === */}
        <div className="section">
          <h3>Компании и контакты</h3>
          {companies.length > 0 ? (
            <div className="history-list">
              {companies.map(company => (
                <div key={company.id} className="history-item" style={{ padding: "12px", borderBottom: "1px solid #30363d" }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4>{company.name}</h4>
                    <button
                      className="add-btn"
                      style={{ padding: '4px 8px', fontSize: '0.8em' }}
                      onClick={() => loadContactsForCompany(company.id)}
                      disabled={loadingContacts[company.id]}
                    >
                      {loadingContacts[company.id] ? 'Загрузка...' : 'Показать контакты'}
                    </button>
                  </div>
                  {contacts[company.id] && (
                    <div style={{ marginTop: '8px' }}>
                      {contacts[company.id].length > 0 ? (
                        contacts[company.id].map(contact => (
                          <div key={contact.id} style={{ padding: '4px 0', borderBottom: '1px solid #2a2a2a' }}>
                            <p><b>{contact.name}</b>{contact.position ? ` - ${contact.position}` : ""}</p>
                            <p>Телефон: {contact.phone || "—"}</p>
                          </div>
                        ))
                      ) : (
                        <p style={{ fontStyle: 'italic', color: '#888' }}>Контакты отсутствуют</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
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