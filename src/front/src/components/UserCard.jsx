// front/src/components/UserCard.jsx
import React from 'react';

function UserCard({ user, roleDisplayNames, onEditRole, onDeactivate, onActivate }) {
  const roleColor = {
    admin: '#e57373',
    logist: '#64b5f6',
    montajnik: '#81c784',
    tech_supp: '#ffb74d',
  }[user.role] || '#ffffff';

  const handleRoleChange = (e) => {
    onEditRole(user.id, e.target.value);
  };

  const handleDeactivateClick = () => {
    onDeactivate(user.id);
  };

  const handleActivateClick = () => {
    onActivate(user.id);
  };

  return (
    <div
      className="card"
      style={{
        borderLeft: `5px solid ${roleColor}`,
        padding: '12px',
        backgroundColor: '#0d1117',
        borderRadius: '8px',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        marginBottom: '12px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
        }}
      >
        <h3
          style={{
            margin: '0',
            color: 'white',
            fontSize: '1.1em',
          }}
        >
          {user.name} {user.lastname}
        </h3>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span
            style={{
              color: user.is_active ? 'green' : 'red',
              fontWeight: 'bold',
              fontSize: '0.9em',
            }}
          >
            {user.is_active ? 'Активен' : 'Неактивен'}
          </span>
        </div>
      </div>
      <p
        style={{
          margin: '4px 0',
          color: '#c9d1d9',
        }}
      >
        <strong>Логин:</strong> {user.login}
      </p>
      <p
        style={{
          margin: '4px 0',
          color: '#c9d1d9',
        }}
      >
        <strong>Роль:</strong> {roleDisplayNames[user.role] || user.role}
      </p>
      <p
        style={{
          margin: '4px 0',
          color: '#c9d1d9',
        }}
      >
        <strong>Telegram ID:</strong> {user.telegram_id || '—'}
      </p>
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginTop: '10px',
          flexWrap: 'wrap',
        }}
      >
        <select
          value={user.role}
          onChange={handleRoleChange}
          style={{
            padding: '4px 8px',
            border: '1px solid #444',
            borderRadius: '4px',
            backgroundColor: '#1a1a1a',
            color: '#e0e0e0',
            fontSize: '0.9em',
          }}
        >
          <option value="admin">{roleDisplayNames.admin}</option>
          <option value="logist">{roleDisplayNames.logist}</option>
          <option value="montajnik">{roleDisplayNames.montajnik}</option>
          <option value="tech_supp">{roleDisplayNames.tech_supp}</option>
        </select>
        {user.is_active ? (
          <button
            className="deactivate-btn"
            onClick={handleDeactivateClick}
            style={{
              backgroundColor: '#ff9800',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9em',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => (e.target.style.backgroundColor = '#e68a00')}
            onMouseLeave={(e) => (e.target.style.backgroundColor = '#ff9800')}
          >
            Деактивировать
          </button>
        ) : (
          <button
            className="activate-btn"
            onClick={handleActivateClick}
            style={{
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9em',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => (e.target.style.backgroundColor = '#45a049')}
            onMouseLeave={(e) => (e.target.style.backgroundColor = '#4CAF50')}
          >
            Активировать
          </button>
        )}
      </div>
    </div>
  );
}

export default UserCard;