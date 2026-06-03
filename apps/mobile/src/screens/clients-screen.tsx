import { Text, View } from 'react-native';
import { getVisitStatusLabel } from '@promotor/ui';
import {
  Banner,
  Card,
  EmptyState,
  Field,
  GhostButton,
  HeroCard,
  MetricCard,
  PrimaryButton,
  Screen,
  SectionTitle,
  StatusPill,
  formatTime,
} from '../components/mobile-ui';
import type { LocalVisitDraft, QueueAction, RouteDayStop } from '../lib/types';
import { getNextVisitAction, getVisitProgress, hasPendingVisitSync } from '../lib/visit-workflow';
import { palette } from '../theme';

interface ClientsScreenProps {
  routeStops: RouteDayStop[];
  visitsByStopId: Record<string, LocalVisitDraft>;
  queue: QueueAction[];
  search: string;
  hasActiveJourney: boolean;
  onSearchChange: (value: string) => void;
  onOpenVisit: (routeStopId: string) => void;
  onRefresh: () => void;
}

export const ClientsScreen = ({
  routeStops,
  visitsByStopId,
  queue,
  search,
  hasActiveJourney,
  onSearchChange,
  onOpenVisit,
  onRefresh,
}: ClientsScreenProps) => {
  const inProgressCount = routeStops.filter((stop) => {
    const visit = visitsByStopId[stop.id];

    return Boolean(visit?.checkInAt) && !visit?.checkOutAt;
  }).length;

  const completedCount = routeStops.filter((stop) => {
    const visit = visitsByStopId[stop.id];

    return Boolean(visit?.checkOutAt);
  }).length;

  return (
    <Screen>
      <HeroCard
        eyebrow="Roteiro operacional"
        title="Lojas do dia"
        subtitle={`${routeStops.length} paradas | ${inProgressCount} em atendimento | ${completedCount} concluidas`}
        aside={
          <StatusPill
            label={hasActiveJourney ? 'Jornada ativa' : 'Jornada inativa'}
            tone={hasActiveJourney ? 'success' : 'warning'}
          />
        }
        helperText="Abra uma loja por vez e siga a proxima etapa indicada para acelerar a operacao em campo."
      />

      <Card>
        <SectionTitle
          title="Filtro e situacao da rota"
          description="Busque rapidamente um cliente e acompanhe o andamento do roteiro salvo no aparelho."
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <StatusPill
            label={hasActiveJourney ? 'Jornada liberada' : 'Inicie a jornada'}
            tone={hasActiveJourney ? 'success' : 'warning'}
          />
          <StatusPill label={`Em atendimento ${inProgressCount}`} />
          <StatusPill label={`Concluidas ${completedCount}`} tone="success" />
        </View>
        <Field
          label="Buscar cliente"
          onChangeText={onSearchChange}
          placeholder="Nome da loja, cidade ou sequencia"
          value={search}
        />
        <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
          <MetricCard hint="clientes filtrados" label="Paradas" value={routeStops.length} />
          <MetricCard hint="visitas abertas" label="Em atendimento" value={inProgressCount} />
          <MetricCard hint="visitas fechadas" label="Concluidas" value={completedCount} />
        </View>
        {!hasActiveJourney ? (
          <Banner
            text="A jornada ainda nao foi iniciada. Abra o dashboard para liberar check-in nas lojas."
            tone="warning"
          />
        ) : null}
        <GhostButton label="Atualizar roteiro" onPress={onRefresh} />
      </Card>

      {routeStops.length === 0 ? (
        <Card>
          <EmptyState
            title="Nenhum cliente encontrado"
            description="Sem clientes no cache local com o filtro atual. Atualize o roteiro ou revise a busca."
          />
        </Card>
      ) : (
        routeStops.map((stop) => {
          const visit = visitsByStopId[stop.id];
          const tone =
            visit?.completionStatus === 'COMPLETED'
              ? 'success'
              : visit?.completionStatus === 'PARTIAL'
                ? 'warning'
                : visit?.completionStatus === 'NOT_DONE'
                  ? 'danger'
                  : 'neutral';
          const nextAction = getNextVisitAction(stop, visit, hasActiveJourney);
          const progress = getVisitProgress(visit);
          const pendingSync = hasPendingVisitSync(visit, queue);

          return (
            <Card key={stop.id}>
              <View style={{ gap: 10 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 10,
                  }}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: palette.ink, fontWeight: '900', fontSize: 18 }}>
                      {stop.sequence}. {stop.client.tradeName}
                    </Text>
                    <Text style={{ color: palette.muted }}>{stop.client.address}</Text>
                  </View>
                  <StatusPill
                    label={getVisitStatusLabel(visit?.completionStatus ?? visit?.status ?? stop.status)}
                    tone={tone}
                  />
                </View>
                <Text style={{ color: palette.muted }}>
                  Janela prevista: {formatTime(stop.plannedStartAt)} - {formatTime(stop.plannedEndAt)}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <StatusPill label={`Proxima etapa: ${nextAction.label}`} />
                  <StatusPill
                    label={`Etapas ${progress.completedRequired}/${progress.totalRequired}`}
                    tone={
                      progress.completedRequired === progress.totalRequired ? 'success' : 'neutral'
                    }
                  />
                  <StatusPill label={`Antes ${visit?.beforePhotos.length ?? 0}`} />
                  <StatusPill label={`Depois ${visit?.afterPhotos.length ?? 0}`} />
                </View>
                <Banner text={nextAction.description} tone="neutral" />
                {pendingSync ? (
                  <Banner
                    text="Essa visita tem alteracoes locais aguardando sincronizacao."
                    tone="warning"
                  />
                ) : null}
              </View>
              <PrimaryButton
                label={
                  nextAction.key === 'complete'
                    ? 'Revisar visita concluida'
                    : nextAction.key === 'journey'
                      ? 'Abrir visita'
                      : `Continuar: ${nextAction.label}`
                }
                onPress={() => onOpenVisit(stop.id)}
              />
            </Card>
          );
        })
      )}
    </Screen>
  );
};
