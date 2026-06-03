import { useEffect, useState } from 'react';
import { Switch, Text, View } from 'react-native';
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
import type { LocalChecklistItem, LocalVisitDraft } from '../lib/types';
import { palette } from '../theme';

interface ChecklistScreenProps {
  visit: LocalVisitDraft;
  busy: boolean;
  error?: string | null;
  onBack: () => void;
  onDraftChange: (items: LocalChecklistItem[]) => void;
  onSubmit: (items: LocalChecklistItem[]) => void;
}

export const ChecklistScreen = ({
  visit,
  busy,
  error,
  onBack,
  onDraftChange,
  onSubmit,
}: ChecklistScreenProps) => {
  const [items, setItems] = useState(visit.checklist);

  useEffect(() => {
    setItems(visit.checklist);
  }, [visit.checklist]);

  const updateItem = (index: number, value: boolean | string) => {
    const nextItems = items.map((item, currentIndex) =>
      currentIndex === index ? { ...item, value } : item,
    );
    setItems(nextItems);
    onDraftChange(nextItems);
  };

  return (
    <Screen>
      <HeroCard
        eyebrow="Checklist operacional"
        title="Checklist da visita"
        subtitle={`${items.length} perguntas carregadas | ${items.filter((item) => item.required).length} obrigatorias`}
        aside={
          <StatusPill
            label={visit.checklistCompleted ? 'Checklist salvo' : 'Checklist pendente'}
            tone={visit.checklistCompleted ? 'success' : 'warning'}
          />
        }
        helperText="Confirme os itens da execucao sem sair do fluxo principal da visita."
      />

      <Card>
        <GhostButton label="Voltar para visita" onPress={onBack} />
        <SectionTitle
          title="Execucao por pergunta"
          description="Confirme os itens obrigatorios da loja. O checklist continua editavel ate o encerramento."
        />
      </Card>

      <Card>
        {items.map((item, index) => (
          <View
            key={item.code}
            style={{
              gap: 8,
              paddingBottom: 12,
              borderBottomWidth: index < items.length - 1 ? 1 : 0,
              borderBottomColor: palette.border,
            }}
          >
            <Text style={{ color: palette.ink, fontWeight: '800' }}>
              {item.label} {item.required ? '*' : ''}
            </Text>
            {item.type === 'BOOLEAN' ? (
              <Switch
                onValueChange={(value) => updateItem(index, value)}
                value={Boolean(item.value)}
              />
            ) : (
              <Field
                label="Resposta"
                multiline
                onChangeText={(value) => updateItem(index, value)}
                placeholder="Descreva a execucao ou ocorrencia"
                value={String(item.value)}
              />
            )}
          </View>
        ))}
        {error ? <Banner text={error} tone="danger" /> : null}
        <PrimaryButton
          label={busy ? 'Salvando checklist...' : 'Salvar checklist e seguir'}
          onPress={() => onSubmit(items)}
        />
      </Card>
    </Screen>
  );
};
