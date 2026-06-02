import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AuthSession, SessionUser } from "@sales-promoters/shared";
import { apiJson, clearSession, getSession, login as apiLogin, logout as apiLogout } from "../lib/api";

interface AuthContextValue {
  user: SessionUser | null;
  initialized: boolean;
  apiMessage: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [apiMessage, setApiMessage] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();

    if (!session) {
      setInitialized(true);
      return;
    }

    apiJson<{ user: SessionUser }>("/auth/me")
      .then((response) => {
        setUser(response.user);
        setApiMessage(null);
      })
      .catch((error: Error) => {
        setApiMessage(error.message);
        clearSession();
      })
      .finally(() => setInitialized(true));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initialized,
      apiMessage,
      login: async (email, password) => {
        const session: AuthSession = await apiLogin(email, password);
        setUser(session.user);
        setApiMessage(null);
      },
      logout: async () => {
        await apiLogout();
        setUser(null);
      }
    }),
    [apiMessage, initialized, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
}
