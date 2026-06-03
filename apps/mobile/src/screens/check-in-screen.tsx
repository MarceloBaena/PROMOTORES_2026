import { useState } from 'react';
import { Text } from 'react-native';
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
import type { RouteDayStop } from '../lib/types';
import { palette } from '../theme';

interface CheckInScreenProps {
  stop: RouteDayStop;
  busy: boolean;
  error?: string | null;
  onBack: () => void;
  onSubmit: (justification: string) => void;
}

export const CheckInScreen = ({
  stop,
  busy,
  error,
  onBack,
  onSubmit,
}: CheckInScreenProps) => {
  const [justification, setJustification] = useState('');

  return (
    <Screen>
      <HeroCard
        eyebrow="Check-in operacional"
        title={`Check-in em ${stop.client.tradeName}`}
        subtitle={`${stop.client.address} | geofence ${stop.client.geofence.radiusInMeters} m`}
        aside={<StatusPill label="Check-in" tone="warning" />}
        helperText="Ao confirmar, o app abre a camera para registrar a fachada ou o ponto de atendimento."
      />

      <Card>
        <GhostButton label="Voltar para visita" onPress={onBack} />
        <SectionTitle
          title="Registrar entrada na loja"
          description="Confirme a chegada no cliente e siga para a captura obrigatoria da foto do estabelecimento."
        />
        <StatusPill label={`Raio permitido ${stop.client.geofence.radiusInMeters} m`} />
        <Text style={{ color: palette.muted }}>{stop.client.address}</Text>
        <Banner
          text="Se o aparelho estiver fora do raio ou sem GPS, registre a justificativa para auditoria antes de continuar."
          tone="neutral"
        />
      </Card>

      <Card>
        <Field
          label="Justificativa operacional"
          multiline
          onChangeText={setJustification}
          placeholder="Preencha apenas se estiver fora da area configurada ou se houver alguma ocorrencia."
          value={justification}
        />
        {error ? <Banner text={error} tone="danger" /> : null}
        <PrimaryButton
          label={busy ? 'Registrando check-in...' : 'Confirmar check-in com foto'}
          onPress={() => onSubmit(justification)}
        />
      </Card>
    </Screen>
  );
};
