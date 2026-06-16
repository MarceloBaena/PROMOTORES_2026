const statusLabels: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  BLOCKED: "Bloqueado",
  SUSPENDED: "Suspenso",
  ARCHIVED: "Arquivado",
  DRAFT: "Rascunho",
  PUBLISHED: "Publicado",
  CANCELLED: "Cancelado",
  COMPLETED: "Concluida",
  FAILED: "Falha",
  SUCCESS: "Sucesso",
  PARTIAL: "Parcial",
  PREVIEW: "Previa",
  PENDING: "Pendente",
  SYNCED: "Sincronizado",
  SYNCING: "Sincronizando",
  OPEN: "Aberta",
  RESOLVED: "Resolvida",
  HIGH: "Alta",
  MEDIUM: "Media",
  LOW: "Baixa",
  CRITICAL: "Critica",
  pending: "Pendente",
  in_progress: "Em atendimento",
  completed: "Concluida",
  not_completed: "Nao concluida",
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
  outside_geofence: "Fora da area prevista",
  missing_required_photo: "Foto obrigatoria ausente",
  too_fast_visit: "Visita rapida demais",
  too_long_visit: "Visita longa demais",
  inconsistent_finish: "Encerramento inconsistente",
  sync_failure: "Falha de sincronizacao"
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
