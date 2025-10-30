import { Navigate } from "react-router-dom";
import useAuthStore from "../store/useAuthStore";

export default function ProtectedRoute({ children, roles }) {
  const { token, role } = useAuthStore();

  if (!token) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(role)) return <Navigate to={`/${role}`} replace />;
  return children;
}
