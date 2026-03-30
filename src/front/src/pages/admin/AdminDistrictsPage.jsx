// front/src/pages/admin/AdminDistrictsPage.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  adminGetAllDistricts,
  adminCreateDistrict,
  adminUpdateDistrict,
  adminGetDistrictById
} from "../../api";
import "../../styles/LogistPage.css";
import { showAlert } from "../../utils/notify";

const DistrictIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-buildings" viewBox="0 0 16 16">
  <path d="M14.763.075A.5.5 0 0 1 15 .5v15a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5V14h-1v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V10a.5.5 0 0 1 .342-.474L6 7.64V4.5a.5.5 0 0 1 .276-.447l8-4a.5.5 0 0 1 .487.022M6 8.694 1 10.36V15h5zM7 15h2v-1.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5V15h2V1.309l-7 3.5z"/>
  <path d="M2 11h1v1H2zm2 0h1v1H4zm-2 2h1v1H2zm2 0h1v1H4zm4-4h1v1H8zm2 0h1v1h-1zm-2 2h1v1H8zm2 0h1v1h-1zm2-2h1v1h-1zm0 2h1v1h-1zM8 7h1v1H8zm2 0h1v1h-1zm2 0h1v1h-1zM8 5h1v1H8zm2 0h1v1h-1zm2 0h1v1h-1zm0-2h1v1h-1z"/>
</svg>
);

function EditDistrictModal({ district, onClose, onSave }) {
  const [name, setName] = useState(district.name);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) {
      showAlert("Введите название региона");
      return;
    }

    setSaving(true);
    try {
      const updated = await adminUpdateDistrict(district.id, {
        name
      });
      onSave(updated);
      onClose();
    } catch (err) {
      const errorMsg = err.response?.data?.detail || "Ошибка обновления региона";
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
            <DistrictIcon />
            <span>Редактировать регион</span>
          </div>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="task-field">
            <div className="task-field-label">
              <DistrictIcon />
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

function ViewUsersModal({ district, onClose }) {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    loadUsers();
  }, [district.id]);

  async function loadUsers() {
    setLoading(true);
    try {
      const response = await adminGetDistrictById(district.id);
      setUsers(response.montajniks || []);
    } catch (err) {
      console.error("Ошибка загрузки пользователей:", err);
      showAlert("Ошибка загрузки пользователей");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '600px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="task-section-header">
            <DistrictIcon />
            <span>Монтажники в регионе "{district.name}"</span>
          </div>
          <button className="close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="empty">Загрузка...</div>
          ) : users.length > 0 ? (
            <div className="history-list">
              {users.map(user => (
                <div
                  key={user.id}
                  className="profile-card"
                  style={{
                    padding: "8px",
                    borderBottom: "1px solid #2a2a2a",
                    backgroundColor: "#161b22",
                    borderRadius: "4px",
                    marginTop: '2px',
                    transition: "background-color 0.2s ease",
                  }}
                >
                
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">В этом регионе нет монтажников</div>
          )}
        </div>
        <div className="modal-actions">
          <button 
            className="gradient-button" 
            onClick={onClose}
            style={{
              background: 'linear-gradient(to right, #6c757d, #495057)'
            }}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDistrictsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Состояния для районов
  const [showAddDistrictModal, setShowAddDistrictModal] = useState(false);
  const [newDistrictName, setNewDistrictName] = useState("");
  const [districts, setDistricts] = useState([]);
  const [districtSearchTerm, setDistrictSearchTerm] = useState("");

  // Состояния для раскрытия/скрытия пользователей
  const [expandedDistrictIds, setExpandedDistrictIds] = useState(new Set());
  const [loadingUsers, setLoadingUsers] = useState({});

  // Состояния для модальных окон
  const [showEditDistrictModal, setShowEditDistrictModal] = useState(false);
  const [editingDistrict, setEditingDistrict] = useState(null);
  const [showViewUsersModal, setShowViewUsersModal] = useState(false);
  const [viewingDistrict, setViewingDistrict] = useState(null);

  useEffect(() => {
    loadDistricts();
  }, []);

  useEffect(() => {
    let allDistricts = districts;
    if (districtSearchTerm.trim()) {
      const termLower = districtSearchTerm.toLowerCase();
      allDistricts = districts.filter(d => d.name.toLowerCase().includes(termLower));
    }
    setFilteredDistricts(allDistricts);
  }, [districts, districtSearchTerm]);

  const [filteredDistricts, setFilteredDistricts] = useState([]);

  async function loadDistricts() {
    try {
      setLoading(true);
      const data = await adminGetAllDistricts();
      setDistricts(data || []);
    } catch (err) {
      console.error("Ошибка загрузки регионов:", err);
      setError("Ошибка загрузки регионов");
    } finally {
      setLoading(false);
    }
  }

  async function loadUsersForDistrict(districtId) {
    if (loadingUsers[districtId]) return;

    if (expandedDistrictIds.has(districtId)) {
      setExpandedDistrictIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(districtId);
        return newSet;
      });
      return;
    }

    setLoadingUsers(prev => ({ ...prev, [districtId]: true }));
    try {
      const response = await adminGetDistrictById(districtId);
      const districtData = { ...response, montajniks: response.montajniks || [] };
      
      // Обновляем данные района в списке
      setDistricts(prev => 
        prev.map(d => d.id === districtId ? districtData : d)
      );
      
      setExpandedDistrictIds(prev => new Set(prev).add(districtId));
    } catch (err) {
      console.error(`Ошибка загрузки пользователей для региона ${districtId}:`, err);
      // Добавляем район в expanded, чтобы показать сообщение о пустом списке
      setExpandedDistrictIds(prev => new Set(prev).add(districtId));
    } finally {
      setLoadingUsers(prev => ({ ...prev, [districtId]: false }));
    }
  }

  const handleAddDistrict = async () => {
    if (!newDistrictName.trim()) {
      showAlert("Введите название региона");
      return;
    }
    try {
      const result = await adminCreateDistrict({
        name: newDistrictName.trim()
      });
      showAlert(`Регион "${result.name}" добавлен`);
      setNewDistrictName("");
      setShowAddDistrictModal(false);
      loadDistricts();
    } catch (err) {
      showAlert(err.response?.data?.detail || "Ошибка добавления региона");
    }
  };

  const openEditDistrictModal = (district) => {
    setEditingDistrict(district);
    setShowEditDistrictModal(true);
  };


  const handleDistrictSave = (updatedDistrict) => {
    setDistricts(prev => prev.map(d => d.id === updatedDistrict.id ? updatedDistrict : d));
  };

  if (loading) return <div className="logist-main"><div className="empty">Загрузка...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Регионы</h1>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button className="gradient-button" onClick={() => setShowAddDistrictModal(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4" stroke="currentColor" strokeWidth="2" fill="none"/>
            </svg>
            Регионы
          </button>
        </div>

        <div style={{ marginBottom: '16px', maxWidth: '100%' }}>
          <label className="dark-label" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Oxygen, Ubuntu, Cantarell, sans-serif' }}>
            Поиск по регионам
          </label>
          <input
            type="text"
            className="dark-select"
            placeholder="Поиск..."
            value={districtSearchTerm}
            onChange={e => setDistrictSearchTerm(e.target.value)}
          />
        </div>

        <div className="section">
          <h3>Регионы и монтажники</h3>
          {filteredDistricts.length > 0 ? (
            <div className="history-list">
              {filteredDistricts.map(district => {
                const isExpanded = expandedDistrictIds.has(district.id);
                const districtUsers = district.montajniks || [];
                const isLoading = loadingUsers[district.id];

                return (
                  <React.Fragment key={district.id}>
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
                      onClick={() => loadUsersForDistrict(district.id)}
                    >
                      <p style={{ margin: "0", fontWeight: "bold", fontSize: "0.9em", display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{district.name}</span>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDistrictModal(district);
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
                        </div>
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
                        ) : districtUsers.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {districtUsers.map(user => (
                              <div
                                key={user.id}
                                className="profile-card"
                                style={{ 
                                  padding: '8px', 
                                  cursor: 'default',
                                  border: "1px solid rgba(255,255,255,0.08)",
                                  backgroundColor: "#1b2c3c",
                                }}
                              >
                                <p style={{ margin: '0 0 4px 0', fontWeight: 'bold', fontSize: '0.95em' }}>
                                  {user.name} {user.lastname}
                                </p>
                                
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p style={{ margin: "0", fontStyle: "italic", color: "#888" }}>Монтажники отсутствуют</p>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          ) : (
            <div className="empty">Список регионов пуст</div>
          )}
        </div>

        {/* Модальное окно добавления района */}
        {showAddDistrictModal && (
          <div className="modal-backdrop" onClick={() => setShowAddDistrictModal(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div className="task-section-header">
                  <DistrictIcon />
                  <span>Добавить регион</span>
                </div>
                <button className="close" onClick={(e) => { e.stopPropagation(); setShowAddDistrictModal(false); }}>×</button>
              </div>
              <div className="modal-body">
                <div className="task-field">
                  <div className="task-field-label">
                    <DistrictIcon />
                    Название:
                  </div>
                  <div className="task-field-value">
                    <input
                      type="text"
                      value={newDistrictName}
                      onChange={(e) => setNewDistrictName(e.target.value)}
                      placeholder="Введите название"
                      className="dark-select"
                    />
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button className="gradient-button" onClick={(e) => { e.stopPropagation(); handleAddDistrict(); }}>
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Модальное окно редактирования района */}
        {showEditDistrictModal && editingDistrict && (
          <EditDistrictModal
            district={editingDistrict}
            onClose={() => {
              setShowEditDistrictModal(false);
              setEditingDistrict(null);
            }}
            onSave={handleDistrictSave}
          />
        )}

        {/* Модальное окно просмотра пользователей */}
        {showViewUsersModal && viewingDistrict && (
          <ViewUsersModal
            district={viewingDistrict}
            onClose={() => {
              setShowViewUsersModal(false);
              setViewingDistrict(null);
            }}
          />
        )}
      </div>
    </div>
  );
}