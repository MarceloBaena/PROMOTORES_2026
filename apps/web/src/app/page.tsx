'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { LoginForm } from '@/components/login-form';
import { useAuthStore } from '@/lib/auth-store';
import { canAccessWebPortal, getDefaultRouteForRole } from '@/lib/auth-routing';
import { useHydrated } from '@/lib/use-hydrated';

export default function HomePage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (user && !canAccessWebPortal(user.role)) {
      clearSession();
      return;
    }

    if (accessToken && user && canAccessWebPortal(user.role)) {
      router.replace(getDefaultRouteForRole(user.role));
    }
  }, [accessToken, clearSession, hydrated, router, user]);

  return (
    <main className="login-page">
      <section className="login-shell login-shell-corporate" aria-label="Autenticacao do sistema">
        <div className="login-card login-card-corporate">
          <div className="login-brand login-brand-corporate" aria-label="Identidade do sistema">
            <Image
              src="/formula_logo_branca.png"
              alt="Formula Distribuidora"
              width={148}
              height={52}
              priority
              className="login-brand-logo"
            />
            <div className="login-copy">
              <p className="login-system-name">{'F\u00f3rmula Campo'}</p>
              <h1 className="login-title">Acesso operacional</h1>
              <p className="login-subtitle">Entre com suas credenciais corporativas para continuar.</p>
            </div>
          </div>

          <LoginForm onAuthenticated={(role) => router.push(getDefaultRouteForRole(role))} />

          <div className="login-operational-notes" aria-label="Diretrizes operacionais do sistema">
            <article className="login-note-card">
              <strong>Operacao offline-first</strong>
              <p>Roteiro, evidencias e fila de sincronizacao continuam disponiveis em campo.</p>
            </article>
            <article className="login-note-card">
              <strong>Ambiente interno</strong>
              <p>Uso restrito a supervisores e administradores em contexto operacional.</p>
            </article>
            <article className="login-note-card">
              <strong>Auditoria ativa</strong>
              <p>Eventos, fotos, GPS e sincronizacao ficam rastreados para governanca.</p>
            </article>
          </div>

          <p className="login-footnote">{'Ambiente interno • Uso corporativo'}</p>
        </div>
      </section>
    </main>
  );
}
