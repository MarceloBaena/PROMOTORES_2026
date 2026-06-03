import type { ReactNode } from 'react';
import type { JourneySummary, VisitCompletionStatus } from '@promotor/types';
import { DashboardScreen } from '../screens/dashboard-screen';
import { ClientsScreen } from '../screens/clients-screen';
import { VisitDetailScreen } from '../screens/visit-detail-screen';
import { CheckInScreen } from '../screens/check-in-screen';
import { PhotosScreen } from '../screens/photos-screen';
import { ChecklistScreen } from '../screens/checklist-screen';
import { NotesScreen } from '../screens/notes-screen';
import { CheckoutScreen } from '../screens/checkout-screen';
import { HistoryScreen } from '../screens/history-screen';
import { SyncScreen } from '../screens/sync-screen';
import type {
  HistoryItem,
  LocalChecklistItem,
  LocalVisitDraft,
  PhotoCategory,
  QueueAction,
  RouteDayBundle,
  RouteDayStop,
  RouteNotification,
  SyncLogEntry,
} from '../lib/types';
import type {
  VisitNextAction,
  VisitProgress,
  VisitStep,
} from '../lib/visit-workflow';
import type { DetailScreen, RootTab } from './promoter-screen-types';

interface PromoterRootScreenRendererProps {
  selectedTab: RootTab;
  activeJourney: JourneySummary | null;
  busyLabel: string | null;
  isOnline: boolean;
  lastSyncAt?: string;
  notifications: RouteNotification[];
  nextStop: RouteDayStop | null;
  nextStopAction: VisitNextAction;
  queue: QueueAction[];
  route: RouteDayBundle | null;
  routeStops: RouteDayStop[];
  routeUpdateMessage: string | null;
  search: string;
  syncError: string | null | undefined;
  syncLogs: SyncLogEntry[];
  userName: string;
  visitsByStopId: Record<string, LocalVisitDraft>;
  historyItems: HistoryItem[];
  hasActiveJourney: boolean;
  onJourneyToggle: () => void;
  onOpenClients: () => void;
  onOpenHistory: () => void;
  onOpenNextVisit: (routeStopId: string) => void;
  onOpenSync: () => void;
  onLogout: () => void;
  onRefresh: () => void;
  onSearchChange: (value: string) => void;
  onOpenVisit: (routeStopId: string) => void;
  onSync: () => void;
}

export const PromoterRootScreenRenderer = ({
  selectedTab,
  activeJourney,
  busyLabel,
  isOnline,
  lastSyncAt,
  notifications,
  nextStop,
  nextStopAction,
  queue,
  route,
  routeStops,
  routeUpdateMessage,
  search,
  syncError,
  syncLogs,
  userName,
  visitsByStopId,
  historyItems,
  hasActiveJourney,
  onJourneyToggle,
  onOpenClients,
  onOpenHistory,
  onOpenNextVisit,
  onOpenSync,
  onLogout,
  onRefresh,
  onSearchChange,
  onOpenVisit,
  onSync,
}: PromoterRootScreenRendererProps) => {
  switch (selectedTab) {
    case 'dashboard':
      return (
        <DashboardScreen
          activeJourney={activeJourney}
          busyLabel={busyLabel}
          isOnline={isOnline}
          lastSyncAt={lastSyncAt}
          notifications={notifications}
          onJourneyToggle={onJourneyToggle}
          onOpenClients={onOpenClients}
          onOpenHistory={onOpenHistory}
          onOpenNextVisit={() => {
            if (nextStop) {
              onOpenNextVisit(nextStop.id);
            }
          }}
          onOpenSync={onOpenSync}
          onLogout={onLogout}
          onRefresh={onRefresh}
          nextStop={nextStop}
          nextStopActionDescription={
            nextStopAction.key === 'complete' ? null : nextStopAction.description
          }
          nextStopActionLabel={
            nextStopAction.key === 'journey' || nextStopAction.key === 'complete'
              ? null
              : nextStopAction.label
          }
          queueCount={queue.length}
          route={route}
          routeUpdateMessage={routeUpdateMessage}
          syncError={syncError}
          userName={userName}
        />
      );
    case 'clients':
      return (
        <ClientsScreen
          hasActiveJourney={hasActiveJourney}
          onOpenVisit={onOpenVisit}
          onRefresh={onRefresh}
          onSearchChange={onSearchChange}
          queue={queue}
          routeStops={routeStops}
          search={search}
          visitsByStopId={visitsByStopId}
        />
      );
    case 'history':
      return <HistoryScreen items={historyItems} />;
    case 'sync':
      return (
        <SyncScreen
          busy={Boolean(busyLabel)}
          isOnline={isOnline}
          lastSyncAt={lastSyncAt}
          onRefresh={onRefresh}
          onSync={onSync}
          queue={queue}
          syncLogs={syncLogs}
          syncError={syncError}
        />
      );
  }
};

interface PromoterDetailScreenRendererProps {
  currentStop: RouteDayStop | null;
  currentVisit?: LocalVisitDraft;
  detailScreen: DetailScreen | null;
  blockers: string[];
  checkoutRequirements: string[];
  pendingSync: boolean;
  progress: VisitProgress;
  nextAction: VisitNextAction;
  steps: VisitStep[];
  busyLabel: string | null;
  actionError: string | null;
  onBackToRoot: () => void;
  onOpenDashboard: () => void;
  onOpenDetail: (screen: DetailScreen) => void;
  onStartService: () => void;
  onCheckIn: (justification: string) => void;
  onCapturePhoto: (
    photoType: 'BEFORE' | 'AFTER',
    category: PhotoCategory,
  ) => void;
  onChecklistDraftChange: (items: LocalChecklistItem[]) => void;
  onChecklistSubmit: (items: LocalChecklistItem[]) => void;
  onNotesDraftChange: (notes: string) => void;
  onNotesSubmit: (notes: string) => void;
  onCheckOut: (completionStatus: VisitCompletionStatus, notes: string) => void;
  renderRootFallback: () => ReactNode;
}

export const PromoterDetailScreenRenderer = ({
  currentStop,
  currentVisit,
  detailScreen,
  blockers,
  checkoutRequirements,
  pendingSync,
  progress,
  nextAction,
  steps,
  busyLabel,
  actionError,
  onBackToRoot,
  onOpenDashboard,
  onOpenDetail,
  onStartService,
  onCheckIn,
  onCapturePhoto,
  onChecklistDraftChange,
  onChecklistSubmit,
  onNotesDraftChange,
  onNotesSubmit,
  onCheckOut,
  renderRootFallback,
}: PromoterDetailScreenRendererProps) => {
  if (!currentStop) {
    return renderRootFallback();
  }

  switch (detailScreen?.name) {
    case 'visit-detail':
      return (
        <VisitDetailScreen
          blockers={blockers}
          onBack={onBackToRoot}
          onOpenDashboard={onOpenDashboard}
          onOpenAfterPhotos={() =>
            onOpenDetail({
              name: 'photos-after',
              routeStopId: currentStop.id,
            })
          }
          onOpenBeforePhotos={() =>
            onOpenDetail({
              name: 'photos-before',
              routeStopId: currentStop.id,
            })
          }
          onOpenCheckIn={() =>
            onOpenDetail({
              name: 'check-in',
              routeStopId: currentStop.id,
            })
          }
          onOpenChecklist={() =>
            onOpenDetail({
              name: 'checklist',
              routeStopId: currentStop.id,
            })
          }
          onStartService={onStartService}
          onOpenCheckout={() =>
            onOpenDetail({
              name: 'checkout',
              routeStopId: currentStop.id,
            })
          }
          pendingSync={pendingSync}
          nextAction={nextAction}
          progress={progress}
          steps={steps}
          stop={currentStop}
          visit={currentVisit}
        />
      );
    case 'check-in':
      return (
        <CheckInScreen
          busy={busyLabel === 'Registrando check-in...'}
          error={actionError}
          onBack={() =>
            onOpenDetail({
              name: 'visit-detail',
              routeStopId: currentStop.id,
            })
          }
          onSubmit={onCheckIn}
          stop={currentStop}
        />
      );
    case 'photos-before':
      return (
        <PhotosScreen
          busy={busyLabel === 'Capturando foto...'}
          error={actionError}
          onBack={() =>
            onOpenDetail({
              name: 'visit-detail',
              routeStopId: currentStop.id,
            })
          }
          onCapture={(category) => onCapturePhoto('BEFORE', category)}
          onContinue={() =>
            onOpenDetail({
              name: 'checklist',
              routeStopId: currentStop.id,
            })
          }
          nextActionDescription="Com a foto inicial registrada, confirme a execucao da loja antes da foto final."
          nextActionLabel="Ir para execucao"
          photoType="BEFORE"
          stop={currentStop}
          visit={currentVisit}
        />
      );
    case 'checklist':
      return currentVisit ? (
        <ChecklistScreen
          busy={busyLabel === 'Salvando checklist...'}
          error={actionError}
          onBack={() =>
            onOpenDetail({
              name: 'visit-detail',
              routeStopId: currentStop.id,
            })
          }
          onDraftChange={onChecklistDraftChange}
          onSubmit={onChecklistSubmit}
          visit={currentVisit}
        />
      ) : (
        renderRootFallback()
      );
    case 'notes':
      return currentVisit ? (
        <NotesScreen
          busy={busyLabel === 'Salvando observacoes...'}
          error={actionError}
          onBack={() =>
            onOpenDetail({
              name: 'visit-detail',
              routeStopId: currentStop.id,
            })
          }
          onDraftChange={onNotesDraftChange}
          onSubmit={onNotesSubmit}
          visit={currentVisit}
        />
      ) : (
        renderRootFallback()
      );
    case 'photos-after':
      return (
        <PhotosScreen
          busy={busyLabel === 'Capturando foto...'}
          error={actionError}
          onBack={() =>
            onOpenDetail({
              name: 'visit-detail',
              routeStopId: currentStop.id,
            })
          }
          onCapture={(category) => onCapturePhoto('AFTER', category)}
          onContinue={() =>
            onOpenDetail({
              name: 'checkout',
              routeStopId: currentStop.id,
            })
          }
          nextActionDescription="Com a foto final registrada, a visita fica pronta para o check-out."
          nextActionLabel="Ir para check-out"
          photoType="AFTER"
          stop={currentStop}
          visit={currentVisit}
        />
      );
    case 'checkout':
      return currentVisit ? (
        <CheckoutScreen
          busy={busyLabel === 'Finalizando visita...'}
          error={actionError}
          missingRequirements={checkoutRequirements}
          onBack={() =>
            onOpenDetail({
              name: 'visit-detail',
              routeStopId: currentStop.id,
            })
          }
          onDraftNotesChange={onNotesDraftChange}
          onSubmit={onCheckOut}
          visit={currentVisit}
        />
      ) : (
        renderRootFallback()
      );
    default:
      return renderRootFallback();
  }
};
