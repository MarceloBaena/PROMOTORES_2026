import { useState } from 'react';
import { Text, View } from 'react-native';
import {
  Banner,
  Card,
  ChipButton,
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
import type { LocalVisitDraft, PhotoCategory, RouteDayStop } from '../lib/types';
import { palette } from '../theme';

const categories: Array<{ value: PhotoCategory; label: string }> = [
  { value: 'GENERAL', label: 'Geral' },
  { value: 'SHELF', label: 'Gondola' },
  { value: 'DISPLAY', label: 'Ponto extra' },
  { value: 'PRICE_TAG', label: 'Preco' },
  { value: 'STOCK', label: 'Estoque' },
  { value: 'OTHER', label: 'Ocorrencia extra' },
];

interface PhotosScreenProps {
  stop: RouteDayStop;
  visit?: LocalVisitDraft;
  photoType: 'BEFORE' | 'AFTER';
  busy: boolean;
  error?: string | null;
  nextActionLabel?: string;
  nextActionDescription?: string;
  onBack: () => void;
  onCapture: (category: PhotoCategory) => void;
  onContinue?: () => void;
}

export const PhotosScreen = ({
  stop,
  visit,
  photoType,
  busy,
  error,
  nextActionLabel,
  nextActionDescription,
  onBack,
  onCapture,
  onContinue,
}: PhotosScreenProps) => {
  const [category, setCategory] = useState<PhotoCategory>('GENERAL');
  const photos = photoType === 'BEFORE' ? visit?.beforePhotos ?? [] : visit?.afterPhotos ?? [];
  const syncedCount = photos.filter((photo) => photo.syncStatus === 'SYNCED').length;
  const pendingCount = photos.filter((photo) => photo.syncStatus === 'PENDING').length;
  const errorCount = photos.filter((photo) => photo.syncStatus === 'ERROR').length;
  const guidanceText =
    nextActionDescription ??
    (photoType === 'BEFORE'
      ? 'Registre pelo menos uma foto inicial depois de iniciar o atendimento.'
      : 'Registre pelo menos uma foto final antes do check-out.');

  return (
    <Screen>
      <HeroCard
        eyebrow={photoType === 'BEFORE' ? 'Evidencia antes' : 'Evidencia depois'}
        title={photoType === 'BEFORE' ? 'Fotos de inicio' : 'Fotos de encerramento'}
        subtitle={`${stop.client.tradeName} | ${photos.length} registradas | ${pendingCount} pendentes`}
        aside={
          <StatusPill
            label={photoType === 'BEFORE' ? 'Antes da execucao' : 'Antes do check-out'}
            tone={photos.length > 0 ? 'success' : 'warning'}
          />
        }
        helperText="Cada foto fica gravada no aparelho com data, hora e status de sincronizacao."
      />

      <Card>
        <GhostButton label="Voltar para visita" onPress={onBack} />
        <SectionTitle
          title="Captura de evidencias"
          description="Escolha o tipo da imagem e abra a camera. Mantenha o enquadramento simples e objetivo."
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <MetricCard hint="salvas no aparelho" label="Fotos" value={photos.length} />
          <MetricCard hint="aguardando envio" label="Pendentes" value={pendingCount} />
          <MetricCard hint="confirmadas no backend" label="Sincronizadas" value={syncedCount} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {categories.map((item) => (
            <ChipButton
              key={item.value}
              label={item.label}
              onPress={() => setCategory(item.value)}
              selected={item.value === category}
            />
          ))}
        </View>
        <StatusPill
          label={`Categoria: ${categories.find((item) => item.value === category)?.label ?? category}`}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <StatusPill label={`Total ${photos.length}`} />
          {pendingCount > 0 ? <StatusPill label={`Pendentes ${pendingCount}`} tone="warning" /> : null}
          {syncedCount > 0 ? <StatusPill label={`Sync ${syncedCount}`} tone="success" /> : null}
          {errorCount > 0 ? <StatusPill label={`Erro ${errorCount}`} tone="danger" /> : null}
        </View>
        <Banner text={guidanceText} tone={photos.length > 0 ? 'success' : 'neutral'} />
        {error ? <Banner text={error} tone="danger" /> : null}
        <PrimaryButton
          label={busy ? 'Abrindo camera...' : 'Capturar foto'}
          onPress={() => onCapture(category)}
        />
        {photos.length > 0 && onContinue && nextActionLabel ? (
          <SecondaryButton label={nextActionLabel} onPress={onContinue} />
        ) : null}
      </Card>

      <Card>
        <SectionTitle
          title="Evidencias registradas"
          description="Revise rapidamente o que ja foi salvo nesta etapa da visita."
        />
        {photos.length === 0 ? (
          <Banner text="Nenhuma foto registrada ainda para esta etapa." tone="warning" />
        ) : (
          photos.map((photo) => (
            <View
              key={photo.id}
              style={{
                gap: 6,
                padding: 12,
                borderWidth: 1,
                borderColor: palette.border,
                borderRadius: 14,
                backgroundColor: palette.surfaceMuted,
              }}
            >
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <StatusPill label={photo.stage} />
                <StatusPill label={photo.category} />
                <StatusPill
                  label={
                    photo.syncStatus === 'SYNCED'
                      ? 'Sincronizada'
                      : photo.syncStatus === 'ERROR'
                        ? 'Erro no envio'
                        : 'Pendente'
                  }
                  tone={
                    photo.syncStatus === 'SYNCED'
                      ? 'success'
                      : photo.syncStatus === 'ERROR'
                        ? 'danger'
                        : 'warning'
                  }
                />
              </View>
              <Text style={{ color: palette.muted }}>{formatDateTime(photo.capturedAt)}</Text>
              <Text style={{ color: palette.muted }}>
                GPS:{' '}
                {photo.gpsStatus === 'CAPTURED'
                  ? `${photo.capturedLatitude?.toFixed(5) ?? '--'}, ${photo.capturedLongitude?.toFixed(5) ?? '--'}`
                  : photo.gpsErrorMessage ?? 'Nao disponivel'}
              </Text>
              {photo.syncError ? <Banner text={photo.syncError} tone="danger" /> : null}
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
};
