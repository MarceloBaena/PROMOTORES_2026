import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import {
  Banner,
  Card,
  Field,
  HeroCard,
  PrimaryButton,
  SectionTitle,
  SecondaryButton,
  Screen,
  StatusPill,
} from '../components/mobile-ui';
import type { AuthFeedback } from '../lib/auth-feedback';
import { palette } from '../theme';

interface LoginScreenProps {
  initialEmail: string;
  initialPassword: string;
  busy: boolean;
  diagnosing: boolean;
  error?: AuthFeedback | null;
  connectionMessage?: {
    tone: 'neutral' | 'success' | 'warning' | 'danger';
    text: string;
  } | null;
  configuredApiBaseUrl: string;
  activeApiBaseUrl?: string | null;
  onSubmit: (email: string, password: string) => void;
  onProbeConnection: () => void;
}

export const LoginScreen = ({
  initialEmail,
  initialPassword,
  busy,
  diagnosing,
  error,
  connectionMessage,
  configuredApiBaseUrl,
  activeApiBaseUrl,
  onSubmit,
  onProbeConnection,
}: LoginScreenProps) => {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState(initialPassword);

  useEffect(() => {
    setEmail(initialEmail);
    setPassword(initialPassword);
  }, [initialEmail, initialPassword]);

  return (
    <Screen>
      <HeroCard
        eyebrow="Acesso operacional"
        title="Entrar no app de campo"
        subtitle="Use o login do promotor para baixar o roteiro do dia, registrar evidencias e continuar operando mesmo sem internet."
        aside={<StatusPill label="Promotor" tone="success" />}
        helperText="Ambiente interno de operacao. Sem modulos promocionais ou navegação pública."
      />

      <Card>
        <SectionTitle
          title="Autenticacao do aparelho"
          description="Entre uma vez para liberar sessao local, roteiro e fila de sincronizacao neste dispositivo."
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <StatusPill label="Login local" tone="success" />
          <StatusPill
            label={activeApiBaseUrl ? 'API validada' : 'API aguardando teste'}
            tone={activeApiBaseUrl ? 'success' : 'warning'}
          />
        </View>
        <Field
          autoCapitalize="none"
          keyboardType="email-address"
          label="Email"
          onChangeText={setEmail}
          placeholder="promotor.centro@formula.local"
          value={email}
        />
        <Field
          label="Senha"
          onChangeText={setPassword}
          placeholder="Promotor@123"
          secureTextEntry
          value={password}
        />
        {error ? <Banner text={error.summary} tone="danger" /> : null}
        {error?.details.length ? (
          <View
            style={{
              gap: 6,
              padding: 12,
              borderRadius: 14,
              backgroundColor: palette.surfaceMuted,
              borderWidth: 1,
              borderColor: palette.border,
            }}
          >
            <Text style={{ color: palette.ink, fontWeight: '800' }}>Motivo do erro</Text>
            {error.details.map((detail) => (
              <Text key={detail} style={{ color: palette.muted, lineHeight: 20 }}>
                - {detail}
              </Text>
            ))}
          </View>
        ) : null}
        {connectionMessage ? (
          <Banner text={connectionMessage.text} tone={connectionMessage.tone} />
        ) : null}
        <PrimaryButton
          label={busy ? 'Validando acesso...' : 'Entrar no app'}
          onPress={() => onSubmit(email, password)}
          disabled={busy || diagnosing}
        />
        <SecondaryButton
          label={diagnosing ? 'Testando conexao...' : 'Validar conexao com a API'}
          onPress={onProbeConnection}
          disabled={busy || diagnosing}
        />
      </Card>

      <Card>
        <SectionTitle
          title="Diagnostico rapido"
          description="Use estas informacoes apenas para homologacao, suporte de rede e validacao do ambiente."
        />
        <View style={{ gap: 4 }}>
          <Text style={{ color: palette.muted }}>API configurada:</Text>
          <Text selectable style={{ color: palette.ink, fontWeight: '700' }}>
            {configuredApiBaseUrl}
          </Text>
          {activeApiBaseUrl ? (
            <>
              <Text style={{ color: palette.muted }}>Ultima API usada com sucesso:</Text>
              <Text selectable style={{ color: palette.ink, fontWeight: '700' }}>
                {activeApiBaseUrl}
              </Text>
            </>
          ) : null}
        </View>
        <View style={{ gap: 4 }}>
          <Text style={{ color: palette.muted }}>Credencial de homologacao:</Text>
          <Text style={{ color: palette.ink, fontWeight: '700' }}>
            promotor.centro@formula.local / Promotor@123
          </Text>
        </View>
      </Card>
    </Screen>
  );
};
