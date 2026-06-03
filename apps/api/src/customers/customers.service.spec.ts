import { BadRequestException } from '@nestjs/common';
import {
  CustomerImportBatchStatus,
  CustomerImportItemStatus,
  CustomerImportSourceType,
  CustomerSourceType,
  CustomerStatus,
  UserRole,
} from '@prisma/client';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  const userFindUniqueMock = jest.fn();
  const userFindFirstMock = jest.fn();
  const customerFindFirstMock = jest.fn();
  const customerFindManyMock = jest.fn();
  const customerCountMock = jest.fn();
  const customerCreateMock = jest.fn();
  const customerUpdateMock = jest.fn();
  const customerUpdateManyMock = jest.fn();
  const customerImportBatchCreateMock = jest.fn();
  const customerImportBatchUpdateMock = jest.fn();
  const customerImportBatchFindFirstMock = jest.fn();
  const customerImportBatchFindUniqueMock = jest.fn();
  const customerImportItemCreateManyMock = jest.fn();
  const customerImportItemUpdateMock = jest.fn();
  const customerImportItemCountMock = jest.fn();
  const promoterFindFirstMock = jest.fn();
  const auditRecordMock = jest.fn();
  const gatewayFetchCustomersMock = jest.fn();

  const prismaService: {
    user: Record<string, unknown>;
    customer: Record<string, unknown>;
    customerSchedule: Record<string, unknown>;
    customerImportBatch: Record<string, unknown>;
    customerImportItem: Record<string, unknown>;
    promoter: Record<string, unknown>;
    $transaction: jest.Mock;
  } = {
    user: {
      findUnique: userFindUniqueMock,
      findFirst: userFindFirstMock,
    },
    customer: {
      findFirst: customerFindFirstMock,
      findMany: customerFindManyMock,
      count: customerCountMock,
      create: customerCreateMock,
      update: customerUpdateMock,
      updateMany: customerUpdateManyMock,
    },
    customerSchedule: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    customerImportBatch: {
      create: customerImportBatchCreateMock,
      update: customerImportBatchUpdateMock,
      findFirst: customerImportBatchFindFirstMock,
      findUnique: customerImportBatchFindUniqueMock,
    },
    customerImportItem: {
      createMany: customerImportItemCreateManyMock,
      update: customerImportItemUpdateMock,
      count: customerImportItemCountMock,
    },
    promoter: {
      findFirst: promoterFindFirstMock,
    },
    $transaction: jest.fn(
      (
        input:
          | ((transaction: unknown) => unknown)
          | Array<Promise<unknown> | object | string | number | boolean | null>,
      ) => {
        if (typeof input === 'function') {
          return Promise.resolve(input(prismaService));
        }

        if (Array.isArray(input)) {
          return Promise.resolve(input);
        }

        return Promise.resolve(input);
      },
    ),
  };

  const auditService = {
    record: auditRecordMock,
  };

  const winthorGateway = {
    fetchCustomers: gatewayFetchCustomersMock,
  };

  let service: CustomersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CustomersService(
      prismaService as never,
      auditService as never,
      winthorGateway as never,
    );

    userFindUniqueMock.mockResolvedValue({
      id: 'admin-1',
      companyId: 'company-1',
      role: UserRole.ADMIN,
      region: 'Centro',
    });
    customerFindManyMock.mockResolvedValue([]);
    customerCountMock.mockResolvedValue(0);
    customerCreateMock.mockResolvedValue({ id: 'customer-created-1' });
    customerUpdateManyMock.mockResolvedValue({ count: 0 });
    customerImportItemCountMock.mockResolvedValue(0);
    customerImportItemCreateManyMock.mockResolvedValue({ count: 1 });
    customerImportItemUpdateMock.mockResolvedValue(undefined);
    customerImportBatchUpdateMock.mockResolvedValue(undefined);
    customerImportBatchFindUniqueMock.mockResolvedValue(null);
    auditRecordMock.mockResolvedValue(undefined);
    gatewayFetchCustomersMock.mockResolvedValue({
      records: [],
      adapter: 'disabled',
      unavailableReason: undefined,
    });
  });

  const buildExistingCustomer = (
    overrides?: Partial<Record<string, unknown>>,
  ) => ({
    id: 'customer-1',
    code: 'CLI-001',
    winthorCustomerCode: 'WTH-0001',
    cnpj: '11222333000101',
    tradeName: 'Supermercado Estrela',
    legalName: 'Estrela Comercio de Alimentos LTDA',
    address: 'Av. Presidente Medici',
    city: 'Rondonopolis',
    state: 'MT',
    latitude: -16.47,
    longitude: -54.63,
    geofenceRadiusM: 150,
    routeName: 'Rota Centro',
    region: 'Centro',
    supervisorUserId: 'supervisor-1',
    defaultPromoterUserId: null,
    contactName: 'Mariana',
    phone: '66992001001',
    email: 'mariana@estrela.local',
    zipCode: '78700000',
    addressNumber: '123',
    complement: null,
    district: 'Centro',
    stateRegistration: null,
    visitFrequency: null,
    preferredVisitDays: [],
    preferredVisitTimeStart: null,
    preferredVisitTimeEnd: null,
    notes: 'Cliente base',
    status: CustomerStatus.INACTIVE,
    active: false,
    sourceType: CustomerSourceType.MANUAL,
    lastSyncedAt: null,
    deletedAt: null,
    ...overrides,
  });

  type BatchCreateCall = [
    {
      data: {
        status: CustomerImportBatchStatus;
        readCount: number;
      };
    },
  ];

  type ItemCreateCall = [
    {
      data: Array<{
        status: CustomerImportItemStatus;
        rowNumber: number;
      }>;
    },
  ];

  it('impede supervisor de vincular cliente a outro supervisor', async () => {
    userFindUniqueMock.mockResolvedValue({
      id: 'supervisor-1',
      companyId: 'company-1',
      role: UserRole.SUPERVISOR,
      region: 'Centro',
    });

    await expect(
      service.createCustomer('supervisor-1', {
        code: 'CLI-100',
        legalName: 'Cliente Teste LTDA',
        tradeName: 'Cliente Teste',
        cnpj: '12345678000199',
        contactName: 'Contato Teste',
        phone: '66999990000',
        address: 'Rua A',
        district: 'Centro',
        city: 'Rondonopolis',
        state: 'MT',
        geofenceRadiusM: 150,
        routeName: 'Rota Centro',
        region: 'Centro',
        supervisorUserId: 'supervisor-2',
        notes: 'Cliente em teste',
        status: CustomerStatus.INACTIVE,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('permite ativacao de cliente sem coordenadas validas', async () => {
    customerFindFirstMock.mockResolvedValue({
      id: 'customer-1',
      companyId: 'company-1',
      code: 'CLI-001',
      tradeName: 'Cliente',
      legalName: 'Cliente LTDA',
      cnpj: '12345678000199',
      documentNumber: '12345678000199',
      stateRegistration: null,
      contactName: 'Contato',
      phone: '66999990000',
      email: null,
      zipCode: null,
      address: 'Rua A',
      addressNumber: null,
      complement: null,
      district: 'Centro',
      city: 'Rondonopolis',
      state: 'MT',
      latitude: 0,
      longitude: 0,
      geofenceRadiusM: 150,
      routeName: 'Rota Centro',
      region: 'Centro',
      supervisorUserId: 'supervisor-1',
      defaultPromoterUserId: null,
      visitFrequency: null,
      preferredVisitDays: [],
      preferredVisitTimeStart: null,
      preferredVisitTimeEnd: null,
      notes: null,
      sourceType: CustomerSourceType.MANUAL,
      importBatchId: null,
      importBatch: null,
      lastSyncedAt: null,
      status: CustomerStatus.INACTIVE,
      active: false,
      deletedAt: null,
      schedules: [],
      supervisorUser: null,
      defaultPromoterUser: null,
      _count: {
        routeStops: 0,
        visits: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    customerUpdateMock.mockResolvedValue({
      id: 'customer-1',
      status: CustomerStatus.ACTIVE,
      active: true,
      updatedAt: new Date('2026-04-04T12:00:00.000Z'),
    });

    await expect(
      service.updateCustomerStatus(
        'admin-1',
        'customer-1',
        CustomerStatus.ACTIVE,
      ),
    ).resolves.toMatchObject({
      id: 'customer-1',
      status: CustomerStatus.ACTIVE,
      active: true,
      archived: false,
    });

    expect(customerUpdateMock).toHaveBeenCalledWith({
      where: {
        id: 'customer-1',
      },
      data: {
        status: CustomerStatus.ACTIVE,
        active: true,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
        active: true,
        updatedAt: true,
      },
    });
  });

  it('reativa cliente restaurando status, active e elegibilidade de listagem', async () => {
    customerFindFirstMock.mockResolvedValue({
      id: 'customer-1',
      companyId: 'company-1',
      code: 'CLI-001',
      tradeName: 'Cliente Reativado',
      legalName: 'Cliente Reativado LTDA',
      cnpj: '12345678000199',
      documentNumber: '12345678000199',
      stateRegistration: null,
      contactName: 'Contato',
      phone: '66999990000',
      email: null,
      zipCode: null,
      address: 'Rua A',
      addressNumber: null,
      complement: null,
      district: 'Centro',
      city: 'Rondonopolis',
      state: 'MT',
      latitude: -16.4708,
      longitude: -54.6356,
      geofenceRadiusM: 150,
      routeName: 'Rota Centro',
      region: 'Centro',
      supervisorUserId: 'supervisor-1',
      defaultPromoterUserId: null,
      visitFrequency: null,
      preferredVisitDays: [],
      preferredVisitTimeStart: null,
      preferredVisitTimeEnd: null,
      notes: null,
      sourceType: CustomerSourceType.MANUAL,
      importBatchId: null,
      importBatch: null,
      lastSyncedAt: null,
      status: CustomerStatus.INACTIVE,
      active: false,
      deletedAt: new Date('2026-03-01T00:00:00.000Z'),
      schedules: [],
      supervisorUser: null,
      defaultPromoterUser: null,
      _count: {
        routeStops: 0,
        visits: 0,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    customerUpdateMock.mockResolvedValue({
      id: 'customer-1',
      status: CustomerStatus.ACTIVE,
      active: true,
      updatedAt: new Date('2026-03-31T10:00:00.000Z'),
    });
    customerFindManyMock.mockResolvedValue([
      {
        ...buildExistingCustomer({
          id: 'customer-1',
          tradeName: 'Cliente Reativado',
          legalName: 'Cliente Reativado LTDA',
          status: CustomerStatus.ACTIVE,
          active: true,
          deletedAt: null,
        }),
        schedules: [],
        supervisorUser: null,
        defaultPromoterUser: null,
        _count: {
          routeStops: 0,
          visits: 0,
        },
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: new Date('2026-03-31T10:00:00.000Z'),
      },
    ]);
    customerCountMock.mockResolvedValue(1);

    const result = await service.updateCustomerStatus(
      'admin-1',
      'customer-1',
      CustomerStatus.ACTIVE,
    );

    expect(result).toMatchObject({
      id: 'customer-1',
      status: CustomerStatus.ACTIVE,
      active: true,
      archived: false,
    });
    expect(customerUpdateMock).toHaveBeenCalledWith({
      where: {
        id: 'customer-1',
      },
      data: {
        status: CustomerStatus.ACTIVE,
        active: true,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
        active: true,
        updatedAt: true,
      },
    });

    await service.listCustomers('admin-1', {
      status: CustomerStatus.ACTIVE,
      page: 1,
      pageSize: 20,
    });

    const customerCountCall = customerCountMock.mock.calls[0] as [
      {
        where: Record<string, unknown>;
      },
    ];

    expect(customerCountCall).toBeDefined();
    const where = customerCountCall[0].where as {
      AND?: Array<Record<string, unknown>>;
    };

    expect(where.AND).toBeDefined();
    expect(where.AND).toContainEqual({
      companyId: 'company-1',
    });
    expect(where.AND).toContainEqual({
      status: CustomerStatus.ACTIVE,
      active: true,
      deletedAt: null,
    });
  });

  it('reativa em massa todos os clientes inativos do contexto com updateMany', async () => {
    customerCountMock.mockResolvedValueOnce(3).mockResolvedValueOnce(1);
    customerUpdateManyMock.mockResolvedValue({ count: 3 });

    const result = await service.activateAllInactiveCustomers('admin-1');

    expect(result).toMatchObject({
      foundCount: 3,
      reactivatedCount: 3,
      errorCount: 0,
      missingCoordinatesCount: 1,
    });
    expect(customerUpdateManyMock).toHaveBeenCalledWith({
      where: {
        AND: [
          {
            companyId: 'company-1',
          },
          {
            OR: [
              { status: CustomerStatus.INACTIVE },
              { active: false },
              { deletedAt: { not: null } },
            ],
          },
        ],
      },
      data: {
        status: CustomerStatus.ACTIVE,
        active: true,
        deletedAt: null,
      },
    });
    expect(auditRecordMock).toHaveBeenCalledWith(
      'admin-1',
      expect.anything(),
      'company-1',
      'customer.bulkActivateInactive',
      expect.objectContaining({
        foundCount: 3,
        reactivatedCount: 3,
        errorCount: 0,
        missingCoordinatesCount: 1,
      }),
    );
  });

  it('gera preview CSV com lote rastreavel e item ignorado', async () => {
    customerFindManyMock.mockResolvedValue([
      {
        id: 'customer-1',
        code: 'CLI-001',
        winthorCustomerCode: 'WTH-0001',
        cnpj: '11222333000101',
        tradeName: 'Supermercado Estrela',
        legalName: 'Estrela Comercio de Alimentos LTDA',
        address: 'Av. Presidente Medici',
        city: 'Rondonopolis',
        state: 'MT',
        latitude: -16.47,
        longitude: -54.63,
        geofenceRadiusM: 150,
        routeName: 'Rota Centro',
        region: 'Centro',
        supervisorUserId: 'supervisor-1',
        defaultPromoterUserId: null,
        contactName: 'Mariana',
        phone: '66992001001',
        email: null,
        zipCode: null,
        addressNumber: null,
        complement: null,
        district: 'Centro',
        stateRegistration: null,
        visitFrequency: null,
        preferredVisitDays: [],
        preferredVisitTimeStart: null,
        preferredVisitTimeEnd: null,
        notes: null,
        status: CustomerStatus.ACTIVE,
        active: true,
        sourceType: CustomerSourceType.MANUAL,
        lastSyncedAt: null,
        deletedAt: null,
      },
    ]);
    customerImportBatchCreateMock.mockResolvedValue({ id: 'batch-1' });
    customerImportBatchFindFirstMock.mockResolvedValue({
      id: 'batch-1',
      sourceType: CustomerImportSourceType.CSV,
      status: CustomerImportBatchStatus.PREVIEWED,
      applyChanges: false,
      readCount: 1,
      createdCount: 0,
      updatedCount: 0,
      ignoredCount: 1,
      errorCount: 0,
      logSummary:
        'CSV clientes.csv: preview com 0 criados, 0 atualizados, 1 ignorados e 0 com erro',
      requestedAt: new Date('2026-03-26T18:00:00.000Z'),
      finishedAt: new Date('2026-03-26T18:00:05.000Z'),
      actorUser: null,
      items: [
        {
          id: 'item-1',
          rowNumber: 2,
          status: CustomerImportItemStatus.IGNORE,
          customerId: 'customer-1',
          customerCode: 'CLI-001',
          winthorCustomerCode: 'WTH-0001',
          cnpj: '11222333000101',
          legalName: 'Estrela Comercio de Alimentos LTDA',
          tradeName: 'Supermercado Estrela',
          message:
            'Cliente ja existe e a atualizacao foi desabilitada para este lote',
          conflictKeys: ['customer_code'],
          rawPayload: { customer_code: 'CLI-001' },
          customer: {
            id: 'customer-1',
            code: 'CLI-001',
            tradeName: 'Supermercado Estrela',
          },
        },
      ],
    });

    const response = await service.importCustomersFromCsv(
      'admin-1',
      {
        apply: false,
        allowCreate: true,
        allowUpdate: false,
        ignoreDuplicates: true,
      },
      {
        originalname: 'clientes.csv',
        buffer: Buffer.from(
          'customer_code,legal_name,trade_name,address,city,state,cnpj\nCLI-001,Estrela Comercio de Alimentos LTDA,Supermercado Estrela,Av. Presidente Medici,Rondonopolis,MT,11.222.333/0001-01',
        ),
      },
    );

    const batchCreateCalls = customerImportBatchCreateMock.mock
      .calls as Array<BatchCreateCall>;
    const itemCreateCalls = customerImportItemCreateManyMock.mock
      .calls as Array<ItemCreateCall>;

    expect(batchCreateCalls[0]?.[0]).toMatchObject({
      data: {
        status: CustomerImportBatchStatus.PROCESSING,
        readCount: 1,
      },
    });
    const batchUpdateCalls = customerImportBatchUpdateMock.mock.calls as Array<
      [
        {
          where: { id: string };
          data: { status: CustomerImportBatchStatus };
        },
      ]
    >;

    expect(batchUpdateCalls[0]?.[0].where.id).toBe('batch-1');
    expect(batchUpdateCalls[0]?.[0].data.status).toBe(
      CustomerImportBatchStatus.QUEUED,
    );
    expect(itemCreateCalls[0]?.[0]).toMatchObject({
      data: [
        expect.objectContaining({
          status: CustomerImportItemStatus.STAGED,
          rowNumber: 2,
        }),
      ],
    });
    expect(response.status).toBe(CustomerImportBatchStatus.PREVIEWED);
    expect(response.previewItems[0]?.status).toBe(
      CustomerImportItemStatus.IGNORE,
    );
  });

  it('detecta CSV com virgula automaticamente e registra metadados do lote', async () => {
    customerImportBatchCreateMock.mockResolvedValue({ id: 'batch-auto' });
    customerImportBatchFindFirstMock.mockResolvedValue({
      id: 'batch-auto',
      sourceType: CustomerImportSourceType.CSV,
      status: CustomerImportBatchStatus.QUEUED,
      applyChanges: false,
      sourceReference: 'clientes-auto.csv',
      readCount: 1,
      createdCount: 0,
      updatedCount: 0,
      ignoredCount: 0,
      errorCount: 0,
      logSummary: 'CSV clientes-auto.csv: lote enfileirado',
      requestPayload: null,
      requestedAt: new Date('2026-03-31T10:00:00.000Z'),
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      attemptCount: 0,
      nextRetryAt: null,
      lastError: null,
      actorUser: null,
      items: [],
    });

    await service.importCustomersFromCsv(
      'admin-1',
      {
        apply: false,
        allowCreate: true,
        allowUpdate: true,
        ignoreDuplicates: true,
      },
      {
        originalname: 'clientes-auto.csv',
        buffer: Buffer.from(
          'customer_code,trade_name,address,city,state\nCLI-010,Mercado Delta,Rua A,Cuiaba,MT',
          'utf-8',
        ),
      },
    );

    const batchCreateCalls = customerImportBatchCreateMock.mock.calls as Array<
      [{ data: { requestPayload: unknown } }]
    >;
    const requestPayload = batchCreateCalls[0]?.[0].data.requestPayload as {
      csvMetadata?: {
        detectedDelimiter?: string | null;
        validRows?: number;
        invalidRows?: number;
        normalizedHeaders?: string[];
      };
      delimiter?: string | null;
    };

    expect(requestPayload.delimiter).toBeNull();
    expect(requestPayload.csvMetadata).toMatchObject({
      detectedDelimiter: ',',
      validRows: 1,
      invalidRows: 0,
      normalizedHeaders: [
        'customer_code',
        'trade_name',
        'address',
        'city',
        'state',
      ],
    });
  });

  it('sanitiza caracteres nulos antes de persistir o lote CSV', async () => {
    customerImportBatchCreateMock.mockResolvedValue({ id: 'batch-null-safe' });
    customerImportBatchFindFirstMock.mockResolvedValue({
      id: 'batch-null-safe',
      sourceType: CustomerImportSourceType.CSV,
      status: CustomerImportBatchStatus.QUEUED,
      applyChanges: false,
      sourceReference: 'clientes.csv',
      readCount: 1,
      createdCount: 0,
      updatedCount: 0,
      ignoredCount: 0,
      errorCount: 0,
      logSummary: 'CSV clientes.csv: lote enfileirado',
      requestPayload: null,
      requestedAt: new Date('2026-03-31T10:30:00.000Z'),
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      attemptCount: 0,
      nextRetryAt: null,
      lastError: null,
      actorUser: null,
      items: [],
    });

    const utf16Csv = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(
        'customer_code;trade_name;address;city;state\r\nCLI-011;Mercado Prisma;Rua A;Cuiaba;MT',
        'utf16le',
      ),
    ]);

    await service.importCustomersFromCsv(
      'admin-1',
      {
        apply: false,
        allowCreate: true,
        allowUpdate: true,
        ignoreDuplicates: true,
      },
      {
        originalname: 'clien\0tes.csv',
        buffer: utf16Csv,
      },
    );

    const batchCreateCalls = customerImportBatchCreateMock.mock.calls as Array<
      [
        {
          data: {
            sourceReference: string | null;
            requestPayload: {
              sourceReference?: string | null;
              csvMetadata?: {
                originalHeaders?: string[];
                normalizedHeaders?: string[];
              } | null;
            };
          };
        },
      ]
    >;
    const itemCreateCalls = customerImportItemCreateManyMock.mock
      .calls as Array<
      [
        {
          data: Array<{
            rawPayload: Record<string, string>;
          }>;
        },
      ]
    >;

    expect(batchCreateCalls[0]?.[0].data.sourceReference).toBe('clientes.csv');
    expect(batchCreateCalls[0]?.[0].data.requestPayload).toMatchObject({
      sourceReference: 'clientes.csv',
      csvMetadata: {
        originalHeaders: [
          'customer_code',
          'trade_name',
          'address',
          'city',
          'state',
        ],
        normalizedHeaders: [
          'customer_code',
          'trade_name',
          'address',
          'city',
          'state',
        ],
      },
    });
    expect(
      JSON.stringify(batchCreateCalls[0]?.[0].data.requestPayload),
    ).not.toContain('\\u0000');
    expect(
      JSON.stringify(itemCreateCalls[0]?.[0].data[0]?.rawPayload),
    ).not.toContain('\\u0000');
  });

  it('remove surrogate invalido do payload salvo em customerImportBatch.create', async () => {
    customerImportBatchCreateMock.mockResolvedValue({
      id: 'batch-surrogate-safe',
    });
    customerImportBatchFindFirstMock.mockResolvedValue({
      id: 'batch-surrogate-safe',
      sourceType: CustomerImportSourceType.CSV,
      status: CustomerImportBatchStatus.QUEUED,
      applyChanges: false,
      sourceReference: 'clientes.csv',
      readCount: 1,
      createdCount: 0,
      updatedCount: 0,
      ignoredCount: 0,
      errorCount: 0,
      logSummary: 'CSV clientes.csv: lote enfileirado',
      requestPayload: null,
      requestedAt: new Date('2026-04-04T10:30:00.000Z'),
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      attemptCount: 0,
      nextRetryAt: null,
      lastError: null,
      actorUser: null,
      items: [],
    });

    await service.importCustomersFromCsv(
      'admin-1',
      {
        apply: false,
        allowCreate: true,
        allowUpdate: true,
        ignoreDuplicates: true,
      },
      {
        originalname: 'clien\uD800tes.csv',
        buffer: Buffer.from(
          'customer_code;trade_name;address;city;state;trade_\uD800alias\r\nCLI-012;Mercado Omega;Rua A;Cuiaba;MT;teste\r\n',
          'utf-8',
        ),
      },
    );

    const batchCreateCalls = customerImportBatchCreateMock.mock.calls as Array<
      [
        {
          data: {
            sourceReference: string | null;
            requestPayload: Record<string, unknown>;
          };
        },
      ]
    >;
    const persistedPayload = batchCreateCalls[0]?.[0].data.requestPayload;

    expect(batchCreateCalls[0]?.[0].data.sourceReference).toBe('clientes.csv');
    expect(JSON.stringify(persistedPayload)).not.toContain('\\ud800');
    expect(JSON.stringify(persistedPayload)).not.toContain('\\udc00');
  });

  it('retorna erro claro quando o Prisma rejeita unicode invalido no batch', async () => {
    customerImportBatchCreateMock.mockRejectedValue(
      new Error('lone leading surrogate in hex escape at line 1 column 911'),
    );

    await expect(
      service.importCustomersFromCsv(
        'admin-1',
        {
          apply: false,
          allowCreate: true,
          allowUpdate: true,
          ignoreDuplicates: true,
        },
        {
          originalname: 'clientes.csv',
          buffer: Buffer.from(
            'customer_code;trade_name;address;city;state\r\nCLI-013;Mercado Sigma;Rua A;Cuiaba;MT\r\n',
            'utf-8',
          ),
        },
      ),
    ).rejects.toThrow(
      'Arquivo contem caracteres invalidos ou codificacao incompativel. Salve em UTF-8 e tente novamente.',
    );
  });

  it('diagnostica preview com layout incompatível de pedidos bloqueados', async () => {
    customerImportBatchCreateMock.mockResolvedValue({ id: 'batch-layout' });
    customerImportBatchFindFirstMock.mockResolvedValue({
      id: 'batch-layout',
      sourceType: CustomerImportSourceType.CSV,
      status: CustomerImportBatchStatus.PREVIEWED,
      applyChanges: false,
      sourceReference: 'pedidos-bloqueados.csv',
      readCount: 1,
      createdCount: 0,
      updatedCount: 0,
      ignoredCount: 0,
      errorCount: 1,
      logSummary:
        'CSV pedidos-bloqueados.csv: preview com 0 criados, 0 atualizados, 0 ignorados e 1 com erro',
      requestPayload: null,
      requestedAt: new Date('2026-03-31T10:40:00.000Z'),
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      attemptCount: 0,
      nextRetryAt: null,
      lastError: null,
      actorUser: null,
      items: [],
    });

    await service.importCustomersFromCsv(
      'admin-1',
      {
        apply: false,
        allowCreate: true,
        allowUpdate: true,
        ignoreDuplicates: true,
      },
      {
        originalname: 'pedidos-bloqueados.csv',
        buffer: Buffer.from(
          [
            'Pedido RCA;Data;Cliente;Condição Venda;Usuário;Usuário ERP;Valor;',
            '8000000182;27/03/2026;2123 - SUP AGUIAR;1;FRANCISCO;FRANCISCO ERP;R$ 2.308,49;',
          ].join('\n'),
          'utf-8',
        ),
      },
    );

    const batchCreateCalls = customerImportBatchCreateMock.mock.calls as Array<
      [{ data: { requestPayload: { csvMetadata?: Record<string, unknown> } } }]
    >;
    const itemCreateCalls = customerImportItemCreateManyMock.mock
      .calls as Array<
      [
        {
          data: Array<{
            message: string;
            rawPayload: Record<string, string>;
          }>;
        },
      ]
    >;
    const csvMetadata = batchCreateCalls[0]?.[0].data.requestPayload
      .csvMetadata as Record<string, unknown>;

    expect(csvMetadata).toMatchObject({
      recognizedHeaders: ['cliente'],
      unrecognizedHeaders: [
        'pedido_rca',
        'data',
        'condicao_venda',
        'usuario',
        'usuario_erp',
        'valor',
      ],
      missingRequiredHeaders: ['customer_code', 'city'],
      incompatibleLayout: true,
    });
    expect(itemCreateCalls[0]?.[0].data[0]?.rawPayload.cliente).toBe(
      '2123 - SUP AGUIAR',
    );
    expect(itemCreateCalls[0]?.[0].data[0]?.message).toContain(
      'O arquivo enviado nao corresponde ao layout de importacao de clientes.',
    );
  });

  it('retorna erro claro quando latitude ou longitude vierem em formato invalido', () => {
    const preparedRow = (
      service as unknown as {
        prepareCsvRow: (row: {
          rowNumber: number;
          values: Record<string, string>;
        }) => { errorMessage?: string };
      }
    ).prepareCsvRow({
      rowNumber: 2,
      values: {
        customer_code: 'CLI-020',
        trade_name: 'Mercado Coordenada',
        address: 'Rua A',
        city: 'Cuiaba',
        state: 'MT',
        latitude: '-15.677.733.999.549.100',
        longitude: '-5.809.380.399.241.410',
      },
    });

    expect(preparedRow.errorMessage).toBe(
      'Latitude invalida. Revise o formato numerico da coluna.',
    );
  });

  it('acumula erros por linha no CSV com validacoes de documento, email, horario e layout', () => {
    const preparedRow = (
      service as unknown as {
        prepareCsvRow: (row: {
          rowNumber: number;
          values: Record<string, string>;
          extraValues?: string[];
        }) => {
          issues?: string[];
          errorMessage?: string;
          payload?: Record<string, unknown>;
        };
      }
    ).prepareCsvRow({
      rowNumber: 2,
      extraValues: ['coluna inesperada'],
      values: {
        customer_code: 'CLI-030',
        trade_name: 'Cliente Invalido',
        city: 'Cuiaba',
        state: 'MATO',
        cnpj: '11222333000100',
        email: 'email-invalido',
        preferred_visit_time_start: '25:99',
        geofence_radius_m: '10',
      },
    });

    expect(preparedRow.payload).toBeUndefined();
    expect(preparedRow.errorMessage).toBe(
      'Linha possui 1 coluna(s) excedente(s) apos o cabecalho. Revise o layout do arquivo.',
    );
    expect(preparedRow.issues).toEqual(
      expect.arrayContaining([
        'Linha possui 1 coluna(s) excedente(s) apos o cabecalho. Revise o layout do arquivo.',
        'UF invalida',
        'CNPJ invalido. Digitos verificadores nao conferem.',
        'Email invalido',
        'Horario preferencial inicial invalido. Use o formato HH:mm.',
        'Raio de geofence invalido. O valor minimo permitido e 20.',
      ]),
    );
  });

  it('exibe issues do lote ao consultar preview da importacao', async () => {
    customerImportBatchFindFirstMock.mockResolvedValue({
      id: 'batch-preview-issues',
      sourceType: CustomerImportSourceType.CSV,
      status: CustomerImportBatchStatus.PREVIEWED,
      applyChanges: false,
      readCount: 1,
      createdCount: 0,
      updatedCount: 0,
      ignoredCount: 0,
      errorCount: 1,
      logSummary: 'Preview com erros por linha',
      requestPayload: null,
      requestedAt: new Date('2026-04-25T10:00:00.000Z'),
      startedAt: new Date('2026-04-25T10:00:01.000Z'),
      finishedAt: new Date('2026-04-25T10:00:02.000Z'),
      durationMs: 1000,
      attemptCount: 1,
      nextRetryAt: null,
      lastError: null,
      actorUser: null,
      items: [
        {
          id: 'item-preview-1',
          rowNumber: 4,
          status: CustomerImportItemStatus.ERROR,
          customerId: null,
          customerCode: 'CLI-040',
          winthorCustomerCode: null,
          cnpj: '11222333000100',
          legalName: null,
          tradeName: 'Cliente Preview',
          message: 'CNPJ invalido. Digitos verificadores nao conferem.',
          conflictKeys: [],
          rawPayload: {
            customer_code: 'CLI-040',
            __import_meta: {
              issues: [
                'CNPJ invalido. Digitos verificadores nao conferem.',
                'Email invalido',
              ],
            },
          },
          customer: null,
          processedAt: new Date('2026-04-25T10:00:02.000Z'),
        },
      ],
    });

    const batch = await service.getImportBatch(
      'admin-1',
      'batch-preview-issues',
    );

    expect(batch.summary).toMatchObject({
      readCount: 1,
      createdCount: 0,
      updatedCount: 0,
      ignoredCount: 0,
      errorCount: 1,
    });
    expect(batch.previewItems[0]?.issues).toEqual([
      'CNPJ invalido. Digitos verificadores nao conferem.',
      'Email invalido',
    ]);
    expect(batch.previewItems[0]?.rawPayload).toEqual({
      customer_code: 'CLI-040',
    });
  });

  it('aceita supervisor_email e default_promoter_email resolvendo os ids corretos', async () => {
    userFindFirstMock.mockResolvedValue({
      id: 'supervisor-1',
      region: 'Centro',
    });
    promoterFindFirstMock.mockResolvedValue({
      id: 'promoter-1',
      supervisorId: 'supervisor-1',
    });

    const preparedRow = (
      service as unknown as {
        prepareCsvRow: (row: {
          rowNumber: number;
          values: Record<string, string>;
        }) => Record<string, unknown>;
        buildImportDecisions: (
          actor: {
            id: string;
            companyId: string;
            role: UserRole;
            region: string | null;
          },
          preparedRows: Array<Record<string, unknown>>,
          existingCustomers: Array<Record<string, unknown>>,
          options: Record<string, unknown>,
          referenceCache: {
            supervisors: Map<string, unknown>;
            promoters: Map<string, unknown>;
          },
        ) => Promise<Array<Record<string, unknown>>>;
      }
    ).prepareCsvRow({
      rowNumber: 2,
      values: {
        customer_code: 'CLI-021',
        legal_name: 'Cliente Email LTDA',
        trade_name: 'Cliente Email',
        address: 'Rua B',
        city: 'Cuiaba',
        state: 'MT',
        supervisor_email: 'supervisor@formula.local',
        default_promoter_email: 'promotor.centro@formula.local',
      },
    });

    const decisions = await (
      service as unknown as {
        buildImportDecisions: (
          actor: {
            id: string;
            companyId: string;
            role: UserRole;
            region: string | null;
          },
          preparedRows: Array<Record<string, unknown>>,
          existingCustomers: Array<Record<string, unknown>>,
          options: Record<string, unknown>,
          referenceCache: {
            supervisors: Map<string, unknown>;
            promoters: Map<string, unknown>;
          },
        ) => Promise<Array<Record<string, unknown>>>;
      }
    ).buildImportDecisions(
      {
        id: 'admin-1',
        companyId: 'company-1',
        role: UserRole.ADMIN,
        region: 'Centro',
      },
      [preparedRow],
      [],
      {
        sourceType: CustomerImportSourceType.CSV,
        customerSourceType: CustomerSourceType.CSV,
        apply: false,
        allowCreate: true,
        allowUpdate: true,
        ignoreDuplicates: true,
        fallbackSupervisorUserId: null,
        fallbackDefaultPromoterUserId: null,
        logPrefix: 'CSV teste',
      },
      {
        supervisors: new Map(),
        promoters: new Map(),
      },
    );

    expect(decisions[0]?.status).toBe(CustomerImportItemStatus.CREATE);
    expect(decisions[0]?.payload).toMatchObject({
      supervisorUserId: 'supervisor-1',
      defaultPromoterUserId: 'promoter-1',
    });
  });

  it('retorna mensagem clara quando supervisor_email nao existir', async () => {
    userFindFirstMock.mockResolvedValue(null);

    const preparedRow = (
      service as unknown as {
        prepareCsvRow: (row: {
          rowNumber: number;
          values: Record<string, string>;
        }) => Record<string, unknown>;
        buildImportDecisions: (
          actor: {
            id: string;
            companyId: string;
            role: UserRole;
            region: string | null;
          },
          preparedRows: Array<Record<string, unknown>>,
          existingCustomers: Array<Record<string, unknown>>,
          options: Record<string, unknown>,
          referenceCache: {
            supervisors: Map<string, unknown>;
            promoters: Map<string, unknown>;
          },
        ) => Promise<Array<Record<string, unknown>>>;
      }
    ).prepareCsvRow({
      rowNumber: 2,
      values: {
        customer_code: 'CLI-022',
        trade_name: 'Cliente Sem Supervisor',
        address: 'Rua C',
        city: 'Cuiaba',
        state: 'MT',
        supervisor_email: 'inexistente@formula.local',
      },
    });

    const decisions = await (
      service as unknown as {
        buildImportDecisions: (
          actor: {
            id: string;
            companyId: string;
            role: UserRole;
            region: string | null;
          },
          preparedRows: Array<Record<string, unknown>>,
          existingCustomers: Array<Record<string, unknown>>,
          options: Record<string, unknown>,
          referenceCache: {
            supervisors: Map<string, unknown>;
            promoters: Map<string, unknown>;
          },
        ) => Promise<Array<Record<string, unknown>>>;
      }
    ).buildImportDecisions(
      {
        id: 'admin-1',
        companyId: 'company-1',
        role: UserRole.ADMIN,
        region: 'Centro',
      },
      [preparedRow],
      [],
      {
        sourceType: CustomerImportSourceType.CSV,
        customerSourceType: CustomerSourceType.CSV,
        apply: false,
        allowCreate: true,
        allowUpdate: true,
        ignoreDuplicates: true,
        fallbackSupervisorUserId: null,
        fallbackDefaultPromoterUserId: null,
        logPrefix: 'CSV teste',
      },
      {
        supervisors: new Map(),
        promoters: new Map(),
      },
    );

    expect(decisions[0]?.status).toBe(CustomerImportItemStatus.ERROR);
    expect(decisions[0]?.message).toContain(
      'Supervisor responsavel nao encontrado: inexistente@formula.local',
    );
  });

  it('aceita aliases e prepara update preservando campos existentes ausentes no CSV', async () => {
    const preparedRow = (
      service as unknown as {
        prepareCsvRow: (row: {
          rowNumber: number;
          values: Record<string, string>;
        }) => { rowNumber: number; payload?: Record<string, unknown> };
      }
    ).prepareCsvRow({
      rowNumber: 2,
      values: {
        cod_cliente: 'CLI-001',
        nome_fantasia: 'Supermercado Estrela Atualizado',
        cidade: 'Rondonopolis',
      },
    });

    const decisions = await (
      service as unknown as {
        buildImportDecisions: (
          actor: {
            id: string;
            companyId: string;
            role: UserRole;
            region: string | null;
          },
          preparedRows: Array<Record<string, unknown>>,
          existingCustomers: Array<Record<string, unknown>>,
          options: Record<string, unknown>,
          referenceCache: {
            supervisors: Map<string, unknown>;
            promoters: Map<string, unknown>;
          },
        ) => Promise<Array<Record<string, unknown>>>;
      }
    ).buildImportDecisions(
      {
        id: 'admin-1',
        companyId: 'company-1',
        role: UserRole.ADMIN,
        region: 'Centro',
      },
      [preparedRow],
      [buildExistingCustomer()],
      {
        sourceType: CustomerImportSourceType.CSV,
        customerSourceType: CustomerSourceType.CSV,
        apply: false,
        allowCreate: true,
        allowUpdate: true,
        ignoreDuplicates: true,
        fallbackSupervisorUserId: null,
        fallbackDefaultPromoterUserId: null,
        logPrefix: 'CSV teste',
      },
      {
        supervisors: new Map(),
        promoters: new Map(),
      },
    );

    expect(decisions[0]?.status).toBe(CustomerImportItemStatus.UPDATE);
    expect(decisions[0]?.payload).toMatchObject({
      tradeName: 'Supermercado Estrela Atualizado',
      legalName: 'Estrela Comercio de Alimentos LTDA',
      address: 'Av. Presidente Medici',
      state: 'MT',
      phone: '66992001001',
      status: CustomerStatus.INACTIVE,
      active: false,
    });
  });

  it('classifica lote misto com create, update, ignore e error sem derrubar o processamento', async () => {
    const typedService = service as unknown as {
      prepareCsvRow: (row: {
        rowNumber: number;
        values: Record<string, string>;
      }) => Record<string, unknown>;
      buildImportDecisions: (
        actor: {
          id: string;
          companyId: string;
          role: UserRole;
          region: string | null;
        },
        preparedRows: Array<Record<string, unknown>>,
        existingCustomers: Array<Record<string, unknown>>,
        options: Record<string, unknown>,
        referenceCache: {
          supervisors: Map<string, unknown>;
          promoters: Map<string, unknown>;
        },
      ) => Promise<Array<Record<string, unknown>>>;
    };

    const decisions = await typedService.buildImportDecisions(
      {
        id: 'admin-1',
        companyId: 'company-1',
        role: UserRole.ADMIN,
        region: 'Centro',
      },
      [
        typedService.prepareCsvRow({
          rowNumber: 2,
          values: {
            customer_code: 'CLI-100',
            legal_name: 'Cliente Novo LTDA',
            address: 'Rua Nova',
            city: 'Cuiaba',
            state: 'MT',
          },
        }),
        typedService.prepareCsvRow({
          rowNumber: 3,
          values: {
            customer_code: 'CLI-001',
            trade_name: 'Supermercado Estrela Atualizado',
            city: 'Rondonopolis',
          },
        }),
        typedService.prepareCsvRow({
          rowNumber: 4,
          values: {
            customer_code: 'CLI-100',
            trade_name: 'Cliente Duplicado',
            address: 'Rua Nova',
            city: 'Cuiaba',
            state: 'MT',
          },
        }),
        typedService.prepareCsvRow({
          rowNumber: 5,
          values: {
            trade_name: 'Sem Codigo',
            city: 'Cuiaba',
          },
        }),
      ],
      [buildExistingCustomer()],
      {
        sourceType: CustomerImportSourceType.CSV,
        customerSourceType: CustomerSourceType.CSV,
        apply: false,
        allowCreate: true,
        allowUpdate: true,
        ignoreDuplicates: true,
        fallbackSupervisorUserId: null,
        fallbackDefaultPromoterUserId: null,
        logPrefix: 'CSV parcial',
      },
      {
        supervisors: new Map(),
        promoters: new Map(),
      },
    );

    expect(decisions.map((item) => item.status)).toEqual([
      CustomerImportItemStatus.CREATE,
      CustomerImportItemStatus.UPDATE,
      CustomerImportItemStatus.IGNORE,
      CustomerImportItemStatus.ERROR,
    ]);
  });

  it('persiste customerImportItems em chunks sem transaction client externo', async () => {
    const processedAt = new Date('2026-03-31T18:00:00.000Z');
    const decisions = Array.from({ length: 1001 }, (_, index) => ({
      rowNumber: index + 1,
      status: CustomerImportItemStatus.CREATE,
      customerId: null,
      customerCode: `CLI-${String(index + 1).padStart(4, '0')}`,
      winthorCustomerCode: null,
      cnpj: null,
      legalName: `Cliente ${index + 1}`,
      tradeName: `Cliente ${index + 1}`,
      message: 'Cliente pronto para cadastro',
      conflictKeys: [],
      rawPayload: {
        customer_code: `CLI-${String(index + 1).padStart(4, '0')}`,
      },
    }));

    await (
      service as unknown as {
        updateImportItems: (
          batchId: string,
          importDecisions: Array<Record<string, unknown>>,
          date: Date,
        ) => Promise<void>;
      }
    ).updateImportItems('batch-big', decisions, processedAt);

    expect(customerImportItemUpdateMock).toHaveBeenCalledTimes(1001);

    const transactionCalls = prismaService.$transaction.mock.calls as Array<
      [unknown]
    >;
    const arrayTransactions = transactionCalls.filter(
      (call): call is [unknown[]] => Array.isArray(call[0]),
    );

    expect(arrayTransactions.length).toBeGreaterThan(1);
    expect(arrayTransactions[0]?.[0]).toHaveLength(200);
    expect(arrayTransactions[arrayTransactions.length - 1]?.[0]).toHaveLength(
      1,
    );
  });

  it('persiste itens staged em chunks para lotes grandes', async () => {
    const stagedRows = Array.from({ length: 450 }, (_, index) => ({
      rowNumber: index + 1,
      rawPayload: {
        customer_code: `CLI-${String(index + 1).padStart(4, '0')}`,
      },
      preview: {
        rowNumber: index + 1,
        rawPayload: {
          customer_code: `CLI-${String(index + 1).padStart(4, '0')}`,
        },
        payload: {
          code: `CLI-${String(index + 1).padStart(4, '0')}`,
          winthorCustomerCode: null,
          cnpj: null,
          legalName: `Cliente ${index + 1}`,
          tradeName: `Cliente ${index + 1}`,
        },
      },
    }));

    await (
      service as unknown as {
        persistStagedImportItems: (
          batchId: string,
          rows: Array<Record<string, unknown>>,
        ) => Promise<void>;
      }
    ).persistStagedImportItems('batch-stage', stagedRows);

    expect(customerImportItemCreateManyMock).toHaveBeenCalledTimes(3);
    const createManyCalls = customerImportItemCreateManyMock.mock
      .calls as Array<[{ data: Array<Record<string, unknown>> }]>;

    expect(createManyCalls[0]?.[0].data).toHaveLength(200);
    expect(createManyCalls[1]?.[0].data).toHaveLength(200);
    expect(createManyCalls[2]?.[0].data).toHaveLength(50);
  });

  it('registra lote falho quando o adaptador Winthor nao esta disponivel', async () => {
    gatewayFetchCustomersMock.mockResolvedValue({
      records: [],
      adapter: 'disabled',
      unavailableReason:
        'Adaptador Winthor somente leitura ainda nao configurado.',
    });
    customerImportBatchCreateMock.mockResolvedValue({ id: 'batch-2' });
    customerImportBatchFindFirstMock.mockResolvedValue({
      id: 'batch-2',
      sourceType: CustomerImportSourceType.WINTHOR,
      status: CustomerImportBatchStatus.FAILED,
      applyChanges: false,
      readCount: 0,
      createdCount: 0,
      updatedCount: 0,
      ignoredCount: 0,
      errorCount: 1,
      logSummary:
        'Winthor: Adaptador Winthor somente leitura ainda nao configurado.',
      requestedAt: new Date('2026-03-26T18:10:00.000Z'),
      finishedAt: new Date('2026-03-26T18:10:01.000Z'),
      actorUser: null,
      items: [],
    });

    const response = await service.importCustomersFromWinthor('admin-1', {
      apply: false,
      allowCreate: true,
      allowUpdate: true,
      ignoreDuplicates: true,
    });

    expect(response.status).toBe(CustomerImportBatchStatus.FAILED);
    expect(auditRecordMock).toHaveBeenCalled();
  });
});
