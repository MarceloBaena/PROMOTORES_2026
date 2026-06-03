'use client';

import type { UserRole } from '@promotor/types';
import { LogOut, X } from 'lucide-react';
import Link from 'next/link';
import { hasCollaboratorsAccess, roleLabels, type NavigationItem } from './navigation';

interface SidebarProps {
  apiBaseUrl: string;
  currentPath: string;
  navigation: NavigationItem[];
  onClose: () => void;
  onLogout: () => void;
  user?: {
    email?: string | null;
    name?: string | null;
    role?: UserRole | null;
  } | null;
}

export const Sidebar = ({
  apiBaseUrl,
  currentPath,
  navigation,
  onClose,
  onLogout,
  user,
}: SidebarProps) => {
  const operationalNavigation = navigation.filter(
    (item) => !item.href.startsWith('/dashboard/collaborators'),
  );
  const administrativeNavigation = navigation.filter((item) =>
    item.href.startsWith('/dashboard/collaborators'),
  );

  const renderNavigationGroup = (label: string, items: NavigationItem[]) => {
    if (items.length === 0) {
      return null;
    }

    return (
      <div className="sidebar-nav-group">
        <div className="sidebar-nav-group-header">
          <span className="sidebar-nav-group-title">{label}</span>
          <span className="sidebar-nav-group-count">{items.length}</span>
        </div>
        <nav className="nav-list">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive =
              currentPath === item.href ||
              (item.href !== '/dashboard' && currentPath.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={isActive ? 'nav-link nav-link-active' : 'nav-link'}
                onClick={onClose}
              >
                <Icon size={18} />
                <span className="nav-link-copy">
                  <strong>{item.label}</strong>
                  <small>{item.href.replace('/dashboard', '').replaceAll('-', ' ') || 'resumo'}</small>
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    );
  };

  return (
    <div className="shell-sidebar-panel">
      <div className="shell-sidebar-header">
        <div className="sidebar-brand-panel">
          <div className="sidebar-brand-mark" aria-hidden="true">
            FC
          </div>
          <div className="brand-block">
            <small className="auth-kicker">Centro operacional</small>
            <strong>Gestao de promotores</strong>
            <span>
              Ambiente corporativo para supervisao de campo, resposta a alertas e governanca de
              cadastros.
            </span>
          </div>
        </div>

        <button
          aria-label="Fechar navegacao"
          className="shell-nav-close"
          type="button"
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>

      <div className="sidebar-chip-row">
        <span className="info-chip info-chip-strong">{navigation.length} modulos habilitados</span>
        {user?.role ? <span className="info-chip">{roleLabels[user.role] ?? user.role}</span> : null}
      </div>

      <div className="shell-sidebar-section">
        <span className="sidebar-section-label">Navegacao</span>
        {renderNavigationGroup('Operacao e supervisao', operationalNavigation)}
        {renderNavigationGroup('Administracao', administrativeNavigation)}
      </div>

      <div className="shell-sidebar-section">
        <div className="sidebar-status-card">
          <span className="sidebar-section-label">Usuario conectado</span>
          <strong>{user?.name ?? 'Operador de campo'}</strong>
          <p className="shell-sidebar-copy">{user?.email ?? 'Sessao local'}</p>
          <div className="sidebar-chip-row">
            <span className="info-chip">
              {user?.role ? roleLabels[user.role] ?? user.role : 'Sessao ativa'}
            </span>
            <span className="info-chip">Perfil corporativo</span>
          </div>
          {hasCollaboratorsAccess(user?.role ?? null) ? (
            <p className="hint">Permissao para cadastro de colaboradores, acesso e governanca.</p>
          ) : null}
        </div>

        <div className="sidebar-status-card">
          <span className="sidebar-section-label">Ambiente conectado</span>
          <strong>API corporativa</strong>
          <p className="shell-sidebar-copy mono">{apiBaseUrl}</p>
          <div className="sidebar-chip-row">
            <span className="info-chip">
              <span className="pulse-dot" />
              Monitoramento ativo
            </span>
            <span className="info-chip">Auditoria habilitada</span>
          </div>
        </div>
      </div>

      <div className="sidebar-footer">
        <p className="sidebar-footer-note">Uso interno. Navegacao focada em operacao, auditoria e resposta.</p>
        <button className="button button-danger" type="button" onClick={onLogout}>
          <LogOut size={16} />
          Encerrar sessao
        </button>
      </div>
    </div>
  );
};
