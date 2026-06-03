'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState, ErrorState, LoadingState, PaginationControls } from '@/components/page-states';
import { FilterBar } from '@/components/ui/filter-bar';
import { FormField } from '@/components/ui/form-field';
import { NoticeCard } from '@/components/ui/notice-card';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { ApiError, getEvidences, getPromoters, resolveAssetUrl } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { getRequestErrorMessage, getSettledErrorMessage, getSettledValue } from '@/lib/request-state';
import type { EvidenceListResponse, PromotersListResponse } from '@/lib/types';

export default function EvidencesPage() {
  const [data, setData] = useState<EvidenceListResponse | null>(null);
  const [promoters, setPromoters] = useState<PromotersListResponse['items']>([]);
  const [page, setPage] = useState(1);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [promoterId, setPromoterId] = useState('');
  const [type, setType] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSupportMessage(null);

      const [evidenceResponseResult, promotersResponseResult] = await Promise.allSettled([
        getEvidences({
          date,
          page,
          pageSize: 12,
          promoterId: promoterId || undefined,
          type: type || undefined,
        }),
        getPromoters({ pageSize: 100 }),
      ]);

      const evidenceResponse = getSettledValue(evidenceResponseResult);

      if (!evidenceResponse) {
        throw evidenceResponseResult.status === 'rejected'
          ? evidenceResponseResult.reason
          : new ApiError('Falha ao carregar evidencias', 500);
      }

      setData(evidenceResponse);
      setPromoters(getSettledValue(promotersResponseResult)?.items ?? []);
      setSupportMessage(
        getSettledErrorMessage(
          promotersResponseResult,
          'Nao foi possivel carregar a lista de promotores para filtro.',
        ),
      );
    } catch (loadError) {
      setError(getRequestErrorMessage(loadError, 'Falha ao carregar evidencias'));
    } finally {
      setLoading(false);
    }
  }, [date, page, promoterId, type]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return <LoadingState message="Carregando evidencias..." />;
  }

  if (!data || error) {
    return (
      <ErrorState
        message={error ?? 'Falha ao carregar evidencias'}
        onRetry={() => void loadData()}
      />
    );
  }

  return (
    <div className="page-grid">
      <PageHeader
        eyebrow="Evidencias"
        title="Galeria organizada por visita com comparacao antes e depois"
        description="Filtre por data, promotor e tipo de foto para inspecionar a execucao no ponto de venda."
      />

      <SectionCard
        title="Consulta de evidencias"
        description="Leitura fotografica por visita para auditoria visual e acompanhamento em campo."
      >
        {supportMessage ? (
          <NoticeCard title="Carga parcial" description={supportMessage} />
        ) : null}

        <FilterBar>
          <FormField label="Data">
            <input
              className="input"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </FormField>

          <FormField label="Promotor">
            <select
              className="select"
              value={promoterId}
              onChange={(event) => {
                setPage(1);
                setPromoterId(event.target.value);
              }}
            >
              <option value="">Todos</option>
              {promoters.map((promoter) => (
                <option key={promoter.id} value={promoter.id}>
                  {promoter.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Tipo">
            <select
              className="select"
              value={type}
              onChange={(event) => {
                setPage(1);
                setType(event.target.value);
              }}
            >
              <option value="">Todos</option>
              <option value="BEFORE">Antes</option>
              <option value="AFTER">Depois</option>
            </select>
          </FormField>
        </FilterBar>

        <div className="stack">
          {data.items.length === 0 ? (
            <EmptyState
              title="Nenhuma evidencia encontrada"
              description="Ajuste os filtros para localizar as fotos da operacao."
            />
          ) : (
            data.items.map((item) => (
              <SectionCard
                key={item.visitId}
                tone="muted"
                title={item.clientName}
                description={`${item.promoterName} - check-in ${formatDateTime(item.checkInAt)}`}
                actions={
                  <span
                    className={item.evidenceComplete ? 'badge badge-completed' : 'badge badge-partial'}
                  >
                    {item.evidenceComplete ? 'Evidencia completa' : 'Pendencia'}
                  </span>
                }
              >
                <div className="gallery-compare">
                  <div className="gallery-column">
                    <h3>Antes</h3>
                    <div className="photo-grid">
                      {item.beforePhotos.length === 0 ? (
                        <EmptyState
                          title="Sem fotos de antes"
                          description="Nenhuma evidencia inicial foi enviada."
                        />
                      ) : (
                        item.beforePhotos.map((photo) => (
                          <article key={photo.id} className="photo-card list-card">
                            <Image
                              alt="Foto antes"
                              height={480}
                              src={resolveAssetUrl(photo.url)}
                              unoptimized
                              width={640}
                            />
                            <span className="hint">{photo.category ?? 'GENERAL'}</span>
                            <span className="hint">{formatDateTime(photo.capturedAt)}</span>
                          </article>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="gallery-column">
                    <h3>Depois</h3>
                    <div className="photo-grid">
                      {item.afterPhotos.length === 0 ? (
                        <EmptyState
                          title="Sem fotos de depois"
                          description="Nenhuma evidencia final foi enviada."
                        />
                      ) : (
                        item.afterPhotos.map((photo) => (
                          <article key={photo.id} className="photo-card list-card">
                            <Image
                              alt="Foto depois"
                              height={480}
                              src={resolveAssetUrl(photo.url)}
                              unoptimized
                              width={640}
                            />
                            <span className="hint">{photo.category ?? 'GENERAL'}</span>
                            <span className="hint">{formatDateTime(photo.capturedAt)}</span>
                          </article>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </SectionCard>
            ))
          )}
        </div>

        <PaginationControls
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          onPageChange={setPage}
        />
      </SectionCard>
    </div>
  );
}
