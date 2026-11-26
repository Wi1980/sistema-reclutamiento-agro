import { useAuthStore } from '../store/authStore';

export function usePermission(permission: string): boolean {
  return useAuthStore(s => s.hasPermission(permission));
}

export function useAnyPermission(...permissions: string[]): boolean {
  const hasPermission = useAuthStore(s => s.hasPermission);
  return permissions.some(p => hasPermission(p));
}

export function useIsRoot(): boolean {
  return useAuthStore(s => s.isRoot());
}
