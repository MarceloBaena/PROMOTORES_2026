'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Download } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { EmptyState, ErrorState, LoadingState } from '@/components/page-states';
import { StatusBadge } from '@/components/status-badge';
import { PageContainer } from '@/components/ui/layout-primitives';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { StatsCard } from '@/components/ui/stats-card';
import { ApiError, getVisitDetail, resolveAssetUrl } from '@/lib/api';
import {
  formatAlertSeverityLabel,
  formatAlertTypeLabel,
  formatDate,
  formatDateTime,
  formatDistance,
} from '@/lib/format';
import type { VisitDetailResponse } from '@/lib/types';

type StepState = 'COMPLETED' | 'ACTIVE' | 'PENDING';

const formatDuration = (checkInAt?: string | null, checkOutAt?: string | null) => {
  if (!checkInAt) {
    return 'Nao iniciado';
  }

  if (!checkOutAt) {
    return 'Em andamento';
  }

  const start = new Date(checkInAt);
  const end = new Date(checkOutAt);
  const diffMs = Math.max(0, end.getTime() - start.getTime());
  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  return `${hours}h ${String(minutes).padStart(2, '0')}min`;
};

const getStepLabel = (state: StepState) => {
  switch (state) {
    case 'COMPLETED':
      return 'Concluida';
    case 'ACTIVE':
      return 'Em andamento';
    default:
      return 'Pendente';
  }
};

const getPhotoVariant = (
  photos: VisitDetailResponse['photos'],
  variant: 'CHECKIN' | 'BEFORE' | 'AFTER',
) => {
  if (variant === 'CHECKIN') {
    return photos.find((photo) => photo.category === 'CHECKIN_ESTABLISHMENT') ?? null;
  }

  if (variant === 'BEFORE') {
    return (
      photos.find(
        (photo) => photo.type === 'BEFORE' && photo.category !== 'CHECKIN_ESTABLISHMENT',
      ) ?? null
    );
  }

  return photos.find((photo) => photo.type === 'AFTER') ?? null;
};

const summarizeAuditPayload = (payload: unknown) => {
  if (!payload) {
    return 'Sem payload complementar';
  }

  if (typeof payload === 'string') {
    return payload;
  }

  if (typeof payload === 'object') {
    const keys = Object.keys(payload as Record<string, unknown>);
    return keys.length > 0 ? `Campos: ${keys.join(', ')}` : 'Objeto sem campos visiveis';
  }

  return String(payload);
};

function VisitStepCard(props: {
  title: string;
  description: string;
  state: StepState;
  timestamp?: string | null;
}) {
  const { title, description, state, timestamp } = props;

  return (
    <article className={`visit-step-card visit-step-card-${state.toLowerCase()}`}>
      <div className="list-card-header">
        <strong>{title}</strong>
        <span className={`visit-step-pill visit-step-pill-${state.toLowerCase()}`}>
          {getStepLabel(state)}
        </span>
      </div>
      <p className="hint">{description}</p>
      <p className="hint">
        {timestamp ? `Registrado em ${formatDateTime(timestamp)}` : 'Aguardando execucao'}
      </p>
    </article>
  );
}

function EvidencePhotoCard(props: {
  title: string;
  subtitle: string;
  photo: VisitDetailResponse['photos'][number] | null;
}) {
  const { title, subtitle, photo } = props;

  return (
    <article className="visit-photo-panel">
      <div className="visit-photo-panel-header">
        <div>
          <strong>{title}</strong>
          <p className="hint">{subtitle}</p>
        </div>
        {photo ? <span className="badge badge-completed">Capturada</span> : <span className="badge badge-alert">Pendente</span>}
      </div>

      {photo ? (
        <>
          <div className="visit-photo-frame">
            <Image
              alt={title}
              height={720}
              src={resolveAssetUrl(photo.url)}
              unoptimized
              width={960}
            />
          </div>
          <div className="visit-photo-meta">
            <span className="hint">Data e hora</span>
            <strong>{formatDateTime(photo.capturedAt)}</strong>
          </div>
        </>
      ) : (
        <div className="visit-photo-empty">
          <div className="stack">
            <strong>Sem foto registrada</strong>
            <p className="hint">Esta etapa ainda nao possui evidencia fotografica enviada.</p>
          </div>
        </div>
      )}
    </article>
  );
}

export default function VisitDetailPage() {
  const params = useParams<{ visitId: string }>();
  const [data, setData] = useState<VisitDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDetail = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setData(await getVisitDetail(params.visitId));
    } catch (loadError) {
      setError(loadError instanceof ApiError ? loadError.message : 'Falha ao carregar visita');
    } finally {
      setLoading(false);
    }
  }, [params.visitId]);

  useEffect(() => {
    if (params.visitId) {
      void loadDetail();
    }
  }, [loadDetail, params.visitId]);

  const checkInPhoto = useMemo(() => (data ? getPhotoVariant(data.photos, 'CHECKIN') : null), [data]);
  const beforePhoto = useMemo(() => (data ? getPhotoVariant(data.photos, 'BEFORE') : null), [data]);
  const afterPhoto = useMemo(() => (data ? getPhotoVariant(data.photos, 'AFTER') : null), [data]);

  const handleExport = useCallback(() => {
    if (!data) {
      return;
    }

    const payload = {
      visitId: data.id,
      routeDate: data.routeDate,
      client: {
        tradeName: data.client.tradeName,
        legalName: data.client.legalName,
        address: data.client.address,
        city: data.client.city,
        state: data.client.state,
      },
      promoter: data.promoter,
      supervisor: data.supervisor,
      status: data.completionStatus ?? data.status,
      checkInAt: data.checkInAt,
      checkOutAt: data.checkOutAt,
      duration: formatDuration(data.checkInAt, data.checkOutAt),
      outsideGeofence: data.outsideGeofence,
      geofenceDistanceM: data.geofenceDistanceM,
      outsideGeofenceJustification: data.outsideGeofenceJustification,
      notes: data.notes,
      photos: {
        checkIn: checkInPhoto,
        before: beforePhoto,
        after: afterPhoto,
      },
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const safeClientName = data.client.tradeName.toLowerCase().replace(/[^a-z0-9]+/gi, '-');

    anchor.href = objectUrl;
    anchor.download = `evidencias-visita-${safeClientName}-${data.id}.json`;
    anchor.click();
    window.URL.revokeObjectURL(objectUrl);
  }, [afterPhoto, beforePhoto, checkInPhoto, data]);

  if (loading) {
    return <LoadingState message="Carregando evidencias da visita..." />;
  }

  if (!data || error) {
    return (
      <ErrorState
        message={error ?? 'Visita nao encontrada'}
        onRetry={() => void loadDetail()}
      />
    );
  }

  const checkInState: StepState = checkInPhoto && data.checkInAt ? 'COMPLETED' : 'PENDING';
  const beforeState: StepState = beforePhoto ? 'COMPLETED' : data.checkInAt ? 'ACTIVE' : 'PENDING';
  const afterState: StepState = afterPhoto ? 'COMPLETED' : beforePhoto ? 'ACTIVE' : 'PENDING';
  const completionState: StepState = data.checkOutAt ? 'COMPLETED' : data.checkInAt ? 'ACTIVE' : 'PENDING';
  const nextVisitHref = data.nextVisit?.visitId
    ? `/dashboard/visits/${data.nextVisit.visitId}`
    : '/dashboard/visits';

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Evidencias da visita"
        title="Evidencias da visita"
        description="Acompanhamento corporativo da execucao com foco em evidencias, tempos e fechamento operacional."
        meta={
          <div className="visit-header-meta-grid">
            <div className="visit-header-meta-card">
              <span className="visit-header-meta-label">Cliente</span>
              <strong>{data.client.tradeName}</strong>
            </div>
            <div className="visit-header-meta-card">
              <span className="visit-header-meta-label">Promotor</span>
              <strong>{data.promoter.name}</strong>
            </div>
            <div className="visit-header-meta-card">
              <span className="visit-header-meta-label">Data</span>
              <strong>{formatDate(data.routeDate)}</strong>
            </div>
          </div>
        }
        actions={
          <div className="row-actions">
            <Link className="button button-secondary" href="/dashboard/visits">
              <ArrowLeft size={16} />
              Voltar
            </Link>
            {(data.photos.length > 0 || Boolean(data.notes)) && (
              <button className="button button-primary" type="button" onClick={handleExport}>
                <Download size={16} />
                Exportar
              </button>
            )}
          </div>
        }
      />

      <SectionCard title="Resumo da visita" description="Leitura executiva do atendimento registrado no ponto de venda.">
        <section className="stats-grid">
          <StatsCard
            label="Status"
            value={<StatusBadge value={data.completionStatus ?? data.status} />}
            hint={
              data.outsideGeofence
                ? `Fora da area - ${formatDistance(data.geofenceDistanceM)}`
                : 'Dentro da area permitida'
            }
          />
          <StatsCard label="Check-in" value={formatDateTime(data.checkInAt)} />
          <StatsCard label="Check-out" value={formatDateTime(data.checkOutAt)} />
          <StatsCard label="Duracao" value={formatDuration(data.checkInAt, data.checkOutAt)} />
          <StatsCard
            label="Supervisor"
            value={data.supervisor?.name ?? 'Nao vinculado'}
            hint={data.supervisor?.email ?? 'Sem e-mail vinculado'}
          />
        </section>
      </SectionCard>

      <SectionCard title="Etapas da visita" description="Status visivel de cada fase obrigatoria do fluxo do promotor.">
        <section className="visit-step-grid">
          <VisitStepCard
            title="Check-in com foto"
            description="A presenca no local so e validada com foto do estabelecimento no momento do check-in."
            state={checkInState}
            timestamp={checkInPhoto?.capturedAt ?? data.checkInAt}
          />
          <VisitStepCard
            title="Foto do antes"
            description="Evidencia obrigatoria da gondola antes da limpeza, organizacao e reposicao."
            state={beforeState}
            timestamp={beforePhoto?.capturedAt}
          />
          <VisitStepCard
            title="Foto do depois"
            description="Evidencia obrigatoria do resultado final apos a execucao do atendimento."
            state={afterState}
            timestamp={afterPhoto?.capturedAt}
          />
          <VisitStepCard
            title="Atendimento encerrado"
            description="Fechamento operacional com check-out e consolidacao do atendimento executado."
            state={completionState}
            timestamp={data.checkOutAt}
          />
        </section>
      </SectionCard>

      <SectionCard title="Evidencias fotograficas" description="Fotos em destaque com data e hora registradas para leitura rapida do supervisor.">
        <section className="visit-photo-feature-grid">
          <EvidencePhotoCard
            title="Foto do check-in"
            subtitle="Estabelecimento no momento de entrada"
            photo={checkInPhoto}
          />
          <EvidencePhotoCard
            title="Foto do antes"
            subtitle="Estado inicial da execucao"
            photo={beforePhoto}
          />
          <EvidencePhotoCard
            title="Foto do depois"
            subtitle="Resultado final do atendimento"
            photo={afterPhoto}
          />
        </section>
      </SectionCard>

      <SectionCard title="Observacoes da visita" description="Texto operacional registrado pelo promotor durante o atendimento.">
        <div className="visit-notes-panel">
          {data.notes ? (
            <p>{data.notes}</p>
          ) : (
            <EmptyState
              title="Sem observacoes adicionais"
              description="O promotor nao registrou anotacoes textuais nesta visita."
            />
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Flags de auditoria"
        description="Ocorrencias automaticas geradas pelo backend para esta visita, com severidade e tratativa."
      >
        {data.alerts.length === 0 ? (
          <EmptyState
            title="Sem flags vinculadas"
            description="Nenhuma regra automatica sinalizou inconsistencias nesta visita."
          />
        ) : (
          <div className="visit-audit-list">
            {data.alerts.map((alert) => (
              <article key={alert.id} className="visit-audit-item">
                <div className="visit-audit-item-header">
                  <span className="audit-entity-pill">{formatAlertTypeLabel(alert.type)}</span>
                  <span className="hint">{formatDateTime(alert.createdAt)}</span>
                </div>
                <strong>{alert.message}</strong>
                <p className="hint">{formatAlertSeverityLabel(alert.severity)}</p>
                <p className="hint">
                  {alert.resolvedAt
                    ? `Resolvido em ${formatDateTime(alert.resolvedAt)}`
                    : 'Flag aberta para tratativa manual'}
                </p>
                {alert.resolutionNote ? (
                  <p className="hint">Resolucao: {alert.resolutionNote}</p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Auditoria e historico"
        description="Linha do tempo de status e trilha administrativa vinculada a esta visita."
      >
        <div className="visit-audit-grid">
          <div className="visit-audit-column">
            <div className="section-heading section-heading-compact">
              <div className="section-heading-copy">
                <h3>Historico de status</h3>
                <p className="hint">Mudancas registradas no fluxo da visita.</p>
              </div>
            </div>
            {data.statusHistory.length === 0 ? (
              <EmptyState
                title="Sem alteracoes registradas"
                description="Nao ha transicoes de status adicionais para esta visita."
              />
            ) : (
              <div className="visit-audit-list">
                {data.statusHistory.map((item, index) => (
                  <article key={`${item.changedAt}-${index}`} className="visit-audit-item">
                    <div className="visit-audit-item-header">
                      <span className="badge badge-in-progress">
                        {item.nextCompletionStatus ?? item.nextStatus}
                      </span>
                      <span className="hint">{formatDateTime(item.changedAt)}</span>
                    </div>
                    <strong>
                      {item.previousStatus ?? 'Sem status anterior'} {'->'} {item.nextStatus}
                    </strong>
                    {item.note ? <p className="hint">{item.note}</p> : null}
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="visit-audit-column">
            <div className="section-heading section-heading-compact">
              <div className="section-heading-copy">
                <h3>Trilha de auditoria</h3>
                <p className="hint">Eventos administrativos e operacionais consolidados pelo backend.</p>
              </div>
            </div>
            {data.auditTrail.length === 0 ? (
              <EmptyState
                title="Sem eventos de auditoria"
                description="A trilha de auditoria nao retornou eventos para esta visita."
              />
            ) : (
              <div className="visit-audit-list">
                {data.auditTrail.map((item) => (
                  <article key={item.id} className="visit-audit-item">
                    <div className="visit-audit-item-header">
                      <span className="audit-entity-pill">{item.entityType}</span>
                      <span className="hint">{formatDateTime(item.createdAt)}</span>
                    </div>
                    <strong>{item.action}</strong>
                    <p className="hint">{summarizeAuditPayload(item.payload)}</p>
                    <details className="audit-payload-details">
                      <summary className="audit-payload-summary">Ver payload completo</summary>
                      <pre className="mono audit-payload">{JSON.stringify(item.payload, null, 2)}</pre>
                    </details>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Acoes finais">
        <div className="visit-final-actions">
          <div className="visit-final-actions-copy">
            <strong>Fechamento da leitura</strong>
            <p className="hint">
              {data.nextVisit
                ? `Proxima visita prevista: ${data.nextVisit.customerName} na sequencia ${data.nextVisit.sequence}.`
                : 'Nao ha proxima visita prevista no roteiro atual.'}
            </p>
          </div>

          <div className="row-actions">
            <Link className="button button-secondary" href="/dashboard/visits">
              <ArrowLeft size={16} />
              Voltar
            </Link>
            <Link className="button button-primary" href={nextVisitHref}>
              Ver proxima visita
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </SectionCard>
    </PageContainer>
  );
}
