'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { canAccessPromoterApp, canAccessSupervisorPanel } from '@promotor/types';
import { LoadingState } from '@/components/page-states';
import { getMe } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { canAccessWebPortal, getDefaultRouteForRole } from '@/lib/auth-routing';
import { useHydrated } from '@/lib/use-hydrated';

export default function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [validatingSession, setValidatingSession] = useState(true);
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const clearSession = useAuthStore((state) => state.clearSession);
  const hasSessionUser = Boolean(user);
  const userRole = user?.role ?? null;

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (!accessToken || !hasSessionUser) {
      setValidatingSession(false);
      router.replace('/');
      return;
    }

    if (!userRole || !canAccessWebPortal(userRole)) {
      clearSession();
      setValidatingSession(false);
      router.replace('/');
      return;
    }

    if (canAccessSupervisorPanel(userRole)) {
      setValidatingSession(false);
      router.replace(getDefaultRouteForRole(userRole));
      return;
    }

    let active = true;

    const validateSession = async () => {
      try {
        const me = await getMe();

        if (!canAccessWebPortal(me.role)) {
          throw new Error('Perfil sem acesso ao portal web');
        }

        if (canAccessSupervisorPanel(me.role)) {
          if (active) {
            updateUser(me);
            setValidatingSession(false);
            router.replace(getDefaultRouteForRole(me.role));
          }
          return;
        }

        if (!canAccessPromoterApp(me.role)) {
          throw new Error('Perfil sem acesso ao workspace operacional');
        }

        if (active) {
          updateUser(me);
          setValidatingSession(false);
        }
      } catch {
        if (active) {
          clearSession();
          setValidatingSession(false);
          router.replace('/');
        }
      }
    };

    void validateSession();

    return () => {
      active = false;
    };
  }, [accessToken, clearSession, hasSessionUser, hydrated, router, updateUser, userRole]);

  if (!hydrated) {
    return <LoadingState message="Carregando sessao..." />;
  }

  if (!accessToken || validatingSession) {
    return <LoadingState message="Validando acesso operacional..." />;
  }

  return <>{children}</>;
}
