import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

interface Props {
  children: React.ReactNode;
  // Pasar uno de los dos: permission exacto o cualquiera de varios
  permission?: string;
  anyOf?: string[];
}

export default function ProtectedRoute({ children, permission, anyOf }: Props) {
  const { accessToken, user, hasPermission } = useAuthStore();

  if (!accessToken || !user) {
    return <Navigate to="/app/login" replace />;
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/app/dashboard" replace />;
  }

  if (anyOf && !anyOf.some(p => hasPermission(p))) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return <>{children}</>;
}
