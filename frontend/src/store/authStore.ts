import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  id:                   number;
  nombre:               string;
  email:                string;
  rol:                  string;
  permisos:             Record<string, boolean>;
  must_change_password?: boolean;
}

interface AuthState {
  user:        AuthUser | null;
  accessToken: string | null;
  setAuth:              (user: AuthUser, token: string) => void;
  setAccessToken:       (token: string) => void;
  clearMustChangePassword: () => void;
  logout:               () => void;
  isAuthenticated:      () => boolean;
  hasPermission:        (permission: string) => boolean;
  isRoot:               () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:        null,
      accessToken: null,

      setAuth: (user, accessToken) => set({ user, accessToken }),
      setAccessToken: (accessToken) => set({ accessToken }),
      clearMustChangePassword: () =>
        set(s => s.user ? { user: { ...s.user, must_change_password: false } } : {}),
      logout: () => set({ user: null, accessToken: null }),

      isAuthenticated: () => !!get().accessToken && !!get().user,

      // ROOT (permisos.all) pasa siempre
      hasPermission: (permission: string) => {
        const permisos = get().user?.permisos ?? {};
        return permisos.all === true || permisos[permission] === true;
      },

      isRoot: () => get().user?.permisos?.all === true,
    }),
    {
      name: 'agroexportadora-auth',
      partialize: (state) => ({ user: state.user }),
    }
  )
);
