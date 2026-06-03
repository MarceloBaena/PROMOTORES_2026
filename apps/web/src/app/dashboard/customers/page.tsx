'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import { ActionBar } from '@/components/ui/action-bar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DataTable } from '@/components/ui/data-table';
import { FilterBar } from '@/components/ui/filter-bar';
import { FormField } from '@/components/ui/form-field';
import { PageContainer } from '@/components/ui/layout-primitives';
import { NoticeCard } from '@/components/ui/notice-card';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { StatsCard } from '@/components/ui/stats-card';
import { ErrorState, LoadingState, PaginationControls } from '@/components/page-states';
import {
  activateAllInactiveCustomers,
  ApiError,
  createCustomer,
  getCollaborators,
  getCustomer,
  getCustomerImportBatch,
  getCustomerImportBatchItems,
  getCustomerImportBatches,
  getCustomers,
  getPromoters,
  importCustomersCsv,
  importCustomersWinthor,
  syncCustomersFromWinthor,
  updateCustomer,
  updateCustomerStatus,
} from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { validateCustomerInput } from '@/lib/form-validation';
import { formatDateTime } from '@/lib/format';
import {
  getRequestErrorMessage,
  getSettledErrorMessage,
  getSettledValue,
} from '@/lib/request-state';
import type {
  CollaboratorsListResponse,
  CustomerDetailResponse,
  CustomerImportBatchStatus,
  CustomerImportBatchDetail,
  CustomerImportBatchItemsResponse,
  CustomerImportBatchesResponse,
  CustomerImportItemStatus,
  CustomerImportSourceType,
  CustomerInput,
  CustomerStatus,
  CustomersListResponse,
  PromotersListResponse,
} from '@/lib/types';

type WorkspaceMode = 'form' | 'import' | 'history';

interface CustomerDraft {
  code: string;
  winthorCustomerCode: string;
  legalName: string;
  tradeName: string;
  cnpj: string;
  stateRegistration: string;
  contactName: string;
  phone: string;
  email: string;
  zipCode: string;
  address: string;
  addressNumber: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  latitude: string;
  longitude: string;
  geofenceRadiusM: string;
  routeName: string;
  region: string;
  supervisorUserId: string;
  defaultPromoterUserId: string;
  visitFrequency: string;
  preferredVisitDays: string[];
  preferredVisitTimeStart: string;
  preferredVisitTimeEnd: string;
  notes: string;
  status: CustomerStatus;
}

interface ImportDraft {
  sourceType: CustomerImportSourceType;
  delimiter: string;
  changedSince: string;
  allowCreate: boolean;
  allowUpdate: boolean;
  ignoreDuplicates: boolean;
  fallbackSupervisorUserId: string;
  fallbackDefaultPromoterUserId: string;
}

const dayOptions = [
  { value: 'MONDAY', label: 'Seg' },
  { value: 'TUESDAY', label: 'Ter' },
  { value: 'WEDNESDAY', label: 'Qua' },
  { value: 'THURSDAY', label: 'Qui' },
  { value: 'FRIDAY', label: 'Sex' },
  { value: 'SATURDAY', label: 'Sab' },
  { value: 'SUNDAY', label: 'Dom' },
] as const;

const createEmptyDraft = (supervisorUserId = ''): CustomerDraft => ({
  code: '',
  winthorCustomerCode: '',
  legalName: '',
  tradeName: '',
  cnpj: '',
  stateRegistration: '',
  contactName: '',
  phone: '',
  email: '',
  zipCode: '',
  address: '',
  addressNumber: '',
  complement: '',
  district: '',
  city: '',
  state: 'MT',
  latitude: '',
  longitude: '',
  geofenceRadiusM: '150',
  routeName: '',
  region: '',
  supervisorUserId,
  defaultPromoterUserId: '',
  visitFrequency: '',
  preferredVisitDays: [],
  preferredVisitTimeStart: '',
  preferredVisitTimeEnd: '',
  notes: '',
  status: 'INACTIVE',
});

const createImportDraft = (fallbackSupervisorUserId = ''): ImportDraft => ({
  sourceType: 'CSV',
  delimiter: '',
  changedSince: '',
  allowCreate: true,
  allowUpdate: true,
  ignoreDuplicates: true,
  fallbackSupervisorUserId,
  fallbackDefaultPromoterUserId: '',
});

const mapCustomerToDraft = (customer: CustomerDetailResponse): CustomerDraft => ({
  code: customer.code,
  winthorCustomerCode: customer.winthorCustomerCode ?? '',
  legalName: customer.legalName,
  tradeName: customer.tradeName,
  cnpj: customer.cnpj ?? '',
  stateRegistration: customer.stateRegistration ?? '',
  contactName: customer.contactName ?? '',
  phone: customer.phone ?? '',
  email: customer.email ?? '',
  zipCode: customer.zipCode ?? '',
  address: customer.address,
  addressNumber: customer.addressNumber ?? '',
  complement: customer.complement ?? '',
  district: customer.district ?? '',
  city: customer.city,
  state: customer.state,
  latitude: customer.latitude ? String(customer.latitude) : '',
  longitude: customer.longitude ? String(customer.longitude) : '',
  geofenceRadiusM: String(customer.geofenceRadiusM),
  routeName: customer.routeName ?? '',
  region: customer.region ?? '',
  supervisorUserId: customer.supervisorUserId ?? '',
  defaultPromoterUserId: customer.defaultPromoterUserId ?? '',
  visitFrequency: customer.visitFrequency ?? '',
  preferredVisitDays: customer.preferredVisitDays ?? [],
  preferredVisitTimeStart: customer.preferredVisitTimeStart ?? '',
  preferredVisitTimeEnd: customer.preferredVisitTimeEnd ?? '',
  notes: customer.notes ?? '',
  status: customer.status,
});

const toCustomerInput = (draft: CustomerDraft): CustomerInput => ({
  code: draft.code.trim(),
  winthorCustomerCode: draft.winthorCustomerCode.trim() || undefined,
  legalName: draft.legalName.trim(),
  tradeName: draft.tradeName.trim(),
  cnpj: draft.cnpj.replace(/\D/g, ''),
  stateRegistration: draft.stateRegistration.trim() || undefined,
  contactName: draft.contactName.trim(),
  phone: draft.phone.trim(),
  email: draft.email.trim() || undefined,
  zipCode: draft.zipCode.replace(/\D/g, '') || undefined,
  address: draft.address.trim(),
  addressNumber: draft.addressNumber.trim() || undefined,
  complement: draft.complement.trim() || undefined,
  district: draft.district.trim(),
  city: draft.city.trim(),
  state: draft.state.trim().toUpperCase(),
  latitude: draft.latitude.trim() ? Number(draft.latitude) : undefined,
  longitude: draft.longitude.trim() ? Number(draft.longitude) : undefined,
  geofenceRadiusM: Number(draft.geofenceRadiusM || 0),
  routeName: draft.routeName.trim(),
  region: draft.region.trim(),
  supervisorUserId: draft.supervisorUserId,
  defaultPromoterUserId: draft.defaultPromoterUserId || undefined,
  visitFrequency: draft.visitFrequency.trim() || undefined,
  preferredVisitDays: draft.preferredVisitDays,
  preferredVisitTimeStart: draft.preferredVisitTimeStart || undefined,
  preferredVisitTimeEnd: draft.preferredVisitTimeEnd || undefined,
  notes: draft.notes.trim(),
  status: draft.status,
  schedules: [],
});

const customerStatusBadge = (status: CustomerStatus) =>
  status === 'ACTIVE' ? 'badge badge-completed' : 'badge badge-partial';

const importItemBadge = (status: CustomerImportItemStatus) => {
  switch (status) {
    case 'STAGED':
      return 'badge badge-in-progress';
    case 'CREATE':
      return 'badge badge-completed';
    case 'UPDATE':
      return 'badge badge-in-progress';
    case 'IGNORE':
      return 'badge badge-partial';
    default:
      return 'badge badge-alert';
  }
};

const importBatchBadge = (status: CustomerImportBatchStatus) => {
  switch (status) {
    case 'QUEUED':
    case 'PROCESSING':
    case 'RETRY_SCHEDULED':
      return 'badge badge-in-progress';
    case 'COMPLETED':
      return 'badge badge-completed';
    case 'COMPLETED_WITH_ERRORS':
      return 'badge badge-partial';
    case 'FAILED':
      return 'badge badge-alert';
    default:
      return 'badge badge-partial';
  }
};

const isBatchInFlight = (status: CustomerImportBatchStatus) =>
  status === 'QUEUED' || status === 'PROCESSING' || status === 'RETRY_SCHEDULED';

const importBatchStatusLabel = (status: CustomerImportBatchStatus) => {
  switch (status) {
    case 'QUEUED':
      return 'Na fila';
    case 'PROCESSING':
      return 'Processando';
    case 'RETRY_SCHEDULED':
      return 'Reagendado';
    case 'PREVIEWED':
      return 'Preview pronto';
    case 'COMPLETED':
      return 'Concluido';
    case 'COMPLETED_WITH_ERRORS':
      return 'Concluido com erros';
    case 'FAILED':
      return 'Falhou';
    default:
      return status;
  }
};

const sourceLabel = (value?: string | null) => {
  switch (value) {
    case 'CSV':
      return 'CSV / Excel';
    case 'WINTHOR':
      return 'Winthor';
    case 'MANUAL':
      return 'Manual';
    default:
      return value ?? 'Nao informado';
  }
};

const describeDelimiter = (value?: string | null) => {
  if (value === ';') {
    return 'Ponto e virgula (;)';
  }

  if (value === ',') {
    return 'Virgula (,)';
  }

  if (value === '\t') {
    return 'TAB';
  }

  return 'Deteccao automatica';
};

const getImportItemDisplayName = (item: {
  tradeName?: string | null;
  legalName?: string | null;
  customerName?: string | null;
  customerCode?: string | null;
  cnpj?: string | null;
  rawPayload?: unknown;
}) => {
  const rawPayload =
    item.rawPayload && typeof item.rawPayload === 'object' && !Array.isArray(item.rawPayload)
      ? (item.rawPayload as Record<string, unknown>)
      : null;
  const rawLabelCandidates = [
    rawPayload?.trade_name,
    rawPayload?.legal_name,
    rawPayload?.cliente,
    rawPayload?.customer_code,
    rawPayload?.winthor_customer_code,
    rawPayload?.pedido_rca,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  return (
    item.tradeName ??
    item.legalName ??
    item.customerName ??
    item.customerCode ??
    item.cnpj ??
    rawLabelCandidates[0] ??
    'Registro sem identificacao'
  );
};

const getImportItemIssues = (item: { issues?: string[]; message?: string | null }) => {
  const normalizedIssues = (item.issues ?? []).map((issue) => issue.trim()).filter(Boolean);

  if (normalizedIssues.length > 0) {
    return normalizedIssues;
  }

  return item.message ? [item.message] : [];
};

export default function CustomersPage() {
  const user = useAuthStore((state) => state.user);
  const [workspace, setWorkspace] = useState<WorkspaceMode>('form');
  const [customersData, setCustomersData] = useState<CustomersListResponse | null>(null);
  const [historyData, setHistoryData] = useState<CustomerImportBatchesResponse | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<CustomerImportBatchDetail | null>(null);
  const [selectedBatchItems, setSelectedBatchItems] =
    useState<CustomerImportBatchItemsResponse | null>(null);
  const [promoters, setPromoters] = useState<PromotersListResponse['items']>([]);
  const [supervisors, setSupervisors] = useState<
    Array<{ id: string; name: string; region?: string | null }>
  >([]);
  const [draft, setDraft] = useState<CustomerDraft>(
    createEmptyDraft(user?.role === 'SUPERVISOR' ? user.id : ''),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importDraft, setImportDraft] = useState<ImportDraft>(
    createImportDraft(user?.role === 'SUPERVISOR' ? user.id : ''),
  );
  const [importFile, setImportFile] = useState<File | null>(null);
  const [previewBatch, setPreviewBatch] = useState<CustomerImportBatchDetail | null>(null);
  const [statusTarget, setStatusTarget] = useState<CustomersListResponse['items'][number] | null>(
    null,
  );
  const [confirmApplyImport, setConfirmApplyImport] = useState(false);
  const [confirmSyncWinthor, setConfirmSyncWinthor] = useState(false);
  const [confirmActivateAllInactive, setConfirmActivateAllInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [search, setSearch] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [routeFilter, setRouteFilter] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [supervisorFilter, setSupervisorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [itemsStatusFilter, setItemsStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [activatingAllInactive, setActivatingAllInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: 'neutral' | 'success' | 'warning' | 'danger';
    title: string;
    description?: string;
  } | null>(null);
  const deferredSearch = useDeferredValue(search);
  const previewErrorItems = useMemo(
    () => previewBatch?.previewItems.filter((item) => item.status === 'ERROR') ?? [],
    [previewBatch],
  );
  const previewDecisionItems = useMemo(
    () =>
      previewBatch?.previewItems.filter(
        (item) => item.status === 'CREATE' || item.status === 'UPDATE' || item.status === 'IGNORE',
      ) ?? [],
    [previewBatch],
  );

  const supervisorOptions = useMemo(() => {
    if (user?.role === 'SUPERVISOR' && user) {
      return [{ id: user.id, name: user.name }];
    }

    return supervisors;
  }, [supervisors, user]);

  const loadCustomers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [customersResult, promotersResult, supervisorsResult] = await Promise.allSettled([
        getCustomers({
          page,
          pageSize: 20,
          search: deferredSearch || undefined,
          city: cityFilter || undefined,
          routeName: routeFilter || undefined,
          region: regionFilter || undefined,
          supervisorUserId: supervisorFilter || undefined,
          status: statusFilter || undefined,
        }),
        getPromoters({ pageSize: 100 }),
        user?.role === 'ADMIN'
          ? getCollaborators({ role: 'SUPERVISOR', status: 'ACTIVE', pageSize: 100 })
          : Promise.resolve<CollaboratorsListResponse | null>(null),
      ]);

      const customersResponse = getSettledValue(customersResult);

      if (!customersResponse) {
        throw customersResult.status === 'rejected'
          ? customersResult.reason
          : new ApiError('Falha ao carregar clientes', 500);
      }

      setCustomersData(customersResponse);
      setPromoters(getSettledValue(promotersResult)?.items ?? []);
      setSupervisors(
        (getSettledValue(supervisorsResult)?.items ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          region: item.region,
        })),
      );

      const supportErrors = [
        getSettledErrorMessage(promotersResult, 'Nao foi possivel carregar os promotores.'),
        getSettledErrorMessage(supervisorsResult, 'Nao foi possivel carregar os supervisores.'),
      ].filter(Boolean);

      setSupportMessage(supportErrors.length > 0 ? supportErrors.join(' ') : null);
    } catch (loadError) {
      setError(getRequestErrorMessage(loadError, 'Falha ao carregar clientes'));
    } finally {
      setLoading(false);
    }
  }, [
    cityFilter,
    deferredSearch,
    page,
    regionFilter,
    routeFilter,
    statusFilter,
    supervisorFilter,
    user,
  ]);

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const response = await getCustomerImportBatches({
        page: historyPage,
        pageSize: 10,
      });
      setHistoryData(response);
    } catch (loadError) {
      setFeedback({
        tone: 'danger',
        title: 'Falha ao carregar historico de importacoes',
        description: getRequestErrorMessage(loadError, 'Nao foi possivel carregar os lotes.'),
      });
    } finally {
      setHistoryLoading(false);
    }
  }, [historyPage]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    if (workspace === 'history') {
      void loadHistory();
    }
  }, [loadHistory, workspace]);

  useEffect(() => {
    if (selectedBatch) {
      void getCustomerImportBatchItems(selectedBatch.id, {
        page: 1,
        pageSize: 50,
        status: itemsStatusFilter || undefined,
      }).then(setSelectedBatchItems);
    }
  }, [itemsStatusFilter, selectedBatch]);

  useEffect(() => {
    if (!previewBatch || !isBatchInFlight(previewBatch.status)) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void getCustomerImportBatch(previewBatch.id)
        .then((batch) => {
          setPreviewBatch(batch);

          if (!isBatchInFlight(batch.status)) {
            void Promise.all([loadCustomers(), loadHistory()]);
          }
        })
        .catch(() => undefined);
    }, 3_000);

    return () => window.clearInterval(timer);
  }, [loadCustomers, loadHistory, previewBatch]);

  useEffect(() => {
    if (!selectedBatch || !isBatchInFlight(selectedBatch.status)) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void Promise.all([
        getCustomerImportBatch(selectedBatch.id),
        getCustomerImportBatchItems(selectedBatch.id, {
          page: 1,
          pageSize: 50,
          status: itemsStatusFilter || undefined,
        }),
      ])
        .then(([batch, items]) => {
          setSelectedBatch(batch);
          setSelectedBatchItems(items);

          if (!isBatchInFlight(batch.status)) {
            void Promise.all([loadCustomers(), loadHistory()]);
          }
        })
        .catch(() => undefined);
    }, 3_000);

    return () => window.clearInterval(timer);
  }, [itemsStatusFilter, loadCustomers, loadHistory, selectedBatch]);

  useEffect(() => {
    if (user?.role === 'SUPERVISOR') {
      setDraft((current) => ({ ...current, supervisorUserId: user.id }));
      setImportDraft((current) => ({ ...current, fallbackSupervisorUserId: user.id }));
    }
  }, [user]);

  const resetForm = () => {
    setEditingId(null);
    setDraft(createEmptyDraft(user?.role === 'SUPERVISOR' ? user.id : ''));
    setFormError(null);
    setWorkspace('form');
  };

  const handleEdit = async (customerId: string) => {
    try {
      const customer = await getCustomer(customerId);
      setEditingId(customerId);
      setDraft(mapCustomerToDraft(customer));
      setWorkspace('form');
      setFormError(null);
    } catch (loadError) {
      setFormError(getRequestErrorMessage(loadError, 'Falha ao carregar cliente'));
    }
  };

  const handleSubmit = async () => {
    const payload = toCustomerInput(draft);
    const validationErrors = validateCustomerInput(payload);

    if (validationErrors.length > 0) {
      setFormError(validationErrors[0]);
      return;
    }

    try {
      setSaving(true);
      setFormError(null);

      if (editingId) {
        await updateCustomer(editingId, payload);
      } else {
        await createCustomer(payload);
      }

      setFeedback({
        tone: 'success',
        title: editingId ? 'Cliente atualizado' : 'Cliente cadastrado',
        description: 'A base local de clientes foi atualizada com sucesso.',
      });

      resetForm();
      await loadCustomers();
    } catch (saveError) {
      setFormError(getRequestErrorMessage(saveError, 'Falha ao salvar cliente'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!statusTarget) {
      return;
    }

    const nextStatus: CustomerStatus = statusTarget.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    try {
      await updateCustomerStatus(statusTarget.id, nextStatus);
      setFeedback({
        tone: 'success',
        title: nextStatus === 'ACTIVE' ? 'Cliente ativado' : 'Cliente inativado',
        description: 'O status operacional do cliente foi atualizado.',
      });
      setStatusTarget(null);
      await loadCustomers();
    } catch (statusError) {
      setFeedback({
        tone: 'danger',
        title: 'Falha ao atualizar status',
        description: getRequestErrorMessage(statusError, 'Nao foi possivel alterar o status.'),
      });
    }
  };

  const handleActivateAllInactive = async () => {
    try {
      setActivatingAllInactive(true);
      setFeedback(null);

      const result = await activateAllInactiveCustomers();

      setConfirmActivateAllInactive(false);
      const shouldReloadDirectly = statusFilter === '' && page === 1;
      setPage(1);
      setStatusFilter('');

      if (shouldReloadDirectly) {
        await loadCustomers();
      }

      if (result.foundCount === 0) {
        setFeedback({
          tone: 'neutral',
          title: 'Nenhum cliente inativo encontrado',
          description: 'Todos os clientes ja estavam ativos no contexto atual.',
        });
        return;
      }

      setFeedback({
        tone: result.missingCoordinatesCount > 0 ? 'warning' : 'success',
        title: 'Clientes reativados',
        description:
          result.missingCoordinatesCount > 0
            ? `${result.reactivatedCount} cliente(s) foram reativados com sucesso. ${result.missingCoordinatesCount} seguem sem geolocalizacao cadastrada.`
            : `${result.reactivatedCount} cliente(s) foram reativados com sucesso.`,
      });
    } catch (activationError) {
      setFeedback({
        tone: 'danger',
        title: 'Falha ao reativar clientes inativos',
        description: getRequestErrorMessage(
          activationError,
          'Nao foi possivel reativar os clientes inativos.',
        ),
      });
    } finally {
      setActivatingAllInactive(false);
    }
  };

  const runImport = async (apply: boolean) => {
    try {
      setImporting(true);
      setFeedback(null);

      const body = {
        apply,
        allowCreate: importDraft.allowCreate,
        allowUpdate: importDraft.allowUpdate,
        ignoreDuplicates: importDraft.ignoreDuplicates,
        fallbackSupervisorUserId: importDraft.fallbackSupervisorUserId || undefined,
        fallbackDefaultPromoterUserId: importDraft.fallbackDefaultPromoterUserId || undefined,
        changedSince: importDraft.changedSince || undefined,
      };

      const batch =
        importDraft.sourceType === 'CSV'
          ? await importCustomersCsv({
              ...body,
              delimiter: importDraft.delimiter || undefined,
              file: (() => {
                if (!importFile) {
                  throw new ApiError('Selecione um arquivo CSV para importar.', 400);
                }
                return importFile;
              })(),
            })
          : await importCustomersWinthor(body);

      setPreviewBatch(batch);
      setWorkspace('import');
      await Promise.all([loadCustomers(), loadHistory()]);
      setFeedback({
        tone:
          batch.status === 'FAILED'
            ? 'warning'
            : isBatchInFlight(batch.status)
              ? 'neutral'
              : apply
                ? 'success'
                : 'neutral',
        title: isBatchInFlight(batch.status)
          ? 'Lote enfileirado'
          : apply
            ? 'Importacao executada'
            : 'Preview gerado',
        description:
          batch.logSummary ?? 'O lote foi processado e registrado no historico de importacoes.',
      });
    } catch (importError) {
      setFeedback({
        tone: 'danger',
        title: 'Falha na importacao',
        description: getRequestErrorMessage(importError, 'Nao foi possivel importar os clientes.'),
      });
    } finally {
      setImporting(false);
      setConfirmApplyImport(false);
    }
  };

  const handleSyncWinthor = async () => {
    try {
      setImporting(true);
      const batch = await syncCustomersFromWinthor({
        allowCreate: importDraft.allowCreate,
        allowUpdate: importDraft.allowUpdate,
        ignoreDuplicates: importDraft.ignoreDuplicates,
        changedSince: importDraft.changedSince || undefined,
        fallbackSupervisorUserId: importDraft.fallbackSupervisorUserId || undefined,
        fallbackDefaultPromoterUserId: importDraft.fallbackDefaultPromoterUserId || undefined,
      });

      setPreviewBatch(batch);
      setWorkspace('import');
      await Promise.all([loadCustomers(), loadHistory()]);
      setFeedback({
        tone:
          batch.status === 'FAILED'
            ? 'warning'
            : isBatchInFlight(batch.status)
              ? 'neutral'
              : 'success',
        title: isBatchInFlight(batch.status)
          ? 'Sincronizacao enfileirada'
          : 'Sincronizacao Winthor registrada',
        description: batch.logSummary ?? 'O lote foi gravado no historico.',
      });
    } catch (syncError) {
      setFeedback({
        tone: 'danger',
        title: 'Falha ao sincronizar com o Winthor',
        description: getRequestErrorMessage(syncError, 'Nao foi possivel sincronizar.'),
      });
    } finally {
      setImporting(false);
      setConfirmSyncWinthor(false);
    }
  };

  const openBatch = async (batchId: string) => {
    try {
      const [batch, items] = await Promise.all([
        getCustomerImportBatch(batchId),
        getCustomerImportBatchItems(batchId, {
          page: 1,
          pageSize: 50,
          status: itemsStatusFilter || undefined,
        }),
      ]);
      setSelectedBatch(batch);
      setSelectedBatchItems(items);
      setWorkspace('history');
    } catch (batchError) {
      setFeedback({
        tone: 'danger',
        title: 'Falha ao carregar lote',
        description: getRequestErrorMessage(batchError, 'Nao foi possivel abrir o lote.'),
      });
    }
  };

  if (loading && !customersData) {
    return <LoadingState message="Carregando modulo de clientes..." />;
  }

  if (!customersData || error) {
    return (
      <ErrorState
        message={error ?? 'Falha ao carregar clientes'}
        onRetry={() => void loadCustomers()}
      />
    );
  }

  const activeCustomersOnPage = customersData.items.filter(
    (item) => item.status === 'ACTIVE',
  ).length;
  const inactiveCustomersOnPage = customersData.items.length - activeCustomersOnPage;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Clientes"
        title="Base de clientes, importacao e governanca operacional"
        description="Mantenha a base local consistente, sem escrever no ERP e com historico completo de cada lote importado."
        meta={
          <div className="page-header-inline-metrics">
            <span className="info-chip info-chip-strong">
              {customersData.total} clientes filtrados
            </span>
            <span className="info-chip">{activeCustomersOnPage} ativos nesta pagina</span>
            <span className="info-chip">
              {workspace === 'form'
                ? 'Workspace: cadastro'
                : workspace === 'import'
                  ? 'Workspace: importacao'
                  : 'Workspace: historico'}
            </span>
          </div>
        }
      />

      <section className="stats-grid">
        <StatsCard
          label="Clientes ativos"
          value={activeCustomersOnPage}
          tone="success"
          hint="Registros ativos no recorte exibido."
        />
        <StatsCard
          label="Clientes inativos"
          value={inactiveCustomersOnPage}
          tone={inactiveCustomersOnPage > 0 ? 'warning' : 'default'}
          hint="Clientes que podem ser reativados ou revisados."
        />
        <StatsCard
          label="Promotores vinculados"
          value={promoters.length}
          hint="Equipe elegivel para atribuicao na base."
        />
        <StatsCard
          label="Supervisores"
          value={supervisorOptions.length}
          hint="Responsaveis disponiveis para governanca da carteira."
        />
      </section>

      <section className="workspace-toggle" aria-label="Troca de area de trabalho">
        <button
          className={
            workspace === 'form'
              ? 'workspace-toggle-button workspace-toggle-button-active'
              : 'workspace-toggle-button'
          }
          type="button"
          onClick={() => setWorkspace('form')}
        >
          Cadastro
        </button>
        <button
          className={
            workspace === 'import'
              ? 'workspace-toggle-button workspace-toggle-button-active'
              : 'workspace-toggle-button'
          }
          type="button"
          onClick={() => setWorkspace('import')}
        >
          Importacao
        </button>
        <button
          className={
            workspace === 'history'
              ? 'workspace-toggle-button workspace-toggle-button-active'
              : 'workspace-toggle-button'
          }
          type="button"
          onClick={() => setWorkspace('history')}
        >
          Historico
        </button>
      </section>

      {feedback ? (
        <NoticeCard
          tone={feedback.tone}
          title={feedback.title}
          description={feedback.description}
        />
      ) : null}

      {supportMessage ? (
        <NoticeCard tone="warning" title="Atencao" description={supportMessage} />
      ) : null}

      <SectionCard
        title="Base de clientes"
        description="Busca por nome, codigo, CNPJ, cidade, rota, regiao, supervisor e status."
        actions={
          <ActionBar>
            <button className="button button-secondary" type="button" onClick={resetForm}>
              <Plus size={16} />
              Novo cliente
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={activatingAllInactive}
              onClick={() => setConfirmActivateAllInactive(true)}
            >
              <RefreshCw size={16} />
              {activatingAllInactive ? 'Reativando...' : 'Ativar todos os inativos'}
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setConfirmSyncWinthor(true)}
            >
              <RefreshCw size={16} />
              Sincronizar Winthor
            </button>
          </ActionBar>
        }
      >
        <FilterBar
          title="Filtros da carteira"
          description="Refine a base por nome, territorio, supervisor e status para operar sem ruido."
          summary={
            <div className="filter-pill-row">
              <span className="info-chip">{customersData.items.length} registros na pagina</span>
              {search ? <span className="info-chip">Busca ativa</span> : null}
              {statusFilter ? <span className="info-chip">Status {statusFilter}</span> : null}
            </div>
          }
          actions={
            <>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setPage(1);
                  setSearch('');
                  setCityFilter('');
                  setRouteFilter('');
                  setRegionFilter('');
                  setSupervisorFilter('');
                  setStatusFilter('');
                }}
              >
                Limpar filtros
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => void loadCustomers()}
              >
                Recarregar base
              </button>
            </>
          }
        >
          <FormField label="Busca">
            <div className="field-icon-wrap">
              <Search size={16} className="field-icon" />
              <input
                className="input input-with-icon"
                value={search}
                onChange={(event) => {
                  setPage(1);
                  setSearch(event.target.value);
                }}
                placeholder="Nome, codigo ou CNPJ"
              />
            </div>
          </FormField>
          <FormField label="Cidade">
            <input
              className="input"
              value={cityFilter}
              onChange={(event) => setCityFilter(event.target.value)}
            />
          </FormField>
          <FormField label="Rota">
            <input
              className="input"
              value={routeFilter}
              onChange={(event) => setRouteFilter(event.target.value)}
            />
          </FormField>
          <FormField label="Regiao">
            <input
              className="input"
              value={regionFilter}
              onChange={(event) => setRegionFilter(event.target.value)}
            />
          </FormField>
          <FormField label="Supervisor">
            <select
              className="select"
              value={supervisorFilter}
              onChange={(event) => setSupervisorFilter(event.target.value)}
            >
              <option value="">Todos</option>
              {supervisorOptions.map((supervisor) => (
                <option key={supervisor.id} value={supervisor.id}>
                  {supervisor.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Status">
            <select
              className="select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">Todos</option>
              <option value="ACTIVE">Ativo</option>
              <option value="INACTIVE">Inativo</option>
            </select>
          </FormField>
        </FilterBar>

        <DataTable
          summary={
            <div className="table-summary-block">
              <strong>Carteira operacional carregada</strong>
              <span className="hint">
                {customersData.total} clientes no total filtrado, com governanca local e integracao
                real com a API.
              </span>
            </div>
          }
          columns={[
            {
              key: 'codes',
              header: 'Codigo',
              render: (customer) => (
                <div className="stack">
                  <strong>{customer.code}</strong>
                  <span className="hint">
                    Winthor: {customer.winthorCustomerCode ?? 'Nao informado'}
                  </span>
                </div>
              ),
            },
            {
              key: 'names',
              header: 'Cliente',
              render: (customer) => (
                <div className="stack">
                  <strong>{customer.tradeName}</strong>
                  <span className="hint">{customer.legalName}</span>
                  <span className="hint">CNPJ: {customer.cnpj ?? 'Nao informado'}</span>
                </div>
              ),
            },
            {
              key: 'route',
              header: 'Rota / Regiao',
              render: (customer) => (
                <div className="stack">
                  <span>{customer.routeName ?? 'Nao informada'}</span>
                  <span className="hint">{customer.region ?? 'Sem regiao'}</span>
                </div>
              ),
            },
            {
              key: 'supervisor',
              header: 'Supervisor',
              render: (customer) => customer.supervisorName ?? 'Nao vinculado',
            },
            {
              key: 'status',
              header: 'Status',
              render: (customer) => (
                <div className="stack">
                  <span className={customerStatusBadge(customer.status)}>
                    {customer.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                  </span>
                  <span className="hint">{sourceLabel(customer.sourceType)}</span>
                  <span className="hint">{formatDateTime(customer.lastSyncedAt)}</span>
                </div>
              ),
            },
            {
              key: 'actions',
              header: '',
              render: (customer) => (
                <div className="row-actions">
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => void handleEdit(customer.id)}
                  >
                    Editar
                  </button>
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => setStatusTarget(customer)}
                  >
                    {customer.status === 'ACTIVE' ? 'Inativar' : 'Ativar'}
                  </button>
                </div>
              ),
            },
          ]}
          emptyTitle="Nenhum cliente encontrado"
          emptyDescription="Ajuste os filtros ou cadastre um novo cliente."
          getRowKey={(customer) => customer.id}
          items={customersData.items}
          mobileTitle={(customer) => customer.tradeName}
          mobileSubtitle={(customer) => `${customer.code} - ${customer.legalName}`}
          mobileMeta={(customer) => (
            <span className={customerStatusBadge(customer.status)}>
              {customer.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
            </span>
          )}
          mobileBody={(customer) => (
            <div className="stack">
              <p className="hint">CNPJ: {customer.cnpj ?? 'Nao informado'}</p>
              <p className="hint">
                {customer.routeName ?? 'Sem rota'} - {customer.region ?? 'Sem regiao'}
              </p>
              <p className="hint">Supervisor: {customer.supervisorName ?? 'Nao vinculado'}</p>
              <p className="hint">Origem: {sourceLabel(customer.sourceType)}</p>
            </div>
          )}
          mobileActions={(customer) => (
            <>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => void handleEdit(customer.id)}
              >
                Editar
              </button>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setStatusTarget(customer)}
              >
                {customer.status === 'ACTIVE' ? 'Inativar' : 'Ativar'}
              </button>
            </>
          )}
        />

        <PaginationControls
          page={customersData.page}
          pageSize={customersData.pageSize}
          total={customersData.total}
          onPageChange={setPage}
        />
      </SectionCard>

      {workspace === 'form' ? (
        <SectionCard
          title={editingId ? 'Editar cliente' : 'Cadastro manual de cliente'}
          description="Use este formulario para manter a base local sob controle administrativo."
        >
          <div className="form-grid">
            <FormField label="Codigo do cliente">
              <input
                className="input"
                value={draft.code}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, code: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Codigo Winthor">
              <input
                className="input"
                value={draft.winthorCustomerCode}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, winthorCustomerCode: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Razao social">
              <input
                className="input"
                value={draft.legalName}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, legalName: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Nome fantasia">
              <input
                className="input"
                value={draft.tradeName}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, tradeName: event.target.value }))
                }
              />
            </FormField>
            <FormField label="CNPJ">
              <input
                className="input"
                value={draft.cnpj}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, cnpj: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Inscricao estadual">
              <input
                className="input"
                value={draft.stateRegistration}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, stateRegistration: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Telefone">
              <input
                className="input"
                value={draft.phone}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, phone: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Contato">
              <input
                className="input"
                value={draft.contactName}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, contactName: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Email">
              <input
                className="input"
                value={draft.email}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, email: event.target.value }))
                }
              />
            </FormField>
            <FormField label="CEP">
              <input
                className="input"
                value={draft.zipCode}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, zipCode: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Endereco" span={2}>
              <input
                className="input"
                value={draft.address}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, address: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Numero">
              <input
                className="input"
                value={draft.addressNumber}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, addressNumber: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Complemento">
              <input
                className="input"
                value={draft.complement}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, complement: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Bairro">
              <input
                className="input"
                value={draft.district}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, district: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Cidade">
              <input
                className="input"
                value={draft.city}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, city: event.target.value }))
                }
              />
            </FormField>
            <FormField label="UF">
              <input
                className="input"
                value={draft.state}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, state: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Rota">
              <input
                className="input"
                value={draft.routeName}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, routeName: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Regiao">
              <input
                className="input"
                value={draft.region}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, region: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Supervisor responsavel">
              <select
                className="select"
                value={draft.supervisorUserId}
                disabled={user?.role === 'SUPERVISOR'}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, supervisorUserId: event.target.value }))
                }
              >
                <option value="">Selecione</option>
                {supervisorOptions.map((supervisor) => (
                  <option key={supervisor.id} value={supervisor.id}>
                    {supervisor.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Promotor padrao">
              <select
                className="select"
                value={draft.defaultPromoterUserId}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, defaultPromoterUserId: event.target.value }))
                }
              >
                <option value="">Nao vincular</option>
                {promoters.map((promoter) => (
                  <option key={promoter.id} value={promoter.id}>
                    {promoter.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Geofence (m)">
              <input
                className="input"
                type="number"
                min="20"
                value={draft.geofenceRadiusM}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, geofenceRadiusM: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Status">
              <select
                className="select"
                value={draft.status}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    status: event.target.value as CustomerStatus,
                  }))
                }
              >
                <option value="INACTIVE">Inativo</option>
                <option value="ACTIVE">Ativo</option>
              </select>
            </FormField>
            <FormField label="Latitude">
              <input
                className="input"
                value={draft.latitude}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, latitude: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Longitude">
              <input
                className="input"
                value={draft.longitude}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, longitude: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Frequencia de visita">
              <input
                className="input"
                value={draft.visitFrequency}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, visitFrequency: event.target.value }))
                }
              />
            </FormField>
            <FormField label="Horario preferencial">
              <div className="row-actions">
                <input
                  className="input"
                  type="time"
                  value={draft.preferredVisitTimeStart}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      preferredVisitTimeStart: event.target.value,
                    }))
                  }
                />
                <input
                  className="input"
                  type="time"
                  value={draft.preferredVisitTimeEnd}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      preferredVisitTimeEnd: event.target.value,
                    }))
                  }
                />
              </div>
            </FormField>
            <FormField label="Dias preferenciais" span={2}>
              <div className="row-actions">
                {dayOptions.map((day) => (
                  <label key={day.value} className="hint">
                    <input
                      checked={draft.preferredVisitDays.includes(day.value)}
                      type="checkbox"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          preferredVisitDays: event.target.checked
                            ? [...current.preferredVisitDays, day.value]
                            : current.preferredVisitDays.filter((item) => item !== day.value),
                        }))
                      }
                    />{' '}
                    {day.label}
                  </label>
                ))}
              </div>
            </FormField>
            <FormField label="Observacoes" span={2} error={formError}>
              <textarea
                className="textarea"
                rows={4}
                value={draft.notes}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </FormField>
          </div>
          <ActionBar>
            <button className="button button-secondary" type="button" onClick={resetForm}>
              Limpar
            </button>
            <button
              className="button"
              type="button"
              disabled={saving}
              onClick={() => void handleSubmit()}
            >
              {saving ? 'Salvando...' : editingId ? 'Salvar alteracoes' : 'Cadastrar cliente'}
            </button>
          </ActionBar>
        </SectionCard>
      ) : null}

      {workspace === 'import' ? (
        <SectionCard
          title="Importacao de clientes"
          description="CSV exportado do Excel funciona como caminho principal. A integracao Winthor fica pronta para leitura desacoplada."
        >
          <div className="form-grid">
            <FormField label="Origem">
              <select
                className="select"
                value={importDraft.sourceType}
                onChange={(event) =>
                  setImportDraft((current) => ({
                    ...current,
                    sourceType: event.target.value as CustomerImportSourceType,
                  }))
                }
              >
                <option value="CSV">CSV / Excel</option>
                <option value="WINTHOR">Winthor</option>
              </select>
            </FormField>
            {importDraft.sourceType === 'CSV' ? (
              <FormField label="Arquivo CSV">
                <div className="stack">
                  <input
                    className="input"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                  />
                  <p className="hint">
                    Envie um arquivo em UTF-8. O sistema detecta &quot;,&quot;, &quot;;&quot; ou TAB
                    automaticamente quando o delimitador ficar em branco.
                  </p>
                </div>
              </FormField>
            ) : (
              <FormField label="Alterados desde">
                <input
                  className="input"
                  type="datetime-local"
                  value={importDraft.changedSince}
                  onChange={(event) =>
                    setImportDraft((current) => ({ ...current, changedSince: event.target.value }))
                  }
                />
              </FormField>
            )}
            <FormField label="Supervisor fallback">
              <select
                className="select"
                value={importDraft.fallbackSupervisorUserId}
                disabled={user?.role === 'SUPERVISOR'}
                onChange={(event) =>
                  setImportDraft((current) => ({
                    ...current,
                    fallbackSupervisorUserId: event.target.value,
                  }))
                }
              >
                <option value="">Nao vincular</option>
                {supervisorOptions.map((supervisor) => (
                  <option key={supervisor.id} value={supervisor.id}>
                    {supervisor.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Promotor fallback">
              <select
                className="select"
                value={importDraft.fallbackDefaultPromoterUserId}
                onChange={(event) =>
                  setImportDraft((current) => ({
                    ...current,
                    fallbackDefaultPromoterUserId: event.target.value,
                  }))
                }
              >
                <option value="">Nao vincular</option>
                {promoters.map((promoter) => (
                  <option key={promoter.id} value={promoter.id}>
                    {promoter.name}
                  </option>
                ))}
              </select>
            </FormField>
            {importDraft.sourceType === 'CSV' ? (
              <FormField label="Delimitador">
                <select
                  className="select"
                  value={importDraft.delimiter}
                  onChange={(event) =>
                    setImportDraft((current) => ({ ...current, delimiter: event.target.value }))
                  }
                >
                  <option value="">Detectar automaticamente</option>
                  <option value=";">Ponto e virgula (;)</option>
                  <option value=",">Virgula (,)</option>
                  <option value={'\t'}>TAB</option>
                </select>
              </FormField>
            ) : null}
            <FormField label="Opcoes" span={2}>
              <div className="row-actions">
                <label className="hint">
                  <input
                    checked={importDraft.allowCreate}
                    type="checkbox"
                    onChange={(event) =>
                      setImportDraft((current) => ({
                        ...current,
                        allowCreate: event.target.checked,
                      }))
                    }
                  />{' '}
                  Criar novos
                </label>
                <label className="hint">
                  <input
                    checked={importDraft.allowUpdate}
                    type="checkbox"
                    onChange={(event) =>
                      setImportDraft((current) => ({
                        ...current,
                        allowUpdate: event.target.checked,
                      }))
                    }
                  />{' '}
                  Atualizar existentes
                </label>
                <label className="hint">
                  <input
                    checked={importDraft.ignoreDuplicates}
                    type="checkbox"
                    onChange={(event) =>
                      setImportDraft((current) => ({
                        ...current,
                        ignoreDuplicates: event.target.checked,
                      }))
                    }
                  />{' '}
                  Ignorar duplicados
                </label>
              </div>
            </FormField>
          </div>
          <ActionBar>
            <button
              className="button button-secondary"
              type="button"
              disabled={importing}
              onClick={() => void runImport(false)}
            >
              Gerar preview
            </button>
            <button
              className="button"
              type="button"
              disabled={
                importing ||
                !previewBatch ||
                previewBatch.applyChanges ||
                previewBatch.status !== 'PREVIEWED'
              }
              onClick={() => setConfirmApplyImport(true)}
            >
              Aplicar importacao
            </button>
          </ActionBar>
          {previewBatch ? (
            <>
              <NoticeCard
                tone={
                  previewBatch.status === 'FAILED'
                    ? 'warning'
                    : isBatchInFlight(previewBatch.status)
                      ? 'neutral'
                      : 'success'
                }
                title={`Lote ${previewBatch.id} · ${importBatchStatusLabel(previewBatch.status)}`}
                description={`${previewBatch.logSummary ?? 'Preview pronto'} Leitura: ${previewBatch.readCount}, criar: ${previewBatch.createdCount}, atualizar: ${previewBatch.updatedCount}, ignorar: ${previewBatch.ignoredCount}, erros: ${previewBatch.errorCount}. Tentativas: ${previewBatch.attemptCount}.`}
              />
              <div className="customer-import-summary-grid">
                <article className="customer-import-summary-card">
                  <span className="stats-card-label">Arquivo</span>
                  <strong>{previewBatch.sourceReference ?? 'Nao informado'}</strong>
                  <p className="stats-card-hint">Origem {sourceLabel(previewBatch.sourceType)}</p>
                </article>
                <article className="customer-import-summary-card">
                  <span className="stats-card-label">Delimitador</span>
                  <strong>
                    {describeDelimiter(previewBatch.csvMetadata?.detectedDelimiter ?? null)}
                  </strong>
                  <p className="stats-card-hint">
                    Solicitado: {describeDelimiter(previewBatch.csvMetadata?.requestedDelimiter)}
                  </p>
                </article>
                <article className="customer-import-summary-card">
                  <span className="stats-card-label">Linhas validas</span>
                  <strong>
                    {previewBatch.csvMetadata?.validRows ?? previewDecisionItems.length}
                  </strong>
                  <p className="stats-card-hint">
                    {previewBatch.createdCount} criar • {previewBatch.updatedCount} atualizar •{' '}
                    {previewBatch.ignoredCount} ignorar
                  </p>
                </article>
                <article className="customer-import-summary-card">
                  <span className="stats-card-label">Linhas com erro</span>
                  <strong>
                    {previewBatch.csvMetadata?.invalidRows ?? previewErrorItems.length}
                  </strong>
                  <p className="stats-card-hint">
                    Vazias ignoradas: {previewBatch.csvMetadata?.skippedEmptyRows ?? 0}
                  </p>
                </article>
              </div>
              <div className="stack">
                {previewBatch.csvMetadata?.incompatibleLayout ? (
                  <NoticeCard
                    tone="warning"
                    title="Layout de CSV incompatível com importação de clientes"
                    description={
                      previewBatch.csvMetadata.layoutMessage ??
                      'O arquivo enviado nao corresponde ao layout de importacao de clientes.'
                    }
                  />
                ) : null}
                <p className="hint">
                  Cabecalhos encontrados:{' '}
                  {previewBatch.csvMetadata?.originalHeaders?.length
                    ? previewBatch.csvMetadata.originalHeaders.join(', ')
                    : 'Nao disponiveis'}
                </p>
                <p className="hint">
                  Cabecalhos reconhecidos:{' '}
                  {previewBatch.csvMetadata?.recognizedHeaders?.length
                    ? previewBatch.csvMetadata.recognizedHeaders.join(', ')
                    : 'Nao disponiveis'}
                </p>
                <p className="hint">
                  Cabecalhos normalizados:{' '}
                  {previewBatch.csvMetadata?.normalizedHeaders?.length
                    ? previewBatch.csvMetadata.normalizedHeaders.join(', ')
                    : 'Nao disponiveis'}
                </p>
                {previewBatch.csvMetadata?.missingRequiredHeaders?.length ? (
                  <p className="hint">
                    Colunas obrigatorias ausentes:{' '}
                    {previewBatch.csvMetadata.missingRequiredHeaders.join(', ')}
                  </p>
                ) : null}
                {previewBatch.csvMetadata?.unrecognizedHeaders?.length ? (
                  <p className="hint">
                    Colunas nao reconhecidas:{' '}
                    {previewBatch.csvMetadata.unrecognizedHeaders.join(', ')}
                  </p>
                ) : null}
                <p className="hint">Solicitado em: {formatDateTime(previewBatch.requestedAt)}</p>
                <p className="hint">Inicio do job: {formatDateTime(previewBatch.startedAt)}</p>
                <p className="hint">Fim do job: {formatDateTime(previewBatch.finishedAt)}</p>
                <p className="hint">
                  Duracao:{' '}
                  {previewBatch.durationMs ? `${previewBatch.durationMs} ms` : 'Em andamento'}
                </p>
                {previewBatch.nextRetryAt ? (
                  <p className="hint">
                    Proxima tentativa: {formatDateTime(previewBatch.nextRetryAt)}
                  </p>
                ) : null}
                {previewBatch.lastError ? (
                  <p className="hint">Ultimo erro: {previewBatch.lastError}</p>
                ) : null}
              </div>
              {previewErrorItems.length > 0 ? (
                <div className="customer-import-errors">
                  <strong>Linhas com erro</strong>
                  <ul>
                    {previewErrorItems.map((item) => (
                      <li key={item.id}>
                        <span>
                          Linha {item.rowNumber} - {getImportItemDisplayName(item)}
                        </span>
                        <span>{getImportItemIssues(item).join(' | ') || 'Erro nao detalhado'}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <DataTable
                columns={[
                  { key: 'row', header: 'Linha', render: (item) => item.rowNumber },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (item) => (
                      <span className={importItemBadge(item.status)}>{item.status}</span>
                    ),
                  },
                  {
                    key: 'customer',
                    header: 'Cliente / identificador',
                    render: (item) => getImportItemDisplayName(item),
                  },
                  {
                    key: 'keys',
                    header: 'Chaves',
                    render: (item) =>
                      [item.customerCode, item.winthorCustomerCode, item.cnpj]
                        .filter(Boolean)
                        .join(' • ') || 'Nao informado',
                  },
                  {
                    key: 'message',
                    header: 'Resultado',
                    render: (item) => getImportItemIssues(item).join(' | ') || 'Sem mensagem',
                  },
                ]}
                emptyTitle="Nenhum item no preview"
                emptyDescription="O lote nao retornou registros para exibir."
                getRowKey={(item) => item.id}
                items={previewBatch.previewItems}
                mobileTitle={(item) => getImportItemDisplayName(item)}
                mobileSubtitle={(item) => `Linha ${item.rowNumber}`}
                mobileMeta={(item) => (
                  <span className={importItemBadge(item.status)}>{item.status}</span>
                )}
                mobileBody={(item) => (
                  <p className="hint">{getImportItemIssues(item).join(' | ') || 'Sem mensagem'}</p>
                )}
              />
            </>
          ) : (
            <NoticeCard
              title="Preview e reconciliacao"
              description="O sistema exibe conflitos e duplicidades antes de aplicar qualquer alteracao na base local."
            />
          )}
        </SectionCard>
      ) : null}

      {workspace === 'history' ? (
        <SectionCard
          title="Historico de importacoes"
          description="Cada lote registra data, origem, usuario responsavel, resumo e itens lidos para garantir rastreabilidade."
        >
          {historyLoading && !historyData ? (
            <LoadingState message="Carregando historico..." />
          ) : null}
          {historyData ? (
            <>
              <DataTable
                columns={[
                  {
                    key: 'when',
                    header: 'Data/hora',
                    render: (batch) => formatDateTime(batch.requestedAt),
                  },
                  {
                    key: 'origin',
                    header: 'Origem',
                    render: (batch) => sourceLabel(batch.sourceType),
                  },
                  {
                    key: 'user',
                    header: 'Usuario',
                    render: (batch) => batch.actorUserName ?? 'Nao informado',
                  },
                  {
                    key: 'summary',
                    header: 'Resumo',
                    render: (batch) =>
                      `${batch.summary?.readCount ?? batch.readCount} lidos - ${batch.summary?.createdCount ?? batch.createdCount} criados - ${batch.summary?.updatedCount ?? batch.updatedCount} atualizados - ${batch.summary?.ignoredCount ?? batch.ignoredCount} ignorados - ${batch.summary?.errorCount ?? batch.errorCount} erros`,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (batch) => (
                      <span className={importBatchBadge(batch.status)}>
                        {importBatchStatusLabel(batch.status)}
                      </span>
                    ),
                  },
                  {
                    key: 'actions',
                    header: '',
                    render: (batch) => (
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => void openBatch(batch.id)}
                      >
                        Detalhes
                      </button>
                    ),
                  },
                ]}
                emptyTitle="Nenhum lote encontrado"
                emptyDescription="As importacoes e sincronizacoes executadas aparecerao aqui."
                getRowKey={(batch) => batch.id}
                items={historyData.items}
                mobileTitle={(batch) => sourceLabel(batch.sourceType)}
                mobileSubtitle={(batch) => formatDateTime(batch.requestedAt)}
                mobileMeta={(batch) => (
                  <span className={importBatchBadge(batch.status)}>
                    {importBatchStatusLabel(batch.status)}
                  </span>
                )}
                mobileBody={(batch) => <p className="hint">{batch.logSummary ?? 'Sem resumo'}</p>}
                mobileActions={(batch) => (
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => void openBatch(batch.id)}
                  >
                    Detalhes
                  </button>
                )}
              />
              <PaginationControls
                page={historyData.page}
                pageSize={historyData.pageSize}
                total={historyData.total}
                onPageChange={setHistoryPage}
              />
              {selectedBatch ? (
                <SectionCard
                  title={`Lote ${selectedBatch.id}`}
                  description={selectedBatch.logSummary ?? 'Detalhes do lote selecionado.'}
                  tone="muted"
                >
                  <div className="stack">
                    <p className="hint">Status: {importBatchStatusLabel(selectedBatch.status)}</p>
                    <p className="hint">
                      Origem: {sourceLabel(selectedBatch.sourceType)} · Referencia:{' '}
                      {selectedBatch.sourceReference ?? 'Nao informada'}
                    </p>
                    <p className="hint">
                      Solicitado em {formatDateTime(selectedBatch.requestedAt)} · Inicio{' '}
                      {formatDateTime(selectedBatch.startedAt)} · Fim{' '}
                      {formatDateTime(selectedBatch.finishedAt)}
                    </p>
                    <p className="hint">
                      Tentativas: {selectedBatch.attemptCount} · Duracao:{' '}
                      {selectedBatch.durationMs ? `${selectedBatch.durationMs} ms` : 'Em andamento'}
                    </p>
                    <p className="hint">
                      Resumo: {selectedBatch.summary?.readCount ?? selectedBatch.readCount} lidos -{' '}
                      {selectedBatch.summary?.createdCount ?? selectedBatch.createdCount} criados -{' '}
                      {selectedBatch.summary?.updatedCount ?? selectedBatch.updatedCount}{' '}
                      atualizados -{' '}
                      {selectedBatch.summary?.ignoredCount ?? selectedBatch.ignoredCount} ignorados
                      - {selectedBatch.summary?.errorCount ?? selectedBatch.errorCount} erros
                    </p>
                    {selectedBatch.nextRetryAt ? (
                      <p className="hint">
                        Proxima tentativa: {formatDateTime(selectedBatch.nextRetryAt)}
                      </p>
                    ) : null}
                    {selectedBatch.lastError ? (
                      <p className="hint">Ultimo erro: {selectedBatch.lastError}</p>
                    ) : null}
                  </div>
                  <FilterBar>
                    <FormField label="Filtrar itens por status">
                      <select
                        className="select"
                        value={itemsStatusFilter}
                        onChange={(event) => setItemsStatusFilter(event.target.value)}
                      >
                        <option value="">Todos</option>
                        <option value="STAGED">Em staging</option>
                        <option value="CREATE">Criar</option>
                        <option value="UPDATE">Atualizar</option>
                        <option value="IGNORE">Ignorar</option>
                        <option value="ERROR">Erro</option>
                      </select>
                    </FormField>
                  </FilterBar>
                  <DataTable
                    columns={[
                      { key: 'row', header: 'Linha', render: (item) => item.rowNumber },
                      {
                        key: 'status',
                        header: 'Status',
                        render: (item) => (
                          <span className={importItemBadge(item.status)}>{item.status}</span>
                        ),
                      },
                      {
                        key: 'customer',
                        header: 'Cliente',
                        render: (item) =>
                          item.tradeName ?? item.customer?.tradeName ?? 'Nao informado',
                      },
                      {
                        key: 'message',
                        header: 'Log',
                        render: (item) => getImportItemIssues(item).join(' | ') || 'Sem detalhe',
                      },
                    ]}
                    emptyTitle="Nenhum item neste lote"
                    emptyDescription="Nao ha itens para o filtro atual."
                    getRowKey={(item) => item.id}
                    items={selectedBatchItems?.items ?? []}
                    mobileTitle={(item) => item.tradeName ?? item.customer?.tradeName ?? 'Registro'}
                    mobileSubtitle={(item) => `Linha ${item.rowNumber}`}
                    mobileMeta={(item) => (
                      <span className={importItemBadge(item.status)}>{item.status}</span>
                    )}
                    mobileBody={(item) => (
                      <p className="hint">
                        {getImportItemIssues(item).join(' | ') || 'Sem detalhe'}
                      </p>
                    )}
                  />
                </SectionCard>
              ) : null}
            </>
          ) : null}
        </SectionCard>
      ) : null}

      <ConfirmDialog
        open={Boolean(statusTarget)}
        title={statusTarget?.status === 'ACTIVE' ? 'Inativar cliente?' : 'Ativar cliente?'}
        description={
          statusTarget?.status === 'ACTIVE'
            ? 'O cliente deixara de aparecer como ativo para operacao e roteirizacao.'
            : 'O cliente voltara a ficar disponivel para uso operacional.'
        }
        confirmLabel={statusTarget?.status === 'ACTIVE' ? 'Inativar' : 'Ativar'}
        onCancel={() => setStatusTarget(null)}
        onConfirm={() => void handleToggleStatus()}
      />
      <ConfirmDialog
        open={confirmActivateAllInactive}
        title="Reativar clientes inativos?"
        description="Deseja reativar todos os clientes inativos do contexto atual? Clientes sem geolocalizacao tambem serao reativados."
        confirmLabel={activatingAllInactive ? 'Reativando...' : 'Reativar clientes'}
        cancelDisabled={activatingAllInactive}
        confirmDisabled={activatingAllInactive}
        onCancel={() => {
          if (!activatingAllInactive) {
            setConfirmActivateAllInactive(false);
          }
        }}
        onConfirm={() => void handleActivateAllInactive()}
      />
      <ConfirmDialog
        open={confirmApplyImport}
        title="Aplicar importacao?"
        description="As alteracoes serao gravadas apenas na base local do app, com lote auditado e historico detalhado."
        confirmLabel="Aplicar lote"
        onCancel={() => setConfirmApplyImport(false)}
        onConfirm={() => void runImport(true)}
      />
      <ConfirmDialog
        open={confirmSyncWinthor}
        title="Sincronizar clientes do Winthor?"
        description="A leitura do Winthor permanece somente leitura. Nada sera escrito no ERP."
        confirmLabel="Sincronizar"
        onCancel={() => setConfirmSyncWinthor(false)}
        onConfirm={() => void handleSyncWinthor()}
      />
    </PageContainer>
  );
}
