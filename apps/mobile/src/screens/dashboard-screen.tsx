import type { JourneySummary } from '@promotor/types';
import { Text, View } from 'react-native';
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
  formatDateTime,
  formatTime,
} from '../components/mobile-ui';
import type { RouteDayBundle, RouteDayStop, RouteNotification } from '../lib/types';
import { palette } from '../theme';

interface DashboardScreenProps {
  userName: string;
  isOnline: boolean;
  route: RouteDayBundle | null;
  activeJourney: JourneySummary | null;
  queueCount: number;
  lastSyncAt?: string;
  syncError?: string | null;
  routeUpdateMessage?: string | null;
  busyLabel?: string | null;
  nextStop: RouteDayStop | null;
  notifications: RouteNotification[];
  nextStopActionLabel?: string | null;
  nextStopActionDescription?: string | null;
  onJourneyToggle: () => void;
  onRefresh: () => void;
  onOpenNextVisit: () => void;
  onOpenClients: () => void;
  onOpenHistory: () => void;
  onOpenSync: () => void;
  onLogout: () => void;
}

export const DashboardScreen = ({
  userName,
  isOnline,
  route,
  activeJourney,
  queueCount,
  lastSyncAt,
  syncError,
  routeUpdateMessage,
  busyLabel,
  nextStop,
  notifications,
  nextStopActionLabel,
  nextStopActionDescription,
  onJourneyToggle,
  onRefresh,
  onOpenNextVisit,
  onOpenClients,
  onOpenHistory,
  onOpenSync,
  onLogout,
}: DashboardScreenProps) => (
  <Screen>
    <HeroCard
      eyebrow="Inicio operacional"
      title="Operacao do dia"
      subtitle={`${userName} | ${isOnline ? 'online' : 'offline'} | jornada ${activeJourney ? 'ativa' : 'inativa'}`}
      aside={
        <StatusPill
          label={isOnline ? 'Conectado' : 'Sem sinal'}
          tone={isOnline ? 'success' : 'warning'}
        />
      }
      helperText="Painel principal para iniciar jornada, abrir o roteiro e acompanhar pendencias do aparelho."
    />

    {syncError ? <Banner text={syncError} tone="danger" /> : null}
    {routeUpdateMessage ? <Banner text={routeUpdateMessage} tone="success" /> : null}

    <Card>
      <SectionTitle
        title="Turno e sincronizacao"
        description="Comece ou encerre a jornada e acompanhe o estado do aparelho antes de sair para a loja."
      />
      <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
        <MetricCard
          hint="ultimo envio local"
          label="Sync"
          value={lastSyncAt ? formatTime(lastSyncAt) : 'Nunca'}
        />
        <MetricCard hint="fila offline" label="Pendencias" value={queueCount} />
        <MetricCard hint="lojas do roteiro" label="Clientes" value={route?.totalStops ?? 0} />
        <MetricCard hint="roteiro publicado" label="Versao" value={route?.version ?? 1} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <StatusPill
          label={activeJourney ? 'Jornada em andamento' : 'Jornada parada'}
          tone={activeJourney ? 'success' : 'warning'}
        />
        <StatusPill
          label={queueCount > 0 ? `${queueCount} itens aguardando envio` : 'Fila local em dia'}
          tone={queueCount > 0 ? 'warning' : 'success'}
        />
      </View>
      <PrimaryButton
        label={busyLabel ? busyLabel : activeJourney ? 'Encerrar jornada' : 'Iniciar jornada'}
        onPress={onJourneyToggle}
      />
      <SecondaryButton label="Abrir roteiro do dia" onPress={onOpenClients} />
      <GhostButton label="Atualizar dados do aparelho" onPress={onRefresh} />
    </Card>

    <Card>
      <SectionTitle
        title="Proxima visita"
        description={
          nextStop
            ? 'Abra a proxima loja e siga a etapa recomendada para manter o fluxo rapido.'
            : route
              ? `Roteiro carregado para ${formatDateTime(route.date)}`
              : 'Nenhum roteiro carregado'
        }
      />
      {nextStop ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: palette.ink, fontWeight: '800', fontSize: 16 }}>
            Proxima visita: {nextStop.sequence}. {nextStop.client.tradeName}
          </Text>
          <Text style={{ color: palette.muted }}>{nextStop.client.address}</Text>
          <Text style={{ color: palette.muted }}>
            Janela prevista: {formatTime(nextStop.plannedStartAt)} -{' '}
            {formatTime(nextStop.plannedEndAt)}
          </Text>
          {nextStopActionDescription ? (
            <Text style={{ color: palette.muted }}>{nextStopActionDescription}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <StatusPill label={`Janela ${formatTime(nextStop.plannedStartAt)} - ${formatTime(nextStop.plannedEndAt)}`} />
            <StatusPill label={`Geofence ${nextStop.client.geofence.radiusInMeters} m`} />
          </View>
        </View>
      ) : (
        <Banner text="Sem proxima visita pendente no roteiro atual." tone="neutral" />
      )}
      {nextStop && nextStopActionLabel ? (
        <PrimaryButton label={nextStopActionLabel} onPress={onOpenNextVisit} />
      ) : !activeJourney && nextStop ? (
        <Banner
          text="Inicie a jornada para liberar o check-in da primeira visita do dia."
          tone="warning"
        />
      ) : null}
    </Card>

    <Card>
      <SectionTitle
        title="Resumo do roteiro"
        description="Visao rapida do que falta executar no dia."
      />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <StatusPill label={`Concluidas ${route?.completedStops ?? 0}`} tone="success" />
        <StatusPill label={`Pendentes ${route?.pendingStops ?? 0}`} tone="warning" />
        <StatusPill label={`Parciais ${route?.partialStops ?? 0}`} tone="warning" />
        <StatusPill label={`Nao realizadas ${route?.skippedStops ?? 0}`} tone="danger" />
      </View>
      {route?.nextInstruction ? <Text style={{ color: palette.muted }}>{route.nextInstruction}</Text> : null}
    </Card>

    <Card>
      <SectionTitle
        title="Comunicados do supervisor"
        description="As ultimas publicacoes e instrucoes do roteiro aparecem aqui."
      />
      {notifications.length === 0 ? (
        <Banner text="Nenhuma nova alteracao recebida para o roteiro atual." tone="neutral" />
      ) : (
        notifications.slice(0, 2).map((notification) => (
          <View
            key={notification.id}
            style={{
              gap: 4,
              padding: 12,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.surfaceRaised,
            }}
          >
            <Text style={{ color: palette.ink, fontWeight: '800' }}>{notification.title}</Text>
            <Text style={{ color: palette.muted }}>{notification.message}</Text>
            <Text style={{ color: palette.muted }}>{formatDateTime(notification.createdAt)}</Text>
          </View>
        ))
      )}
    </Card>

    <Card>
      <SectionTitle
        title="Acesso rapido"
        description="Atalhos principais de operacao e suporte do aparelho."
      />
      <PrimaryButton label="Abrir roteiro do dia" onPress={onOpenClients} />
      <SecondaryButton label="Sincronizacao offline" onPress={onOpenSync} />
      <SecondaryButton label="Historico local" onPress={onOpenHistory} />
      <GhostButton label="Encerrar sessao" onPress={onLogout} />
    </Card>
  </Screen>
);
