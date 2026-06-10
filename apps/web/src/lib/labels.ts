const statusLabels: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  BLOCKED: "Bloqueado",
  SUSPENDED: "Suspenso",
  ARCHIVED: "Arquivado",
  DRAFT: "Rascunho",
  PUBLISHED: "Publicado",
  CANCELLED: "Cancelado",
  COMPLETED: "Concluída",
  FAILED: "Falha",
  SUCCESS: "Sucesso",
  PENDING: "Pendente",
  SYNCED: "Sincronizado",
  SYNCING: "Sincronizando",
  OPEN: "Aberta",
  RESOLVED: "Resolvida",
  HIGH: "Alta",
  MEDIUM: "Media",
  LOW: "Baixa",
  CRITICAL: "Crítica",
  pending: "Pendente",
  in_progress: "Em atendimento",
  completed: "Concluída",
  not_completed: "Não concluída",
  failed: "Falha",
  synced: "Sincronizado",
  syncing: "Sincronizando"
};

const roleLabels: Record<string, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  PROMOTOR: "Promotor"
};

const auditTypeLabels: Record<string, string> = {
  gps_missing: "GPS ausente",
  outside_geofence: "Fora da área prevista",
  missing_required_photo: "Foto obrigatória ausente",
  too_fast_visit: "Visita rápida demais",
  too_long_visit: "Visita longa demais",
  inconsistent_finish: "Encerramento inconsistente",
  sync_failure: "Falha de sincronização"
};

export function statusLabel(value?: string | null) {
  if (!value) {
    return "-";
  }

  return statusLabels[value] ?? value.replaceAll("_", " ").toLowerCase();
}

export function roleLabel(value?: string | null) {
  if (!value) {
    return "-";
  }

  return roleLabels[value] ?? value;
}

export function auditTypeLabel(value?: string | null) {
  if (!value) {
    return "-";
  }

  return auditTypeLabels[value] ?? value.replaceAll("_", " ").toLowerCase();
}
