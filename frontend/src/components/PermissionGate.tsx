import { useAuthStore } from '@/store/authStore';

interface Props {
  permission?: string;
  anyOf?: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

// Renderiza children solo si el usuario tiene el permiso requerido.
// Si no tiene permiso, renderiza fallback (por defecto: nada).
export default function PermissionGate({ permission, anyOf, children, fallback = null }: Props) {
  const hasPermission = useAuthStore(s => s.hasPermission);

  if (permission) {
    return hasPermission(permission) ? <>{children}</> : <>{fallback}</>;
  }

  if (anyOf) {
    const ok = anyOf.some(p => hasPermission(p));
    return ok ? <>{children}</> : <>{fallback}</>;
  }

  return <>{children}</>;
}
