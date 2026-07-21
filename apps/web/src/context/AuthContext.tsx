import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AuthSession, SessionUser } from "@sales-promoters/shared";
import { ApiHttpError, apiJson, clearSession, getSession, login as apiLogin, logout as apiLogout } from "../lib/api";

interface AuthContextValue {
  user: SessionUser | null;
  initialized: boolean;
  apiMessage: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const WEB_ACCESS_DENIED_MESSAGE = "Promotor nao pode acessar a retaguarda. Use o aplicativo de campo.";

function isPromoterUser(user: SessionUser | null | undefined) {
  return user?.role === "PROMOTOR";
}

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
        if (isPromoterUser(response.user)) {
          clearSession();
          setUser(null);
          setApiMessage(WEB_ACCESS_DENIED_MESSAGE);
          return;
        }

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
        if (isPromoterUser(session.user)) {
          clearSession();
          throw new ApiHttpError(403, WEB_ACCESS_DENIED_MESSAGE, "WEB_ACCESS_DENIED");
        }
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
