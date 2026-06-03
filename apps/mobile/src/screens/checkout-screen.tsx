import { useEffect, useState } from 'react';
import type { VisitCompletionStatus } from '@promotor/types';
import { View } from 'react-native';
import {
  Banner,
  Card,
  ChipButton,
  Field,
  GhostButton,
  HeroCard,
  MetricCard,
  PrimaryButton,
  Screen,
  SectionTitle,
  StatusPill,
} from '../components/mobile-ui';
import type { LocalVisitDraft } from '../lib/types';

const options: Array<{ value: VisitCompletionStatus; label: string }> = [
  { value: 'COMPLETED', label: 'Concluida' },
  { value: 'PARTIAL', label: 'Parcial' },
  { value: 'NOT_DONE', label: 'Nao realizada' },
];

interface CheckoutScreenProps {
  visit: LocalVisitDraft;
  missingRequirements: string[];
  busy: boolean;
  error?: string | null;
  onBack: () => void;
  onDraftNotesChange: (notes: string) => void;
  onSubmit: (status: VisitCompletionStatus, notes: string) => void;
}

export const CheckoutScreen = ({
  visit,
  missingRequirements,
  busy,
  error,
  onBack,
  onDraftNotesChange,
  onSubmit,
}: CheckoutScreenProps) => {
  const [status, setStatus] = useState<VisitCompletionStatus>('COMPLETED');
  const [notes, setNotes] = useState(visit.notes);

  useEffect(() => {
    setNotes(visit.notes);
  }, [visit.notes]);

  const handleNotesChange = (value: string) => {
    setNotes(value);
    onDraftNotesChange(value);
  };

  return (
    <Screen>
      <HeroCard
        eyebrow="Encerramento da visita"
        title="Finalizar atendimento"
        subtitle="Revise as evidencias, escolha o status final e confirme o fechamento operacional da loja."
        aside={
          <StatusPill
            label={missingRequirements.length === 0 ? 'Pronto para fechar' : 'Pendencias abertas'}
            tone={missingRequirements.length === 0 ? 'success' : 'warning'}
          />
        }
        helperText="O check-out so libera quando todas as etapas obrigatorias da visita estiverem registradas."
      />

      <Card>
        <GhostButton label="Voltar para visita" onPress={onBack} />
        <SectionTitle
          title="Conferencia final"
          description="Revise o que foi executado, defina o status final e encerre a visita. Depois do check-out, o app volta para o roteiro."
        />
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <MetricCard
            hint="foto do estabelecimento"
            label="Check-in"
            value={visit.checkInPhoto ? 'OK' : 'Pendente'}
          />
          <MetricCard hint="evidencias iniciais" label="Antes" value={visit.beforePhotos.length} />
          <MetricCard hint="evidencias finais" label="Depois" value={visit.afterPhotos.length} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <StatusPill
            label={visit.serviceStartedAt ? 'Atendimento iniciado' : 'Atendimento pendente'}
            tone={visit.serviceStartedAt ? 'success' : 'warning'}
          />
          <StatusPill label={`Antes ${visit.beforePhotos.length}`} />
          <StatusPill label={`Depois ${visit.afterPhotos.length}`} />
          {visit.pendingSync ? <StatusPill label="Sync pendente" tone="warning" /> : null}
        </View>
        {missingRequirements.length > 0 ? (
          <Banner text={`Faltando: ${missingRequirements.join(', ')}`} tone="warning" />
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {options.map((option) => (
            <ChipButton
              key={option.value}
              label={option.label}
              onPress={() => setStatus(option.value)}
              selected={status === option.value}
            />
          ))}
        </View>
        <Field
          label="Observacoes finais"
          multiline
          onChangeText={handleNotesChange}
          placeholder="Detalhes adicionais do encerramento da visita."
          value={notes}
        />
        {error ? <Banner text={error} tone="danger" /> : null}
        <PrimaryButton
          disabled={missingRequirements.length > 0}
          label={busy ? 'Finalizando visita...' : 'Confirmar check-out e voltar ao roteiro'}
          onPress={() => onSubmit(status, notes)}
        />
      </Card>
    </Screen>
  );
};
