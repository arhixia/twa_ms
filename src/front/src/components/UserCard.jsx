// UserCard.jsx
import React from 'react';

// Вспомогательная функция для обрезки строки
const truncateName = (str) => {
  if (str.length > 22) {
    return str.substring(0, 19) + '...'; // 19 + '...' = 22
  }
  return str;
};

function UserCard({ user, roleDisplayNames, onEditRole, onDeactivate, onActivate, onEditUser, showCompany = false, companies = [] }) {
  // Цвета ролей в соответствии с дизайном
  const roleColors = {
    admin: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #bae6fd 100%)',
    logist: 'linear-gradient(135deg, #fef3c7 0%, #fed7aa 50%, #fdba74 100%)',
    montajnik: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 50%, #a7f3d0 100%)',
    tech_supp: 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 50%, #d8b4fe 100%)',
    manager: 'linear-gradient(135deg, #fef9c3 0%, #fef08a 50%, #fde047 100%)'
  };

  const handleRoleChange = (e) => {
    onEditRole(user.id, e.target.value);
  };

  const handleDeactivateClick = (e) => {
    e.stopPropagation(); // Останавливаем всплытие, чтобы не сработал onClick на карточке
    onDeactivate(user.id);
  };

  const handleActivateClick = (e) => {
    e.stopPropagation(); // Останавливаем всплытие, чтобы не сработал onClick на карточке
    onActivate(user.id);
  };

  // Обработчик клика на карточку
  const handleCardClick = () => {
    onEditUser(user); // Вызываем функцию открытия модального окна редактирования
  };

  const fullName = `${user.name} ${user.lastname}`;
  const displayName = truncateName(fullName);

  const roleBg = roleColors[user.role] || 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 50%, #bae6fd 100%)';

  // Найти название компании
  const companyName = showCompany && user.company_id 
    ? (companies.find(c => c.id === user.company_id)?.name || `Компания ID: ${user.company_id}`)
    : null;

  return (
    <div
      className="card"
      style={{
        padding: '16px',
        backgroundColor: 'var(--bg-card)',
        borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        marginBottom: '16px',
        border: '1px solid var(--border-subtle)',
        position: 'relative',
        minHeight: '160px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: 'pointer'
      }}
      onClick={handleCardClick}
    >
      {/* Статус активности в верхнем правом углу */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          padding: '4px 8px',
          borderRadius: '16px',
          fontSize: '12px',
          fontWeight: '600',
          color: user.is_active ? '#10b981' : '#ef4444',
          background: 'rgba(255, 255, 255, 0.05)',
          minWidth: '60px',
          textAlign: 'center'
        }}
      >
        {user.is_active ? 'Активен' : 'Неактивен'}
      </div>

      {/* Статус роли в верхнем левом углу */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          padding: '4px 8px',
          borderRadius: '16px',
          fontSize: '12px',
          fontWeight: '600',
          color: '#1f2937',
          background: roleBg,
          minWidth: '60px',
          textAlign: 'center'
        }}
      >
        {roleDisplayNames[user.role] || user.role}
      </div>

      {/* Основной контент */}
      <div style={{ flex: 1, marginTop: '30px' }}>
        <h3
          style={{
            margin: '0 0 8px 0',
            color: 'white',
            fontSize: '1.1em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '100%'
          }}
          title={`${user.name} ${user.lastname}`}
        >
          {displayName}
        </h3>
        <p
          style={{
            margin: '4px 0',
            color: '#c9d1d9',
            fontSize: '0.9em'
          }}
        >
          <strong>Логин:</strong> {user.login}
        </p>
    

       {user.role === 'logist' && (
        <p style={{ margin: '4px 0', color: '#a7f3d0', fontSize: '0.9em', fontWeight: '600' }}>
          <strong>Эффективность:</strong>{' '}
          {typeof user.efficiency === 'number' 
            ? `${user.efficiency.toFixed(1)}%` 
            : 'нет данных'}
        </p>
      )}

        {/* Показываем компанию только если разрешено */}
        {showCompany && companyName && (
          <p
            style={{
              margin: '4px 0',
              color: '#c9d1d9',
              fontSize: '0.9em'
            }}
          >
            <strong>Компания:</strong> {companyName}
          </p>
        )}
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          right: '12px',
          zIndex: 2
        }}
      >
        {user.is_active && (
          <button
            className="deactivate-btn"
            onClick={handleDeactivateClick}
            style={{
              backgroundColor: 'transparent',
              color: '#ef4444',
              border: '1px solid #ef4444',
              padding: '4px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.8em',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            Деактивировать
          </button>
        )}
        
        {!user.is_active && (
          <button
            className="activate-btn"
            onClick={handleActivateClick}
            style={{
              backgroundColor: 'transparent',
              color: '#10b981',
              border: '1px solid #10b981',
              padding: '4px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.8em',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap'
            }}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent';
            }}
          >
            Активировать
          </button>
        )}
      </div>
    </div>
  );
}

export default UserCard;