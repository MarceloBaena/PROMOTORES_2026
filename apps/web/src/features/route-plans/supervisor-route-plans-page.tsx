'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '@/components/page-states';
import { FooterActionBar, HeaderActionBar } from '@/components/ui/action-bar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormField } from '@/components/ui/form-field';
import {
  ContentContainer,
  PageContainer,
  SectionContainer,
} from '@/components/ui/layout-primitives';
import { NoticeCard } from '@/components/ui/notice-card';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/section-card';
import { StatsCard } from '@/components/ui/stats-card';
import { useAuthStore } from '@/lib/auth-store';
import {
  ApiError,
  createRoutePlan,
  getCustomers,
  getPromoters,
  getRoutePlan,
  getRoutePlans,
  publishRoutePlan,
  updateRoutePlan,
} from '@/lib/api';
import { validateRoutePlanInput } from '@/lib/form-validation';
import { formatDateTime } from '@/lib/format';
import type {
  CustomerSummary,
  PromotersListResponse,
  RoutePlanDetailResponse,
  RoutePlanInput,
  RoutePlansListResponse,
  RoutePriority,
} from '@/lib/types';

type PromoterSummary = PromotersListResponse['items'][number];
type RoutePlanSummary = NonNullable<RoutePlansListResponse['items']>[number];

interface LookupContext {
  promoterId: string;
  routeDate: string;
}

interface RouteDraftItem {
  draftKey: string;
  routePlanItemId?: string;
  customerId: string;
  customerName: string;
  city: string;
  district: string;
  sequence: number;
  plannedTime: string;
  priority: RoutePriority;
  notes: string;
  status: string;
  active: boolean;
  completionStatus?: string | null;
  checkOutAt?: string | null;
  cancelledAt?: string | null;
  locked: boolean;
}

interface RouteEditorDraft {
  id?: string;
  routeDate: string;
  promoterId: string;
  promoterName: string;
  supervisorName: string;
  status: string;
  version?: number;
  notes: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
  items: RouteDraftItem[];
}

interface PublishVerificationSnapshot {
  id?: string;
  status: string;
  version?: number;
  publishedAt?: string | null;
  updatedAt?: string | null;
}

interface QuickRouteItemDraft {
  plannedTime: string;
  priority: RoutePriority;
  notes: string;
}

type ConfirmState =
  | { kind: 'load' }
  | { kind: 'new' }
  | { kind: 'cancel' }
  | { kind: 'remove-item'; itemKey: string };

const priorityOptions: Array<{ label: string; value: RoutePriority }> = [
  { label: 'Baixa', value: 'LOW' },
  { label: 'Normal', value: 'NORMAL' },
  { label: 'Alta', value: 'HIGH' },
  { label: 'Urgente', value: 'URGENT' },
];

const padDateSegment = (value: number) => value.toString().padStart(2, '0');

const formatLocalDateInputValue = (value: Date) =>
  `${value.getFullYear()}-${padDateSegment(value.getMonth() + 1)}-${padDateSegment(value.getDate())}`;

const getTodayInputValue = () => formatLocalDateInputValue(new Date());

const toDateInput = (value?: string | null) => {
  if (!value) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return formatLocalDateInputValue(parsed);
};

const toTimeInput = (value?: string | null) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${padDateSegment(date.getHours())}:${padDateSegment(date.getMinutes())}`;
};

const combineDateAndTime = (dateValue: string, timeValue: string) => {
  if (!dateValue || !timeValue) {
    return undefined;
  }

  return new Date(`${dateValue}T${timeValue}:00`).toISOString();
};

const getPriorityLabel = (value?: RoutePriority | null) => {
  switch (value) {
    case 'LOW':
      return 'Baixa';
    case 'NORMAL':
      return 'Normal';
    case 'HIGH':
      return 'Alta';
    case 'URGENT':
      return 'Urgente';
    default:
      return value ?? 'Nao informada';
  }
};

const getPriorityBadgeClassName = (value?: RoutePriority | null) => {
  switch (value) {
    case 'URGENT':
      return 'badge badge-alert';
    case 'HIGH':
      return 'badge badge-partial';
    case 'LOW':
      return 'badge badge-completed';
    case 'NORMAL':
    default:
      return 'badge badge-in-progress';
  }
};

const getRouteStatusLabel = (value?: string | null) => {
  switch (value) {
    case 'DRAFT':
      return 'Rascunho';
    case 'PUBLISHED':
      return 'Publicado';
    case 'ARCHIVED':
      return 'Cancelado';
    default:
      return 'Nao carregado';
  }
};

const getRouteStatusBadgeClassName = (value?: string | null) => {
  switch (value) {
    case 'PUBLISHED':
      return 'badge badge-completed';
    case 'DRAFT':
      return 'badge badge-partial';
    case 'ARCHIVED':
      return 'badge badge-alert';
    default:
      return 'badge';
  }
};

export const didPublishPersistInBackend = (
  previous: PublishVerificationSnapshot,
  next: Pick<RoutePlanDetailResponse, 'status' | 'version' | 'publishedAt' | 'updatedAt'>,
) => {
  if (next.status !== 'PUBLISHED' || !next.publishedAt) {
    return false;
  }

  if (!previous.id) {
    return true;
  }

  if (previous.status !== 'PUBLISHED') {
    return true;
  }

  if (typeof previous.version === 'number' && typeof next.version === 'number') {
    return next.version > previous.version;
  }

  return (
    next.publishedAt !== previous.publishedAt || next.updatedAt !== previous.updatedAt
  );
};

const isLockedRouteItem = (stop: RoutePlanDetailResponse['stops'][number]) =>
  !stop.active ||
  stop.status === 'COMPLETED' ||
  stop.completionStatus === 'COMPLETED' ||
  Boolean(stop.checkOutAt) ||
  Boolean(stop.cancelledAt);

const sortDraftItems = (items: RouteDraftItem[]) =>
  [...items].sort((left, right) => left.sequence - right.sequence);

const normalizeDraftItems = (items: RouteDraftItem[]) =>
  sortDraftItems(items).map((item, index) => ({
    ...item,
    sequence: index + 1,
  }));

const buildDraftItem = (
  input: Partial<RouteDraftItem> & {
    draftKey: string;
    customerId: string;
    customerName: string;
    city: string;
    district: string;
    sequence: number;
  },
): RouteDraftItem => ({
  draftKey: input.draftKey,
  routePlanItemId: input.routePlanItemId,
  customerId: input.customerId,
  customerName: input.customerName,
  city: input.city,
  district: input.district,
  sequence: input.sequence,
  plannedTime: input.plannedTime ?? '',
  priority: input.priority ?? 'NORMAL',
  notes: input.notes ?? '',
  status: input.status ?? 'PLANNED',
  active: input.active ?? true,
  completionStatus: input.completionStatus ?? null,
  checkOutAt: input.checkOutAt ?? null,
  cancelledAt: input.cancelledAt ?? null,
  locked: input.locked ?? false,
});

const buildRouteDraftFromDetail = (
  detail: RoutePlanDetailResponse,
  supervisorName: string,
): RouteEditorDraft => ({
  id: detail.id,
  routeDate: toDateInput(detail.routeDate),
  promoterId: detail.promoter.id,
  promoterName: detail.promoter.name,
  supervisorName,
  status: detail.status,
  version: detail.version,
  notes: detail.notes ?? '',
  publishedAt: detail.publishedAt ?? null,
  updatedAt: detail.updatedAt,
  items: normalizeDraftItems(
    [...(detail.stops ?? [])].map((stop) =>
      buildDraftItem({
        draftKey: stop.id,
        routePlanItemId: stop.id,
        customerId: stop.customerId,
        customerName: stop.customerName,
        city: stop.city,
        district: '',
        sequence: stop.sequence,
        plannedTime: toTimeInput(stop.plannedStartAt),
        priority: stop.priority,
        notes: stop.notes ?? '',
        status: stop.status,
        active: stop.active,
        completionStatus: stop.completionStatus ?? null,
        checkOutAt: stop.checkOutAt ?? null,
        cancelledAt: stop.cancelledAt ?? null,
        locked: isLockedRouteItem(stop),
      }),
    ),
  ),
});

const createEmptyRouteDraft = (
  context: LookupContext,
  promoter?: PromoterSummary,
  supervisorName?: string,
): RouteEditorDraft => ({
  routeDate: context.routeDate,
  promoterId: context.promoterId,
  promoterName: promoter?.name ?? 'Promotor nao selecionado',
  supervisorName: promoter?.supervisorName ?? supervisorName ?? 'Supervisor nao informado',
  status: 'DRAFT',
  version: undefined,
  notes: '',
  publishedAt: null,
  updatedAt: null,
  items: [],
});

const buildRoutePlanPayload = (
  draft: RouteEditorDraft,
  options: {
    status?: RoutePlanInput['status'];
    publishNow?: boolean;
  },
): RoutePlanInput => ({
  routeDate: draft.routeDate,
  promoterId: draft.promoterId,
  planningView: 'DAILY',
  status: options.status,
  publishNow: options.publishNow,
  notes: draft.notes.trim() || undefined,
  items: normalizeDraftItems(draft.items).map((item) => ({
    routePlanItemId: item.routePlanItemId,
    customerId: item.customerId,
    sequence: item.sequence,
    priority: item.priority,
    plannedStartAt: combineDateAndTime(draft.routeDate, item.plannedTime),
    notes: item.notes.trim() || undefined,
  })),
});

const cloneDraft = (draft: RouteEditorDraft | null): RouteEditorDraft | null => {
  if (!draft) {
    return null;
  }

  return {
    ...draft,
    items: draft.items.map((item) => ({ ...item })),
  };
};

const buildDraftSnapshot = (draft: RouteEditorDraft | null) => {
  if (!draft) {
    return '';
  }

  return JSON.stringify({
    id: draft.id ?? null,
    routeDate: draft.routeDate,
    promoterId: draft.promoterId,
    status: draft.status,
    notes: draft.notes.trim(),
    items: normalizeDraftItems(draft.items).map((item) => ({
      routePlanItemId: item.routePlanItemId ?? null,
      customerId: item.customerId,
      sequence: item.sequence,
      plannedTime: item.plannedTime,
      priority: item.priority,
      notes: item.notes.trim(),
      active: item.active,
      status: item.status,
      completionStatus: item.completionStatus ?? null,
      cancelledAt: item.cancelledAt ?? null,
    })),
  });
};

const createQuickRouteItemDraft = (): QuickRouteItemDraft => ({
  plannedTime: '',
  priority: 'NORMAL',
  notes: '',
});

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof ApiError ? error.message : fallback;

const buildCustomerLocationLabel = (
  customer?:
    | Pick<CustomerSummary, 'district' | 'city'>
    | Pick<RouteDraftItem, 'district' | 'city'>
    | null,
) => {
  const pieces = [customer?.district, customer?.city].filter(Boolean);
  return pieces.length > 0 ? pieces.join(' / ') : 'Local nao informado';
};

const getCustomerCodeLabel = (customer?: CustomerSummary | null) =>
  customer?.customerCode || customer?.code || 'Sem codigo';

const getCustomerDocumentLabel = (customer?: CustomerSummary | null) =>
  customer?.cnpj || customer?.documentNumber || 'CNPJ nao informado';

const normalizeSearchText = (value?: string | null) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const normalizeSearchDigits = (value?: string | null) => (value ?? '').replace(/\D/g, '');

const getCustomerSearchScore = (
  customer: CustomerSummary,
  rawQuery: string,
  promoterId: string,
) => {
  const normalizedQuery = normalizeSearchText(rawQuery);
  const normalizedDigits = normalizeSearchDigits(rawQuery);

  if (!normalizedQuery && !normalizedDigits) {
    return Number.NEGATIVE_INFINITY;
  }

  const tradeName = normalizeSearchText(customer.tradeName);
  const legalName = normalizeSearchText(customer.legalName);
  const customerCode = normalizeSearchText(getCustomerCodeLabel(customer));
  const winthorCustomerCode = normalizeSearchText(customer.winthorCustomerCode);
  const cnpj = normalizeSearchDigits(getCustomerDocumentLabel(customer));
  const city = normalizeSearchText(customer.city);
  const district = normalizeSearchText(customer.district ?? '');
  const routeName = normalizeSearchText(customer.routeName);
  const region = normalizeSearchText(customer.region);
  const haystack = [
    tradeName,
    legalName,
    customerCode,
    winthorCustomerCode,
    city,
    district,
    routeName,
    region,
  ]
    .filter(Boolean)
    .join(' ');

  let score = Number.NEGATIVE_INFINITY;

  if (normalizedDigits) {
    if (cnpj === normalizedDigits) {
      score = Math.max(score, 1200);
    } else if (cnpj.startsWith(normalizedDigits)) {
      score = Math.max(score, 1040);
    } else if (cnpj.includes(normalizedDigits)) {
      score = Math.max(score, 960);
    }
  }

  if (normalizedQuery) {
    if (customerCode === normalizedQuery || winthorCustomerCode === normalizedQuery) {
      score = Math.max(score, 1180);
    } else if (
      customerCode.startsWith(normalizedQuery) ||
      winthorCustomerCode.startsWith(normalizedQuery)
    ) {
      score = Math.max(score, 1020);
    } else if (
      customerCode.includes(normalizedQuery) ||
      winthorCustomerCode.includes(normalizedQuery)
    ) {
      score = Math.max(score, 930);
    }

    if (tradeName === normalizedQuery || legalName === normalizedQuery) {
      score = Math.max(score, 1100);
    } else if (tradeName.startsWith(normalizedQuery) || legalName.startsWith(normalizedQuery)) {
      score = Math.max(score, 980);
    } else if (tradeName.includes(normalizedQuery) || legalName.includes(normalizedQuery)) {
      score = Math.max(score, 860);
    }

    if (city === normalizedQuery || district === normalizedQuery) {
      score = Math.max(score, 620);
    } else if (city.includes(normalizedQuery) || district.includes(normalizedQuery)) {
      score = Math.max(score, 520);
    } else if (haystack.includes(normalizedQuery)) {
      score = Math.max(score, 420);
    }
  }

  if (!Number.isFinite(score)) {
    return score;
  }

  if (customer.defaultPromoterUserId === promoterId) {
    score += 40;
  }

  return score;
};

const sortCustomersBySearchRelevance = (
  customers: CustomerSummary[],
  rawQuery: string,
  promoterId: string,
) =>
  [...customers]
    .map((customer) => ({
      customer,
      score: getCustomerSearchScore(customer, rawQuery, promoterId),
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      return left.customer.tradeName.localeCompare(right.customer.tradeName, 'pt-BR');
    })
    .map((entry) => entry.customer);

const mergeCustomersById = (
  current: CustomerSummary[],
  incoming: CustomerSummary[],
): CustomerSummary[] => {
  const byId = new Map(current.map((customer) => [customer.id, customer]));

  for (const customer of incoming) {
    byId.set(customer.id, customer);
  }

  return [...byId.values()];
};

const buildMovementState = (items: RouteDraftItem[], itemKey: string) => {
  const sortedItems = normalizeDraftItems(items);
  const itemIndex = sortedItems.findIndex((item) => item.draftKey === itemKey);
  const currentItem = sortedItems[itemIndex];
  const previousItem = itemIndex > 0 ? sortedItems[itemIndex - 1] : null;
  const nextItem = itemIndex >= 0 ? sortedItems[itemIndex + 1] : null;

  return {
    canMoveUp: Boolean(currentItem) && itemIndex > 0 && !currentItem?.locked && !previousItem?.locked,
    canMoveDown:
      Boolean(currentItem) &&
      itemIndex >= 0 &&
      itemIndex < sortedItems.length - 1 &&
      !currentItem?.locked &&
      !nextItem?.locked,
  };
};

export default function SupervisorRoutePlansPage() {
  const localItemCounterRef = useRef(0);
  const customerSearchRequestRef = useRef(0);
  const customerPickerRef = useRef<HTMLDivElement | null>(null);
  const user = useAuthStore((state) => state.user);

  const [promoters, setPromoters] = useState<PromoterSummary[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [lookupContext, setLookupContext] = useState<LookupContext>({
    promoterId: '',
    routeDate: getTodayInputValue(),
  });
  const [draft, setDraft] = useState<RouteEditorDraft | null>(null);
  const [baselineDraft, setBaselineDraft] = useState<RouteEditorDraft | null>(null);
  const [quickCustomerQuery, setQuickCustomerQuery] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState<CustomerSummary[]>([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [quickItemDraft, setQuickItemDraft] = useState<QuickRouteItemDraft>(
    createQuickRouteItemDraft,
  );
  const [editingItemKey, setEditingItemKey] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [customerSearchError, setCustomerSearchError] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [supportMessage, setSupportMessage] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const deferredQuickCustomerQuery = useDeferredValue(quickCustomerQuery);
  const [isCustomerPickerOpen, setIsCustomerPickerOpen] = useState(false);
  const [customerPickerUsesQuery, setCustomerPickerUsesQuery] = useState(false);

  const createLocalItemKey = () => {
    localItemCounterRef.current += 1;
    return `route-draft-item-${localItemCounterRef.current}`;
  };

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        setBootstrapping(true);
        setError(null);

        const [promotersResponse, customersResponse] = await Promise.all([
          getPromoters({ page: 1, pageSize: 100, eligibleForRoutePlanning: 'true' }),
          getCustomers({ page: 1, pageSize: 500, status: 'ACTIVE' }),
        ]);

        if (!active) {
          return;
        }

        const promoterItems = promotersResponse.items ?? [];
        const customerItems = customersResponse.items ?? [];
        const defaultPromoterId = promoterItems[0]?.id ?? '';

        setPromoters(promoterItems);
        setCustomers(customerItems);
        setLookupContext({
          promoterId: defaultPromoterId,
          routeDate: getTodayInputValue(),
        });
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(getErrorMessage(loadError, 'Nao foi possivel abrir a tela de roteiros.'));
      } finally {
        if (active) {
          setBootstrapping(false);
        }
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const isDirty = buildDraftSnapshot(draft) !== buildDraftSnapshot(baselineDraft);

    if (!isDirty) {
      return undefined;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [baselineDraft, draft]);

  const promoterById = useMemo(
    () => new Map(promoters.map((promoter) => [promoter.id, promoter])),
    [promoters],
  );

  const customerById = useMemo(
    () => new Map(mergeCustomersById(customers, customerSearchResults).map((customer) => [customer.id, customer])),
    [customerSearchResults, customers],
  );

  const currentPromoterId = draft?.promoterId || lookupContext.promoterId;
  const currentPromoter =
    promoterById.get(draft?.promoterId ?? lookupContext.promoterId) ?? null;

  const sortedDraftItems = useMemo(() => normalizeDraftItems(draft?.items ?? []), [draft?.items]);

  const hasUnsavedChanges = useMemo(
    () => buildDraftSnapshot(draft) !== buildDraftSnapshot(baselineDraft),
    [baselineDraft, draft],
  );

  const needsRepublishNotice = draft?.status === 'PUBLISHED' && hasUnsavedChanges;

  const selectedQuickCustomers = useMemo(
    () =>
      selectedCustomerIds
        .map((customerId) => customerById.get(customerId) ?? null)
        .filter((customer): customer is CustomerSummary => Boolean(customer)),
    [customerById, selectedCustomerIds],
  );

  const browseCustomers = useMemo(
    () =>
      [...customers]
        .filter((customer) => {
          const isAlreadySelected =
            selectedCustomerIds.includes(customer.id) &&
            (editingItemKey ? customer.id !== selectedCustomerIds[0] : true);
          const existsInRoute = sortedDraftItems.some(
            (item) =>
              item.customerId === customer.id &&
              (editingItemKey ? item.draftKey !== editingItemKey : true),
          );

          return !existsInRoute && !isAlreadySelected;
        })
        .sort((left, right) => left.tradeName.localeCompare(right.tradeName, 'pt-BR'))
        .slice(0, 80),
    [customers, editingItemKey, selectedCustomerIds, sortedDraftItems],
  );

  const localCustomerMatches = useMemo(() => {
    if (!draft || !currentPromoterId) {
      return [];
    }

    const normalizedQuery = deferredQuickCustomerQuery.trim();

    if (!normalizedQuery) {
      return [];
    }

    return sortCustomersBySearchRelevance(customers, normalizedQuery, currentPromoterId).slice(
      0,
      60,
    );
  }, [currentPromoterId, customers, deferredQuickCustomerQuery, draft]);

  const matchingCustomers = useMemo(
    () =>
      sortCustomersBySearchRelevance(
        mergeCustomersById(localCustomerMatches, customerSearchResults)
        .filter((customer) => {
          const isAlreadySelected =
            selectedCustomerIds.includes(customer.id) &&
            (editingItemKey ? customer.id !== selectedCustomerIds[0] : true);
          const existsInRoute = sortedDraftItems.some(
            (item) =>
              item.customerId === customer.id &&
              (editingItemKey ? item.draftKey !== editingItemKey : true),
          );

          return !existsInRoute && !isAlreadySelected;
        })
        ,
        deferredQuickCustomerQuery,
        currentPromoterId,
      ).slice(0, 60),
    [
      currentPromoterId,
      customerSearchResults,
      deferredQuickCustomerQuery,
      editingItemKey,
      localCustomerMatches,
      selectedCustomerIds,
      sortedDraftItems,
    ],
  );

  const customerPickerResults = useMemo(() => {
    const shouldFilter = customerPickerUsesQuery && deferredQuickCustomerQuery.trim().length > 0;
    return shouldFilter ? matchingCustomers : browseCustomers;
  }, [browseCustomers, customerPickerUsesQuery, deferredQuickCustomerQuery, matchingCustomers]);

  useEffect(() => {
    if (!draft || !currentPromoterId) {
      setCustomerSearchResults([]);
      setSearchingCustomers(false);
      setCustomerSearchError(null);
      return;
    }

    const normalizedQuery = deferredQuickCustomerQuery.trim();

    if (!normalizedQuery) {
      setCustomerSearchResults([]);
      setSearchingCustomers(false);
      setCustomerSearchError(null);
      return;
    }

    const requestId = customerSearchRequestRef.current + 1;
    customerSearchRequestRef.current = requestId;

    const timeoutId = window.setTimeout(async () => {
      try {
        setSearchingCustomers(true);
        setCustomerSearchError(null);

        const response = await getCustomers({
          page: 1,
          pageSize: 100,
          status: 'ACTIVE',
          search: normalizedQuery,
        });

        if (customerSearchRequestRef.current !== requestId) {
          return;
        }

        const items = response.items ?? [];
        setCustomers((current) => mergeCustomersById(current, items));
        setCustomerSearchResults(items);
      } catch (searchError) {
        if (customerSearchRequestRef.current !== requestId) {
          return;
        }

        setCustomerSearchResults([]);
        setCustomerSearchError(
          getErrorMessage(searchError, 'Nao foi possivel pesquisar os clientes agora.'),
        );
      } finally {
        if (customerSearchRequestRef.current === requestId) {
          setSearchingCustomers(false);
        }
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [currentPromoterId, deferredQuickCustomerQuery, draft]);

  useEffect(() => {
    if (!isCustomerPickerOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!customerPickerRef.current?.contains(event.target as Node)) {
        setIsCustomerPickerOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isCustomerPickerOpen]);

  const routeStatus = draft?.status ?? null;
  const lockedItemsCount = sortedDraftItems.filter((item) => item.locked).length;
  const urgentItemsCount = sortedDraftItems.filter((item) => item.priority === 'URGENT').length;

  const resetQuickAddForm = () => {
    setQuickItemDraft(createQuickRouteItemDraft());
    setQuickCustomerQuery('');
    setCustomerSearchResults([]);
    setSelectedCustomerIds([]);
    setCustomerSearchError(null);
    setEditingItemKey(null);
    setIsCustomerPickerOpen(false);
    setCustomerPickerUsesQuery(false);
  };

  const openDraft = (nextDraft: RouteEditorDraft | null, message?: string | null) => {
    setDraft(cloneDraft(nextDraft));
    setBaselineDraft(cloneDraft(nextDraft));
    resetQuickAddForm();
    setFormError(null);
    setFeedbackMessage(message ?? null);
    setSupportMessage(null);
  };

  const findExistingRoute = async (context: LookupContext): Promise<RoutePlanSummary | null> => {
    const response = await getRoutePlans({
      page: 1,
      pageSize: 20,
      promoterId: context.promoterId,
      view: 'DAILY',
      dateFrom: context.routeDate,
      dateTo: context.routeDate,
    });

    return (
      response.items?.find(
        (item) =>
          item.promoterId === context.promoterId &&
          toDateInput(item.routeDate) === context.routeDate,
      ) ?? null
    );
  };

  const loadExistingRoute = async () => {
    if (!lookupContext.promoterId || !lookupContext.routeDate) {
      setFormError('Selecione o promotor e a data antes de carregar o roteiro.');
      return;
    }

    try {
      setLoadingRoute(true);
      setFormError(null);
      setSupportMessage(null);
      setFeedbackMessage(null);

      const existingRoute = await findExistingRoute(lookupContext);

      if (!existingRoute?.id) {
        openDraft(null);
        setFormError('Nenhum roteiro foi encontrado para esse promotor nessa data.');
        return;
      }

      const detail = await getRoutePlan(existingRoute.id);
      openDraft(
        buildRouteDraftFromDetail(detail, user?.name ?? currentPromoter?.supervisorName ?? ''),
        'Roteiro carregado para edicao.',
      );
    } catch (loadError) {
      setFormError(getErrorMessage(loadError, 'Nao foi possivel carregar o roteiro.'));
    } finally {
      setLoadingRoute(false);
    }
  };

  const createNewRouteDraft = async () => {
    if (!lookupContext.promoterId || !lookupContext.routeDate) {
      setFormError('Selecione o promotor e a data antes de abrir um novo roteiro.');
      return;
    }

    try {
      setLoadingRoute(true);
      setFormError(null);
      setSupportMessage(null);
      setFeedbackMessage(null);

      const existingRoute = await findExistingRoute(lookupContext);

      if (existingRoute?.id) {
        setFormError('Ja existe um roteiro nessa data. Use Carregar roteiro para editar.');
        return;
      }

      const promoter = promoterById.get(lookupContext.promoterId);
      openDraft(
        createEmptyRouteDraft(lookupContext, promoter, user?.name),
        'Novo roteiro aberto em rascunho.',
      );
    } catch (loadError) {
      setFormError(getErrorMessage(loadError, 'Nao foi possivel abrir um novo roteiro.'));
    } finally {
      setLoadingRoute(false);
    }
  };

  const persistRoute = async (mode: 'save' | 'publish') => {
    if (!draft) {
      setFormError('Abra um roteiro antes de salvar ou publicar.');
      return;
    }

    const normalizedDraft: RouteEditorDraft = {
      ...draft,
      items: normalizeDraftItems(draft.items),
    };
    const previousPublicationSnapshot: PublishVerificationSnapshot = {
      id: normalizedDraft.id,
      status: normalizedDraft.status,
      version: normalizedDraft.version,
      publishedAt: normalizedDraft.publishedAt ?? null,
      updatedAt: normalizedDraft.updatedAt ?? null,
    };

    const payload = buildRoutePlanPayload(normalizedDraft, {
      status:
        mode === 'publish'
          ? 'DRAFT'
          : normalizedDraft.status === 'PUBLISHED'
            ? 'PUBLISHED'
            : 'DRAFT',
      publishNow: false,
    });

    const validationErrors = validateRoutePlanInput(payload);

    if (validationErrors.length > 0) {
      setFormError(validationErrors[0]);
      return;
    }

    try {
      if (mode === 'save') {
        setSaving(true);
      } else {
        setPublishing(true);
      }

      setFormError(null);
      setFeedbackMessage(null);
      setSupportMessage(null);

      let routeId = normalizedDraft.id;
      let persistedForPublish = false;

      if (mode === 'publish' && normalizedDraft.id && !hasUnsavedChanges) {
        const published = await publishRoutePlan(normalizedDraft.id);
        routeId = published.id;
      } else if (normalizedDraft.id) {
        const updated = await updateRoutePlan(normalizedDraft.id, payload);
        routeId = updated.id;
        persistedForPublish = mode === 'publish';
      } else {
        const created = await createRoutePlan(payload);
        routeId = created.id;
        persistedForPublish = mode === 'publish';
      }

      if (mode === 'publish' && persistedForPublish) {
        const published = await publishRoutePlan(routeId);
        routeId = published.id;
      }

      if (!routeId) {
        throw new Error('Roteiro salvo sem identificador valido.');
      }

      const detail = await getRoutePlan(routeId);

      if (
        mode === 'publish' &&
        !didPublishPersistInBackend(previousPublicationSnapshot, detail)
      ) {
        throw new Error(
          'A publicacao do roteiro nao foi confirmada no estado salvo pelo backend.',
        );
      }

      openDraft(
        buildRouteDraftFromDetail(detail, user?.name ?? currentPromoter?.supervisorName ?? ''),
        mode === 'publish' ? 'Roteiro publicado para o promotor.' : 'Roteiro salvo em rascunho.',
      );

      if (mode === 'save' && normalizedDraft.status === 'PUBLISHED') {
        setSupportMessage(
          'As alteracoes foram salvas. Publique novamente para enviar a nova versao ao promotor.',
        );
      }
    } catch (persistError) {
      if (mode === 'publish') {
        setSupportMessage(
          'Se as alteracoes ja tiverem sido salvas, tente publicar novamente para concluir o envio ao promotor.',
        );
      }
      setFormError(
        getErrorMessage(
          persistError,
          mode === 'publish'
            ? 'Nao foi possivel publicar o roteiro.'
            : 'Nao foi possivel salvar o roteiro.',
        ),
      );
    } finally {
      setSaving(false);
      setPublishing(false);
    }
  };

  const handleLookupPromoterChange = (value: string) => {
    setLookupContext((current) => ({
      ...current,
      promoterId: value,
    }));
    setFormError(null);
    setFeedbackMessage(null);
    setSupportMessage(null);
  };

  const handleLookupDateChange = (value: string) => {
    setLookupContext((current) => ({
      ...current,
      routeDate: value,
    }));
    setFormError(null);
    setFeedbackMessage(null);
    setSupportMessage(null);
  };

  const handleLoadRequested = () => {
    if (hasUnsavedChanges) {
      setConfirmState({ kind: 'load' });
      return;
    }

    void loadExistingRoute();
  };

  const handleNewRequested = () => {
    if (hasUnsavedChanges) {
      setConfirmState({ kind: 'new' });
      return;
    }

    void createNewRouteDraft();
  };

  const handleCancelRequested = () => {
    if (!hasUnsavedChanges) {
      resetQuickAddForm();
      return;
    }

    setConfirmState({ kind: 'cancel' });
  };

  const handleQuickCustomerSelect = (customer: CustomerSummary) => {
    setSelectedCustomerIds((current) => {
      if (editingItemKey) {
        return [customer.id];
      }

      return current.includes(customer.id) ? current : [...current, customer.id];
    });
    setQuickCustomerQuery(customer.tradeName);
    setIsCustomerPickerOpen(false);
    setCustomerPickerUsesQuery(false);
    setFormError(null);
  };

  const handleSelectedCustomerRemove = (customerId: string) => {
    setSelectedCustomerIds((current) => current.filter((item) => item !== customerId));
    setFormError(null);
  };

  const handleSelectedCustomersClear = () => {
    setSelectedCustomerIds([]);
    setQuickCustomerQuery('');
    setCustomerPickerUsesQuery(false);
    setFormError(null);
  };

  const handleAddCustomer = () => {
    if (!draft) {
      setFormError('Carregue ou crie um roteiro antes de adicionar clientes.');
      return;
    }

    if (selectedCustomerIds.length === 0) {
      setFormError('Selecione pelo menos um cliente para adicionar ao roteiro.');
      return;
    }

    if (editingItemKey) {
      if (selectedCustomerIds.length !== 1) {
        setFormError('Na edicao, selecione apenas um cliente.');
        return;
      }

      const customer = customerById.get(selectedCustomerIds[0]);

      if (!customer?.id) {
        setFormError('O cliente selecionado nao foi encontrado.');
        return;
      }

      const duplicatedCustomer = draft.items.some(
        (item) => item.customerId === customer.id && item.draftKey !== editingItemKey,
      );

      if (duplicatedCustomer) {
        setFormError('Esse cliente ja faz parte do roteiro atual.');
        return;
      }

      setDraft((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          items: normalizeDraftItems(
            current.items.map((item) =>
              item.draftKey === editingItemKey
                ? {
                    ...item,
                    customerId: customer.id,
                    customerName: customer.tradeName,
                    city: customer.city,
                    district: customer.district ?? '',
                    plannedTime: quickItemDraft.plannedTime,
                    priority: quickItemDraft.priority,
                    notes: quickItemDraft.notes,
                  }
                : item,
            ),
          ),
        };
      });

      resetQuickAddForm();
      setFormError(null);
      setFeedbackMessage('Cliente atualizado no roteiro.');
      return;
    }

    const selectedCustomers = selectedCustomerIds
      .map((customerId) => customerById.get(customerId) ?? null)
      .filter((customer): customer is CustomerSummary => Boolean(customer?.id));

    if (selectedCustomers.length !== selectedCustomerIds.length) {
      setFormError('Um ou mais clientes selecionados nao foram encontrados.');
      return;
    }

    const duplicatedCustomers = selectedCustomers.filter((customer) =>
      draft.items.some((item) => item.customerId === customer.id),
    );

    if (duplicatedCustomers.length > 0) {
      setFormError(`Esse cliente ja faz parte do roteiro atual: ${duplicatedCustomers[0].tradeName}.`);
      return;
    }

    setDraft((current) => {
      if (!current) {
        return current;
      }

      const nextItems = selectedCustomers.map((customer, index) =>
        buildDraftItem({
          draftKey: createLocalItemKey(),
          customerId: customer.id,
          customerName: customer.tradeName,
          city: customer.city,
          district: customer.district ?? '',
          sequence: current.items.length + index + 1,
          plannedTime: quickItemDraft.plannedTime,
          priority: quickItemDraft.priority,
          notes: quickItemDraft.notes,
          status: 'PLANNED',
          active: true,
          locked: false,
        }),
      );

      return {
        ...current,
        items: normalizeDraftItems([...current.items, ...nextItems]),
      };
    });
    resetQuickAddForm();
    setFormError(null);
    setFeedbackMessage(
      selectedCustomers.length === 1
        ? 'Cliente adicionado ao roteiro.'
        : `${selectedCustomers.length} clientes adicionados ao roteiro.`,
    );
  };

  const handleEditItem = (itemKey: string) => {
    const item = sortedDraftItems.find((entry) => entry.draftKey === itemKey);

    if (!item || item.locked) {
      return;
    }

    setEditingItemKey(item.draftKey);
    setQuickItemDraft({
      plannedTime: item.plannedTime,
      priority: item.priority,
      notes: item.notes,
    });
    setQuickCustomerQuery(item.customerName);
    setSelectedCustomerIds([item.customerId]);
    setCustomerSearchResults([]);
    setCustomerSearchError(null);
    setFormError(null);
    setFeedbackMessage(null);
  };

  const handleMoveItem = (itemKey: string, direction: 'up' | 'down') => {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const nextItems = normalizeDraftItems(current.items);
      const currentIndex = nextItems.findIndex((item) => item.draftKey === itemKey);
      const item = nextItems[currentIndex];

      if (!item || item.locked) {
        return current;
      }

      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      const targetItem = nextItems[targetIndex];

      if (targetIndex < 0 || targetIndex >= nextItems.length || targetItem?.locked) {
        return current;
      }

      [nextItems[currentIndex], nextItems[targetIndex]] = [nextItems[targetIndex], nextItems[currentIndex]];

      return {
        ...current,
        items: normalizeDraftItems(nextItems),
      };
    });

    setFeedbackMessage(null);
  };

  const handleRemoveItemRequested = (itemKey: string) => {
    setConfirmState({ kind: 'remove-item', itemKey });
  };

  const resolveConfirmAction = () => {
    if (!confirmState) {
      return;
    }

    const nextState = confirmState;
    setConfirmState(null);

    if (nextState.kind === 'load') {
      void loadExistingRoute();
      return;
    }

    if (nextState.kind === 'new') {
      void createNewRouteDraft();
      return;
    }

    if (nextState.kind === 'cancel') {
      setDraft(cloneDraft(baselineDraft));
      resetQuickAddForm();
      setFormError(null);
      setFeedbackMessage('Alteracoes descartadas.');
      setSupportMessage(null);
      return;
    }

    setDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        items: normalizeDraftItems(
          current.items.filter((item) => item.draftKey !== nextState.itemKey),
        ),
      };
    });

    if (editingItemKey === nextState.itemKey) {
      resetQuickAddForm();
    }

    setFormError(null);
    setFeedbackMessage('Cliente removido do roteiro.');
  };

  if (bootstrapping) {
    return (
      <PageContainer className="route-plans-simple-page">
        <LoadingState message="Preparando promotores e clientes para montagem do roteiro." />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer className="route-plans-simple-page">
        <ErrorState message={error} />
      </PageContainer>
    );
  }

  return (
    <PageContainer className="route-plans-simple-page">
      <PageHeader
        eyebrow="Roteirizacao"
        title="Roteiro diario do promotor"
        description="Selecione o promotor, escolha a data, monte a rota em uma lista simples e publique quando estiver pronto."
        meta={
          <div className="page-header-inline-metrics">
            <span className="info-chip info-chip-strong">
              {currentPromoter?.name ?? 'Promotor nao selecionado'}
            </span>
            <span className="info-chip">
              {lookupContext.routeDate || 'Sem data definida'}
            </span>
            <span className="info-chip">{getRouteStatusLabel(routeStatus)}</span>
          </div>
        }
      />

      <section className="stats-grid">
        <StatsCard
          label="Clientes na rota"
          value={sortedDraftItems.length}
          hint="Quantidade atual de paradas no roteiro em edicao."
        />
        <StatsCard
          label="Selecionados"
          value={selectedQuickCustomers.length}
          hint="Clientes marcados para adicionar ou substituir."
        />
        <StatsCard
          label="Itens bloqueados"
          value={lockedItemsCount}
          tone={lockedItemsCount > 0 ? 'warning' : 'default'}
          hint="Paradas com visita concluida ou indisponiveis para mover."
        />
        <StatsCard
          label="Publicacao"
          value={draft?.publishedAt ? formatDateTime(draft.publishedAt) : 'Nao publicado'}
          tone={draft?.publishedAt ? 'success' : hasUnsavedChanges ? 'warning' : 'default'}
          hint={
            needsRepublishNotice
              ? 'Ha alteracoes que ainda precisam ser republicadas.'
              : urgentItemsCount > 0
                ? `${urgentItemsCount} parada(s) urgente(s) na lista.`
                : 'Rascunho pronto para seguir o fluxo de publicacao.'
          }
        />
      </section>

      <ContentContainer className="route-plans-simple-stack">
        <SectionCard
          title="Contexto do roteiro"
          description="1. Selecione o promotor, escolha a data e carregue um roteiro existente ou abra um novo rascunho."
          actions={
            <HeaderActionBar className="route-plans-simple-header-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={handleLoadRequested}
                disabled={!lookupContext.promoterId || !lookupContext.routeDate || loadingRoute}
              >
                {loadingRoute ? 'Carregando...' : 'Carregar roteiro'}
              </button>
              <button
                className="button button-primary"
                type="button"
                onClick={handleNewRequested}
                disabled={!lookupContext.promoterId || !lookupContext.routeDate || loadingRoute}
              >
                Novo roteiro
              </button>
            </HeaderActionBar>
          }
        >
          <SectionContainer className="route-plans-simple-message-stack">
            {formError ? (
              <NoticeCard
                tone="danger"
                title="Nao foi possivel concluir a acao."
                description={formError}
              />
            ) : null}

            {feedbackMessage ? (
              <NoticeCard tone="success" title="Fluxo atualizado." description={feedbackMessage} />
            ) : null}

            {supportMessage ? (
              <NoticeCard tone="warning" title="Atencao operacional." description={supportMessage} />
            ) : null}

            {hasUnsavedChanges ? (
              <NoticeCard
                tone="warning"
                title="Ha alteracoes nao salvas."
                description="Revise a lista e use Salvar rascunho ou Publicar roteiro antes de sair da tela."
              />
            ) : null}

            {needsRepublishNotice ? (
              <NoticeCard
                tone="warning"
                title="Esse roteiro ja foi publicado."
                description="Depois de salvar as alteracoes, publique novamente para enviar a versao atual ao promotor."
              />
            ) : null}
          </SectionContainer>

          <SectionContainer className="route-plans-simple-form-stack">
            <FormField label="Promotor">
              <select
                className="input"
                value={lookupContext.promoterId}
                onChange={(event) => handleLookupPromoterChange(event.target.value)}
              >
                <option value="">Selecione um promotor</option>
                {(promoters ?? []).map((promoter) => (
                  <option key={promoter.id} value={promoter.id}>
                    {promoter.name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Data do roteiro">
              <input
                className="input"
                type="date"
                value={lookupContext.routeDate}
                onChange={(event) => handleLookupDateChange(event.target.value)}
              />
            </FormField>

            <FormField label="Status do roteiro">
              <div className="route-plans-simple-status">
                <span className={getRouteStatusBadgeClassName(routeStatus)}>
                  {getRouteStatusLabel(routeStatus)}
                </span>
                {draft?.updatedAt ? (
                  <span className="hint">
                    Ultima atualizacao em {formatDateTime(draft.updatedAt)}
                  </span>
                ) : (
                    <span className="hint">Nenhum roteiro carregado para esse contexto.</span>
                  )}
              </div>
            </FormField>
          </SectionContainer>
        </SectionCard>

        <SectionCard
          title="Adicionar cliente"
          description="2. Pesquise clientes cadastrados, selecione um ou varios e adicione todos na rota atual."
        >
          <SectionContainer className="route-plans-simple-form-stack">
            <FormField
              label="Cliente"
              hint={
                currentPromoterId
                  ? 'Digite nome fantasia, razao social, codigo ou CNPJ. A busca prioriza codigo, CNPJ e clientes mais aderentes ao promotor selecionado.'
                  : 'Selecione o promotor e abra um roteiro para buscar clientes.'
              }
            >
              <div className="route-plans-simple-combobox" ref={customerPickerRef}>
                <div className="route-plans-simple-combobox-input">
                  <input
                    className="input"
                    type="search"
                    placeholder="Clique para ver clientes ou digite para filtrar"
                    value={quickCustomerQuery}
                    onFocus={() => {
                      if (!draft) {
                        return;
                      }

                      setIsCustomerPickerOpen(true);
                      setCustomerPickerUsesQuery(false);
                    }}
                    onClick={() => {
                      if (!draft) {
                        return;
                      }

                      setIsCustomerPickerOpen(true);
                      setCustomerPickerUsesQuery(false);
                    }}
                    onChange={(event) => {
                      setQuickCustomerQuery(event.target.value);
                      setCustomerPickerUsesQuery(true);
                      setIsCustomerPickerOpen(true);
                    }}
                    disabled={!draft}
                  />
                  {quickCustomerQuery || selectedCustomerIds.length > 0 ? (
                    <button
                      className="button button-secondary"
                      type="button"
                      onClick={() => {
                        setQuickCustomerQuery('');
                        setSelectedCustomerIds([]);
                        setCustomerPickerUsesQuery(false);
                        setIsCustomerPickerOpen(true);
                        setFormError(null);
                      }}
                    >
                      Limpar
                    </button>
                  ) : null}
                </div>

                {draft && isCustomerPickerOpen ? (
                  <div className="route-plans-simple-customer-dropdown">
                    <div className="route-plans-simple-search-results-header">
                      <div className="stack">
                        <strong>
                          {customerPickerUsesQuery && deferredQuickCustomerQuery.trim()
                            ? 'Resultados filtrados'
                            : 'Clientes ativos cadastrados'}
                        </strong>
                        <span className="hint">
                          {customerPickerUsesQuery && deferredQuickCustomerQuery.trim()
                            ? `${customerPickerResults.length} cliente(s) encontrado(s).`
                            : 'Role a lista ou comece a digitar para filtrar por nome, codigo ou CNPJ.'}
                        </span>
                      </div>
                      {searchingCustomers && customerPickerUsesQuery ? (
                        <span className="hint">Atualizando no banco...</span>
                      ) : null}
                    </div>

                    {customerSearchError && customerPickerUsesQuery ? (
                      <NoticeCard
                        tone="danger"
                        title="Nao foi possivel pesquisar clientes."
                        description={customerSearchError}
                      />
                    ) : null}

                    {customerPickerResults.length > 0 ? (
                      <div className="route-plans-simple-search-results route-plans-simple-search-results-scroll">
                        {customerPickerResults.map((customer) => {
                          const isSelected = selectedCustomerIds.includes(customer.id);

                          return (
                            <button
                              key={customer.id}
                              className={`route-plans-simple-search-result${
                                isSelected
                                  ? ' route-plans-simple-search-result-selected'
                                  : ''
                              }`}
                              type="button"
                              aria-label={`Selecionar ${customer.tradeName}`}
                              onClick={() => handleQuickCustomerSelect(customer)}
                            >
                              <div className="route-plans-simple-search-result-copy">
                                <div className="route-plans-simple-search-result-head">
                                  <strong>{customer.tradeName}</strong>
                                  <div className="route-plans-simple-search-result-badges">
                                    {customer.defaultPromoterUserId === currentPromoterId ? (
                                      <span className="badge badge-completed">
                                        Promotor padrao
                                      </span>
                                    ) : null}
                                    {isSelected ? (
                                      <span className="badge badge-in-progress">Selecionado</span>
                                    ) : null}
                                  </div>
                                </div>
                                {customer.legalName !== customer.tradeName ? (
                                  <span className="hint">{customer.legalName}</span>
                                ) : null}
                                <span className="route-plans-simple-search-meta">
                                  {getCustomerCodeLabel(customer)} •{' '}
                                  {buildCustomerLocationLabel(customer)}
                                </span>
                                <span className="hint">
                                  CNPJ: {getCustomerDocumentLabel(customer)}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="hint">Nenhum cliente encontrado para esse filtro.</p>
                    )}
                  </div>
                ) : null}
              </div>
            </FormField>

            <FormField label="Horario previsto">
              <input
                className="input"
                type="time"
                value={quickItemDraft.plannedTime}
                onChange={(event) =>
                  setQuickItemDraft((current) => ({
                    ...current,
                    plannedTime: event.target.value,
                  }))
                }
                disabled={!draft}
              />
            </FormField>

            <FormField label="Prioridade">
              <select
                className="input"
                value={quickItemDraft.priority}
                onChange={(event) =>
                  setQuickItemDraft((current) => ({
                    ...current,
                    priority: event.target.value as RoutePriority,
                  }))
                }
                disabled={!draft}
              >
                {priorityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Observacao">
              <textarea
                className="input"
                rows={3}
                value={quickItemDraft.notes}
                onChange={(event) =>
                  setQuickItemDraft((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder="Observacao opcional para o promotor."
                disabled={!draft}
              />
            </FormField>
          </SectionContainer>

          <SectionContainer className="route-plans-simple-customer-picker">
            {!draft ? (
              <p className="hint">Abra um roteiro para habilitar a adicao de clientes.</p>
            ) : (
              <>
                <div className="route-plans-simple-picker-copy">
                  <p className="hint">
                    {editingItemKey
                      ? 'Selecione somente um cliente para substituir o item em edicao.'
                      : 'Marque um ou varios clientes abaixo e depois use Adicionar selecionados a rota.'}
                  </p>
                </div>

                {selectedQuickCustomers.length > 0 ? (
                  <div className="route-plans-simple-selected-customers">
                    <div className="route-plans-simple-search-results-header">
                      <div className="stack">
                        <strong>
                          {editingItemKey
                            ? 'Cliente selecionado para edicao'
                            : 'Clientes selecionados'}
                        </strong>
                        <span className="hint">
                          {editingItemKey
                            ? 'Revise o cliente escolhido antes de salvar a alteracao.'
                            : `${selectedQuickCustomers.length} cliente(s) pronto(s) para entrar na rota.`}
                        </span>
                      </div>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={handleSelectedCustomersClear}
                      >
                        Limpar selecao
                      </button>
                    </div>

                    <div className="route-plans-simple-selection-list">
                      {selectedQuickCustomers.map((customer) => (
                        <div
                          key={customer.id}
                          className="route-plans-simple-selection-chip"
                        >
                          <div className="route-plans-simple-selection-chip-copy">
                            <strong>{customer.tradeName}</strong>
                            {customer.legalName !== customer.tradeName ? (
                              <span className="hint">{customer.legalName}</span>
                            ) : null}
                            <span className="route-plans-simple-search-meta">
                              Codigo: {getCustomerCodeLabel(customer)} - CNPJ:{' '}
                              {getCustomerDocumentLabel(customer)}
                            </span>
                            <span className="hint">
                              {buildCustomerLocationLabel(customer)}
                            </span>
                          </div>
                          <button
                            className="button button-secondary"
                            type="button"
                            onClick={() => handleSelectedCustomerRemove(customer.id)}
                            aria-label={`Remover ${customer.tradeName} da selecao`}
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {!isCustomerPickerOpen ? (
                  <p className="hint">
                    Clique no campo Cliente para abrir a lista de clientes ativos ou digite para filtrar.
                  </p>
                ) : null}
              </>
            )}
          </SectionContainer>

          <HeaderActionBar className="route-plans-simple-inline-actions">
            {editingItemKey ? (
              <button
                className="button button-secondary"
                type="button"
                onClick={resetQuickAddForm}
              >
                Cancelar edicao
              </button>
            ) : null}
            <button
              className="button button-primary"
              type="button"
              onClick={handleAddCustomer}
              disabled={
                !draft ||
                (editingItemKey
                  ? selectedCustomerIds.length !== 1
                  : selectedCustomerIds.length === 0)
              }
            >
              {editingItemKey ? 'Salvar cliente' : 'Adicionar selecionados a rota'}
            </button>
          </HeaderActionBar>
        </SectionCard>

        <SectionCard
          title="Lista da rota"
          description="3. Revise a ordem das visitas, ajuste o horario e remova o que nao deve seguir para o promotor."
        >
          {!draft ? (
            <EmptyState
              title="Nenhum roteiro em edicao"
              description="Selecione o promotor, escolha a data e use Carregar roteiro ou Novo roteiro para comecar."
            />
          ) : sortedDraftItems.length === 0 ? (
            <EmptyState
              title="Nenhum cliente na rota"
              description="Adicione clientes para montar a sequencia do dia."
            />
          ) : (
            <div className="route-plans-simple-route-list" role="list" aria-label="Clientes da rota">
              {sortedDraftItems.map((item) => {
                const movementState = buildMovementState(sortedDraftItems, item.draftKey);

                return (
                  <article
                    key={item.draftKey}
                    className={`route-plans-simple-route-item${
                      item.locked ? ' route-plans-simple-route-item-locked' : ''
                    }`}
                    role="listitem"
                  >
                    <header className="route-plans-simple-route-header">
                      <div className="route-plans-simple-route-head">
                        <span className="route-plans-simple-sequence">#{item.sequence}</span>
                        <span className="route-plans-simple-label">Sequencia</span>
                      </div>

                      <div className="route-plans-simple-route-title">
                        <span className="route-plans-simple-label">Cliente</span>
                        <strong className="route-plans-simple-route-customer">
                          {item.customerName}
                        </strong>
                      </div>

                      <div className="route-plans-simple-route-header-status">
                        {item.locked ? (
                          <span className="badge badge-partial">Item bloqueado</span>
                        ) : (
                          <span className="hint">Item em edicao</span>
                        )}
                      </div>
                    </header>

                    <div className="route-plans-simple-route-content">
                      <div className="route-plans-simple-route-facts">
                        <div className="route-plans-simple-route-fact">
                          <span className="route-plans-simple-label">Horario</span>
                          <strong>{item.plannedTime || 'Nao definido'}</strong>
                        </div>

                        <div className="route-plans-simple-route-fact">
                          <span className="route-plans-simple-label">Prioridade</span>
                          <span className={getPriorityBadgeClassName(item.priority)}>
                            {getPriorityLabel(item.priority)}
                          </span>
                        </div>

                        <div className="route-plans-simple-route-fact">
                          <span className="route-plans-simple-label">Local</span>
                          <strong>{buildCustomerLocationLabel(item)}</strong>
                        </div>
                      </div>

                      <div className="route-plans-simple-route-note-block">
                        <span className="route-plans-simple-label">Observacao</span>
                        <p className="route-plans-simple-route-note">
                          {item.notes?.trim() || 'Sem observacao.'}
                        </p>
                      </div>
                    </div>

                    <div className="route-plans-simple-route-actions">
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => handleMoveItem(item.draftKey, 'up')}
                        disabled={!movementState.canMoveUp}
                      >
                        Subir
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => handleMoveItem(item.draftKey, 'down')}
                        disabled={!movementState.canMoveDown}
                      >
                        Descer
                      </button>
                      <button
                        className="button button-secondary"
                        type="button"
                        onClick={() => handleEditItem(item.draftKey)}
                        disabled={item.locked}
                      >
                        Editar
                      </button>
                      <button
                        className="button button-danger"
                        type="button"
                        onClick={() => handleRemoveItemRequested(item.draftKey)}
                        disabled={item.locked}
                      >
                        Excluir
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Acoes finais"
          description="4. Quando a rota estiver pronta, salve o rascunho ou publique a versao final para o promotor."
        >
          <FooterActionBar className="route-plans-simple-footer-actions" stickyOnMobile>
            <button className="button button-secondary" type="button" onClick={handleCancelRequested}>
              Cancelar alteracoes
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void persistRoute('save')}
              disabled={!draft || saving || publishing}
            >
              {saving ? 'Salvando...' : 'Salvar rascunho'}
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={() => void persistRoute('publish')}
              disabled={!draft || saving || publishing}
            >
              {publishing ? 'Publicando...' : 'Publicar roteiro'}
            </button>
          </FooterActionBar>
        </SectionCard>
      </ContentContainer>

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={
          confirmState?.kind === 'remove-item'
            ? 'Remover cliente da rota'
            : 'Descartar alteracoes'
        }
        description={
          confirmState?.kind === 'remove-item'
            ? 'Esse cliente sera retirado da lista atual do roteiro. Deseja continuar?'
            : 'Existem alteracoes nao salvas. Deseja descartar e seguir com a nova acao?'
        }
        confirmLabel={confirmState?.kind === 'remove-item' ? 'Remover cliente' : 'Descartar'}
        onCancel={() => setConfirmState(null)}
        onConfirm={resolveConfirmAction}
      />
    </PageContainer>
  );
}
