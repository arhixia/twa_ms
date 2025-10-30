import { useState } from "react";
import "../styles/LoginForm.css";

export default function LoginForm({ onLogin }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await onLogin({ login, password });
    } catch (err) {
      setError(err.message || "Ошибка");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="login-form">
      <h2>Вход</h2>
      <input
        type="text"
        placeholder="Логин"
        value={login}
        onChange={(e) => setLogin(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="Пароль"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <button type="submit">Войти</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
