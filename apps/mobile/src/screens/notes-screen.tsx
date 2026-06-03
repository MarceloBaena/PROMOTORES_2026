import { useEffect, useState } from 'react';
import {
  Banner,
  Card,
  Field,
  GhostButton,
  HeroCard,
  PrimaryButton,
  Screen,
  SectionTitle,
  StatusPill,
} from '../components/mobile-ui';
import type { LocalVisitDraft } from '../lib/types';

interface NotesScreenProps {
  visit: LocalVisitDraft;
  busy: boolean;
  error?: string | null;
  onBack: () => void;
  onDraftChange: (notes: string) => void;
  onSubmit: (notes: string) => void;
}

export const NotesScreen = ({
  visit,
  busy,
  error,
  onBack,
  onDraftChange,
  onSubmit,
}: NotesScreenProps) => {
  const [notes, setNotes] = useState(visit.notes);

  useEffect(() => {
    setNotes(visit.notes);
  }, [visit.notes]);

  const handleChange = (value: string) => {
    setNotes(value);
    onDraftChange(value);
  };

  return (
    <Screen>
      <HeroCard
        eyebrow="Observacao operacional"
        title="Anotacoes da visita"
        subtitle="Registre apenas o que ajuda a supervisao a entender a execucao, ruptura ou ocorrencia."
        aside={<StatusPill label="Opcional" />}
        helperText="As observacoes ficam vinculadas a visita e acompanham a sincronizacao posterior."
      />

      <Card>
        <GhostButton label="Voltar para visita" onPress={onBack} />
        <SectionTitle
          title="Registro complementar"
          description="Preencha somente quando houver contexto relevante para fechamento, ruptura ou auditoria."
        />
        <Field
          label="Observacoes"
          multiline
          onChangeText={handleChange}
          placeholder="Descreva o atendimento, ruptura, acao de merchandising ou qualquer ocorrencia."
          value={notes}
        />
        {error ? <Banner text={error} tone="danger" /> : null}
        <PrimaryButton
          label={busy ? 'Salvando observacoes...' : 'Salvar observacoes e voltar'}
          onPress={() => onSubmit(notes)}
        />
      </Card>
    </Screen>
  );
};
