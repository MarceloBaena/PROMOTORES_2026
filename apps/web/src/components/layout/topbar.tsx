'use client';

import type { UserRole } from '@promotor/types';
import { Menu } from 'lucide-react';
import { roleLabels } from './navigation';

interface TopbarProps {
  apiBaseUrl: string;
  currentSection: string;
  description: string;
  onOpenNavigation: () => void;
  userRole?: UserRole | null;
}

export const Topbar = ({
  apiBaseUrl,
  currentSection,
  description,
  onOpenNavigation,
  userRole,
}: TopbarProps) => {
  const todayLabel = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date());

  return (
    <header className="topbar shell-topbar">
      <div className="shell-topbar-main">
        <button className="shell-nav-toggle" type="button" onClick={onOpenNavigation}>
          <Menu size={18} />
          Menu
        </button>

        <div className="topbar-context">
          <span className="auth-kicker">Workspace operacional</span>
          <strong>{currentSection}</strong>
          <p className="hint">{description}</p>
        </div>
      </div>

      <div className="topbar-actions topbar-meta-grid">
        <div className="topbar-meta-card">
          <span>Status</span>
          <strong>
            <span className="pulse-dot" />
            Sessao ativa
          </strong>
        </div>
        <div className="topbar-meta-card">
          <span>Perfil</span>
          <strong>{userRole ? roleLabels[userRole] ?? userRole : 'Operacional'}</strong>
        </div>
        <div className="topbar-meta-card">
          <span>Referencia</span>
          <strong>{todayLabel}</strong>
        </div>
        <div className="topbar-meta-card topbar-meta-card-mono">
          <span>Ambiente</span>
          <strong>{apiBaseUrl}</strong>
        </div>
      </div>
    </header>
  );
};
