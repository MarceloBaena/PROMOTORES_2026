export const brandPalette = {
  sand50: '#fbf5eb',
  sand100: '#f1e4cb',
  slate950: '#14222d',
  slate800: '#29404f',
  success500: '#2f8f6f',
  warning500: '#d07d2b',
  danger500: '#c45345',
} as const;

const visitStatusLabels: Record<string, string> = {
  COMPLETED: 'Concluida',
  IN_PROGRESS: 'Em andamento',
  PARTIAL: 'Parcial',
  NOT_DONE: 'Nao realizada',
  PLANNED: 'Planejada',
  SYNC_PENDING: 'Sync pendente',
  CHECKED_OUT: 'Check-out',
};

export const getVisitStatusLabel = (value?: string | null) =>
  value ? visitStatusLabels[value] ?? value : 'Nao informado';
