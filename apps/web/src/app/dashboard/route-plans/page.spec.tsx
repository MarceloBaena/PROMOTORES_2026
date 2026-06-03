import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RoutePlansPage from './page';
import { didPublishPersistInBackend } from '@/features/route-plans/supervisor-route-plans-page';

const apiMocks = vi.hoisted(() => ({
  getPromoters: vi.fn(),
  getCustomers: vi.fn(),
  getRoutePlans: vi.fn(),
  getRoutePlan: vi.fn(),
  createRoutePlan: vi.fn(),
  updateRoutePlan: vi.fn(),
  publishRoutePlan: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');

  return {
    ...actual,
    ...apiMocks,
  };
});

const promoterResponse = {
  page: 1,
  pageSize: 100,
  total: 1,
  items: [
    {
      id: 'promoter-1',
      name: 'Promotor Centro',
      email: 'promotor.centro@formula.local',
      employeeCode: 'PROM-001',
      active: true,
      supervisorId: 'supervisor-1',
      supervisorName: 'Supervisor Operacional',
      hasActiveJourney: false,
      hasRoutePlanToday: false,
      latestJourneyStartedAt: null,
    },
  ],
};

const buildCustomer = (
  index: number,
  overrides: Partial<{
    tradeName: string;
    legalName: string;
    cnpj: string;
    documentNumber: string;
    district: string;
    city: string;
    address: string;
  }> = {},
) => ({
  id: `customer-${index}`,
  customerCode: `C${String(index).padStart(3, '0')}`,
  code: `C${String(index).padStart(3, '0')}`,
  winthorCustomerCode: null,
  tradeName: overrides.tradeName ?? `Cliente ${index}`,
  legalName: overrides.legalName ?? `Cliente ${index} LTDA`,
  cnpj: overrides.cnpj ?? `${index}`.padStart(14, '0'),
  documentNumber: overrides.documentNumber ?? `${index}`.padStart(14, '0'),
  contactName: null,
  phone: null,
  address: overrides.address ?? `Rua ${index}`,
  district: overrides.district ?? `Bairro ${index}`,
  city: overrides.city ?? 'Cuiaba',
  state: 'MT',
  latitude: -15.6 + index / 1000,
  longitude: -56.1 + index / 1000,
  geofenceRadiusM: 100,
  routeName: null,
  region: null,
  supervisorUserId: 'supervisor-1',
  supervisorName: 'Supervisor Operacional',
  defaultPromoterUserId: 'promoter-1',
  defaultPromoterName: 'Promotor Centro',
  status: 'ACTIVE',
  active: true,
  sourceType: 'MANUAL',
  lastSyncedAt: null,
  notes: null,
  routeStopsCount: 0,
  visitsCount: 0,
  schedules: [],
  createdAt: '2026-03-29T08:00:00.000Z',
  updatedAt: '2026-03-29T08:00:00.000Z',
});

const allCustomers = [
  buildCustomer(1, {
    tradeName: 'Cliente Centro',
    legalName: 'Cliente Centro LTDA',
    cnpj: '11222333000199',
    documentNumber: '11222333000199',
    district: 'Centro',
    city: 'Cuiaba',
    address: 'Rua A',
  }),
  buildCustomer(20, {
    tradeName: 'C002 Conveniencia Express',
    legalName: 'C002 Conveniencia Express LTDA',
    cnpj: '99888777000166',
    documentNumber: '99888777000166',
    district: 'Centro Norte',
    city: 'Cuiaba',
    address: 'Rua AA',
  }),
  buildCustomer(2, {
    tradeName: 'Mercado Norte',
    legalName: 'Mercado Norte LTDA',
    cnpj: '22333444000155',
    documentNumber: '22333444000155',
    district: 'CPA',
    city: 'Cuiaba',
    address: 'Rua B',
  }),
  buildCustomer(3, {
    tradeName: 'Atacado Sul',
    legalName: 'Atacado Sul Distribuidora',
    cnpj: '33444555000166',
    documentNumber: '33444555000166',
    district: 'Jardim Europa',
    city: 'Varzea Grande',
    address: 'Rua C',
  }),
  ...Array.from({ length: 7 }, (_, index) => buildCustomer(index + 4)),
];

const buildCustomersResponse = (items = allCustomers, pageSize = 500) => ({
  page: 1,
  pageSize,
  total: items.length,
  items,
});

const routeDetailResponse = {
  id: 'route-plan-1',
  routeDate: '2026-03-29T00:00:00.000Z',
  planningView: 'DAILY',
  version: 1,
  publishedAt: null,
  updatedAt: '2026-03-29T08:10:00.000Z',
  template: null,
  promoter: {
    id: 'promoter-1',
    name: 'Promotor Centro',
    email: 'promotor.centro@formula.local',
    employeeCode: 'PROM-001',
  },
  status: 'DRAFT',
  notes: null,
  nextInstruction: 'Siga para Cliente Centro.',
  stops: [
    {
      id: 'stop-1',
      active: true,
      customerId: 'customer-1',
      customerName: 'Cliente Centro',
      address: 'Rua A',
      city: 'Cuiaba',
      state: 'MT',
      latitude: -15.6,
      longitude: -56.1,
      geofenceRadiusM: 100,
      sequence: 1,
      priority: 'NORMAL',
      plannedStartAt: '2026-03-29T09:00:00.000Z',
      plannedEndAt: null,
      status: 'PLANNED',
      notes: 'Levar material de degustacao.',
      visitId: null,
      completionStatus: null,
      checkInAt: null,
      checkOutAt: null,
      cancelledAt: null,
      cancellationReason: null,
      cancelledBy: null,
    },
  ],
};

const publishedRouteDetailResponse = {
  ...routeDetailResponse,
  status: 'PUBLISHED',
  publishedAt: '2026-03-29T08:20:00.000Z',
  updatedAt: '2026-03-29T08:20:00.000Z',
};

describe('RoutePlansPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    apiMocks.getPromoters.mockResolvedValue(promoterResponse);
    apiMocks.getCustomers.mockImplementation(
      async (query: { search?: string; status?: string; pageSize?: number } = {}) => {
        const rawSearch = query.search?.trim().toLowerCase() ?? '';
        const normalizedDigits = rawSearch.replace(/\D/g, '');

        const filteredItems = allCustomers.filter((customer) => {
          if (query.status && customer.status !== query.status) {
            return false;
          }

          if (!rawSearch) {
            return true;
          }

          const matchesText = [
            customer.tradeName,
            customer.legalName,
            customer.customerCode,
            customer.code,
          ].some((value) => value.toLowerCase().includes(rawSearch));

          const matchesDocument =
            normalizedDigits.length > 0 &&
            (customer.cnpj ?? customer.documentNumber ?? '')
              .replace(/\D/g, '')
              .includes(normalizedDigits);

          return matchesText || matchesDocument;
        });

        return buildCustomersResponse(filteredItems, query.pageSize ?? 500);
      },
    );
    apiMocks.getRoutePlans.mockResolvedValue({
      page: 1,
      pageSize: 20,
      total: 0,
      view: 'DAILY',
      dateFrom: '2026-03-29T00:00:00.000Z',
      dateTo: '2026-03-29T23:59:59.999Z',
      items: [],
    });
    apiMocks.createRoutePlan.mockResolvedValue({ id: 'route-plan-1' });
    apiMocks.updateRoutePlan.mockResolvedValue({ id: 'route-plan-1' });
    apiMocks.publishRoutePlan.mockResolvedValue({ id: 'route-plan-1' });
    apiMocks.getRoutePlan.mockResolvedValue(routeDetailResponse);
  });

  it('renderiza a tela simplificada com os quatro blocos principais do supervisor', async () => {
    render(<RoutePlansPage />);

    await waitFor(() => {
      expect(apiMocks.getPromoters).toHaveBeenCalledTimes(1);
    });
    expect(apiMocks.getCustomers).toHaveBeenCalledWith({
      page: 1,
      pageSize: 500,
      status: 'ACTIVE',
    });

    expect(screen.getByRole('heading', { name: 'Contexto do roteiro' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Adicionar cliente' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Lista da rota' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Acoes finais' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Carregar roteiro' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Novo roteiro' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Adicionar selecionados a rota' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancelar alteracoes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publicar roteiro' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('pesquisa clientes cadastrados por nome, codigo e CNPJ', async () => {
    render(<RoutePlansPage />);

    await waitFor(() => {
      expect(apiMocks.getPromoters).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Novo roteiro' }));

    await waitFor(() => {
      expect(apiMocks.getRoutePlans).toHaveBeenCalledTimes(1);
    });

    const searchInput = screen.getByRole('searchbox', { name: /Cliente/i });

    fireEvent.focus(searchInput);

    expect(await screen.findByRole('button', { name: /Selecionar Cliente Centro/i })).toBeTruthy();

    fireEvent.change(searchInput, {
      target: { value: 'Cliente Centro' },
    });

    await waitFor(() => {
      expect(apiMocks.getCustomers).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 100,
          status: 'ACTIVE',
          search: 'Cliente Centro',
        }),
      );
    });

    expect(await screen.findByRole('button', { name: /Selecionar Cliente Centro/i })).toBeTruthy();

    fireEvent.change(searchInput, {
      target: { value: 'C002' },
    });

    await waitFor(() => {
      expect(apiMocks.getCustomers).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 100,
          status: 'ACTIVE',
          search: 'C002',
        }),
      );
    });

    expect(await screen.findByRole('button', { name: /Selecionar Mercado Norte/i })).toBeTruthy();

    fireEvent.change(searchInput, {
      target: { value: '33444555000166' },
    });

    await waitFor(() => {
      expect(apiMocks.getCustomers).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          pageSize: 100,
          status: 'ACTIVE',
          search: '33444555000166',
        }),
      );
    });

    expect(await screen.findByRole('button', { name: /Selecionar Atacado Sul/i })).toBeTruthy();
  });

  it('prioriza resultados exatos de codigo acima de correspondencias parciais', async () => {
    const { container } = render(<RoutePlansPage />);

    await waitFor(() => {
      expect(apiMocks.getPromoters).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Novo roteiro' }));

    await waitFor(() => {
      expect(apiMocks.getRoutePlans).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByRole('searchbox', { name: /Cliente/i }), {
      target: { value: 'C002' },
    });

    await waitFor(() => {
      expect(
        container.querySelectorAll('.route-plans-simple-search-result').length,
      ).toBeGreaterThan(1);
    });

    const searchResults = Array.from(
      container.querySelectorAll('.route-plans-simple-search-result'),
    ).map((element) => element.textContent ?? '');

    expect(searchResults[0]).toContain('Mercado Norte');
    expect(searchResults[1]).toContain('C002 Conveniencia Express');
  });

  it('permite selecionar um ou varios clientes e adicionar todos a rota', async () => {
    render(<RoutePlansPage />);

    await waitFor(() => {
      expect(apiMocks.getPromoters).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Novo roteiro' }));

    await waitFor(() => {
      expect(apiMocks.getRoutePlans).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('Novo roteiro aberto em rascunho.')).toBeTruthy();

    const searchInput = screen.getByRole('searchbox', { name: /Cliente/i });

    fireEvent.focus(searchInput);
    fireEvent.click(await screen.findByRole('button', { name: /Selecionar Cliente Centro/i }));
    fireEvent.focus(searchInput);
    fireEvent.change(searchInput, {
      target: { value: 'Mercado Norte' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /Selecionar Mercado Norte/i }));

    expect(screen.getByText('Clientes selecionados')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Remover Cliente Centro da selecao/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Remover Mercado Norte da selecao/i })).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Horario previsto/i), {
      target: { value: '09:00' },
    });

    fireEvent.change(screen.getByLabelText(/Observacao/i), {
      target: { value: 'Levar material de degustacao.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar selecionados a rota' }));

    expect(screen.getByText('#1')).toBeTruthy();
    expect(screen.getByText('#2')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Clientes da rota' })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getAllByText('Cliente').length).toBeGreaterThan(0);
    expect(screen.getByText('Cliente Centro')).toBeTruthy();
    expect(screen.getByText('Mercado Norte')).toBeTruthy();
    expect((searchInput as HTMLInputElement).value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));

    await waitFor(() => {
      expect(apiMocks.createRoutePlan).toHaveBeenCalledTimes(1);
    });

    expect(apiMocks.createRoutePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        routeDate: expect.any(String),
        promoterId: 'promoter-1',
        planningView: 'DAILY',
        status: 'DRAFT',
        publishNow: false,
        items: [
          expect.objectContaining({
            customerId: 'customer-1',
            sequence: 1,
            priority: 'NORMAL',
            notes: 'Levar material de degustacao.',
            plannedStartAt: expect.any(String),
          }),
          expect.objectContaining({
            customerId: 'customer-2',
            sequence: 2,
            priority: 'NORMAL',
            notes: 'Levar material de degustacao.',
            plannedStartAt: expect.any(String),
          }),
        ],
      }),
    );

    await waitFor(() => {
      expect(apiMocks.getRoutePlan).toHaveBeenCalledWith('route-plan-1');
    });
  }, 15000);

  it('mantem a lista da rota estavel ao renderizar varios clientes empilhados', async () => {
    render(<RoutePlansPage />);

    await waitFor(() => {
      expect(apiMocks.getPromoters).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Novo roteiro' }));

    await waitFor(() => {
      expect(apiMocks.getRoutePlans).toHaveBeenCalledTimes(1);
    });

    const searchInput = screen.getByRole('searchbox', { name: /Cliente/i });
    fireEvent.focus(searchInput);

    for (let index = 0; index < 10; index += 1) {
      const [nextButton] = await screen.findAllByRole('button', { name: /Selecionar /i });
      fireEvent.click(nextButton);
      fireEvent.focus(searchInput);
    }

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar selecionados a rota' }));

    const routeList = screen.getByRole('list', { name: 'Clientes da rota' });
    const routeItems = screen.getAllByRole('listitem');

    expect(routeList).toBeTruthy();
    expect(routeItems).toHaveLength(10);
    expect(screen.getByText('#10')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Excluir' })).toHaveLength(10);
  }, 15000);

  it('so considera sucesso de publicacao quando o backend devolve estado realmente repersistido', () => {
    expect(
      didPublishPersistInBackend(
        {
          id: 'route-plan-1',
          status: 'PUBLISHED',
          version: 5,
          publishedAt: '2026-04-05T11:21:28.449Z',
          updatedAt: '2026-04-05T11:21:28.451Z',
        },
        {
          status: 'PUBLISHED',
          version: 5,
          publishedAt: '2026-04-05T11:21:28.449Z',
          updatedAt: '2026-04-05T11:21:28.451Z',
        },
      ),
    ).toBe(false);

    expect(
      didPublishPersistInBackend(
        {
          id: 'route-plan-1',
          status: 'PUBLISHED',
          version: 5,
          publishedAt: '2026-04-05T11:21:28.449Z',
          updatedAt: '2026-04-05T11:21:28.451Z',
        },
        {
          status: 'PUBLISHED',
          version: 6,
          publishedAt: '2026-04-05T11:25:00.000Z',
          updatedAt: '2026-04-05T11:25:00.100Z',
        },
      ),
    ).toBe(true);
  });

  it('publica o roteiro pelo endpoint dedicado e confirma status publicado antes de mostrar sucesso', async () => {
    apiMocks.getRoutePlan.mockResolvedValueOnce(publishedRouteDetailResponse);

    render(<RoutePlansPage />);

    await waitFor(() => {
      expect(apiMocks.getPromoters).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Novo roteiro' }));

    await waitFor(() => {
      expect(apiMocks.getRoutePlans).toHaveBeenCalledTimes(1);
    });

    const searchInput = screen.getByRole('searchbox', { name: /Cliente/i });
    fireEvent.focus(searchInput);
    fireEvent.click(await screen.findByRole('button', { name: /Selecionar Cliente Centro/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar selecionados a rota' }));

    fireEvent.click(screen.getByRole('button', { name: 'Publicar roteiro' }));

    await waitFor(() => {
      expect(apiMocks.createRoutePlan).toHaveBeenCalledTimes(1);
      expect(apiMocks.publishRoutePlan).toHaveBeenCalledWith('route-plan-1');
      expect(apiMocks.getRoutePlan).toHaveBeenCalledWith('route-plan-1');
    });

    expect(apiMocks.createRoutePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'DRAFT',
        publishNow: false,
      }),
    );

    expect(screen.getByText('Roteiro publicado para o promotor.')).toBeTruthy();
  });
});
