import type { UserRole } from '@promotor/types';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { secureSessionStorage } from './secure-session-storage';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  setSession: (session: AuthSession) => void;
  updateUser: (user: AuthUser) => void;
  clearSession: () => void;
}

const isSameUser = (left: AuthUser | null, right: AuthUser | null) =>
  left?.id === right?.id &&
  left?.name === right?.name &&
  left?.email === right?.email &&
  left?.role === right?.role;

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setSession: (session) =>
        set((state) => {
          if (
            isSameUser(state.user, session.user) &&
            state.accessToken === session.accessToken &&
            state.refreshToken === session.refreshToken
          ) {
            return state;
          }

          return {
            user: session.user,
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
          };
        }),
      updateUser: (user) =>
        set((state) => {
          if (isSameUser(state.user, user)) {
            return state;
          }

          return {
            ...state,
            user,
          };
        }),
      clearSession: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
        }),
    }),
    {
      name: 'promotor-mobile-auth',
      storage: createJSONStorage(() => secureSessionStorage),
    },
  ),
);
