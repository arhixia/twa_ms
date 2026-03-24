import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchAdminProfile,
  getAdminStatistics, // Новое API
} from "../../api";
import "../../styles/LogistPage.css";

// ✅ Хук для определения мобильного устройства
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

export default function AdminProfilePage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const isMobile = useIsMobile();

  // Состояния для сворачивания/разворачивания
  const [isMontajnikExpanded, setIsMontajnikExpanded] = useState(true);
  const [isLogistExpanded, setIsLogistExpanded] = useState(true);

  // Общий период для всей статистики
  const [selectedStartYear, setSelectedStartYear] = useState(new Date().getFullYear());
  const [selectedStartMonth, setSelectedStartMonth] = useState(1); // Январь
  const [selectedEndYear, setSelectedEndYear] = useState(new Date().getFullYear());
  const [selectedEndMonth, setSelectedEndMonth] = useState(new Date().getMonth() + 1); // Текущий месяц
  
  const [statistics, setStatistics] = useState(null);
  const [statisticsLoading, setStatisticsLoading] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  // Загружаем статистику при изменении дат
  useEffect(() => {
    loadStatistics();
  }, [selectedStartYear, selectedStartMonth, selectedEndYear, selectedEndMonth]);

  async function loadProfile() {
    setLoading(true);
    try {
      const data = await fetchAdminProfile();
      setProfile(data);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Ошибка загрузки профиля");
    } finally {
      setLoading(false);
    }
  }

  async function loadStatistics() {
    if (!selectedStartYear || !selectedStartMonth || !selectedEndYear || !selectedEndMonth) return;
    
    setStatisticsLoading(true);
    try {
      const data = await getAdminStatistics(
        selectedStartYear, 
        selectedStartMonth, 
        selectedEndYear, 
        selectedEndMonth
      );
      setStatistics(data);
    } catch (err) {
      console.error("Ошибка загрузки статистики:", err);
      setStatistics(null);
    } finally {
      setStatisticsLoading(false);
    }
  }

  const handleStartYearChange = (e) => {
    setSelectedStartYear(Number(e.target.value));
  };

  const handleStartMonthChange = (e) => {
    setSelectedStartMonth(Number(e.target.value));
  };

  const handleEndYearChange = (e) => {
    setSelectedEndYear(Number(e.target.value));
  };

  const handleEndMonthChange = (e) => {
    setSelectedEndMonth(Number(e.target.value));
  };

  const toggleMontajnikExpand = () => {
    setIsMontajnikExpanded(!isMontajnikExpanded);
  };

  const toggleLogistExpand = () => {
    setIsLogistExpanded(!isLogistExpanded);
  };

  // Генерация списка лет (последние 5 лет)
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  // Месяцы
  const months = [
    { value: 1, name: 'Январь' },
    { value: 2, name: 'Февраль' },
    { value: 3, name: 'Март' },
    { value: 4, name: 'Апрель' },
    { value: 5, name: 'Май' },
    { value: 6, name: 'Июнь' },
    { value: 7, name: 'Июль' },
    { value: 8, name: 'Август' },
    { value: 9, name: 'Сентябрь' },
    { value: 10, name: 'Октябрь' },
    { value: 11, name: 'Ноябрь' },
    { value: 12, name: 'Декабрь' },
  ];

  if (loading) return <div className="logist-main"><div className="empty">Загрузка...</div></div>;
  if (error) return <div className="logist-main"><div className="error">{error}</div></div>;

  return (
    <div className="logist-main">
      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Статистика</h1>
        </div>

        {/* ========== ОБЩИЙ ВЫБОР ПЕРИОДА ========== */}
        <div className="section" style={{ marginTop: '24px' }}>
          <div style={{
            backgroundColor: '#26293a',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid #444',
            marginBottom: '24px'
          }}>
            <h2 style={{ 
              color: 'white', 
              fontSize: isMobile ? '1.2em' : '1.4em',
              fontWeight: '700',
              margin: '0 0 16px 0',
              fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              Период статистики
            </h2>
            
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column',
              gap: '12px',
              width: '100%'
            }}>
              <span style={{ 
                color: '#e0e0e0', 
                fontSize: isMobile ? '0.95em' : '1.05em',
                fontWeight: '600',
                fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                Укажите период:
              </span>
              
              {/* Период С */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap'
              }}>
                <label style={{ 
                  fontSize: isMobile ? '0.9em' : '0.95em',
                  fontWeight: '600',
                  color: '#e0e0e0',
                  minWidth: '30px',
                  flexShrink: 0
                }}>С</label>
                <select 
                  className="dark-select" 
                  value={selectedStartYear} 
                  onChange={handleStartYearChange}
                  style={{ 
                    flex: isMobile ? '1 1 auto' : '0 0 auto',
                    width: isMobile ? 'auto' : '100px',
                    minWidth: '80px'
                  }}
                >
                  {years.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
                <select 
                  className="dark-select" 
                  value={selectedStartMonth} 
                  onChange={handleStartMonthChange}
                  style={{ 
                    flex: isMobile ? '1 1 auto' : '0 0 auto',
                    width: isMobile ? 'auto' : '140px',
                    minWidth: '120px'
                  }}
                >
                  {months.map(month => (
                    <option key={month.value} value={month.value}>{month.name}</option>
                  ))}
                </select>
              </div>

              {/* Период По */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap'
              }}>
                <label style={{ 
                  fontSize: isMobile ? '0.9em' : '0.95em',
                  fontWeight: '600',
                  color: '#e0e0e0',
                  minWidth: '30px',
                  flexShrink: 0
                }}>По</label>
                <select 
                  className="dark-select" 
                  value={selectedEndYear} 
                  onChange={handleEndYearChange}
                  style={{ 
                    flex: isMobile ? '1 1 auto' : '0 0 auto',
                    width: isMobile ? 'auto' : '100px',
                    minWidth: '80px'
                  }}
                >
                  {years.map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
                <select 
                  className="dark-select" 
                  value={selectedEndMonth} 
                  onChange={handleEndMonthChange}
                  style={{ 
                    flex: isMobile ? '1 1 auto' : '0 0 auto',
                    width: isMobile ? 'auto' : '140px',
                    minWidth: '120px'
                  }}
                >
                  {months.map(month => (
                    <option key={month.value} value={month.value}>{month.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ========== СТАТИСТИКА ПО МОНТАЖНИКАМ ========== */}
          <div style={{
            backgroundColor: '#26293a',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid #444',
            marginBottom: '24px',
            transition: 'all 0.3s ease'
          }}>
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px',
                cursor: 'pointer',
                marginBottom: isMontajnikExpanded ? '16px' : '0'
              }}
              onClick={toggleMontajnikExpand}
            >
              <span style={{
                display: 'inline-block',
                transform: isMontajnikExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.3s ease',
                fontSize: '1.2em',
                color: '#fff',
                flexShrink: 0
              }}>
                ▶
              </span>
              <h2 style={{ 
                color: 'white', 
                fontSize: isMobile ? '1.2em' : '1.4em',
                fontWeight: '700',
                margin: 0,
                fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                Статистика по монтажникам
              </h2>
            </div>

            <div style={{
              maxHeight: isMontajnikExpanded ? '2000px' : '0',
              overflow: 'hidden',
              transition: 'max-height 0.5s ease, opacity 0.3s ease',
              opacity: isMontajnikExpanded ? 1 : 0
            }}>
              {statisticsLoading ? (
                <div className="empty" style={{ padding: '40px 20px', fontSize: '1.1em' }}>
                  Загрузка статистики...
                </div>
              ) : statistics?.montajnik_statistics && statistics.montajnik_statistics.length > 0 ? (
                <div style={{ overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }}>
                  <table style={{
                    width: '100%',
                    minWidth: '500px',
                    borderCollapse: 'collapse',
                    backgroundColor: '#1a1a1a',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
                  }}>
                    <thead>
                      <tr style={{ backgroundColor: '#1a1a1a' }}>
                        <th style={{
                          padding: '12px 16px',
                          textAlign: 'left',
                          color: '#fff',
                          fontWeight: '700',
                          fontSize: isMobile ? '0.9em' : '1.05em',
                          borderBottom: '2px solid #555',
                          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          Монтажник
                        </th>
                        <th style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          color: '#fff',
                          fontWeight: '700',
                          fontSize: isMobile ? '0.9em' : '1.05em',
                          borderBottom: '2px solid #555',
                          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          Заработано
                        </th>
                        <th style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          color: '#fff',
                          fontWeight: '700',
                          fontSize: isMobile ? '0.9em' : '1.05em',
                          borderBottom: '2px solid #555',
                          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          whiteSpace: 'nowrap'
                        }}>
                          Завершено задач
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {statistics.montajnik_statistics.map((stat, index) => (
                        <tr key={stat.montajnik_id} style={{
                          backgroundColor: index % 2 === 0 ? '#242424' : '#2a2a2a',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#333'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#242424' : '#2a2a2a'}
                        >
                          <td style={{
                            padding: '12px 16px',
                            color: '#f0f0f0',
                            borderBottom: '1px solid #333',
                            fontSize: isMobile ? '0.9em' : '1em',
                            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                          }}>
                            {stat.montajnik_name}
                          </td>
                          <td style={{
                            padding: '12px 16px',
                            textAlign: 'right',
                            color: '#4CAF50',
                            fontWeight: '700',
                            borderBottom: '1px solid #333',
                            fontSize: isMobile ? '0.9em' : '1.05em',
                            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                            whiteSpace: 'nowrap'
                          }}>
                            {stat.total_earned} ₽
                          </td>
                          <td style={{
                            padding: '12px 16px',
                            textAlign: 'right',
                            color: '#e0e0e0',
                            fontWeight: '600',
                            borderBottom: '1px solid #333',
                            fontSize: isMobile ? '0.9em' : '1em',
                            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                          }}>
                            {stat.task_count}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty" style={{ padding: '40px 20px', fontSize: '1.1em' }}>
                  Нет данных за выбранный период
                </div>
              )}
            </div>
          </div>

          {/* ========== СТАТИСТИКА ПО ЛОГИСТАМ ========== */}
          <div style={{
            backgroundColor: '#26293a',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid #444',
            transition: 'all 0.3s ease'
          }}>
            <div 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px',
                cursor: 'pointer',
                marginBottom: isLogistExpanded ? '16px' : '0'
              }}
              onClick={toggleLogistExpand}
            >
              <span style={{
                display: 'inline-block',
                transform: isLogistExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                transition: 'transform 0.3s ease',
                fontSize: '1.2em',
                color: '#fff',
                flexShrink: 0
              }}>
                ▶
              </span>
              <h2 style={{ 
                color: 'white', 
                fontSize: isMobile ? '1.2em' : '1.4em',
                fontWeight: '700',
                margin: 0,
                fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}>
                Статистика по логистам
              </h2>
            </div>

            <div style={{
              maxHeight: isLogistExpanded ? '2000px' : '0',
              overflow: 'hidden',
              transition: 'max-height 0.5s ease, opacity 0.3s ease',
              opacity: isLogistExpanded ? 1 : 0
            }}>
              {statisticsLoading ? (
                <div className="empty" style={{ padding: '40px 20px', fontSize: '1.1em' }}>
                  Загрузка статистики...
                </div>
              ) : statistics?.logist_statistics && statistics.logist_statistics.length > 0 ? (
                <div style={{ overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }}>
                  <table style={{
                    width: '100%',
                    minWidth: '500px',
                    borderCollapse: 'collapse',
                    backgroundColor: '#1a1a1a',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)'
                  }}>
                    <thead>
                      <tr style={{ backgroundColor: '#1a1a1a' }}>
                        <th style={{
                          padding: '12px 16px',
                          textAlign: 'left',
                          color: '#fff',
                          fontWeight: '700',
                          fontSize: isMobile ? '0.9em' : '1.05em',
                          borderBottom: '2px solid #555',
                          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          Логист
                        </th>

                        <th style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          color: '#fff',
                          fontWeight: '700',
                          fontSize: isMobile ? '0.9em' : '1.05em',
                          borderBottom: '2px solid #555',
                          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          whiteSpace: 'nowrap'
                        }}>
                          Заработано
                        </th>
                        <th style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          color: '#fff',
                          fontWeight: '700',
                          fontSize: isMobile ? '0.9em' : '1.05em',
                          borderBottom: '2px solid #555',
                          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          whiteSpace: 'nowrap'
                        }}>
                          Всего задач
                        </th>
                        <th style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          color: '#fff',
                          fontWeight: '700',
                          fontSize: isMobile ? '0.9em' : '1.05em',
                          borderBottom: '2px solid #555',
                          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                          whiteSpace: 'nowrap'
                        }}>
                          Хороших оценок
                        </th>
                        <th style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          color: '#fff',
                          fontWeight: '700',
                          fontSize: isMobile ? '0.9em' : '1.05em',
                          borderBottom: '2px solid #555',
                          fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                        }}>
                          Эффективность
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {statistics.logist_statistics.map((stat, index) => (
                        <tr key={stat.logist_id} style={{
                          backgroundColor: index % 2 === 0 ? '#242424' : '#2a2a2a',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#333'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#242424' : '#2a2a2a'}
                        >
                          <td style={{
                            padding: '12px 16px',
                            color: '#f0f0f0',
                            borderBottom: '1px solid #333',
                            fontSize: isMobile ? '0.9em' : '1em',
                            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                          }}>
                            {stat.logist_name}
                          </td>

                          <td style={{
                              padding: '12px 16px',
                              textAlign: 'right',
                              color: '#4CAF50',
                              fontWeight: '700',
                              borderBottom: '1px solid #333',
                              fontSize: isMobile ? '0.9em' : '1.05em',
                              fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                              whiteSpace: 'nowrap'
                            }}>
                              {stat.total_earned} ₽
                            </td>
                          <td style={{
                            padding: '12px 16px',
                            textAlign: 'right',
                            color: '#e0e0e0',
                            fontWeight: '600',
                            borderBottom: '1px solid #333',
                            fontSize: isMobile ? '0.9em' : '1em',
                            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                          }}>
                            {stat.total_tasks}
                          </td>
                          <td style={{
                            padding: '12px 16px',
                            textAlign: 'right',
                            color: '#4CAF50',
                            fontWeight: '600',
                            borderBottom: '1px solid #333',
                            fontSize: isMobile ? '0.9em' : '1em',
                            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                          }}>
                            {stat.good_tasks}
                          </td>
                          <td style={{
                            padding: '12px 16px',
                            textAlign: 'right',
                            color: stat.efficiency !== null ? '#a7f3d0' : '#888',
                            fontWeight: '700',
                            borderBottom: '1px solid #333',
                            fontSize: isMobile ? '0.9em' : '1.05em',
                            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                          }}>
                            {stat.efficiency !== null ? `${stat.efficiency}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty" style={{ padding: '40px 20px', fontSize: '1.1em' }}>
                  Нет данных за выбранный период
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}