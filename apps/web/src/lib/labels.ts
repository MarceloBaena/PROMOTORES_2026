const statusLabels: Record<string, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  BLOCKED: "Bloqueado",
  SUSPENDED: "Suspenso",
  ARCHIVED: "Arquivado",
  DRAFT: "Rascunho",
  PUBLISHED: "Publicado",
  IN_PROGRESS: "Em atendimento",
  CANCELLED: "Cancelado",
  COMPLETED: "Concluida",
  NOT_COMPLETED: "Nao concluida",
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
  skipped: "Ignorado",
  not_completed: "Nao concluida",
  canceled: "Cancelada",
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
  GPS_MISSING: "GPS ausente",
  gps_missing: "GPS ausente",
  OUTSIDE_GEOFENCE: "Fora da area prevista",
  outside_geofence: "Fora da area prevista",
  MISSING_REQUIRED_PHOTO: "Foto obrigatoria ausente",
  missing_required_photo: "Foto obrigatoria ausente",
  TOO_FAST_VISIT: "Visita rapida demais",
  too_fast_visit: "Visita rapida demais",
  TOO_LONG_VISIT: "Visita longa demais",
  too_long_visit: "Visita longa demais",
  INCONSISTENT_FINISH: "Encerramento inconsistente",
  inconsistent_finish: "Encerramento inconsistente",
  SYNC_FAILURE: "Falha de sincronizacao",
  sync_failure: "Falha de sincronizacao",
  possible_duplicate_photo: "Possivel foto duplicada",
  POSSIBLE_DUPLICATE_PHOTO: "Possivel foto duplicada",
  SUPPLIER_MISSING_BEFORE_PHOTO: "Fornecedor sem foto antes",
  SUPPLIER_MISSING_AFTER_PHOTO: "Fornecedor sem foto depois",
  SUPPLIER_MISSING_DELIVERY_RESPONSE: "Fornecedor sem resposta de entrega",
  SUPPLIER_MISSING_REPLENISHMENT_RESPONSE: "Fornecedor sem resposta de abastecimento",
  SUPPLIER_MISSING_STOCKOUT_RESPONSE: "Fornecedor sem resposta de ruptura",
  SUPPLIER_TOO_FAST: "Fornecedor concluido rapido demais",
  CHECKOUT_WITH_PENDING_SUPPLIER: "Checkout com fornecedor pendente"
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
