import { Text, View } from 'react-native';
import { getVisitStatusLabel } from '@promotor/ui';
import {
  Banner,
  Card,
  GhostButton,
  HeroCard,
  MetricCard,
  PrimaryButton,
  Screen,
  SectionTitle,
  SecondaryButton,
  StatusPill,
  StepRail,
  formatDateTime,
  formatTime,
} from '../components/mobile-ui';
import type { LocalVisitDraft, RouteDayStop } from '../lib/types';
import type { VisitNextAction, VisitProgress, VisitStep, VisitStepKey } from '../lib/visit-workflow';
import { palette } from '../theme';

interface VisitDetailScreenProps {
  stop: RouteDayStop;
  visit?: LocalVisitDraft;
  blockers: string[];
  steps: VisitStep[];
  progress: VisitProgress;
  nextAction: VisitNextAction;
  pendingSync: boolean;
  onBack: () => void;
  onOpenDashboard: () => void;
  onOpenCheckIn: () => void;
  onStartService: () => void;
  onOpenBeforePhotos: () => void;
  onOpenChecklist: () => void;
  onOpenAfterPhotos: () => void;
  onOpenCheckout: () => void;
}

export const VisitDetailScreen = ({
  stop,
  visit,
  blockers,
  steps,
  progress,
  nextAction,
  pendingSync,
  onBack,
  onOpenDashboard,
  onOpenCheckIn,
  onStartService,
  onOpenBeforePhotos,
  onOpenChecklist,
  onOpenAfterPhotos,
  onOpenCheckout,
}: VisitDetailScreenProps) => {
  const handlers: Record<VisitStepKey, () => void> = {
    checkIn: onOpenCheckIn,
    startService: onStartService,
    beforePhotos: onOpenBeforePhotos,
    execution: onOpenChecklist,
    afterPhotos: onOpenAfterPhotos,
    checkout: onOpenCheckout,
  };

  const labels: Record<VisitStepKey, string> = {
    checkIn: visit?.checkInAt ? 'Revisar check-in' : 'Realizar check-in',
    startService: visit?.serviceStartedAt ? 'Atendimento iniciado' : 'Iniciar atendimento',
    beforePhotos: 'Fotos antes',
    execution: visit?.checklistSyncedAt ? 'Execucao registrada' : 'Registrar execucao',
    afterPhotos: 'Fotos depois',
    checkout: visit?.checkOutAt ? 'Check-out concluido' : 'Finalizar visita',
  };

  const primaryAction = () => {
    switch (nextAction.key) {
      case 'journey':
        onOpenDashboard();
        break;
      case 'complete':
        onBack();
        break;
      default:
        handlers[nextAction.key]();
        break;
    }
  };

  const quickActionKeys: VisitStepKey[] = [
    'checkIn',
    'startService',
    'beforePhotos',
    'execution',
    'afterPhotos',
    'checkout',
  ];
  const quickActions =
    nextAction.key === 'complete'
      ? []
      : quickActionKeys
          .filter((key) => {
            if (nextAction.key === key) {
              return false;
            }

            const step = steps.find((item) => item.key === key);

            return step ? !step.blocked : false;
          })
          .slice(0, 2);

  const blockersMessage = blockers.length
    ? `Pendencias atuais:\n${blockers.map((blocker) => `- ${blocker}`).join('\n')}`
    : null;

  return (
    <Screen>
      <HeroCard
        eyebrow="Visita operacional"
        title={`${stop.sequence}. ${stop.client.tradeName}`}
        subtitle={`${stop.client.address} | janela ${formatTime(stop.plannedStartAt)} - ${formatTime(stop.plannedEndAt)}`}
        aside={
          <StatusPill
            label={getVisitStatusLabel(visit?.completionStatus ?? visit?.status ?? stop.status)}
          />
        }
        helperText="Trabalhe uma etapa por vez. A proxima acao obrigatoria fica destacada abaixo."
      />

      <Card>
        <GhostButton label="Voltar para clientes" onPress={onBack} />
        <SectionTitle
          title="Estado da visita"
          description="Veja o status atual, as evidencias ja registradas e o que ainda falta para concluir a loja."
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <StatusPill
            label={getVisitStatusLabel(visit?.completionStatus ?? visit?.status ?? stop.status)}
          />
          <StatusPill label={`Geofence ${stop.client.geofence.radiusInMeters} m`} />
          <StatusPill
            label={visit?.serviceStartedAt ? 'Atendimento iniciado' : 'Atendimento nao iniciado'}
            tone={visit?.serviceStartedAt ? 'success' : 'warning'}
          />
          {pendingSync ? <StatusPill label="Sync pendente" tone="warning" /> : null}
        </View>
        <View style={{ gap: 4 }}>
          <Text style={{ color: palette.muted }}>
            Janela prevista: {formatTime(stop.plannedStartAt)} - {formatTime(stop.plannedEndAt)}
          </Text>
          <Text style={{ color: palette.muted }}>
            Check-in: {formatDateTime(visit?.checkInAt)} | Check-out: {formatDateTime(visit?.checkOutAt)}
          </Text>
          <Text style={{ color: palette.muted }}>
            Atendimento iniciado: {formatDateTime(visit?.serviceStartedAt)}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <MetricCard
            hint="foto do estabelecimento"
            label="Check-in"
            value={visit?.checkInPhoto ? 'OK' : 'Pendente'}
          />
          <MetricCard
            hint="inicio da execucao"
            label="Atendimento"
            value={visit?.serviceStartedAt ? 'Iniciado' : 'Pendente'}
          />
          <MetricCard
            hint="etapas obrigatorias"
            label="Progresso"
            value={`${progress.completedRequired}/${progress.totalRequired}`}
          />
          <MetricCard
            hint="antes / depois"
            label="Evidencias"
            value={`${visit?.beforePhotos.length ?? 0}/${visit?.afterPhotos.length ?? 0}`}
          />
        </View>
      </Card>

      {visit?.outsideGeofence ? (
        <Banner
          text={`Check-in fora da geofence (${Math.round(visit.geofenceDistanceM ?? 0)} m). A justificativa operacional foi salva para auditoria.`}
          tone="warning"
        />
      ) : null}

      {blockersMessage ? <Banner text={blockersMessage} tone="warning" /> : null}

      <Card>
        <SectionTitle
          title="Acao do momento"
          description={nextAction.description}
        />
        <PrimaryButton
          label={nextAction.key === 'complete' ? 'Voltar para clientes' : nextAction.label}
          onPress={primaryAction}
        />
        {quickActions.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: palette.ink, fontWeight: '800' }}>Atalhos liberados</Text>
            {quickActions.map((key) => (
              <SecondaryButton key={key} label={labels[key]} onPress={handlers[key]} />
            ))}
          </View>
        ) : null}
      </Card>

      <Card>
        <SectionTitle
          title="Sequencia obrigatoria"
          description="Siga a ordem operacional para nao bloquear o encerramento da visita."
        />
        <StepRail steps={steps} />
      </Card>
    </Screen>
  );
};
