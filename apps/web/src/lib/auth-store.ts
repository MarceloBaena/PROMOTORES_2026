'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { UserRole } from '@promotor/types';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface SessionPayload {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  user: SessionUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  setSession: (payload: SessionPayload) => void;
  updateUser: (user: SessionUser) => void;
  clearSession: () => void;
}

const isSameUser = (left: SessionUser | null, right: SessionUser | null) => {
  if (!left || !right) {
    return left === right;
  }

  return (
    left.id === right.id &&
    left.email === right.email &&
    left.name === right.name &&
    left.role === right.role
  );
};

const noopStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setSession: (payload) =>
        set({
          user: payload.user,
          accessToken: payload.accessToken,
          refreshToken: payload.refreshToken,
        }),
      updateUser: (user) =>
        set((state) => (isSameUser(state.user, user) ? state : { ...state, user })),
      clearSession: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
        }),
    }),
    {
      name: 'promotor-web-session',
      storage: createJSONStorage(() =>
        typeof window === 'undefined' ? noopStorage : sessionStorage,
      ),
    },
  ),
);
