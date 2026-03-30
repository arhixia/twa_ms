import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  superAdminListAllCompanies,
  superAdminCreateCompany
} from "../../api";
import "../../styles/LogistPage.css";
import { showAlert } from "../../utils/notify";


const CompanyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-people" viewBox="0 0 16 16">
  <path d="M15 14s1 0 1-1-1-4-5-4-5 3-5 4 1 1 1 1zm-7.978-1L7 12.996c.001-.264.167-1.03.76-1.72C8.312 10.629 9.282 10 11 10c1.717 0 2.687.63 3.24 1.276.593.69.758 1.457.76 1.72l-.008.002-.014.002zM11 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4m3-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0M6.936 9.28a6 6 0 0 0-1.23-.247A7 7 0 0 0 5 9c-4 0-5 3-5 4q0 1 1 1h4.216A2.24 2.24 0 0 1 5 13c0-1.01.377-2.042 1.09-2.904.243-.294.526-.569.846-.816M4.92 10A5.5 5.5 0 0 0 4 13H1c0-.26.164-1.03.76-1.724.545-.636 1.492-1.256 3.16-1.275ZM1.5 5.5a3 3 0 1 1 6 0 3 3 0 0 1-6 0m3-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4"/>
</svg>
);

function AddCompanyModal({ isOpen, onClose, onAdd }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      showAlert("Пожалуйста, введите название компании.");
      return;
    }

    setSaving(true);
    try {
      const result = await superAdminCreateCompany({ name: name.trim() });
      showAlert(`Компания "${result.name}" добавлена`);
      onAdd(result);
      onClose();
    } catch (err) {
      const errorMsg = err.response?.data?.detail || "Ошибка добавления компании";
      showAlert (`Ошибка: ${errorMsg}`);
    } finally {
      setSaving(false);
      setName("");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="task-section-header">
            <CompanyIcon />
            <span>Добавить компанию</span>
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
            {saving ? 'Создание...' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SuperAdminCompaniesPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Состояния для компаний
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [filteredCompanies, setFilteredCompanies] = useState([]);
  const [companySearchTerm, setCompanySearchTerm] = useState("");

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
      const data = await superAdminListAllCompanies();
      setCompanies(data || []);
    } catch (err) {
      console.error("Ошибка загрузки компаний:", err);
      setError("Ошибка загрузки компаний");
    } finally {
      setLoading(false);
    }
  }

  const handleCompanyAdd = (newCompany) => {
    setCompanies(prev => [...prev, newCompany]);
  };

  if (loading) return <div className="logist-main"><div className="empty">Загрузка...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Компании</h1>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button className="gradient-button" onClick={() => setShowAddCompanyModal(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-plus" viewBox="0 0 16 16">
              <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4" stroke="currentColor" strokeWidth="2" fill="none"/>
            </svg>
            Компания
          </button>
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
          <h3>Все компании</h3>
          {filteredCompanies.length > 0 ? (
            <div className="history-list">
              {filteredCompanies.map(company => (
                <div
                  key={company.id}
                  className="profile-card"
                  style={{
                    padding: "12px",
                    borderRadius: "8px",
                    border: "1px solid rgba(255,255,255,0.08)",
                    backgroundColor: "#1b2c3c",
                  }}
                >
                  <p style={{ margin: "0", fontWeight: "bold", fontSize: "0.9em", display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{company.name}</span>
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">Список компаний пуст</div>
          )}
        </div>

        {/* === Модальное окно добавления компании === */}
        <AddCompanyModal
          isOpen={showAddCompanyModal}
          onClose={() => setShowAddCompanyModal(false)}
          onAdd={handleCompanyAdd}
        />
      </div>
    </div>
  );
}