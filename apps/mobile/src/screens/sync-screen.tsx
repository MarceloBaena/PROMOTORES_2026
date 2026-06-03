import { Text, View } from 'react-native';
import {
  Banner,
  Card,
  EmptyState,
  GhostButton,
  HeroCard,
  MetricCard,
  PrimaryButton,
  Screen,
  SecondaryButton,
  SectionTitle,
  StatusPill,
  formatDateTime,
} from '../components/mobile-ui';
import type { QueueAction, SyncLogEntry } from '../lib/types';
import { palette } from '../theme';

interface SyncScreenProps {
  isOnline: boolean;
  lastSyncAt?: string;
  syncError?: string | null;
  queue: QueueAction[];
  syncLogs: SyncLogEntry[];
  busy: boolean;
  onSync: () => void;
  onRefresh: () => void;
}

export const SyncScreen = ({
  isOnline,
  lastSyncAt,
  syncError,
  queue,
  syncLogs,
  busy,
  onSync,
  onRefresh,
}: SyncScreenProps) => (
  <Screen>
    <HeroCard
      eyebrow="Sincronizacao offline"
      title="Fila e reenvio"
      subtitle={`${queue.length} itens na fila | ${isOnline ? 'conexao disponivel' : 'trabalho offline'} | ultimo envio ${lastSyncAt ? formatDateTime(lastSyncAt) : 'nunca'}`}
      aside={
        <StatusPill
          label={isOnline ? 'Online' : 'Offline'}
          tone={isOnline ? 'success' : 'warning'}
        />
      }
      helperText="Nada sai do aparelho antes da confirmacao do servidor. Se a internet cair, a fila continua salva localmente."
    />

    <Card>
      <SectionTitle
        title="Painel de sincronizacao"
        description="Use esta tela para disparar reenvio manual, revisar falhas e acompanhar o status local da fila."
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <MetricCard hint="acoes locais aguardando envio" label="Fila" value={queue.length} />
        <MetricCard
          hint="confirmacao mais recente"
          label="Ultimo sync"
          value={lastSyncAt ? formatDateTime(lastSyncAt) : 'Nunca'}
        />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <StatusPill
          label={isOnline ? 'Online' : 'Offline'}
          tone={isOnline ? 'success' : 'warning'}
        />
        <StatusPill
          label={queue.some((item) => item.status === 'FAILED') ? 'Ha falhas para revisar' : 'Sem falhas criticas'}
          tone={queue.some((item) => item.status === 'FAILED') ? 'danger' : 'success'}
        />
      </View>
      {syncError ? <Banner text={syncError} tone="danger" /> : null}
      <PrimaryButton
        label={busy ? 'Sincronizando...' : isOnline ? 'Sincronizar agora' : 'Aguardando internet'}
        onPress={onSync}
        disabled={!isOnline}
      />
      <SecondaryButton label="Atualizar dados do servidor" onPress={onRefresh} disabled={!isOnline} />
    </Card>

    <Card>
      <SectionTitle
        title="Fila pendente"
        description="Cada bloco representa uma acao local aguardando confirmacao do backend."
      />
      {queue.length === 0 ? (
        <EmptyState title="Fila vazia" description="Nao ha acoes pendentes neste momento." />
      ) : (
        queue.map((action) => (
          <View
            key={action.id}
            style={{
              gap: 8,
              padding: 14,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.surfaceRaised,
            }}
          >
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <StatusPill label={action.type} />
              <StatusPill
                label={action.status}
                tone={
                  action.status === 'FAILED'
                    ? 'danger'
                    : action.status === 'SYNCING'
                      ? 'warning'
                      : 'neutral'
                }
              />
              <StatusPill label={`Tentativas ${action.attempts}`} />
            </View>
            <Text style={{ color: palette.muted }}>Criado em {formatDateTime(action.createdAt)}</Text>
            <Text style={{ color: palette.muted }}>client_generated_id {action.clientGeneratedId}</Text>
            {action.nextRetryAt ? (
              <Text style={{ color: palette.muted }}>
                Proxima tentativa {formatDateTime(action.nextRetryAt)}
              </Text>
            ) : null}
            {action.lastError ? <Banner text={action.lastError} tone="danger" /> : null}
          </View>
        ))
      )}
    </Card>

    <Card>
      <SectionTitle
        title="Historico local de sync"
        description="As confirmacoes e falhas recentes ficam registradas para diagnostico e reprocessamento manual."
      />
      {syncLogs.length === 0 ? (
        <EmptyState
          title="Sem logs locais"
          description="As proximas tentativas de sincronizacao aparecerao aqui."
        />
      ) : (
        syncLogs.slice(0, 20).map((log) => (
          <View
            key={log.id}
            style={{
              gap: 8,
              padding: 14,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.surfaceRaised,
            }}
          >
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <StatusPill label={log.actionType} />
              <StatusPill
                label={log.status}
                tone={
                  log.status === 'FAILED'
                    ? 'danger'
                    : log.status === 'SYNCED'
                      ? 'success'
                      : log.status === 'SYNCING'
                        ? 'warning'
                        : 'neutral'
                }
              />
            </View>
            <Text style={{ color: palette.muted }}>
              {formatDateTime(log.createdAt)} - {log.message}
            </Text>
            <Text style={{ color: palette.muted }}>client_generated_id {log.clientGeneratedId}</Text>
            {log.serverEntityId ? (
              <Text style={{ color: palette.muted }}>
                Confirmacao do servidor: {log.serverEntityId}
              </Text>
            ) : null}
          </View>
        ))
      )}
      <GhostButton label="Atualizar painel de sync" onPress={onRefresh} disabled={!isOnline} />
    </Card>
  </Screen>
);
