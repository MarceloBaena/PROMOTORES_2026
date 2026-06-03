export type RootTab = 'dashboard' | 'clients' | 'history' | 'sync';

export type DetailScreen =
  | { name: 'visit-detail'; routeStopId: string }
  | { name: 'check-in'; routeStopId: string }
  | { name: 'photos-before'; routeStopId: string }
  | { name: 'checklist'; routeStopId: string }
  | { name: 'notes'; routeStopId: string }
  | { name: 'photos-after'; routeStopId: string }
  | { name: 'checkout'; routeStopId: string };
