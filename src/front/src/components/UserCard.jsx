import React from 'react';

// Вспомогательная функция для обрезки строки
const truncateName = (str) => {
  if (str.length > 22) {
    return str.substring(0, 19) + '...'; // 19 + '...' = 22
  }
  return str;
};

function UserCard({ user, roleDisplayNames, onEditRole, onDeactivate, onActivate, onEditUser }) {
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

  // Обработчик клика на кнопку редактирования
  const handleEditClick = (e) => {
    e.stopPropagation(); // Останавливаем всплытие, чтобы не сработал onClick на карточке
    onEditUser(user); // Вызываем функцию открытия модального окна редактирования
  };

  // Формируем полное имя и применяем обрезку
  const fullName = `${user.name} ${user.lastname}`;
  const displayName = truncateName(fullName);

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
            whiteSpace: 'nowrap', // Запрещаем перенос строки
            overflow: 'hidden',   // Скрываем переполнение
            textOverflow: 'ellipsis', // Добавляем многоточие
            maxWidth: '70%' // Ограничиваем ширину, чтобы кнопки всегда были видны
          }}
          title={`${user.name} ${user.lastname}`} // Показываем полное имя при наведении
        >
          {displayName}
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
          alignItems: 'center'
        }}
      >
        {/* Кнопка редактирования */}
        <button
          className="edit-user-btn"
          onClick={handleEditClick}
          style={{
            backgroundColor: '#2962FF',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.9em',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {e.target.style.backgroundColor = '#2962FF'}}
          onMouseLeave={(e) => {e.target.style.backgroundColor = '#2962FF'}}
        >
          ✏️ Редактировать
        </button>

        {/* Кнопки активации/деактивации */}
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