import { Text, View } from 'react-native';
import { getVisitStatusLabel } from '@promotor/ui';
import {
  Card,
  EmptyState,
  HeroCard,
  MetricCard,
  Screen,
  SectionTitle,
  StatusPill,
  formatDateTime,
} from '../components/mobile-ui';
import type { HistoryItem } from '../lib/types';
import { palette } from '../theme';

interface HistoryScreenProps {
  items: HistoryItem[];
}

export const HistoryScreen = ({ items }: HistoryScreenProps) => {
  const openCount = items.filter((item) => item.checkInAt && !item.checkOutAt).length;
  const completedCount = items.filter((item) => item.checkOutAt).length;
  const pendingSyncCount = items.filter((item) => item.pendingSync).length;

  return (
    <Screen>
      <HeroCard
        eyebrow="Registro do aparelho"
        title="Historico operacional"
        subtitle={`${items.length} visitas gravadas | ${completedCount} concluidas | ${pendingSyncCount} com sync pendente`}
        aside={
          <StatusPill
            label={pendingSyncCount > 0 ? 'Pendencias locais' : 'Cache em dia'}
            tone={pendingSyncCount > 0 ? 'warning' : 'success'}
          />
        }
        helperText="Use esta tela para conferir o que ficou salvo localmente, mesmo com internet instavel."
      />

      <Card>
        <SectionTitle
          title="Resumo local"
          description="Visitas registradas no aparelho com status, horario e evidencias salvas offline."
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <StatusPill label={`Em aberto ${openCount}`} tone={openCount > 0 ? 'warning' : 'neutral'} />
          <StatusPill label={`Concluidas ${completedCount}`} tone="success" />
          <StatusPill
            label={`Pendentes ${pendingSyncCount}`}
            tone={pendingSyncCount > 0 ? 'warning' : 'neutral'}
          />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <MetricCard hint="registros no aparelho" label="Visitas" value={items.length} />
          <MetricCard hint="ainda abertas" label="Em aberto" value={openCount} />
          <MetricCard hint="aguardando envio" label="Sync pendente" value={pendingSyncCount} />
        </View>
      </Card>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            title="Sem historico local"
            description="As visitas aparecem aqui assim que houver check-in ou sincronizacao de alguma execucao."
          />
        </Card>
      ) : (
        items.map((item) => (
          <Card key={`${item.routeStopId}-${item.lastLocalChangeAt}`}>
            <View style={{ gap: 10 }}>
              <View style={{ gap: 4 }}>
                <Text style={{ color: palette.ink, fontWeight: '900', fontSize: 17 }}>
                  {item.sequence}. {item.clientName}
                </Text>
                <Text style={{ color: palette.muted }}>{item.clientAddress}</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <StatusPill label={getVisitStatusLabel(item.completionStatus ?? item.operationalStatus)} />
                <StatusPill
                  label={item.checkInAt && !item.checkOutAt ? 'Visita em andamento' : 'Visita encerrada'}
                  tone={item.checkOutAt ? 'success' : item.checkInAt ? 'warning' : 'neutral'}
                />
                {item.pendingSync ? <StatusPill label="Sync pendente" tone="warning" /> : null}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                <MetricCard hint="evidencias iniciais" label="Fotos antes" value={item.beforePhotos} />
                <MetricCard hint="evidencias finais" label="Fotos depois" value={item.afterPhotos} />
              </View>
              <View style={{ gap: 2 }}>
                <Text style={{ color: palette.muted }}>
                  Check-in: {formatDateTime(item.checkInAt)}
                </Text>
                <Text style={{ color: palette.muted }}>
                  Check-out: {formatDateTime(item.checkOutAt)}
                </Text>
                <Text style={{ color: palette.muted }}>
                  Ultima alteracao local: {formatDateTime(item.lastLocalChangeAt)}
                </Text>
              </View>
            </View>
          </Card>
        ))
      )}
      {completedCount === items.length && items.length > 0 ? (
        <Card>
          <View style={{ gap: 8 }}>
            <Text style={{ color: palette.ink, fontWeight: '900', fontSize: 16 }}>
              Todas as visitas registradas estao encerradas
            </Text>
            <StatusPill label="Historico local estabilizado" tone="success" />
          </View>
        </Card>
      ) : null}
    </Screen>
  );
};
