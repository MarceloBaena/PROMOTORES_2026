'use client';

import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  BarChart3,
  Camera,
  FileText,
  LayoutDashboard,
  Map,
  MapPinned,
  RefreshCcw,
  Route,
  Store,
  Shield,
  UserCog,
  Users,
} from 'lucide-react';
import type { UserRole } from '@promotor/types';
import { canManageCollaborators } from '@promotor/types';

export interface NavigationItem {
  href: string;
  label: string;
  icon: LucideIcon;
  allowedRoles: UserRole[];
}

export const dashboardNavigation: NavigationItem[] = [
  {
    href: '/dashboard',
    label: 'Resumo',
    icon: LayoutDashboard,
    allowedRoles: ['ADMIN', 'SUPERVISOR'],
  },
  {
    href: '/dashboard/map',
    label: 'Mapa',
    icon: Map,
    allowedRoles: ['ADMIN', 'SUPERVISOR'],
  },
  {
    href: '/dashboard/team',
    label: 'Campo',
    icon: Users,
    allowedRoles: ['ADMIN', 'SUPERVISOR'],
  },
  {
    href: '/dashboard/teams',
    label: 'Equipes',
    icon: Users,
    allowedRoles: ['ADMIN', 'SUPERVISOR'],
  },
  {
    href: '/dashboard/visits',
    label: 'Visitas',
    icon: Store,
    allowedRoles: ['ADMIN', 'SUPERVISOR'],
  },
  {
    href: '/dashboard/evidences',
    label: 'Evidencias',
    icon: Camera,
    allowedRoles: ['ADMIN', 'SUPERVISOR'],
  },
  {
    href: '/dashboard/customers',
    label: 'Clientes',
    icon: MapPinned,
    allowedRoles: ['ADMIN', 'SUPERVISOR'],
  },
  {
    href: '/dashboard/route-plans',
    label: 'Roteiros',
    icon: Route,
    allowedRoles: ['ADMIN', 'SUPERVISOR'],
  },
  {
    href: '/dashboard/alerts',
    label: 'Alertas',
    icon: AlertTriangle,
    allowedRoles: ['ADMIN', 'SUPERVISOR'],
  },
  {
    href: '/dashboard/sync-pendencies',
    label: 'Pendencias Sync',
    icon: RefreshCcw,
    allowedRoles: ['ADMIN', 'SUPERVISOR'],
  },
  {
    href: '/dashboard/reports',
    label: 'Relatorios',
    icon: BarChart3,
    allowedRoles: ['ADMIN', 'SUPERVISOR'],
  },
  {
    href: '/dashboard/audit',
    label: 'Auditoria',
    icon: Shield,
    allowedRoles: ['ADMIN', 'SUPERVISOR'],
  },
  {
    href: '/dashboard/architecture',
    label: 'Arquitetura',
    icon: FileText,
    allowedRoles: ['ADMIN', 'SUPERVISOR'],
  },
  {
    href: '/dashboard/collaborators',
    label: 'Colaboradores',
    icon: UserCog,
    allowedRoles: ['ADMIN', 'SUPERVISOR'],
  },
];

export const roleLabels: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  PROMOTER: 'Promotor',
};

export const getVisibleDashboardNavigation = (role?: UserRole | null) =>
  dashboardNavigation.filter((item) => (role ? item.allowedRoles.includes(role) : false));

const isDashboardItemMatch = (pathname: string, item: NavigationItem) =>
  pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));

export const getNavigationItemForPath = (pathname: string) =>
  dashboardNavigation.find((item) => isDashboardItemMatch(pathname, item)) ?? null;

export const canAccessDashboardRoute = (pathname: string, role?: UserRole | null) => {
  if (!role) {
    return false;
  }

  const currentItem = getNavigationItemForPath(pathname);

  return currentItem ? currentItem.allowedRoles.includes(role) : false;
};

export const getCurrentSectionLabel = (pathname: string) => {
  const currentItem = getNavigationItemForPath(pathname) ?? dashboardNavigation[0];

  return currentItem.label;
};

export const getCurrentSectionDescription = (pathname: string) => {
  if (pathname.startsWith('/dashboard/alerts')) {
    return 'Excecoes criticas, resolucoes pendentes e leitura rapida de risco.';
  }

  if (pathname.startsWith('/dashboard/visits')) {
    return 'Controle operacional de visitas, geofence, evidencias e fechamento.';
  }

  if (pathname.startsWith('/dashboard/collaborators')) {
    return 'Cadastro, acesso e governanca de supervisores e promotores.';
  }

  if (pathname.startsWith('/dashboard/customers')) {
    return 'Base de clientes, geofence, agenda e dados mestres operacionais.';
  }

  if (pathname.startsWith('/dashboard/route-plans')) {
    return 'Planejamento diario por promotor, sequencia e janela de atendimento.';
  }

  if (pathname.startsWith('/dashboard/reports')) {
    return 'Consolidacao diaria de produtividade, evidencia e nao atendimento.';
  }

  if (pathname.startsWith('/dashboard/sync-pendencies')) {
    return 'Fila operacional de visitas pendentes, itens sem consolidacao e risco de backlog.';
  }

  if (pathname.startsWith('/dashboard/audit')) {
    return 'Rastreabilidade de acoes, alteracoes criticas e leitura temporal de auditoria.';
  }

  if (pathname.startsWith('/dashboard/architecture')) {
    return 'Blueprint funcional do sistema, banco, APIs, fluxo offline-first e wireframes.';
  }

  if (pathname.startsWith('/dashboard/map')) {
    return 'Visao territorial da execucao do dia, equipe e clientes em rota.';
  }

  if (pathname.startsWith('/dashboard/teams')) {
    return 'Cadastro de equipes, supervisor responsavel e promotores vinculados.';
  }

  if (pathname.startsWith('/dashboard/team')) {
    return 'Status de jornada, atrasos e distribuicao da operacao em campo.';
  }

  return 'Painel corporativo para supervisao, administracao e resposta operacional.';
};

export const hasCollaboratorsAccess = (role?: UserRole | null) =>
  role ? canManageCollaborators(role) : false;
