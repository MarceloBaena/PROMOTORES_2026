import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditEntityType,
  CustomerImportBatchStatus,
  CustomerImportItemStatus,
  CustomerImportSourceType,
  CustomerSourceType,
  CustomerStatus,
  Prisma,
  ScheduleDayOfWeek,
  UserRole,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ImportCustomersCsvDto,
  ImportCustomersWinthorDto,
  ListCustomerImportBatchesQueryDto,
  ListCustomerImportBatchItemsQueryDto,
  ListCustomersQueryDto,
  UpsertCustomerDto,
} from './customers.dto';
import {
  deepSanitize,
  normalizeDigits,
  normalizeImportHeader,
  normalizeOptional,
  normalizeOptionalUpper,
  normalizeString,
  normalizeUpper,
  parseBoolean,
  parseCsvBuffer,
  parseInteger,
  parseMultiValueField,
  parseNumber,
  sanitizeStorageString as sanitizeImportStorageString,
} from './customers.import-utils';
import type { ParsedCsvDocument } from './customers.import-utils';
import {
  WINTHOR_CUSTOMER_GATEWAY,
  type ReadonlyWinthorCustomerRecord,
  type WinthorCustomerGateway,
} from './winthor-customer.gateway';

const DEFAULT_GEOFENCE_RADIUS_M = 150;
const MAX_PAGE_SIZE = 100;
const IMPORT_WRITE_CHUNK_SIZE = 200;
const MAX_CUSTOMER_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const IMPORT_RAW_PAYLOAD_META_KEY = '__import_meta';
const VALID_PREFERRED_VISIT_DAYS = new Set(Object.values(ScheduleDayOfWeek));
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME_WINDOW_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

class ImportRowValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(issues[0] ?? 'Linha invalida para importacao de clientes');
    this.name = 'ImportRowValidationError';
  }
}

const sanitizeStorageString = (value?: string | null) => {
  if (typeof value !== 'string') {
    return value ?? null;
  }

  return sanitizeImportStorageString(value);
};

const sanitizeStorageStringArray = (values?: string[]) =>
  (values ?? []).map((value) => sanitizeImportStorageString(value));

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && !Array.isArray(value) && typeof value === 'object';

const withImportPayloadMetadata = (
  rawPayload: Prisma.InputJsonValue,
  issues?: string[],
): Prisma.InputJsonValue => {
  if ((issues?.length ?? 0) === 0 || !isPlainRecord(rawPayload)) {
    return rawPayload;
  }

  return {
    ...rawPayload,
    [IMPORT_RAW_PAYLOAD_META_KEY]: {
      issues: sanitizeStorageStringArray(issues),
    },
  } as Prisma.InputJsonObject;
};

const extractImportPayloadMetadata = (rawPayload: Prisma.JsonValue) => {
  if (!isPlainRecord(rawPayload)) {
    return {
      issues: [] as string[],
      rawPayload,
    };
  }

  const metadataCandidate = rawPayload[IMPORT_RAW_PAYLOAD_META_KEY];
  const issues =
    isPlainRecord(metadataCandidate) && Array.isArray(metadataCandidate.issues)
      ? metadataCandidate.issues
          .filter((issue): issue is string => typeof issue === 'string')
          .map((issue) => sanitizeImportStorageString(issue))
      : [];

  const cleanPayload = Object.fromEntries(
    Object.entries(rawPayload).filter(
      ([key]) => key !== IMPORT_RAW_PAYLOAD_META_KEY,
    ),
  );

  return {
    issues,
    rawPayload: cleanPayload as Prisma.JsonObject,
  };
};

const isValidCnpj = (value: string) => {
  if (!/^\d{14}$/.test(value) || /^(\d)\1{13}$/.test(value)) {
    return false;
  }

  const digits = value.split('').map(Number);
  const calculateCheckDigit = (baseDigits: number[]) => {
    let factor = baseDigits.length - 7;
    const total = baseDigits.reduce((accumulator, digit) => {
      const next = accumulator + digit * factor;
      factor = factor === 2 ? 9 : factor - 1;
      return next;
    }, 0);
    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const firstCheckDigit = calculateCheckDigit(digits.slice(0, 12));
  const secondCheckDigit = calculateCheckDigit(digits.slice(0, 13));

  return firstCheckDigit === digits[12] && secondCheckDigit === digits[13];
};

const sanitizeJsonForStorage = (
  value: Prisma.JsonValue | Prisma.InputJsonValue | null,
): Prisma.InputJsonValue | null => {
  if (value === null) {
    return null;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return deepSanitize(value) as Prisma.InputJsonValue;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeJsonForStorage(
        deepSanitize(item as Prisma.JsonValue | Prisma.InputJsonValue) as
          | Prisma.JsonValue
          | Prisma.InputJsonValue,
      ),
    ) as Prisma.InputJsonArray;
  }

  const sanitizedObject: Record<string, Prisma.InputJsonValue | null> = {};

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === undefined) {
      continue;
    }

    sanitizedObject[sanitizeImportStorageString(key)] = sanitizeJsonForStorage(
      deepSanitize(entry as Prisma.JsonValue | Prisma.InputJsonValue | null) as
        | Prisma.JsonValue
        | Prisma.InputJsonValue
        | null,
    );
  }

  return sanitizedObject as Prisma.InputJsonObject;
};

const customerSummaryInclude = {
  schedules: {
    where: {
      deletedAt: null,
    },
    orderBy: {
      dayOfWeek: 'asc',
    },
  },
  supervisorUser: {
    select: {
      id: true,
      name: true,
      email: true,
      region: true,
    },
  },
  defaultPromoterUser: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  _count: {
    select: {
      routeStops: true,
      visits: true,
    },
  },
} as const;

const customerDetailInclude = {
  ...customerSummaryInclude,
  importBatch: {
    select: {
      id: true,
      sourceType: true,
      status: true,
      requestedAt: true,
      finishedAt: true,
    },
  },
} as const;

type CustomerSummaryRecord = Prisma.CustomerGetPayload<{
  include: typeof customerSummaryInclude;
}>;

type CustomerDetailRecord = Prisma.CustomerGetPayload<{
  include: typeof customerDetailInclude;
}>;

type TransactionClient = Prisma.TransactionClient;

interface CustomerActorContext {
  id: string;
  companyId: string;
  role: UserRole;
  region: string | null;
}

interface NormalizedCustomerSchedule {
  dayOfWeek: ScheduleDayOfWeek;
  visitWindowStart: string | null;
  visitWindowEnd: string | null;
  sequenceHint: number | null;
  active: boolean;
}

interface ManualCustomerPayload {
  code: string;
  winthorCustomerCode: string | null;
  legalName: string;
  tradeName: string;
  cnpj: string | null;
  stateRegistration: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  zipCode: string | null;
  address: string;
  addressNumber: string | null;
  complement: string | null;
  district: string | null;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusM: number;
  routeName: string | null;
  region: string | null;
  supervisorUserId: string | null;
  defaultPromoterUserId: string | null;
  visitFrequency: string | null;
  preferredVisitDays: string[];
  preferredVisitTimeStart: string | null;
  preferredVisitTimeEnd: string | null;
  notes: string | null;
  status: CustomerStatus;
  schedules?: NormalizedCustomerSchedule[] | undefined;
}

interface ImportCustomerPayload {
  code: string;
  winthorCustomerCode: string | null;
  legalName: string;
  tradeName: string;
  cnpj: string | null;
  stateRegistration: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  zipCode: string | null;
  address: string;
  addressNumber: string | null;
  complement: string | null;
  district: string | null;
  city: string;
  state: string;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusM: number | null;
  routeName: string | null;
  region: string | null;
  supervisorUserId: string | null;
  defaultPromoterUserId: string | null;
  visitFrequency: string | null;
  preferredVisitDays: string[];
  preferredVisitTimeStart: string | null;
  preferredVisitTimeEnd: string | null;
  notes: string | null;
  status: CustomerStatus;
  statusExplicitlyProvided: boolean;
  sourceType: CustomerSourceType;
  lastSyncedAt: Date | null;
}

interface PersistableCustomerPayload {
  code: string;
  winthorCustomerCode: string | null;
  legalName: string;
  tradeName: string;
  cnpj: string | null;
  stateRegistration: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  zipCode: string | null;
  address: string;
  addressNumber: string | null;
  complement: string | null;
  district: string | null;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  geofenceRadiusM: number;
  routeName: string | null;
  region: string | null;
  supervisorUserId: string | null;
  defaultPromoterUserId: string | null;
  visitFrequency: string | null;
  preferredVisitDays: string[];
  preferredVisitTimeStart: string | null;
  preferredVisitTimeEnd: string | null;
  notes: string | null;
  status: CustomerStatus;
  active: boolean;
  sourceType: CustomerSourceType;
  lastSyncedAt: Date | null;
}

interface ExistingCustomerIdentity {
  id: string;
  code: string;
  winthorCustomerCode: string | null;
  cnpj: string | null;
  tradeName: string;
  legalName: string;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  geofenceRadiusM: number;
  routeName: string | null;
  region: string | null;
  supervisorUserId: string | null;
  defaultPromoterUserId: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  zipCode: string | null;
  addressNumber: string | null;
  complement: string | null;
  district: string | null;
  stateRegistration: string | null;
  visitFrequency: string | null;
  preferredVisitDays: string[];
  preferredVisitTimeStart: string | null;
  preferredVisitTimeEnd: string | null;
  notes: string | null;
  status: CustomerStatus;
  active: boolean;
  sourceType: CustomerSourceType;
  lastSyncedAt: Date | null;
  deletedAt: Date | null;
}

interface SupervisorReference {
  id: string;
  region: string | null;
}

interface PromoterReference {
  id: string;
  supervisorId: string | null;
}

interface ImportPreparedRow {
  rowNumber: number;
  rawPayload: Prisma.InputJsonValue;
  issues: string[];
  payload?: ImportCustomerPayload;
  errorMessage?: string;
}

interface StagedImportRow {
  rowNumber: number;
  rawPayload: Prisma.InputJsonValue;
  preview: ImportPreparedRow;
}

interface ImportDecision {
  rowNumber: number;
  status: CustomerImportItemStatus;
  payload?: PersistableCustomerPayload;
  customerId?: string | null;
  customerCode: string | null;
  winthorCustomerCode: string | null;
  cnpj: string | null;
  legalName: string | null;
  tradeName: string | null;
  message: string;
  issues: string[];
  conflictKeys: string[];
  rawPayload: Prisma.InputJsonValue;
  existingCustomer?: ExistingCustomerIdentity | null;
}

interface ImportReferenceCache {
  supervisors: Map<string, SupervisorReference | null>;
  promoters: Map<string, PromoterReference | null>;
}

interface ImportExecutionOptions {
  sourceType: CustomerImportSourceType;
  customerSourceType: CustomerSourceType;
  apply: boolean;
  allowCreate: boolean;
  allowUpdate: boolean;
  ignoreDuplicates: boolean;
  fallbackSupervisorUserId: string | null;
  fallbackDefaultPromoterUserId: string | null;
  logPrefix: string;
}

interface ImportBatchRequestPayload {
  sourceType: CustomerImportSourceType;
  customerSourceType: CustomerSourceType;
  apply: boolean;
  allowCreate: boolean;
  allowUpdate: boolean;
  ignoreDuplicates: boolean;
  fallbackSupervisorUserId: string | null;
  fallbackDefaultPromoterUserId: string | null;
  changedSince: string | null;
  delimiter: string | null;
  sourceReference: string | null;
  requestedByUserId: string;
  adapter: string | null;
  logPrefix: string;
  csvMetadata: {
    requestedDelimiter: string | null;
    detectedDelimiter: string | null;
    originalHeaders: string[];
    normalizedHeaders: string[];
    recognizedHeaders: string[];
    unrecognizedHeaders: string[];
    missingRequiredHeaders: string[];
    incompatibleLayout: boolean;
    layoutMessage: string | null;
    validRows: number;
    invalidRows: number;
    skippedEmptyRows: number;
  } | null;
}

const csvHeaderAliases = {
  code: [
    'customer_code',
    'codigo_cliente',
    'codigo_do_cliente',
    'codigo',
    'cod_cliente',
    'cod',
    'codcli',
    'cod_cliente_winthor',
  ],
  winthorCustomerCode: [
    'winthor_customer_code',
    'codigo_winthor',
    'cod_winthor',
    'codigo_cliente_winthor',
    'cod_winthor_cliente',
    'codcli_winthor',
  ],
  legalName: [
    'legal_name',
    'razao_social',
    'razao',
    'nome_legal',
    'razaosocial',
  ],
  tradeName: [
    'trade_name',
    'nome_fantasia',
    'fantasia',
    'nome_cliente',
    'cliente',
  ],
  cnpj: ['cnpj', 'documento', 'document_number', 'cpf_cnpj', 'cgc'],
  stateRegistration: ['state_registration', 'inscricao_estadual', 'ie'],
  contactName: ['contact_name', 'contato', 'responsavel'],
  phone: ['phone', 'telefone', 'fone'],
  email: ['email', 'e_mail'],
  zipCode: ['zip_code', 'cep'],
  address: ['address', 'endereco', 'logradouro'],
  addressNumber: ['address_number', 'numero'],
  complement: ['complement', 'complemento'],
  district: ['district', 'bairro'],
  city: ['city', 'cidade'],
  state: ['state', 'uf', 'estado'],
  latitude: ['latitude', 'lat'],
  longitude: ['longitude', 'lng', 'lon'],
  geofenceRadiusM: ['geofence_radius_m', 'raio_geofence_m', 'geofence'],
  routeName: ['route_name', 'rota'],
  region: ['region', 'regiao'],
  supervisorUserId: [
    'supervisor_user_id',
    'supervisor_id',
    'supervisor_email',
    'email_supervisor',
  ],
  defaultPromoterUserId: [
    'default_promoter_user_id',
    'promoter_user_id',
    'promotor_user_id',
    'default_promoter_email',
    'promoter_email',
    'promotor_email',
  ],
  visitFrequency: ['visit_frequency', 'frequencia_visita'],
  preferredVisitDays: ['preferred_visit_days', 'dias_preferenciais'],
  preferredVisitTimeStart: [
    'preferred_visit_time_start',
    'horario_preferencial_inicio',
  ],
  preferredVisitTimeEnd: [
    'preferred_visit_time_end',
    'horario_preferencial_fim',
  ],
  notes: ['notes', 'observacoes', 'obs'],
  status: ['status'],
  active: ['active', 'ativo'],
} as const;

interface CsvHeaderRequirement {
  label: string;
  aliases: readonly string[];
}

interface CsvHeaderDiagnostics {
  recognizedHeaders: string[];
  unrecognizedHeaders: string[];
  missingRequiredHeaders: string[];
  incompatibleLayout: boolean;
  layoutMessage: string | null;
}

const csvHeaderRequirements: CsvHeaderRequirement[] = [
  {
    label: 'customer_code',
    aliases: csvHeaderAliases.code,
  },
  {
    label: 'legal_name ou trade_name',
    aliases: [...csvHeaderAliases.legalName, ...csvHeaderAliases.tradeName],
  },
  {
    label: 'city',
    aliases: csvHeaderAliases.city,
  },
];

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly auditService: AuditService,
    @Inject(WINTHOR_CUSTOMER_GATEWAY)
    private readonly winthorCustomerGateway: WinthorCustomerGateway,
  ) {}

  async listActiveCustomers() {
    return this.prismaService.customer.findMany({
      where: this.buildOperationalCustomerWhere(),
      orderBy: {
        tradeName: 'asc',
      },
    });
  }

  async findCustomerById(customerId: string) {
    return this.prismaService.customer.findFirst({
      where: {
        id: customerId,
        deletedAt: null,
      },
    });
  }

  async listCustomers(actorUserId: string, query: ListCustomersQueryDto) {
    const actor = await this.getActorContext(actorUserId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, MAX_PAGE_SIZE);
    const where = this.buildListCustomersWhere(actor, query);
    const orderBy = this.resolveCustomerSort(
      query.sortBy,
      query.sortDirection ?? 'asc',
    );

    const [total, items] = await Promise.all([
      this.prismaService.customer.count({ where }),
      this.prismaService.customer.findMany({
        where,
        include: customerSummaryInclude,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: items.map((item) => this.mapCustomerSummary(item)),
    };
  }

  async getCustomerDetails(actorUserId: string, customerId: string) {
    const actor = await this.getActorContext(actorUserId);
    const customer = await this.findAccessibleCustomerOrThrow(
      actor,
      customerId,
    );
    return this.mapCustomerDetail(customer);
  }

  async createCustomer(actorUserId: string, dto: UpsertCustomerDto) {
    const actor = await this.getActorContext(actorUserId);
    this.ensureManagerActor(actor);
    const normalized = this.normalizeManualPayload(dto);
    const payload = await this.resolveManualCustomerPayload(actor, normalized);

    await this.assertUniqueCustomerIdentifiers(actor.companyId, payload);

    try {
      const created = await this.prismaService.$transaction(
        async (transaction) => {
          const customer = await transaction.customer.create({
            data: this.toCustomerCreateInput(actor.companyId, payload, {
              sourceType: CustomerSourceType.MANUAL,
              importBatchId: null,
              lastSyncedAt: null,
            }),
          });

          if (normalized.schedules !== undefined) {
            await this.replaceCustomerSchedules(
              transaction,
              customer.id,
              normalized.schedules,
            );
          }

          return customer;
        },
      );

      await this.auditService.record(
        actorUserId,
        AuditEntityType.CUSTOMER,
        created.id,
        'customer.create',
        {
          code: payload.code,
          status: payload.status,
          sourceType: CustomerSourceType.MANUAL,
        },
      );

      this.logger.log(
        `Cliente criado actorUserId=${actorUserId} customerId=${created.id} code=${payload.code}`,
      );

      return this.getCustomerDetails(actorUserId, created.id);
    } catch (error) {
      this.rethrowKnownConstraintError(error);
      throw error;
    }
  }

  async updateCustomer(
    actorUserId: string,
    customerId: string,
    dto: UpsertCustomerDto,
  ) {
    const actor = await this.getActorContext(actorUserId);
    this.ensureManagerActor(actor);
    const existing = await this.findAccessibleCustomerOrThrow(
      actor,
      customerId,
    );
    const normalized = this.normalizeManualPayload(dto);
    const payload = await this.resolveManualCustomerPayload(
      actor,
      normalized,
      existing,
    );

    await this.assertUniqueCustomerIdentifiers(
      actor.companyId,
      payload,
      customerId,
    );

    try {
      await this.prismaService.$transaction(async (transaction) => {
        await transaction.customer.update({
          where: {
            id: customerId,
          },
          data: this.toCustomerUpdateInput(payload, {
            sourceType: existing.sourceType,
            importBatchId: existing.importBatchId ?? null,
            lastSyncedAt: existing.lastSyncedAt,
          }),
        });

        if (normalized.schedules !== undefined) {
          await this.replaceCustomerSchedules(
            transaction,
            customerId,
            normalized.schedules,
          );
        }
      });

      await this.auditService.record(
        actorUserId,
        AuditEntityType.CUSTOMER,
        customerId,
        'customer.update',
        {
          code: payload.code,
          status: payload.status,
          sourceType: existing.sourceType,
        },
      );

      this.logger.log(
        `Cliente atualizado actorUserId=${actorUserId} customerId=${customerId}`,
      );

      return this.getCustomerDetails(actorUserId, customerId);
    } catch (error) {
      this.rethrowKnownConstraintError(error);
      throw error;
    }
  }

  async updateCustomerStatus(
    actorUserId: string,
    customerId: string,
    status: CustomerStatus,
  ) {
    const actor = await this.getActorContext(actorUserId);
    this.ensureManagerActor(actor);
    const existing = await this.findAccessibleCustomerOrThrow(
      actor,
      customerId,
    );
    const nextActive = status === CustomerStatus.ACTIVE;

    const updated = await this.prismaService.customer.update({
      where: {
        id: customerId,
      },
      data: {
        status,
        active: nextActive,
        deletedAt: nextActive ? null : existing.deletedAt,
      },
      select: {
        id: true,
        status: true,
        active: true,
        updatedAt: true,
      },
    });

    await this.auditService.record(
      actorUserId,
      AuditEntityType.CUSTOMER,
      customerId,
      'customer.status',
      {
        previousStatus: existing.status,
        nextStatus: status,
      },
    );

    this.logger.log(
      `Status do cliente alterado actorUserId=${actorUserId} customerId=${customerId} status=${status}`,
    );

    return {
      id: updated.id,
      status: updated.status,
      active: updated.active,
      updatedAt: updated.updatedAt.toISOString(),
      archived: updated.status === CustomerStatus.INACTIVE,
    };
  }

  async activateAllInactiveCustomers(actorUserId: string) {
    const actor = await this.getActorContext(actorUserId);
    this.ensureManagerActor(actor);
    const actorScope = this.buildActorCustomerScope(actor);
    const where: Prisma.CustomerWhereInput = {
      AND: [
        {
          companyId: actor.companyId,
        },
        ...(actorScope ? [actorScope] : []),
        this.buildInactiveCustomerWhere(),
      ],
    };
    const [foundCount, missingCoordinatesCount] = await Promise.all([
      this.prismaService.customer.count({ where }),
      this.prismaService.customer.count({
        where: {
          AND: [
            where,
            {
              latitude: 0,
              longitude: 0,
            },
          ],
        },
      }),
    ]);

    if (foundCount === 0) {
      return {
        foundCount: 0,
        reactivatedCount: 0,
        errorCount: 0,
        missingCoordinatesCount: 0,
        updatedAt: new Date().toISOString(),
      };
    }

    const result = await this.prismaService.customer.updateMany({
      where,
      data: {
        status: CustomerStatus.ACTIVE,
        active: true,
        deletedAt: null,
      },
    });
    const errorCount = Math.max(foundCount - result.count, 0);

    await this.auditService.record(
      actorUserId,
      AuditEntityType.CUSTOMER,
      actor.companyId,
      'customer.bulkActivateInactive',
      {
        foundCount,
        reactivatedCount: result.count,
        errorCount,
        missingCoordinatesCount,
      },
    );

    this.logger.log(
      `Clientes inativos reativados actorUserId=${actorUserId} found=${foundCount} reactivated=${result.count} missingCoordinates=${missingCoordinatesCount}`,
    );

    return {
      foundCount,
      reactivatedCount: result.count,
      errorCount,
      missingCoordinatesCount,
      updatedAt: new Date().toISOString(),
    };
  }

  async listImportBatches(
    actorUserId: string,
    query: ListCustomerImportBatchesQueryDto,
  ) {
    const actor = await this.getActorContext(actorUserId);
    this.ensureManagerActor(actor);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, MAX_PAGE_SIZE);
    const where: Prisma.CustomerImportBatchWhereInput = {
      companyId: actor.companyId,
      actorUserId: actor.role === UserRole.ADMIN ? undefined : actor.id,
      sourceType: query.sourceType,
      status: query.status,
    };

    const [total, items] = await Promise.all([
      this.prismaService.customerImportBatch.count({ where }),
      this.prismaService.customerImportBatch.findMany({
        where,
        include: {
          actorUser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              items: true,
            },
          },
        },
        orderBy: {
          requestedAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: items.map((item) => ({
        id: item.id,
        sourceType: item.sourceType,
        status: item.status,
        applyChanges: item.applyChanges,
        sourceReference: item.sourceReference,
        readCount: item.readCount,
        createdCount: item.createdCount,
        updatedCount: item.updatedCount,
        ignoredCount: item.ignoredCount,
        errorCount: item.errorCount,
        logSummary: item.logSummary,
        requestedAt: item.requestedAt.toISOString(),
        startedAt: item.startedAt?.toISOString() ?? null,
        finishedAt: item.finishedAt?.toISOString() ?? null,
        durationMs: item.durationMs,
        attemptCount: item.attemptCount,
        nextRetryAt: item.nextRetryAt?.toISOString() ?? null,
        lastError: item.lastError,
        actorUserId: item.actorUser?.id ?? null,
        actorUserName: item.actorUser?.name ?? null,
        itemsCount: item._count.items,
        summary: {
          readCount: item.readCount,
          createdCount: item.createdCount,
          updatedCount: item.updatedCount,
          ignoredCount: item.ignoredCount,
          errorCount: item.errorCount,
        },
      })),
    };
  }

  async getImportBatch(actorUserId: string, batchId: string) {
    const actor = await this.getActorContext(actorUserId);
    this.ensureManagerActor(actor);

    const batch = await this.prismaService.customerImportBatch.findFirst({
      where: {
        id: batchId,
        companyId: actor.companyId,
        actorUserId: actor.role === UserRole.ADMIN ? undefined : actor.id,
      },
      include: {
        actorUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        items: {
          orderBy: {
            rowNumber: 'asc',
          },
          take: 20,
          include: {
            customer: {
              select: {
                id: true,
                code: true,
                tradeName: true,
              },
            },
          },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException('Lote de importacao nao encontrado');
    }

    const requestPayload = this.safeParseBatchRequestPayload(
      batch.requestPayload,
    );

    return {
      id: batch.id,
      sourceType: batch.sourceType,
      status: batch.status,
      applyChanges: batch.applyChanges,
      sourceReference: batch.sourceReference,
      readCount: batch.readCount,
      createdCount: batch.createdCount,
      updatedCount: batch.updatedCount,
      ignoredCount: batch.ignoredCount,
      errorCount: batch.errorCount,
      summary: {
        readCount: batch.readCount,
        createdCount: batch.createdCount,
        updatedCount: batch.updatedCount,
        ignoredCount: batch.ignoredCount,
        errorCount: batch.errorCount,
      },
      logSummary: batch.logSummary,
      requestedAt: batch.requestedAt.toISOString(),
      startedAt: batch.startedAt?.toISOString() ?? null,
      finishedAt: batch.finishedAt?.toISOString() ?? null,
      durationMs: batch.durationMs,
      attemptCount: batch.attemptCount,
      nextRetryAt: batch.nextRetryAt?.toISOString() ?? null,
      lastError: batch.lastError,
      requestPayload: batch.requestPayload,
      csvMetadata: requestPayload?.csvMetadata ?? null,
      actorUser: batch.actorUser
        ? {
            id: batch.actorUser.id,
            name: batch.actorUser.name,
            email: batch.actorUser.email,
          }
        : null,
      previewItems: batch.items.map((item) => {
        const payloadMetadata = extractImportPayloadMetadata(item.rawPayload);

        return {
          id: item.id,
          rowNumber: item.rowNumber,
          status: item.status,
          customerId: item.customerId,
          customerCode: item.customerCode,
          winthorCustomerCode: item.winthorCustomerCode,
          cnpj: item.cnpj,
          legalName: item.legalName,
          tradeName: item.tradeName,
          message: item.message,
          issues: payloadMetadata.issues,
          conflictKeys: item.conflictKeys,
          rawPayload: payloadMetadata.rawPayload,
          customerName: item.customer?.tradeName ?? null,
          processedAt: item.processedAt?.toISOString() ?? null,
        };
      }),
    };
  }

  async listImportBatchItems(
    actorUserId: string,
    batchId: string,
    query: ListCustomerImportBatchItemsQueryDto,
  ) {
    const actor = await this.getActorContext(actorUserId);
    this.ensureManagerActor(actor);
    await this.assertBatchAccess(actor, batchId);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 50, MAX_PAGE_SIZE);
    const where: Prisma.CustomerImportItemWhereInput = {
      batchId,
      status: query.status,
    };

    const [total, items] = await Promise.all([
      this.prismaService.customerImportItem.count({ where }),
      this.prismaService.customerImportItem.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              code: true,
              tradeName: true,
            },
          },
        },
        orderBy: {
          rowNumber: 'asc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      page,
      pageSize,
      total,
      items: items.map((item) => {
        const payloadMetadata = extractImportPayloadMetadata(item.rawPayload);

        return {
          id: item.id,
          rowNumber: item.rowNumber,
          status: item.status,
          customerId: item.customerId,
          customerCode: item.customerCode,
          winthorCustomerCode: item.winthorCustomerCode,
          cnpj: item.cnpj,
          legalName: item.legalName,
          tradeName: item.tradeName,
          message: item.message,
          issues: payloadMetadata.issues,
          conflictKeys: item.conflictKeys,
          rawPayload: payloadMetadata.rawPayload,
          customer: item.customer
            ? {
                id: item.customer.id,
                code: item.customer.code,
                tradeName: item.customer.tradeName,
              }
            : null,
          processedAt: item.processedAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(),
        };
      }),
    };
  }

  async importCustomersFromCsv(
    actorUserId: string,
    dto: ImportCustomersCsvDto,
    file: {
      buffer: Buffer;
      size?: number;
      originalname?: string;
    },
  ) {
    const actor = await this.getActorContext(actorUserId);
    this.ensureManagerActor(actor);

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException(
        'Arquivo CSV vazio. Selecione um arquivo com cabecalho e linhas de dados.',
      );
    }

    if (
      (file.size ?? file.buffer.length) > MAX_CUSTOMER_IMPORT_FILE_SIZE_BYTES
    ) {
      throw new BadRequestException(
        'Arquivo CSV excede o limite de 10 MB para importacao.',
      );
    }

    const requestedDelimiter = dto.delimiter?.trim() || undefined;

    if (
      requestedDelimiter &&
      requestedDelimiter !== ';' &&
      requestedDelimiter !== ',' &&
      requestedDelimiter !== '\t'
    ) {
      throw new BadRequestException(
        'Delimitador CSV invalido. Use ";", "," ou TAB, ou deixe em branco para detectar automaticamente.',
      );
    }

    let parsedDocument: ParsedCsvDocument;

    try {
      parsedDocument = parseCsvBuffer(file.buffer, requestedDelimiter);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel ler o arquivo CSV enviado.',
      );
    }

    const headerDiagnostics = this.analyzeCsvHeaders(
      parsedDocument.normalizedHeaders,
    );

    if (parsedDocument.rows.length === 0) {
      throw new BadRequestException(
        'Arquivo CSV sem linhas de dados importaveis.',
      );
    }

    const options = await this.resolveImportExecutionOptions(actor, dto, {
      sourceType: CustomerImportSourceType.CSV,
      customerSourceType: CustomerSourceType.CSV,
      logPrefix: `CSV ${file.originalname ?? 'clientes.csv'}`,
    });
    const sourceReference =
      sanitizeStorageString(file.originalname ?? 'clientes.csv') ??
      'clientes.csv';
    const stagedRows = parsedDocument.rows.map((row) => ({
      rowNumber: row.rowNumber,
      rawPayload: row.values,
      preview: this.prepareCsvRow(row, headerDiagnostics),
    }));
    const validRows = stagedRows.filter((item) => item.preview.payload).length;
    const invalidRows = stagedRows.length - validRows;

    return this.stageImportBatch(actor, options, stagedRows, {
      sourceType: options.sourceType,
      customerSourceType: options.customerSourceType,
      apply: options.apply,
      allowCreate: options.allowCreate,
      allowUpdate: options.allowUpdate,
      ignoreDuplicates: options.ignoreDuplicates,
      fallbackSupervisorUserId: options.fallbackSupervisorUserId,
      fallbackDefaultPromoterUserId: options.fallbackDefaultPromoterUserId,
      changedSince: null,
      delimiter: requestedDelimiter ?? null,
      sourceReference,
      requestedByUserId: actor.id,
      adapter: null,
      logPrefix: options.logPrefix,
      csvMetadata: {
        requestedDelimiter: requestedDelimiter ?? null,
        detectedDelimiter: parsedDocument.delimiter,
        originalHeaders: parsedDocument.originalHeaders,
        normalizedHeaders: parsedDocument.normalizedHeaders,
        recognizedHeaders: headerDiagnostics.recognizedHeaders,
        unrecognizedHeaders: headerDiagnostics.unrecognizedHeaders,
        missingRequiredHeaders: headerDiagnostics.missingRequiredHeaders,
        incompatibleLayout: headerDiagnostics.incompatibleLayout,
        layoutMessage: headerDiagnostics.layoutMessage,
        validRows,
        invalidRows,
        skippedEmptyRows: parsedDocument.skippedEmptyRows,
      },
    });
  }

  async importCustomersFromWinthor(
    actorUserId: string,
    dto: ImportCustomersWinthorDto,
  ) {
    const actor = await this.getActorContext(actorUserId);
    this.ensureManagerActor(actor);
    const options = await this.resolveImportExecutionOptions(actor, dto, {
      sourceType: CustomerImportSourceType.WINTHOR,
      customerSourceType: CustomerSourceType.WINTHOR,
      logPrefix: 'Winthor',
    });

    return this.executeWinthorImport(actor, dto, options);
  }

  async syncCustomersFromWinthor(
    actorUserId: string,
    dto: ImportCustomersWinthorDto,
  ) {
    const actor = await this.getActorContext(actorUserId);
    this.ensureManagerActor(actor);
    const options = await this.resolveImportExecutionOptions(
      actor,
      {
        ...dto,
        apply: true,
      },
      {
        sourceType: CustomerImportSourceType.WINTHOR,
        customerSourceType: CustomerSourceType.WINTHOR,
        logPrefix: 'Winthor sync',
      },
    );

    return this.executeWinthorImport(actor, dto, options);
  }

  private async executeWinthorImport(
    actor: CustomerActorContext,
    dto: ImportCustomersWinthorDto,
    options: ImportExecutionOptions,
  ) {
    const gatewayResult = await this.winthorCustomerGateway.fetchCustomers({
      changedSince: dto.changedSince ? new Date(dto.changedSince) : undefined,
    });
    const adapter = sanitizeStorageString(gatewayResult.adapter);
    const requestPayload: ImportBatchRequestPayload = {
      sourceType: options.sourceType,
      customerSourceType: options.customerSourceType,
      apply: options.apply,
      allowCreate: options.allowCreate,
      allowUpdate: options.allowUpdate,
      ignoreDuplicates: options.ignoreDuplicates,
      fallbackSupervisorUserId: options.fallbackSupervisorUserId,
      fallbackDefaultPromoterUserId: options.fallbackDefaultPromoterUserId,
      changedSince: dto.changedSince ?? null,
      delimiter: null,
      sourceReference: adapter,
      requestedByUserId: actor.id,
      adapter,
      logPrefix: options.logPrefix,
      csvMetadata: null,
    };

    if (gatewayResult.unavailableReason) {
      const unavailableReason =
        sanitizeStorageString(gatewayResult.unavailableReason) ??
        'Integracao Winthor indisponivel';
      const sanitizedRequestPayload = sanitizeJsonForStorage(
        requestPayload as unknown as Prisma.InputJsonValue,
      );
      let batch;

      try {
        batch = await this.prismaService.customerImportBatch.create({
          data: {
            companyId: actor.companyId,
            actorUserId: actor.id,
            sourceType: CustomerImportSourceType.WINTHOR,
            status: CustomerImportBatchStatus.FAILED,
            applyChanges: options.apply,
            sourceReference: adapter,
            requestPayload: sanitizedRequestPayload ?? Prisma.JsonNull,
            readCount: 0,
            createdCount: 0,
            updatedCount: 0,
            ignoredCount: 0,
            errorCount: 1,
            logSummary:
              sanitizeStorageString(
                `${options.logPrefix}: ${unavailableReason}`,
              ) ?? `${options.logPrefix}: ${unavailableReason}`,
            lastError: unavailableReason,
            finishedAt: new Date(),
          },
        });
      } catch (error) {
        this.rethrowInvalidImportEncodingError(error);
        throw error;
      }

      await this.auditService.record(
        actor.id,
        AuditEntityType.CUSTOMER_IMPORT_BATCH,
        batch.id,
        'customer-import.failed',
        {
          sourceType: CustomerImportSourceType.WINTHOR,
          reason: unavailableReason,
          adapter,
          retryable: gatewayResult.retryable ?? false,
        },
      );

      return this.getImportBatch(actor.id, batch.id);
    }

    const stagedRows = gatewayResult.records.map((record, index) => ({
      rowNumber: index + 1,
      rawPayload: this.serializeWinthorRecord(record),
      preview: this.prepareWinthorRow(record, index + 1),
    }));

    return this.stageImportBatch(
      actor,
      {
        ...options,
        logPrefix: `${options.logPrefix} (${gatewayResult.adapter})`,
      },
      stagedRows,
      {
        ...requestPayload,
        logPrefix: `${options.logPrefix} (${gatewayResult.adapter})`,
      },
    );
  }

  async processNextPendingImportBatch() {
    const now = new Date();
    const candidate = await this.prismaService.customerImportBatch.findFirst({
      where: {
        status: {
          in: [
            CustomerImportBatchStatus.QUEUED,
            CustomerImportBatchStatus.RETRY_SCHEDULED,
          ],
        },
        OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
      },
      orderBy: {
        requestedAt: 'asc',
      },
      select: {
        id: true,
        status: true,
        attemptCount: true,
      },
    });

    if (!candidate) {
      return false;
    }

    const startedAt = new Date();
    const claimed = await this.prismaService.customerImportBatch.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status,
      },
      data: {
        status: CustomerImportBatchStatus.PROCESSING,
        startedAt,
        finishedAt: null,
        durationMs: null,
        nextRetryAt: null,
        lastError: null,
        attemptCount: candidate.attemptCount + 1,
      },
    });

    if (claimed.count === 0) {
      return false;
    }

    await this.processImportBatch(candidate.id, startedAt);
    return true;
  }

  private async stageImportBatch(
    actor: CustomerActorContext,
    options: ImportExecutionOptions,
    stagedRows: StagedImportRow[],
    requestPayload: ImportBatchRequestPayload,
  ) {
    const sanitizedRequestPayload = sanitizeJsonForStorage(
      requestPayload as unknown as Prisma.InputJsonValue,
    );
    const sanitizedSourceReference = sanitizeStorageString(
      requestPayload.sourceReference,
    );
    const queuedLogSummary =
      sanitizeStorageString(
        this.buildQueuedImportSummaryLog(options.logPrefix, stagedRows.length),
      ) ??
      this.buildQueuedImportSummaryLog(options.logPrefix, stagedRows.length);
    const stagingLogSummary =
      sanitizeStorageString(
        `${options.logPrefix}: preparando staging com ${stagedRows.length} linhas`,
      ) ??
      `${options.logPrefix}: preparando staging com ${stagedRows.length} linhas`;
    let batch;

    try {
      batch = await this.prismaService.customerImportBatch.create({
        data: {
          companyId: actor.companyId,
          actorUserId: actor.id,
          sourceType: options.sourceType,
          status: CustomerImportBatchStatus.PROCESSING,
          applyChanges: options.apply,
          sourceReference: sanitizedSourceReference,
          requestPayload: sanitizedRequestPayload ?? Prisma.JsonNull,
          readCount: stagedRows.length,
          createdCount: 0,
          updatedCount: 0,
          ignoredCount: 0,
          errorCount: 0,
          logSummary: stagingLogSummary,
        },
      });
    } catch (error) {
      this.rethrowInvalidImportEncodingError(error);
      throw error;
    }

    try {
      await this.persistStagedImportItems(batch.id, stagedRows);
      await this.prismaService.customerImportBatch.update({
        where: {
          id: batch.id,
        },
        data: {
          status: CustomerImportBatchStatus.QUEUED,
          logSummary: queuedLogSummary,
          startedAt: null,
          finishedAt: null,
          durationMs: null,
          lastError: null,
        },
      });
    } catch (error) {
      const finishedAt = new Date();
      const lastError = this.resolveImportPersistenceErrorMessage(
        error,
        'Falha ao preparar o staging da importacao de clientes',
      );

      await this.prismaService.customerImportBatch.update({
        where: {
          id: batch.id,
        },
        data: {
          status: CustomerImportBatchStatus.FAILED,
          errorCount: stagedRows.length,
          finishedAt,
          durationMs: 0,
          lastError: sanitizeStorageString(lastError) ?? lastError,
          logSummary:
            sanitizeStorageString(
              `${options.logPrefix}: falha ao gravar staging do lote`,
            ) ?? `${options.logPrefix}: falha ao gravar staging do lote`,
        },
      });

      throw error;
    }

    await this.auditService.record(
      actor.id,
      AuditEntityType.CUSTOMER_IMPORT_BATCH,
      batch.id,
      'customer-import.queued',
      {
        sourceType: options.sourceType,
        applyChanges: options.apply,
        readCount: stagedRows.length,
        sourceReference: sanitizedSourceReference,
      },
    );

    this.logger.log(
      `Lote de importacao enfileirado actorUserId=${actor.id} batchId=${batch.id} sourceType=${options.sourceType} stagedRows=${stagedRows.length}`,
    );

    return this.getImportBatch(actor.id, batch.id);
  }

  private async processImportBatch(batchId: string, startedAt: Date) {
    const batch = await this.prismaService.customerImportBatch.findUnique({
      where: {
        id: batchId,
      },
      include: {
        items: {
          orderBy: {
            rowNumber: 'asc',
          },
        },
      },
    });

    if (!batch || !batch.actorUserId) {
      return;
    }

    const actor = await this.getActorContext(batch.actorUserId);

    try {
      const requestPayload = this.parseBatchRequestPayload(
        batch.requestPayload,
      );
      const options = this.rebuildExecutionOptionsFromBatch(
        batch,
        requestPayload,
      );
      const preparedRows = this.rebuildPreparedRowsFromBatch(
        batch.sourceType,
        batch.items,
      );
      const referenceCache: ImportReferenceCache = {
        supervisors: new Map<string, SupervisorReference | null>(),
        promoters: new Map<string, PromoterReference | null>(),
      };
      const existingCustomers = await this.loadExistingCustomersForImport(
        actor.companyId,
        preparedRows,
      );
      const decisions = await this.buildImportDecisions(
        actor,
        preparedRows,
        existingCustomers,
        options,
        referenceCache,
      );
      const counts = this.countImportDecisions(decisions);
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();

      this.logger.log(
        `Processando lote de importacao batchId=${batch.id} apply=${options.apply} decisions=${decisions.length}`,
      );

      if (!options.apply) {
        await this.updateImportItems(batch.id, decisions, finishedAt);
        await this.prismaService.customerImportBatch.update({
          where: {
            id: batch.id,
          },
          data: {
            status: CustomerImportBatchStatus.PREVIEWED,
            createdCount: counts.createdCount,
            updatedCount: counts.updatedCount,
            ignoredCount: counts.ignoredCount,
            errorCount: counts.errorCount,
            logSummary:
              sanitizeStorageString(
                this.buildImportSummaryLog(options.logPrefix, counts, false),
              ) ?? this.buildImportSummaryLog(options.logPrefix, counts, false),
            finishedAt,
            durationMs,
            lastError: null,
          },
        });

        await this.auditService.record(
          actor.id,
          AuditEntityType.CUSTOMER_IMPORT_BATCH,
          batch.id,
          'customer-import.previewed',
          {
            sourceType: options.sourceType,
            ...counts,
            durationMs,
          },
        );

        return;
      }

      const finalizedDecisions = await this.applyImportDecisions(
        actor.companyId,
        batch.id,
        decisions,
        options,
      );
      const finalizedCounts = this.countImportDecisions(finalizedDecisions);

      await this.updateImportItems(batch.id, finalizedDecisions, finishedAt);
      await this.prismaService.customerImportBatch.update({
        where: {
          id: batch.id,
        },
        data: {
          status:
            finalizedCounts.errorCount > 0
              ? CustomerImportBatchStatus.COMPLETED_WITH_ERRORS
              : CustomerImportBatchStatus.COMPLETED,
          createdCount: finalizedCounts.createdCount,
          updatedCount: finalizedCounts.updatedCount,
          ignoredCount: finalizedCounts.ignoredCount,
          errorCount: finalizedCounts.errorCount,
          logSummary:
            sanitizeStorageString(
              this.buildImportSummaryLog(
                options.logPrefix,
                finalizedCounts,
                true,
              ),
            ) ??
            this.buildImportSummaryLog(
              options.logPrefix,
              finalizedCounts,
              true,
            ),
          finishedAt,
          durationMs,
          lastError: null,
        },
      });

      await this.auditService.record(
        actor.id,
        AuditEntityType.CUSTOMER_IMPORT_BATCH,
        batch.id,
        'customer-import.completed',
        {
          sourceType: options.sourceType,
          applyChanges: true,
          readCount: preparedRows.length,
          durationMs,
        },
      );
    } catch (error) {
      const fallbackPayload =
        batch.requestPayload === null
          ? null
          : this.safeParseBatchRequestPayload(batch.requestPayload);
      const fallbackOptions: ImportExecutionOptions = fallbackPayload
        ? this.rebuildExecutionOptionsFromBatch(batch, fallbackPayload)
        : {
            sourceType: batch.sourceType,
            customerSourceType:
              batch.sourceType === CustomerImportSourceType.WINTHOR
                ? CustomerSourceType.WINTHOR
                : CustomerSourceType.CSV,
            apply: batch.applyChanges,
            allowCreate: true,
            allowUpdate: true,
            ignoreDuplicates: true,
            fallbackSupervisorUserId:
              actor.role === UserRole.SUPERVISOR ? actor.id : null,
            fallbackDefaultPromoterUserId: null,
            logPrefix: 'Importacao de clientes',
          };

      await this.handleImportBatchProcessingError(
        actor.id,
        batch.id,
        batch.attemptCount,
        startedAt,
        fallbackOptions,
        error,
      );
    }
  }

  private async buildImportDecisions(
    actor: CustomerActorContext,
    preparedRows: ImportPreparedRow[],
    existingCustomers: ExistingCustomerIdentity[],
    options: ImportExecutionOptions,
    referenceCache: ImportReferenceCache,
  ) {
    const seenKeys = new Map<string, number>();
    const existingByCode = new Map<string, ExistingCustomerIdentity>();
    const existingByWinthorCode = new Map<string, ExistingCustomerIdentity>();
    const existingByCnpj = new Map<string, ExistingCustomerIdentity>();

    existingCustomers.forEach((customer) => {
      existingByCode.set(customer.code, customer);

      if (customer.winthorCustomerCode) {
        existingByWinthorCode.set(customer.winthorCustomerCode, customer);
      }

      if (customer.cnpj) {
        existingByCnpj.set(customer.cnpj, customer);
      }
    });

    const decisions: ImportDecision[] = [];

    for (const preparedRow of preparedRows) {
      if (!preparedRow.payload) {
        const issues =
          preparedRow.issues.length > 0
            ? preparedRow.issues
            : [
                preparedRow.errorMessage ??
                  'Linha invalida para importacao de clientes',
              ];

        decisions.push({
          rowNumber: preparedRow.rowNumber,
          status: CustomerImportItemStatus.ERROR,
          customerId: null,
          customerCode: null,
          winthorCustomerCode: null,
          cnpj: null,
          legalName: null,
          tradeName: null,
          message: issues[0] ?? 'Linha invalida para importacao de clientes',
          issues,
          conflictKeys: [],
          rawPayload: preparedRow.rawPayload,
        });
        continue;
      }

      const payload = preparedRow.payload;
      const duplicateInFile = this.detectDuplicateKeysInFile(payload, seenKeys);

      if (duplicateInFile) {
        const duplicateMessage = `Duplicidade no arquivo detectada na chave ${duplicateInFile.key} (linha ${duplicateInFile.firstRowNumber})`;
        decisions.push({
          rowNumber: preparedRow.rowNumber,
          status: options.ignoreDuplicates
            ? CustomerImportItemStatus.IGNORE
            : CustomerImportItemStatus.ERROR,
          customerId: null,
          customerCode: payload.code,
          winthorCustomerCode: payload.winthorCustomerCode,
          cnpj: payload.cnpj,
          legalName: payload.legalName,
          tradeName: payload.tradeName,
          message: duplicateMessage,
          issues: [duplicateMessage],
          conflictKeys: [duplicateInFile.key],
          rawPayload: preparedRow.rawPayload,
        });
        continue;
      }

      this.registerSeenKeys(payload, preparedRow.rowNumber, seenKeys);
      const matchedCustomers = this.resolveMatchedCustomers(payload, {
        existingByCode,
        existingByWinthorCode,
        existingByCnpj,
      });

      if (matchedCustomers.size > 1) {
        const conflictMessage =
          'Os identificadores informados apontam para clientes diferentes e exigem conciliacao manual';
        decisions.push({
          rowNumber: preparedRow.rowNumber,
          status: CustomerImportItemStatus.ERROR,
          customerId: null,
          customerCode: payload.code,
          winthorCustomerCode: payload.winthorCustomerCode,
          cnpj: payload.cnpj,
          legalName: payload.legalName,
          tradeName: payload.tradeName,
          message: conflictMessage,
          issues: [conflictMessage],
          conflictKeys: this.resolveConflictKeys(payload, matchedCustomers),
          rawPayload: preparedRow.rawPayload,
        });
        continue;
      }

      const existingCustomer = [...matchedCustomers][0] ?? null;

      if (
        existingCustomer &&
        !this.isCustomerAccessibleToActor(actor, existingCustomer)
      ) {
        const scopeMessage =
          'Cliente localizado fora do escopo permitido para este supervisor';
        decisions.push({
          rowNumber: preparedRow.rowNumber,
          status: CustomerImportItemStatus.ERROR,
          customerId: existingCustomer.id,
          customerCode: payload.code,
          winthorCustomerCode: payload.winthorCustomerCode,
          cnpj: payload.cnpj,
          legalName: payload.legalName,
          tradeName: payload.tradeName,
          message: scopeMessage,
          issues: [scopeMessage],
          conflictKeys: this.resolveConflictKeys(payload, matchedCustomers),
          rawPayload: preparedRow.rawPayload,
          existingCustomer,
        });
        continue;
      }

      try {
        const resolvedPayload = await this.resolveImportCustomerPayload(
          actor,
          payload,
          referenceCache,
          existingCustomer,
          options,
        );

        if (!existingCustomer) {
          if (!options.allowCreate) {
            decisions.push({
              rowNumber: preparedRow.rowNumber,
              status: CustomerImportItemStatus.IGNORE,
              customerId: null,
              customerCode: resolvedPayload.code,
              winthorCustomerCode: resolvedPayload.winthorCustomerCode,
              cnpj: resolvedPayload.cnpj,
              legalName: resolvedPayload.legalName,
              tradeName: resolvedPayload.tradeName,
              message: 'Criacao de novos clientes desabilitada para este lote',
              issues: [],
              conflictKeys: [],
              rawPayload: preparedRow.rawPayload,
            });
            continue;
          }

          decisions.push({
            rowNumber: preparedRow.rowNumber,
            status: CustomerImportItemStatus.CREATE,
            customerId: null,
            customerCode: resolvedPayload.code,
            winthorCustomerCode: resolvedPayload.winthorCustomerCode,
            cnpj: resolvedPayload.cnpj,
            legalName: resolvedPayload.legalName,
            tradeName: resolvedPayload.tradeName,
            message: this.hasUsableCoordinates(
              resolvedPayload.latitude,
              resolvedPayload.longitude,
            )
              ? 'Cliente pronto para cadastro'
              : 'Cliente sera importado sem geolocalizacao cadastrada',
            issues: [],
            conflictKeys: [],
            rawPayload: preparedRow.rawPayload,
            payload: resolvedPayload,
          });
          continue;
        }

        if (!options.allowUpdate) {
          decisions.push({
            rowNumber: preparedRow.rowNumber,
            status: CustomerImportItemStatus.IGNORE,
            customerId: existingCustomer.id,
            customerCode: resolvedPayload.code,
            winthorCustomerCode: resolvedPayload.winthorCustomerCode,
            cnpj: resolvedPayload.cnpj,
            legalName: resolvedPayload.legalName,
            tradeName: resolvedPayload.tradeName,
            message:
              'Cliente ja existe e a atualizacao foi desabilitada para este lote',
            issues: [],
            conflictKeys: this.resolveConflictKeys(payload, matchedCustomers),
            rawPayload: preparedRow.rawPayload,
            existingCustomer,
          });
          continue;
        }

        if (
          options.ignoreDuplicates &&
          !this.hasCustomerChanges(existingCustomer, resolvedPayload)
        ) {
          decisions.push({
            rowNumber: preparedRow.rowNumber,
            status: CustomerImportItemStatus.IGNORE,
            customerId: existingCustomer.id,
            customerCode: resolvedPayload.code,
            winthorCustomerCode: resolvedPayload.winthorCustomerCode,
            cnpj: resolvedPayload.cnpj,
            legalName: resolvedPayload.legalName,
            tradeName: resolvedPayload.tradeName,
            message: 'Registro ja cadastrado sem alteracoes relevantes',
            issues: [],
            conflictKeys: this.resolveConflictKeys(payload, matchedCustomers),
            rawPayload: preparedRow.rawPayload,
            existingCustomer,
          });
          continue;
        }

        decisions.push({
          rowNumber: preparedRow.rowNumber,
          status: CustomerImportItemStatus.UPDATE,
          customerId: existingCustomer.id,
          customerCode: resolvedPayload.code,
          winthorCustomerCode: resolvedPayload.winthorCustomerCode,
          cnpj: resolvedPayload.cnpj,
          legalName: resolvedPayload.legalName,
          tradeName: resolvedPayload.tradeName,
          message: 'Cliente existente pronto para atualizacao segura',
          issues: [],
          conflictKeys: this.resolveConflictKeys(payload, matchedCustomers),
          rawPayload: preparedRow.rawPayload,
          existingCustomer,
          payload: resolvedPayload,
        });
      } catch (error) {
        const issues =
          error instanceof ImportRowValidationError
            ? error.issues
            : [
                error instanceof Error
                  ? error.message
                  : 'Falha ao validar a linha para importacao',
              ];

        decisions.push({
          rowNumber: preparedRow.rowNumber,
          status: CustomerImportItemStatus.ERROR,
          customerId: existingCustomer?.id ?? null,
          customerCode: payload.code,
          winthorCustomerCode: payload.winthorCustomerCode,
          cnpj: payload.cnpj,
          legalName: payload.legalName,
          tradeName: payload.tradeName,
          message: issues[0] ?? 'Falha ao validar a linha para importacao',
          issues,
          conflictKeys: existingCustomer
            ? this.resolveConflictKeys(payload, matchedCustomers)
            : [],
          rawPayload: preparedRow.rawPayload,
          existingCustomer,
        });
      }
    }

    return decisions;
  }

  private async applyImportDecisions(
    companyId: string,
    batchId: string,
    decisions: ImportDecision[],
    options: ImportExecutionOptions,
  ) {
    const finalizedDecisions: ImportDecision[] = [];

    const decisionChunks = this.chunkRecords(
      decisions,
      IMPORT_WRITE_CHUNK_SIZE,
    );

    for (const [chunkIndex, chunk] of decisionChunks.entries()) {
      this.logger.debug(
        `Aplicando chunk de importacao batchId=${batchId} chunk=${chunkIndex + 1}/${decisionChunks.length} size=${chunk.length}`,
      );

      for (const decision of chunk) {
        if (!decision.payload) {
          finalizedDecisions.push(decision);
          continue;
        }

        try {
          if (decision.status === CustomerImportItemStatus.CREATE) {
            const created = await this.prismaService.customer.create({
              data: this.toCustomerCreateInput(companyId, decision.payload, {
                sourceType: options.customerSourceType,
                importBatchId: batchId,
                lastSyncedAt: decision.payload.lastSyncedAt ?? new Date(),
              }),
            });

            finalizedDecisions.push({
              ...decision,
              customerId: created.id,
              message: 'Cliente criado com sucesso na base operacional local',
            });
            continue;
          }

          if (
            decision.status === CustomerImportItemStatus.UPDATE &&
            decision.customerId &&
            decision.existingCustomer
          ) {
            const preservedSourceType =
              decision.existingCustomer.sourceType === CustomerSourceType.MANUAL
                ? CustomerSourceType.MANUAL
                : options.customerSourceType;

            await this.prismaService.customer.update({
              where: {
                id: decision.customerId,
              },
              data: this.toCustomerUpdateInput(decision.payload, {
                sourceType: preservedSourceType,
                importBatchId: batchId,
                lastSyncedAt: decision.payload.lastSyncedAt ?? new Date(),
              }),
            });

            finalizedDecisions.push({
              ...decision,
              message:
                'Cliente existente atualizado com seguranca na base local',
            });
            continue;
          }

          finalizedDecisions.push(decision);
        } catch (error) {
          finalizedDecisions.push({
            ...decision,
            status: CustomerImportItemStatus.ERROR,
            message: this.resolveImportPersistenceErrorMessage(
              error,
              decision.status === CustomerImportItemStatus.CREATE
                ? 'Falha ao criar cliente na base operacional local'
                : 'Falha ao atualizar cliente na base operacional local',
            ),
          });
        }
      }
    }

    return finalizedDecisions;
  }

  private async persistStagedImportItems(
    batchId: string,
    stagedRows: StagedImportRow[],
  ) {
    if (stagedRows.length === 0) {
      return;
    }

    const stagedChunks = this.chunkRecords(stagedRows, IMPORT_WRITE_CHUNK_SIZE);

    this.logger.log(
      `Persistindo staging do lote batchId=${batchId} total=${stagedRows.length} chunks=${stagedChunks.length}`,
    );

    for (const [chunkIndex, chunk] of stagedChunks.entries()) {
      await this.prismaService.customerImportItem.createMany({
        data: chunk.map((stagedRow) => ({
          batchId,
          customerId: null,
          rowNumber: stagedRow.rowNumber,
          status: CustomerImportItemStatus.STAGED,
          customerCode: sanitizeStorageString(stagedRow.preview.payload?.code),
          winthorCustomerCode: sanitizeStorageString(
            stagedRow.preview.payload?.winthorCustomerCode,
          ),
          cnpj: sanitizeStorageString(stagedRow.preview.payload?.cnpj),
          legalName: sanitizeStorageString(
            stagedRow.preview.payload?.legalName,
          ),
          tradeName: sanitizeStorageString(
            stagedRow.preview.payload?.tradeName,
          ),
          message:
            sanitizeStorageString(stagedRow.preview.errorMessage) ??
            'Registro recebido e aguardando validacao do job de importacao',
          conflictKeys: [],
          rawPayload:
            sanitizeJsonForStorage(
              withImportPayloadMetadata(
                stagedRow.rawPayload,
                stagedRow.preview.issues,
              ),
            ) ??
            withImportPayloadMetadata(
              stagedRow.rawPayload,
              stagedRow.preview.issues,
            ),
        })),
      });

      this.logger.debug(
        `Chunk de staging persistido batchId=${batchId} chunk=${chunkIndex + 1}/${stagedChunks.length} size=${chunk.length}`,
      );
    }
  }

  private async updateImportItems(
    batchId: string,
    decisions: ImportDecision[],
    processedAt: Date,
  ) {
    if (decisions.length === 0) {
      return;
    }

    const decisionChunks = this.chunkRecords(
      decisions,
      IMPORT_WRITE_CHUNK_SIZE,
    );

    this.logger.log(
      `Persistindo preview/importacao batchId=${batchId} total=${decisions.length} chunks=${decisionChunks.length}`,
    );

    for (const [chunkIndex, chunk] of decisionChunks.entries()) {
      await this.prismaService.$transaction(
        chunk.map((decision) =>
          this.prismaService.customerImportItem.update({
            where: {
              batchId_rowNumber: {
                batchId,
                rowNumber: decision.rowNumber,
              },
            },
            data: {
              customerId: decision.customerId ?? null,
              status: decision.status,
              customerCode: sanitizeStorageString(decision.customerCode),
              winthorCustomerCode: sanitizeStorageString(
                decision.winthorCustomerCode,
              ),
              cnpj: sanitizeStorageString(decision.cnpj),
              legalName: sanitizeStorageString(decision.legalName),
              tradeName: sanitizeStorageString(decision.tradeName),
              message:
                sanitizeStorageString(decision.message) ??
                'Erro nao detalhado na importacao',
              conflictKeys: sanitizeStorageStringArray(decision.conflictKeys),
              rawPayload:
                sanitizeJsonForStorage(
                  withImportPayloadMetadata(
                    decision.rawPayload,
                    decision.issues,
                  ),
                ) ??
                withImportPayloadMetadata(decision.rawPayload, decision.issues),
              processedAt,
            },
          }),
        ),
      );

      this.logger.debug(
        `Chunk de item persistido batchId=${batchId} chunk=${chunkIndex + 1}/${decisionChunks.length} size=${chunk.length}`,
      );
    }
  }

  private chunkRecords<T>(records: T[], chunkSize: number) {
    if (records.length === 0) {
      return [] as T[][];
    }

    const normalizedChunkSize = Math.max(1, chunkSize);
    const chunks: T[][] = [];

    for (let index = 0; index < records.length; index += normalizedChunkSize) {
      chunks.push(records.slice(index, index + normalizedChunkSize));
    }

    return chunks;
  }

  private resolveImportPersistenceErrorMessage(
    error: unknown,
    fallbackMessage: string,
  ) {
    if (this.isInvalidImportEncodingError(error)) {
      return 'Arquivo contem caracteres invalidos ou codificacao incompativel. Salve em UTF-8 e tente novamente.';
    }

    try {
      this.rethrowKnownConstraintError(error);
    } catch (mappedError) {
      if (mappedError instanceof Error) {
        return mappedError.message;
      }
    }

    if (
      error instanceof BadRequestException ||
      error instanceof ConflictException ||
      error instanceof NotFoundException
    ) {
      return error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return fallbackMessage;
  }

  private rethrowInvalidImportEncodingError(error: unknown): never | void {
    if (this.isInvalidImportEncodingError(error)) {
      throw new BadRequestException(
        'Arquivo contem caracteres invalidos ou codificacao incompativel. Salve em UTF-8 e tente novamente.',
      );
    }
  }

  private analyzeCsvHeaders(normalizedHeaders: string[]): CsvHeaderDiagnostics {
    const knownHeaders = new Set<string>(
      Object.values(csvHeaderAliases).flatMap((aliases) => [...aliases]),
    );
    const recognizedHeaders = normalizedHeaders.filter(
      (header) => !header.startsWith('column_') && knownHeaders.has(header),
    );
    const unrecognizedHeaders = normalizedHeaders.filter(
      (header) => !header.startsWith('column_') && !knownHeaders.has(header),
    );
    const missingRequiredHeaders = csvHeaderRequirements
      .filter(
        (requirement) =>
          !requirement.aliases.some((alias) =>
            normalizedHeaders.includes(alias),
          ),
      )
      .map((requirement) => requirement.label);
    const incompatibleLayout = missingRequiredHeaders.length > 0;

    return {
      recognizedHeaders,
      unrecognizedHeaders,
      missingRequiredHeaders,
      incompatibleLayout,
      layoutMessage: incompatibleLayout
        ? `O arquivo enviado nao corresponde ao layout de importacao de clientes. Colunas obrigatorias ausentes: ${missingRequiredHeaders.join(', ')}.`
        : null,
    };
  }

  private parseCsvCoordinate(
    rawValue: string | null,
    fieldLabel: 'Latitude' | 'Longitude',
  ) {
    const normalized = normalizeString(rawValue);

    if (!normalized) {
      return null;
    }

    const parsed = parseNumber(normalized);

    if (parsed === null) {
      throw new BadRequestException(
        `${fieldLabel} invalida. Revise o formato numerico da coluna.`,
      );
    }

    if (fieldLabel === 'Latitude' && (parsed < -90 || parsed > 90)) {
      throw new BadRequestException(
        'Latitude invalida. O valor deve estar entre -90 e 90.',
      );
    }

    if (fieldLabel === 'Longitude' && (parsed < -180 || parsed > 180)) {
      throw new BadRequestException(
        'Longitude invalida. O valor deve estar entre -180 e 180.',
      );
    }

    return parsed;
  }

  private dedupeImportIssues(issues: string[]) {
    return [
      ...new Set(issues.map((issue) => sanitizeStorageString(issue) ?? issue)),
    ].filter((issue) => issue.trim().length > 0);
  }

  private collectCsvCoordinate(
    rawValue: string | null,
    fieldLabel: 'Latitude' | 'Longitude',
    issues: string[],
  ) {
    try {
      return this.parseCsvCoordinate(rawValue, fieldLabel);
    } catch (error) {
      issues.push(
        error instanceof Error
          ? error.message
          : `${fieldLabel} invalida. Revise o formato numerico da coluna.`,
      );
      return null;
    }
  }

  private collectCsvInteger(
    rawValue: string | null,
    fieldLabel: string,
    issues: string[],
    options?: {
      min?: number;
      max?: number;
    },
  ) {
    const normalized = normalizeString(rawValue);

    if (!normalized) {
      return null;
    }

    const parsed = parseInteger(normalized);

    if (parsed === null) {
      issues.push(
        `${fieldLabel} invalido. Revise o formato numerico da coluna.`,
      );
      return null;
    }

    if (options?.min !== undefined && parsed < options.min) {
      issues.push(
        `${fieldLabel} invalido. O valor minimo permitido e ${options.min}.`,
      );
      return null;
    }

    if (options?.max !== undefined && parsed > options.max) {
      issues.push(
        `${fieldLabel} invalido. O valor maximo permitido e ${options.max}.`,
      );
      return null;
    }

    return parsed;
  }

  private prepareCsvRow(
    row: {
      rowNumber: number;
      values: Record<string, string>;
      cellsCount?: number;
      extraValues?: string[];
    },
    headerDiagnostics?: CsvHeaderDiagnostics,
  ) {
    if (headerDiagnostics?.incompatibleLayout) {
      const issues = this.dedupeImportIssues([
        headerDiagnostics.layoutMessage ??
          'O arquivo enviado nao corresponde ao layout de importacao de clientes.',
      ]);

      return {
        rowNumber: row.rowNumber,
        rawPayload: row.values,
        issues,
        errorMessage: issues[0],
      } satisfies ImportPreparedRow;
    }

    const issues: string[] = [];
    const extraValues =
      row.extraValues?.filter((value) => value.trim().length > 0) ?? [];

    if (extraValues.length > 0) {
      issues.push(
        `Linha possui ${extraValues.length} coluna(s) excedente(s) apos o cabecalho. Revise o layout do arquivo.`,
      );
    }

    try {
      const latitudeRaw = this.pickCsvValue(
        row.values,
        csvHeaderAliases.latitude,
      );
      const longitudeRaw = this.pickCsvValue(
        row.values,
        csvHeaderAliases.longitude,
      );
      const payload = this.normalizeImportPayload({
        code: this.pickCsvValue(row.values, csvHeaderAliases.code),
        winthorCustomerCode: this.pickCsvValue(
          row.values,
          csvHeaderAliases.winthorCustomerCode,
        ),
        legalName: this.pickCsvValue(row.values, csvHeaderAliases.legalName),
        tradeName: this.pickCsvValue(row.values, csvHeaderAliases.tradeName),
        cnpj: this.pickCsvValue(row.values, csvHeaderAliases.cnpj),
        stateRegistration: this.pickCsvValue(
          row.values,
          csvHeaderAliases.stateRegistration,
        ),
        contactName: this.pickCsvValue(
          row.values,
          csvHeaderAliases.contactName,
        ),
        phone: this.pickCsvValue(row.values, csvHeaderAliases.phone),
        email: this.pickCsvValue(row.values, csvHeaderAliases.email),
        zipCode: this.pickCsvValue(row.values, csvHeaderAliases.zipCode),
        address: this.pickCsvValue(row.values, csvHeaderAliases.address),
        addressNumber: this.pickCsvValue(
          row.values,
          csvHeaderAliases.addressNumber,
        ),
        complement: this.pickCsvValue(row.values, csvHeaderAliases.complement),
        district: this.pickCsvValue(row.values, csvHeaderAliases.district),
        city: this.pickCsvValue(row.values, csvHeaderAliases.city),
        state: this.pickCsvValue(row.values, csvHeaderAliases.state),
        latitude: this.collectCsvCoordinate(latitudeRaw, 'Latitude', issues),
        longitude: this.collectCsvCoordinate(longitudeRaw, 'Longitude', issues),
        geofenceRadiusM: this.collectCsvInteger(
          this.pickCsvValue(row.values, csvHeaderAliases.geofenceRadiusM),
          'Raio de geofence',
          issues,
          { min: 20, max: 1000 },
        ),
        routeName: this.pickCsvValue(row.values, csvHeaderAliases.routeName),
        region: this.pickCsvValue(row.values, csvHeaderAliases.region),
        supervisorUserId: this.pickCsvValue(
          row.values,
          csvHeaderAliases.supervisorUserId,
        ),
        defaultPromoterUserId: this.pickCsvValue(
          row.values,
          csvHeaderAliases.defaultPromoterUserId,
        ),
        visitFrequency: this.pickCsvValue(
          row.values,
          csvHeaderAliases.visitFrequency,
        ),
        preferredVisitDays: parseMultiValueField(
          this.pickCsvValue(row.values, csvHeaderAliases.preferredVisitDays),
        ),
        preferredVisitTimeStart: this.pickCsvValue(
          row.values,
          csvHeaderAliases.preferredVisitTimeStart,
        ),
        preferredVisitTimeEnd: this.pickCsvValue(
          row.values,
          csvHeaderAliases.preferredVisitTimeEnd,
        ),
        notes: this.pickCsvValue(row.values, csvHeaderAliases.notes),
        status: this.pickCsvValue(row.values, csvHeaderAliases.status),
        active: this.pickCsvValue(row.values, csvHeaderAliases.active),
        sourceType: CustomerSourceType.CSV,
        lastSyncedAt: null,
      });

      const normalizedIssues = this.dedupeImportIssues(issues);

      if (normalizedIssues.length > 0) {
        return {
          rowNumber: row.rowNumber,
          rawPayload: row.values,
          issues: normalizedIssues,
          errorMessage: normalizedIssues[0],
        } satisfies ImportPreparedRow;
      }

      return {
        rowNumber: row.rowNumber,
        rawPayload: row.values,
        issues: [],
        payload,
      } satisfies ImportPreparedRow;
    } catch (error) {
      const normalizedIssues = this.dedupeImportIssues([
        ...issues,
        ...(error instanceof ImportRowValidationError
          ? error.issues
          : [
              error instanceof Error
                ? error.message
                : 'Falha ao validar linha CSV',
            ]),
      ]);

      return {
        rowNumber: row.rowNumber,
        rawPayload: row.values,
        issues: normalizedIssues,
        errorMessage: normalizedIssues[0] ?? 'Falha ao validar linha CSV',
      } satisfies ImportPreparedRow;
    }
  }

  private prepareWinthorRow(
    record: ReadonlyWinthorCustomerRecord,
    rowNumber: number,
  ) {
    try {
      const payload = this.normalizeImportPayload({
        code: record.customerCode,
        winthorCustomerCode: record.winthorCustomerCode,
        legalName: record.legalName,
        tradeName: record.tradeName,
        cnpj: record.cnpj ?? null,
        stateRegistration: record.stateRegistration ?? null,
        contactName: record.contactName ?? null,
        phone: record.phone ?? null,
        email: record.email ?? null,
        zipCode: record.zipCode ?? null,
        address: record.address,
        addressNumber: record.addressNumber ?? null,
        complement: record.complement ?? null,
        district: record.district ?? null,
        city: record.city,
        state: record.state,
        latitude: record.latitude ?? null,
        longitude: record.longitude ?? null,
        geofenceRadiusM: record.geofenceRadiusM ?? null,
        routeName: record.routeName ?? null,
        region: record.region ?? null,
        supervisorUserId: null,
        defaultPromoterUserId: null,
        visitFrequency: record.visitFrequency ?? null,
        preferredVisitDays: record.preferredVisitDays ?? [],
        preferredVisitTimeStart: record.preferredVisitTimeStart ?? null,
        preferredVisitTimeEnd: record.preferredVisitTimeEnd ?? null,
        notes: record.notes ?? null,
        status: CustomerStatus.ACTIVE,
        active: null,
        sourceType: CustomerSourceType.WINTHOR,
        lastSyncedAt: record.lastSyncedAt ?? new Date(),
      });

      return {
        rowNumber,
        rawPayload: this.serializeWinthorRecord(record),
        issues: [],
        payload,
      } satisfies ImportPreparedRow;
    } catch (error) {
      const issues = this.dedupeImportIssues(
        error instanceof ImportRowValidationError
          ? error.issues
          : [
              error instanceof Error
                ? error.message
                : 'Falha ao validar registro Winthor',
            ],
      );

      return {
        rowNumber,
        rawPayload: this.serializeWinthorRecord(record),
        issues,
        errorMessage: issues[0] ?? 'Falha ao validar registro Winthor',
      } satisfies ImportPreparedRow;
    }
  }

  private serializeWinthorRecord(record: ReadonlyWinthorCustomerRecord) {
    return {
      ...record,
      lastSyncedAt: record.lastSyncedAt?.toISOString() ?? null,
    } satisfies Prisma.InputJsonObject;
  }

  private deserializeWinthorRecord(
    rawPayload: Prisma.JsonValue,
  ): ReadonlyWinthorCustomerRecord {
    if (
      !rawPayload ||
      Array.isArray(rawPayload) ||
      typeof rawPayload !== 'object'
    ) {
      throw new BadRequestException(
        'Payload de staging do Winthor invalido para reprocessamento',
      );
    }

    const record = rawPayload as Record<string, unknown>;

    return {
      customerCode: normalizeString(
        this.coerceNullableString(record.customerCode),
      ),
      winthorCustomerCode: normalizeString(
        this.coerceNullableString(record.winthorCustomerCode),
      ),
      legalName: normalizeString(this.coerceNullableString(record.legalName)),
      tradeName: normalizeString(this.coerceNullableString(record.tradeName)),
      cnpj: normalizeOptional(this.coerceNullableString(record.cnpj)),
      stateRegistration: normalizeOptional(
        this.coerceNullableString(record.stateRegistration),
      ),
      contactName: normalizeOptional(
        this.coerceNullableString(record.contactName),
      ),
      phone: normalizeOptional(this.coerceNullableString(record.phone)),
      email: normalizeOptional(this.coerceNullableString(record.email)),
      zipCode: normalizeOptional(this.coerceNullableString(record.zipCode)),
      address: normalizeString(this.coerceNullableString(record.address)),
      addressNumber: normalizeOptional(
        this.coerceNullableString(record.addressNumber),
      ),
      complement: normalizeOptional(
        this.coerceNullableString(record.complement),
      ),
      district: normalizeOptional(this.coerceNullableString(record.district)),
      city: normalizeString(this.coerceNullableString(record.city)),
      state: normalizeString(this.coerceNullableString(record.state)),
      latitude: parseNumber(this.coerceNullableString(record.latitude)),
      longitude: parseNumber(this.coerceNullableString(record.longitude)),
      geofenceRadiusM: parseInteger(
        this.coerceNullableString(record.geofenceRadiusM),
      ),
      routeName: normalizeOptional(this.coerceNullableString(record.routeName)),
      region: normalizeOptional(this.coerceNullableString(record.region)),
      visitFrequency: normalizeOptional(
        this.coerceNullableString(record.visitFrequency),
      ),
      preferredVisitDays: Array.isArray(record.preferredVisitDays)
        ? record.preferredVisitDays
            .map((item) => normalizeUpper(this.coerceNullableString(item)))
            .filter((item): item is string => Boolean(item))
        : [],
      preferredVisitTimeStart: normalizeOptional(
        this.coerceNullableString(record.preferredVisitTimeStart),
      ),
      preferredVisitTimeEnd: normalizeOptional(
        this.coerceNullableString(record.preferredVisitTimeEnd),
      ),
      notes: normalizeOptional(this.coerceNullableString(record.notes)),
      lastSyncedAt:
        typeof record.lastSyncedAt === 'string' &&
        record.lastSyncedAt.length > 0
          ? new Date(record.lastSyncedAt)
          : null,
    };
  }

  private coerceNullableString(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'string') {
      return value;
    }

    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    return null;
  }

  private coerceJsonStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => normalizeString(this.coerceNullableString(item)))
      .filter(Boolean);
  }

  private coerceJsonInteger(value: unknown) {
    const raw = this.coerceNullableString(value);
    const parsed = raw === null ? Number.NaN : Number(raw);

    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  }

  private normalizeManualPayload(
    dto: UpsertCustomerDto,
  ): ManualCustomerPayload {
    return {
      code: dto.code.trim().toUpperCase(),
      winthorCustomerCode: dto.winthorCustomerCode?.trim() || null,
      legalName: dto.legalName.trim(),
      tradeName: dto.tradeName.trim(),
      cnpj: normalizeDigits(dto.cnpj),
      stateRegistration: dto.stateRegistration?.trim() || null,
      contactName: dto.contactName.trim(),
      phone: dto.phone.trim(),
      email: dto.email?.trim().toLowerCase() || null,
      zipCode: dto.zipCode ? normalizeDigits(dto.zipCode) : null,
      address: dto.address.trim(),
      addressNumber: dto.addressNumber?.trim() || null,
      complement: dto.complement?.trim() || null,
      district: dto.district.trim(),
      city: dto.city.trim(),
      state: dto.state.trim().toUpperCase(),
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      geofenceRadiusM: dto.geofenceRadiusM,
      routeName: dto.routeName.trim(),
      region: dto.region.trim(),
      supervisorUserId: dto.supervisorUserId.trim(),
      defaultPromoterUserId: dto.defaultPromoterUserId?.trim() || null,
      visitFrequency: dto.visitFrequency?.trim() || null,
      preferredVisitDays: [...new Set(dto.preferredVisitDays ?? [])],
      preferredVisitTimeStart: dto.preferredVisitTimeStart?.trim() || null,
      preferredVisitTimeEnd: dto.preferredVisitTimeEnd?.trim() || null,
      notes: dto.notes?.trim() || null,
      status: dto.status,
      schedules:
        dto.schedules === undefined
          ? undefined
          : this.normalizeSchedules(dto.schedules),
    };
  }

  private normalizeImportPayload(input: {
    code?: string | null;
    winthorCustomerCode?: string | null;
    legalName?: string | null;
    tradeName?: string | null;
    cnpj?: string | null;
    stateRegistration?: string | null;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    zipCode?: string | null;
    address?: string | null;
    addressNumber?: string | null;
    complement?: string | null;
    district?: string | null;
    city?: string | null;
    state?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    geofenceRadiusM?: number | null;
    routeName?: string | null;
    region?: string | null;
    supervisorUserId?: string | null;
    defaultPromoterUserId?: string | null;
    visitFrequency?: string | null;
    preferredVisitDays?: string[] | null;
    preferredVisitTimeStart?: string | null;
    preferredVisitTimeEnd?: string | null;
    notes?: string | null;
    status?: string | null;
    active?: string | null;
    sourceType: CustomerSourceType;
    lastSyncedAt: Date | null;
  }): ImportCustomerPayload {
    const issues: string[] = [];
    const code = normalizeUpper(input.code);
    const legalName = normalizeString(input.legalName);
    const tradeName = normalizeString(input.tradeName);
    const address = normalizeString(input.address);
    const city = normalizeString(input.city);
    const state = normalizeUpper(input.state);
    const cnpj = normalizeDigits(input.cnpj);
    const email = normalizeOptional(input.email)?.toLowerCase() ?? null;
    const zipCode = normalizeDigits(input.zipCode) || null;
    const preferredVisitDays = [
      ...new Set(
        (input.preferredVisitDays ?? [])
          .map((value) => normalizeUpper(value))
          .filter(Boolean),
      ),
    ];
    const preferredVisitTimeStart = normalizeOptional(
      input.preferredVisitTimeStart,
    );
    const preferredVisitTimeEnd = normalizeOptional(
      input.preferredVisitTimeEnd,
    );
    const normalizedStatus = normalizeUpper(input.status);
    const normalizedActive = normalizeString(input.active).toLowerCase();
    const explicitActiveValues = new Set([
      '1',
      '0',
      'true',
      'false',
      'sim',
      'nao',
      'não',
      'yes',
      'no',
      'ativo',
      'inativo',
      'active',
      'inactive',
    ]);
    const statusExplicitlyProvided =
      normalizedStatus.length > 0 || normalizedActive.length > 0;

    if (!code) {
      issues.push('Codigo do cliente obrigatorio');
    }

    if (!legalName && !tradeName) {
      issues.push('Razao social ou nome fantasia obrigatorio');
    }

    if (!city) {
      issues.push('Cidade obrigatoria');
    }

    if (state && state.length !== 2) {
      issues.push('UF invalida');
    }

    if (cnpj && cnpj.length !== 14) {
      issues.push('CNPJ invalido. Informe 14 digitos.');
    } else if (cnpj && !isValidCnpj(cnpj)) {
      issues.push('CNPJ invalido. Digitos verificadores nao conferem.');
    }

    if (email && !EMAIL_REGEX.test(email)) {
      issues.push('Email invalido');
    }

    if (zipCode && zipCode.length !== 8) {
      issues.push('CEP invalido. Informe 8 digitos.');
    }

    if (
      input.latitude !== null &&
      input.latitude !== undefined &&
      (input.latitude < -90 || input.latitude > 90)
    ) {
      issues.push('Latitude invalida. O valor deve estar entre -90 e 90.');
    }

    if (
      input.longitude !== null &&
      input.longitude !== undefined &&
      (input.longitude < -180 || input.longitude > 180)
    ) {
      issues.push('Longitude invalida. O valor deve estar entre -180 e 180.');
    }

    if (
      input.geofenceRadiusM !== null &&
      input.geofenceRadiusM !== undefined &&
      (input.geofenceRadiusM < 20 || input.geofenceRadiusM > 1000)
    ) {
      issues.push(
        'Raio de geofence invalido. Informe um valor entre 20 e 1000 metros.',
      );
    }

    const invalidVisitDays = preferredVisitDays.filter(
      (day) => !VALID_PREFERRED_VISIT_DAYS.has(day as ScheduleDayOfWeek),
    );

    if (invalidVisitDays.length > 0) {
      issues.push(
        `Dias preferenciais invalidos: ${invalidVisitDays.join(', ')}`,
      );
    }

    if (
      preferredVisitTimeStart &&
      !TIME_WINDOW_REGEX.test(preferredVisitTimeStart)
    ) {
      issues.push(
        'Horario preferencial inicial invalido. Use o formato HH:mm.',
      );
    }

    if (
      preferredVisitTimeEnd &&
      !TIME_WINDOW_REGEX.test(preferredVisitTimeEnd)
    ) {
      issues.push('Horario preferencial final invalido. Use o formato HH:mm.');
    }

    if (
      preferredVisitTimeStart &&
      preferredVisitTimeEnd &&
      preferredVisitTimeStart > preferredVisitTimeEnd
    ) {
      issues.push(
        'Horario preferencial final deve ser maior ou igual ao horario inicial.',
      );
    }

    if (
      normalizedStatus.length > 0 &&
      normalizedStatus !== CustomerStatus.ACTIVE &&
      normalizedStatus !== CustomerStatus.INACTIVE
    ) {
      issues.push('Status invalido. Use ACTIVE ou INACTIVE.');
    }

    if (
      normalizedActive.length > 0 &&
      !explicitActiveValues.has(normalizedActive)
    ) {
      issues.push(
        'Campo active invalido. Use valores como true/false, sim/nao, active/inactive ou 1/0.',
      );
    }

    if (
      normalizedStatus.length > 0 &&
      normalizedActive.length > 0 &&
      explicitActiveValues.has(normalizedActive)
    ) {
      const statusFromActive = this.resolveImportStatus(
        undefined,
        normalizedActive,
      );
      const statusFromField = this.resolveImportStatus(
        normalizedStatus,
        undefined,
      );

      if (statusFromActive !== statusFromField) {
        issues.push('Campos status e active informam valores conflitantes.');
      }
    }

    const normalizedIssues = this.dedupeImportIssues(issues);

    if (normalizedIssues.length > 0) {
      throw new ImportRowValidationError(normalizedIssues);
    }

    return {
      code,
      winthorCustomerCode: normalizeOptionalUpper(input.winthorCustomerCode),
      legalName,
      tradeName,
      cnpj: cnpj || null,
      stateRegistration: normalizeOptional(input.stateRegistration),
      contactName: normalizeOptional(input.contactName),
      phone: normalizeOptional(input.phone),
      email,
      zipCode,
      address,
      addressNumber: normalizeOptional(input.addressNumber),
      complement: normalizeOptional(input.complement),
      district: normalizeOptional(input.district),
      city,
      state,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      geofenceRadiusM: input.geofenceRadiusM ?? null,
      routeName: normalizeOptional(input.routeName),
      region: normalizeOptional(input.region),
      supervisorUserId: normalizeOptional(input.supervisorUserId),
      defaultPromoterUserId: normalizeOptional(input.defaultPromoterUserId),
      visitFrequency: normalizeOptional(input.visitFrequency),
      preferredVisitDays,
      preferredVisitTimeStart,
      preferredVisitTimeEnd,
      notes: normalizeOptional(input.notes),
      status: this.resolveImportStatus(input.status, input.active),
      statusExplicitlyProvided,
      sourceType: input.sourceType,
      lastSyncedAt: input.lastSyncedAt,
    };
  }

  private resolveImportStatus(
    statusValue?: string | null,
    activeValue?: string | null,
  ) {
    if (statusValue === CustomerStatus.ACTIVE) {
      return CustomerStatus.ACTIVE;
    }

    if (statusValue === CustomerStatus.INACTIVE) {
      return CustomerStatus.INACTIVE;
    }

    const normalizedStatus = normalizeUpper(
      typeof statusValue === 'string' ? statusValue : undefined,
    );

    if (normalizedStatus === CustomerStatus.INACTIVE) {
      return CustomerStatus.INACTIVE;
    }

    if (normalizedStatus === CustomerStatus.ACTIVE) {
      return CustomerStatus.ACTIVE;
    }

    if (activeValue && !parseBoolean(activeValue)) {
      return CustomerStatus.INACTIVE;
    }

    return CustomerStatus.ACTIVE;
  }

  private normalizeSchedules(schedules: UpsertCustomerDto['schedules']) {
    const items = schedules ?? [];
    const seenDays = new Set<ScheduleDayOfWeek>();
    const normalized: NormalizedCustomerSchedule[] = [];

    for (const schedule of items) {
      if (seenDays.has(schedule.dayOfWeek)) {
        throw new BadRequestException(
          `Dia de agenda duplicado: ${schedule.dayOfWeek}`,
        );
      }

      seenDays.add(schedule.dayOfWeek);
      normalized.push({
        dayOfWeek: schedule.dayOfWeek,
        visitWindowStart: schedule.visitWindowStart?.trim() || null,
        visitWindowEnd: schedule.visitWindowEnd?.trim() || null,
        sequenceHint: schedule.sequenceHint ?? null,
        active: schedule.active ?? true,
      });
    }

    return normalized;
  }

  private async resolveManualCustomerPayload(
    actor: CustomerActorContext,
    payload: ManualCustomerPayload,
    existing?: CustomerDetailRecord,
  ): Promise<PersistableCustomerPayload> {
    const supervisor = await this.resolveSupervisorReference(
      actor,
      payload.supervisorUserId,
    );
    const promoter = await this.resolvePromoterReference(
      actor,
      payload.defaultPromoterUserId,
    );
    const region =
      payload.region ?? supervisor?.region ?? existing?.region ?? actor.region;
    const supervisorUserId =
      payload.supervisorUserId ??
      promoter?.supervisorId ??
      existing?.supervisorUserId ??
      (actor.role === UserRole.SUPERVISOR ? actor.id : null);
    const defaultPromoterUserId =
      payload.defaultPromoterUserId ?? existing?.defaultPromoterUserId ?? null;
    const coordinates = this.resolveCoordinates(
      payload.latitude,
      payload.longitude,
      {
        existingLatitude: existing?.latitude,
        existingLongitude: existing?.longitude,
        status: payload.status,
        importMode: false,
      },
    );

    if (actor.role === UserRole.SUPERVISOR) {
      if (supervisorUserId !== actor.id) {
        throw new BadRequestException(
          'Supervisor so pode vincular clientes ao proprio contexto',
        );
      }

      if (
        actor.region &&
        region &&
        region.localeCompare(actor.region, 'pt-BR', {
          sensitivity: 'accent',
        }) !== 0
      ) {
        throw new BadRequestException(
          'Supervisor so pode gerenciar clientes da propria regiao',
        );
      }
    }

    return {
      code: payload.code,
      winthorCustomerCode: payload.winthorCustomerCode,
      legalName: payload.legalName,
      tradeName: payload.tradeName,
      cnpj: payload.cnpj,
      stateRegistration: payload.stateRegistration,
      contactName: payload.contactName,
      phone: payload.phone,
      email: payload.email,
      zipCode: payload.zipCode,
      address: payload.address,
      addressNumber: payload.addressNumber,
      complement: payload.complement,
      district: payload.district,
      city: payload.city,
      state: payload.state,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      geofenceRadiusM: payload.geofenceRadiusM,
      routeName: payload.routeName,
      region: region ?? null,
      supervisorUserId,
      defaultPromoterUserId,
      visitFrequency: payload.visitFrequency,
      preferredVisitDays: payload.preferredVisitDays,
      preferredVisitTimeStart: payload.preferredVisitTimeStart,
      preferredVisitTimeEnd: payload.preferredVisitTimeEnd,
      notes: payload.notes,
      status: coordinates.status,
      active: coordinates.status === CustomerStatus.ACTIVE,
      sourceType: existing?.sourceType ?? CustomerSourceType.MANUAL,
      lastSyncedAt: existing?.lastSyncedAt ?? null,
    };
  }

  private async resolveImportCustomerPayload(
    actor: CustomerActorContext,
    payload: ImportCustomerPayload,
    referenceCache: ImportReferenceCache,
    existing: ExistingCustomerIdentity | null,
    options: ImportExecutionOptions,
  ): Promise<PersistableCustomerPayload> {
    const requestedSupervisorReference =
      payload.supervisorUserId ?? options.fallbackSupervisorUserId;
    const requestedPromoterReference =
      payload.defaultPromoterUserId ?? options.fallbackDefaultPromoterUserId;
    const supervisor = await this.resolveSupervisorReferenceCached(
      actor,
      requestedSupervisorReference,
      referenceCache,
    );
    const promoter = await this.resolvePromoterReferenceCached(
      actor,
      requestedPromoterReference,
      referenceCache,
    );
    const region =
      payload.region ?? supervisor?.region ?? existing?.region ?? actor.region;
    const supervisorUserId =
      supervisor?.id ??
      promoter?.supervisorId ??
      existing?.supervisorUserId ??
      (actor.role === UserRole.SUPERVISOR ? actor.id : null);
    const defaultPromoterUserId =
      promoter?.id ?? existing?.defaultPromoterUserId ?? null;
    const legalName =
      payload.legalName || existing?.legalName || payload.tradeName || null;
    const tradeName =
      payload.tradeName || existing?.tradeName || payload.legalName || null;
    const address = payload.address || existing?.address || null;
    const city = payload.city || existing?.city || null;
    const state = payload.state || existing?.state || null;
    const status = payload.statusExplicitlyProvided
      ? payload.status
      : (existing?.status ?? payload.status);
    const coordinates = this.resolveCoordinates(
      payload.latitude,
      payload.longitude,
      {
        existingLatitude: existing?.latitude,
        existingLongitude: existing?.longitude,
        status,
        importMode: true,
      },
    );

    if (!legalName || !tradeName) {
      throw new BadRequestException(
        'Razao social ou nome fantasia obrigatorio para a importacao',
      );
    }

    if (!address) {
      throw new BadRequestException(
        'Endereco obrigatorio para criar ou atualizar o cliente',
      );
    }

    if (!city) {
      throw new BadRequestException(
        'Cidade obrigatoria para criar ou atualizar o cliente',
      );
    }

    if (!state || state.length !== 2) {
      throw new BadRequestException('UF obrigatoria e deve ter 2 caracteres');
    }

    if (actor.role === UserRole.SUPERVISOR) {
      if (supervisorUserId && supervisorUserId !== actor.id) {
        throw new BadRequestException(
          'Supervisor so pode importar clientes para a propria equipe',
        );
      }

      if (
        actor.region &&
        region &&
        region.localeCompare(actor.region, 'pt-BR', {
          sensitivity: 'accent',
        }) !== 0
      ) {
        throw new BadRequestException(
          'Supervisor so pode importar clientes da propria regiao',
        );
      }
    }

    return {
      code: payload.code,
      winthorCustomerCode:
        payload.winthorCustomerCode ?? existing?.winthorCustomerCode ?? null,
      legalName,
      tradeName,
      cnpj: payload.cnpj ?? existing?.cnpj ?? null,
      stateRegistration:
        payload.stateRegistration ?? existing?.stateRegistration ?? null,
      contactName: payload.contactName ?? existing?.contactName ?? null,
      phone: payload.phone ?? existing?.phone ?? null,
      email: payload.email ?? existing?.email ?? null,
      zipCode: payload.zipCode ?? existing?.zipCode ?? null,
      address,
      addressNumber: payload.addressNumber ?? existing?.addressNumber ?? null,
      complement: payload.complement ?? existing?.complement ?? null,
      district: payload.district ?? existing?.district ?? null,
      city,
      state,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      geofenceRadiusM:
        payload.geofenceRadiusM ??
        existing?.geofenceRadiusM ??
        DEFAULT_GEOFENCE_RADIUS_M,
      routeName: payload.routeName ?? existing?.routeName ?? null,
      region: region ?? null,
      supervisorUserId,
      defaultPromoterUserId,
      visitFrequency:
        payload.visitFrequency ?? existing?.visitFrequency ?? null,
      preferredVisitDays:
        payload.preferredVisitDays.length > 0
          ? payload.preferredVisitDays
          : (existing?.preferredVisitDays ?? []),
      preferredVisitTimeStart:
        payload.preferredVisitTimeStart ??
        existing?.preferredVisitTimeStart ??
        null,
      preferredVisitTimeEnd:
        payload.preferredVisitTimeEnd ??
        existing?.preferredVisitTimeEnd ??
        null,
      notes: payload.notes ?? existing?.notes ?? null,
      status: coordinates.status,
      active: coordinates.status === CustomerStatus.ACTIVE,
      sourceType: payload.sourceType,
      lastSyncedAt: payload.lastSyncedAt ?? new Date(),
    };
  }

  private resolveCoordinates(
    latitude: number | null | undefined,
    longitude: number | null | undefined,
    options: {
      existingLatitude?: number;
      existingLongitude?: number;
      status: CustomerStatus;
      importMode: boolean;
    },
  ) {
    const candidateLatitude = latitude ?? options.existingLatitude ?? 0;
    const candidateLongitude = longitude ?? options.existingLongitude ?? 0;

    if (this.hasUsableCoordinates(candidateLatitude, candidateLongitude)) {
      return {
        latitude: candidateLatitude,
        longitude: candidateLongitude,
        status: options.status,
      };
    }

    return {
      latitude: 0,
      longitude: 0,
      status: options.status,
    };
  }

  private async resolveImportExecutionOptions(
    actor: CustomerActorContext,
    dto: ImportCustomersCsvDto | ImportCustomersWinthorDto,
    input: Pick<
      ImportExecutionOptions,
      'sourceType' | 'customerSourceType' | 'logPrefix'
    >,
  ): Promise<ImportExecutionOptions> {
    const fallbackSupervisorUserId =
      dto.fallbackSupervisorUserId?.trim() ||
      (actor.role === UserRole.SUPERVISOR ? actor.id : null);
    const fallbackDefaultPromoterUserId =
      dto.fallbackDefaultPromoterUserId?.trim() || null;

    if (fallbackSupervisorUserId) {
      await this.resolveSupervisorReference(actor, fallbackSupervisorUserId);
    }

    if (fallbackDefaultPromoterUserId) {
      await this.resolvePromoterReference(actor, fallbackDefaultPromoterUserId);
    }

    return {
      sourceType: input.sourceType,
      customerSourceType: input.customerSourceType,
      apply: dto.apply ?? false,
      allowCreate: dto.allowCreate ?? true,
      allowUpdate: dto.allowUpdate ?? true,
      ignoreDuplicates: dto.ignoreDuplicates ?? true,
      fallbackSupervisorUserId,
      fallbackDefaultPromoterUserId,
      logPrefix:
        sanitizeStorageString(input.logPrefix) ?? 'Importacao de clientes',
    };
  }

  private parseBatchRequestPayload(rawPayload: Prisma.JsonValue | null) {
    if (
      !rawPayload ||
      Array.isArray(rawPayload) ||
      typeof rawPayload !== 'object'
    ) {
      throw new BadRequestException(
        'Metadados do lote de importacao estao ausentes ou invalidos',
      );
    }

    const payload = rawPayload as Record<string, unknown>;
    const rawCsvMetadata =
      payload.csvMetadata &&
      !Array.isArray(payload.csvMetadata) &&
      typeof payload.csvMetadata === 'object'
        ? (payload.csvMetadata as Record<string, unknown>)
        : null;

    return {
      sourceType:
        payload.sourceType === CustomerImportSourceType.WINTHOR
          ? CustomerImportSourceType.WINTHOR
          : CustomerImportSourceType.CSV,
      customerSourceType:
        payload.customerSourceType === CustomerSourceType.WINTHOR
          ? CustomerSourceType.WINTHOR
          : CustomerSourceType.CSV,
      apply: parseBoolean(this.coerceNullableString(payload.apply)),
      allowCreate:
        payload.allowCreate === undefined
          ? true
          : parseBoolean(this.coerceNullableString(payload.allowCreate)),
      allowUpdate:
        payload.allowUpdate === undefined
          ? true
          : parseBoolean(this.coerceNullableString(payload.allowUpdate)),
      ignoreDuplicates:
        payload.ignoreDuplicates === undefined
          ? true
          : parseBoolean(this.coerceNullableString(payload.ignoreDuplicates)),
      fallbackSupervisorUserId:
        normalizeOptional(
          this.coerceNullableString(payload.fallbackSupervisorUserId),
        ) ?? null,
      fallbackDefaultPromoterUserId:
        normalizeOptional(
          this.coerceNullableString(payload.fallbackDefaultPromoterUserId),
        ) ?? null,
      changedSince: normalizeOptional(
        this.coerceNullableString(payload.changedSince),
      ),
      delimiter: normalizeOptional(
        this.coerceNullableString(payload.delimiter),
      ),
      sourceReference: normalizeOptional(
        this.coerceNullableString(payload.sourceReference),
      ),
      requestedByUserId:
        normalizeString(this.coerceNullableString(payload.requestedByUserId)) ??
        '',
      adapter: normalizeOptional(this.coerceNullableString(payload.adapter)),
      logPrefix:
        normalizeString(this.coerceNullableString(payload.logPrefix)) ??
        'Importacao de clientes',
      csvMetadata: rawCsvMetadata
        ? {
            requestedDelimiter: normalizeOptional(
              this.coerceNullableString(rawCsvMetadata.requestedDelimiter),
            ),
            detectedDelimiter: normalizeOptional(
              this.coerceNullableString(rawCsvMetadata.detectedDelimiter),
            ),
            originalHeaders: this.coerceJsonStringArray(
              rawCsvMetadata.originalHeaders,
            ),
            normalizedHeaders: this.coerceJsonStringArray(
              rawCsvMetadata.normalizedHeaders,
            ),
            recognizedHeaders: this.coerceJsonStringArray(
              rawCsvMetadata.recognizedHeaders,
            ),
            unrecognizedHeaders: this.coerceJsonStringArray(
              rawCsvMetadata.unrecognizedHeaders,
            ),
            missingRequiredHeaders: this.coerceJsonStringArray(
              rawCsvMetadata.missingRequiredHeaders,
            ),
            incompatibleLayout: parseBoolean(
              this.coerceNullableString(rawCsvMetadata.incompatibleLayout),
            ),
            layoutMessage: normalizeOptional(
              this.coerceNullableString(rawCsvMetadata.layoutMessage),
            ),
            validRows: this.coerceJsonInteger(rawCsvMetadata.validRows),
            invalidRows: this.coerceJsonInteger(rawCsvMetadata.invalidRows),
            skippedEmptyRows: this.coerceJsonInteger(
              rawCsvMetadata.skippedEmptyRows,
            ),
          }
        : null,
    } satisfies ImportBatchRequestPayload;
  }

  private safeParseBatchRequestPayload(rawPayload: Prisma.JsonValue | null) {
    try {
      return this.parseBatchRequestPayload(rawPayload);
    } catch {
      return null;
    }
  }

  private rebuildExecutionOptionsFromBatch(
    batch: {
      sourceType: CustomerImportSourceType;
      applyChanges: boolean;
    },
    payload: ImportBatchRequestPayload,
  ): ImportExecutionOptions {
    return {
      sourceType: batch.sourceType,
      customerSourceType: payload.customerSourceType,
      apply: batch.applyChanges,
      allowCreate: payload.allowCreate,
      allowUpdate: payload.allowUpdate,
      ignoreDuplicates: payload.ignoreDuplicates,
      fallbackSupervisorUserId: payload.fallbackSupervisorUserId,
      fallbackDefaultPromoterUserId: payload.fallbackDefaultPromoterUserId,
      logPrefix: payload.logPrefix,
    };
  }

  private rebuildPreparedRowsFromBatch(
    sourceType: CustomerImportSourceType,
    items: Array<{
      rowNumber: number;
      rawPayload: Prisma.JsonValue;
    }>,
  ) {
    return items.map((item) => {
      if (sourceType === CustomerImportSourceType.CSV) {
        if (
          !item.rawPayload ||
          Array.isArray(item.rawPayload) ||
          typeof item.rawPayload !== 'object'
        ) {
          return {
            rowNumber: item.rowNumber,
            rawPayload: {
              invalidRawPayload:
                item.rawPayload === null ? null : item.rawPayload,
            },
            issues: ['Payload bruto CSV invalido para reprocessamento'],
            errorMessage: 'Payload bruto CSV invalido para reprocessamento',
          } satisfies ImportPreparedRow;
        }

        const values = Object.fromEntries(
          Object.entries(
            extractImportPayloadMetadata(item.rawPayload).rawPayload as Record<
              string,
              unknown
            >,
          ).map(([key, value]) => [
            key,
            this.coerceNullableString(value) ?? '',
          ]),
        );

        return this.prepareCsvRow({
          rowNumber: item.rowNumber,
          values,
          cellsCount: Object.keys(values).length,
          extraValues: [],
        });
      }

      return this.prepareWinthorRow(
        this.deserializeWinthorRecord(item.rawPayload),
        item.rowNumber,
      );
    });
  }

  private async handleImportBatchProcessingError(
    actorUserId: string,
    batchId: string,
    attemptCount: number,
    startedAt: Date,
    options: ImportExecutionOptions,
    error: unknown,
  ) {
    const message =
      error instanceof Error
        ? error.message
        : 'Falha inesperada ao aplicar a importacao';
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const maxAttempts = this.readImportJobMaxAttempts();
    const retryable = this.isRetryableImportError(error);

    this.logger.error(
      `Falha ao processar importacao de clientes batchId=${batchId} attempt=${attemptCount}`,
      error instanceof Error ? error.stack : undefined,
    );

    if (retryable && attemptCount < maxAttempts) {
      const nextRetryAt = this.calculateNextRetryAt(attemptCount);

      await this.prismaService.customerImportBatch.update({
        where: {
          id: batchId,
        },
        data: {
          status: CustomerImportBatchStatus.RETRY_SCHEDULED,
          nextRetryAt,
          lastError: message,
          durationMs,
          logSummary: `${options.logPrefix}: falha transitória na tentativa ${attemptCount}. Novo processamento agendado para ${nextRetryAt.toISOString()}.`,
        },
      });

      await this.auditService.record(
        actorUserId,
        AuditEntityType.CUSTOMER_IMPORT_BATCH,
        batchId,
        'customer-import.retry-scheduled',
        {
          sourceType: options.sourceType,
          reason: message,
          attemptCount,
          nextRetryAt: nextRetryAt.toISOString(),
        },
      );

      return;
    }

    await this.prismaService.customerImportBatch.update({
      where: {
        id: batchId,
      },
      data: {
        status: CustomerImportBatchStatus.FAILED,
        lastError: message,
        logSummary: `${options.logPrefix}: ${message}`,
        finishedAt,
        durationMs,
        nextRetryAt: null,
      },
    });

    await this.auditService.record(
      actorUserId,
      AuditEntityType.CUSTOMER_IMPORT_BATCH,
      batchId,
      'customer-import.failed',
      {
        sourceType: options.sourceType,
        reason: message,
        attemptCount,
      },
    );
  }

  private buildQueuedImportSummaryLog(logPrefix: string, stagedRows: number) {
    return `${logPrefix}: lote enfileirado com ${stagedRows} registros em staging aguardando processamento assíncrono`;
  }

  private readImportJobMaxAttempts() {
    const rawValue = process.env.CUSTOMER_IMPORT_JOB_MAX_ATTEMPTS;
    const parsed = rawValue ? Number(rawValue) : Number.NaN;
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : 3;
  }

  private calculateNextRetryAt(attemptCount: number) {
    const rawValue = process.env.CUSTOMER_IMPORT_JOB_RETRY_DELAY_MS;
    const parsed = rawValue ? Number(rawValue) : Number.NaN;
    const baseDelayMs = Number.isFinite(parsed) && parsed > 0 ? parsed : 10_000;
    const retryDelayMs = baseDelayMs * attemptCount;

    return new Date(Date.now() + retryDelayMs);
  }

  private isRetryableImportError(error: unknown) {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();

    return (
      message.includes('timeout') ||
      message.includes('tempor') ||
      message.includes('connection') ||
      message.includes('conexao') ||
      message.includes('deadlock') ||
      message.includes('econn')
    );
  }

  private isInvalidImportEncodingError(error: unknown) {
    if (!(error instanceof Error)) {
      return false;
    }

    const message = error.message.toLowerCase();

    return (
      message.includes('unsupported unicode escape sequence') ||
      message.includes('lone leading surrogate') ||
      message.includes('lone trailing surrogate') ||
      message.includes('surrogate in hex escape') ||
      message.includes('cannot be converted to text')
    );
  }

  private async loadExistingCustomersForImport(
    companyId: string,
    preparedRows: ImportPreparedRow[],
  ) {
    const codes = new Set<string>();
    const winthorCodes = new Set<string>();
    const cnpjs = new Set<string>();

    preparedRows.forEach((row) => {
      if (!row.payload) {
        return;
      }

      codes.add(row.payload.code);

      if (row.payload.winthorCustomerCode) {
        winthorCodes.add(row.payload.winthorCustomerCode);
      }

      if (row.payload.cnpj) {
        cnpjs.add(row.payload.cnpj);
      }
    });

    if (codes.size === 0 && winthorCodes.size === 0 && cnpjs.size === 0) {
      return [];
    }

    return this.prismaService.customer.findMany({
      where: {
        companyId,
        OR: [
          codes.size > 0 ? { code: { in: [...codes] } } : undefined,
          winthorCodes.size > 0
            ? { winthorCustomerCode: { in: [...winthorCodes] } }
            : undefined,
          cnpjs.size > 0 ? { cnpj: { in: [...cnpjs] } } : undefined,
        ].filter(Boolean) as Prisma.CustomerWhereInput[],
      },
      select: {
        id: true,
        code: true,
        winthorCustomerCode: true,
        cnpj: true,
        tradeName: true,
        legalName: true,
        address: true,
        city: true,
        state: true,
        latitude: true,
        longitude: true,
        geofenceRadiusM: true,
        routeName: true,
        region: true,
        supervisorUserId: true,
        defaultPromoterUserId: true,
        contactName: true,
        phone: true,
        email: true,
        zipCode: true,
        addressNumber: true,
        complement: true,
        district: true,
        stateRegistration: true,
        visitFrequency: true,
        preferredVisitDays: true,
        preferredVisitTimeStart: true,
        preferredVisitTimeEnd: true,
        notes: true,
        status: true,
        active: true,
        sourceType: true,
        lastSyncedAt: true,
        deletedAt: true,
      },
    });
  }

  private buildListCustomersWhere(
    actor: CustomerActorContext,
    query: ListCustomersQueryDto,
  ): Prisma.CustomerWhereInput {
    const filters: Prisma.CustomerWhereInput[] = [
      { companyId: actor.companyId },
    ];
    const scope = this.buildActorCustomerScope(actor);
    const search = query.search?.trim();
    const normalizedSearchDigits = search ? normalizeDigits(search) : '';

    if (scope) {
      filters.push(scope);
    }

    if (query.customerCode) {
      filters.push({
        code: {
          contains: query.customerCode.trim().toUpperCase(),
          mode: 'insensitive',
        },
      });
    }

    if (query.cnpj) {
      filters.push({
        cnpj: {
          contains: normalizeDigits(query.cnpj),
        },
      });
    }

    if (query.city) {
      filters.push({
        city: {
          contains: query.city.trim(),
          mode: 'insensitive',
        },
      });
    }

    if (query.routeName) {
      filters.push({
        routeName: {
          contains: query.routeName.trim(),
          mode: 'insensitive',
        },
      });
    }

    if (query.region) {
      filters.push({
        region: {
          contains: query.region.trim(),
          mode: 'insensitive',
        },
      });
    }

    if (query.supervisorUserId) {
      filters.push({
        supervisorUserId: query.supervisorUserId,
      });
    }

    if (query.sourceType) {
      filters.push({
        sourceType: query.sourceType,
      });
    }

    if (query.status === CustomerStatus.ACTIVE || query.active === true) {
      filters.push(this.buildOperationalCustomerWhere());
    }

    if (query.status === CustomerStatus.INACTIVE || query.active === false) {
      filters.push(this.buildInactiveCustomerWhere());
    }

    if (search) {
      filters.push({
        OR: [
          { tradeName: { contains: search, mode: 'insensitive' } },
          { legalName: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { winthorCustomerCode: { contains: search, mode: 'insensitive' } },
          ...(normalizedSearchDigits
            ? [{ cnpj: { contains: normalizedSearchDigits } }]
            : []),
          { city: { contains: search, mode: 'insensitive' } },
          { district: { contains: search, mode: 'insensitive' } },
          { routeName: { contains: search, mode: 'insensitive' } },
          { region: { contains: search, mode: 'insensitive' } },
          {
            supervisorUser: {
              is: {
                name: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            },
          },
        ],
      });
    }

    return {
      AND: filters,
    };
  }

  private buildOperationalCustomerWhere(
    extra?: Prisma.CustomerWhereInput,
  ): Prisma.CustomerWhereInput {
    return {
      status: CustomerStatus.ACTIVE,
      active: true,
      deletedAt: null,
      ...(extra ?? {}),
    };
  }

  private buildInactiveCustomerWhere(
    extra?: Prisma.CustomerWhereInput,
  ): Prisma.CustomerWhereInput {
    return {
      OR: [
        { status: CustomerStatus.INACTIVE },
        { active: false },
        { deletedAt: { not: null } },
      ],
      ...(extra ?? {}),
    };
  }

  private buildActorCustomerScope(
    actor: CustomerActorContext,
  ): Prisma.CustomerWhereInput | undefined {
    if (actor.role === UserRole.ADMIN) {
      return undefined;
    }

    const scopes: Prisma.CustomerWhereInput[] = [
      { supervisorUserId: actor.id },
    ];

    if (actor.region) {
      scopes.push({
        region: {
          equals: actor.region,
          mode: 'insensitive',
        },
      });
    }

    return {
      OR: scopes,
    };
  }

  private resolveCustomerSort(
    sortBy?: string,
    sortDirection: Prisma.SortOrder = 'asc',
  ): Prisma.CustomerOrderByWithRelationInput {
    switch (sortBy) {
      case 'customerCode':
      case 'code':
        return { code: sortDirection };
      case 'winthorCustomerCode':
        return { winthorCustomerCode: sortDirection };
      case 'legalName':
        return { legalName: sortDirection };
      case 'city':
        return { city: sortDirection };
      case 'routeName':
        return { routeName: sortDirection };
      case 'region':
        return { region: sortDirection };
      case 'status':
        return { status: sortDirection };
      case 'lastSyncedAt':
        return { lastSyncedAt: sortDirection };
      case 'createdAt':
        return { createdAt: sortDirection };
      default:
        return { tradeName: sortDirection };
    }
  }

  private mapCustomerSummary(customer: CustomerSummaryRecord) {
    return {
      id: customer.id,
      customerCode: customer.code,
      code: customer.code,
      winthorCustomerCode: customer.winthorCustomerCode,
      legalName: customer.legalName,
      tradeName: customer.tradeName,
      cnpj: customer.cnpj,
      documentNumber: customer.cnpj ?? customer.documentNumber,
      contactName: customer.contactName,
      phone: customer.phone,
      address: customer.address,
      district: customer.district,
      city: customer.city,
      state: customer.state,
      latitude: customer.latitude,
      longitude: customer.longitude,
      geofenceRadiusM: customer.geofenceRadiusM,
      routeName: customer.routeName,
      region: customer.region,
      supervisorUserId: customer.supervisorUserId,
      supervisorName: customer.supervisorUser?.name ?? null,
      defaultPromoterUserId: customer.defaultPromoterUserId,
      defaultPromoterName: customer.defaultPromoterUser?.name ?? null,
      status: customer.status,
      active:
        customer.active &&
        customer.status === CustomerStatus.ACTIVE &&
        customer.deletedAt === null,
      sourceType: customer.sourceType,
      lastSyncedAt: customer.lastSyncedAt?.toISOString() ?? null,
      notes: customer.notes,
      routeStopsCount: customer._count.routeStops,
      visitsCount: customer._count.visits,
      schedules: customer.schedules.map((schedule) => ({
        id: schedule.id,
        dayOfWeek: schedule.dayOfWeek,
        visitWindowStart: schedule.visitWindowStart,
        visitWindowEnd: schedule.visitWindowEnd,
        sequenceHint: schedule.sequenceHint,
        active: schedule.active,
      })),
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    };
  }

  private mapCustomerDetail(customer: CustomerDetailRecord) {
    return {
      ...this.mapCustomerSummary(customer),
      stateRegistration: customer.stateRegistration,
      email: customer.email,
      zipCode: customer.zipCode,
      addressNumber: customer.addressNumber,
      complement: customer.complement,
      visitFrequency: customer.visitFrequency,
      preferredVisitDays: customer.preferredVisitDays,
      preferredVisitTimeStart: customer.preferredVisitTimeStart,
      preferredVisitTimeEnd: customer.preferredVisitTimeEnd,
      importBatchId: customer.importBatchId,
      importBatch: customer.importBatch
        ? {
            id: customer.importBatch.id,
            sourceType: customer.importBatch.sourceType,
            status: customer.importBatch.status,
            requestedAt: customer.importBatch.requestedAt.toISOString(),
            finishedAt: customer.importBatch.finishedAt?.toISOString() ?? null,
          }
        : null,
      deletedAt: customer.deletedAt?.toISOString() ?? null,
    };
  }

  private async findAccessibleCustomerOrThrow(
    actor: CustomerActorContext,
    customerId: string,
  ) {
    const customer = await this.prismaService.customer.findFirst({
      where: {
        id: customerId,
        companyId: actor.companyId,
        ...(this.buildActorCustomerScope(actor) ?? {}),
      },
      include: customerDetailInclude,
    });

    if (!customer) {
      throw new NotFoundException('Cliente nao encontrado');
    }

    return customer;
  }

  private isCustomerAccessibleToActor(
    actor: CustomerActorContext,
    customer: Pick<ExistingCustomerIdentity, 'supervisorUserId' | 'region'>,
  ) {
    if (actor.role === UserRole.ADMIN) {
      return true;
    }

    if (customer.supervisorUserId === actor.id) {
      return true;
    }

    return Boolean(
      actor.region &&
      customer.region &&
      customer.region.localeCompare(actor.region, 'pt-BR', {
        sensitivity: 'accent',
      }) === 0,
    );
  }

  private async getActorContext(
    actorUserId: string,
  ): Promise<CustomerActorContext> {
    const actor = await this.prismaService.user.findUnique({
      where: {
        id: actorUserId,
      },
      select: {
        id: true,
        companyId: true,
        role: true,
        region: true,
      },
    });

    if (!actor) {
      throw new NotFoundException('Usuario nao encontrado');
    }

    return {
      id: actor.id,
      companyId: actor.companyId,
      role: actor.role,
      region: actor.region ?? null,
    };
  }

  private ensureManagerActor(actor: CustomerActorContext) {
    if (actor.role === UserRole.PROMOTER) {
      throw new BadRequestException(
        'Perfil sem permissao para gerenciar clientes',
      );
    }
  }

  private async assertUniqueCustomerIdentifiers(
    companyId: string,
    payload: Pick<
      PersistableCustomerPayload,
      'code' | 'winthorCustomerCode' | 'cnpj'
    >,
    customerId?: string,
  ) {
    const conflicts = await this.prismaService.customer.findMany({
      where: {
        companyId,
        id: customerId ? { not: customerId } : undefined,
        OR: [
          { code: payload.code },
          payload.winthorCustomerCode
            ? { winthorCustomerCode: payload.winthorCustomerCode }
            : undefined,
          payload.cnpj ? { cnpj: payload.cnpj } : undefined,
        ].filter(Boolean) as Prisma.CustomerWhereInput[],
      },
      select: {
        code: true,
        winthorCustomerCode: true,
        cnpj: true,
        deletedAt: true,
      },
    });

    if (conflicts.some((item) => item.code === payload.code)) {
      const deleted = conflicts.some(
        (item) => item.code === payload.code && item.deletedAt,
      );
      throw new ConflictException(
        deleted
          ? 'Ja existe cliente arquivado com esse codigo. Reative ou atualize o cadastro existente.'
          : 'Ja existe cliente com esse codigo',
      );
    }

    if (
      payload.winthorCustomerCode &&
      conflicts.some(
        (item) => item.winthorCustomerCode === payload.winthorCustomerCode,
      )
    ) {
      throw new ConflictException('Ja existe cliente com esse codigo Winthor');
    }

    if (payload.cnpj && conflicts.some((item) => item.cnpj === payload.cnpj)) {
      throw new ConflictException('Ja existe cliente com esse CNPJ');
    }
  }

  private async resolveSupervisorReference(
    actor: CustomerActorContext,
    supervisorUserId: string | null,
  ) {
    if (!supervisorUserId) {
      return null;
    }

    const normalizedReference = normalizeString(supervisorUserId);

    if (
      actor.role === UserRole.SUPERVISOR &&
      !normalizedReference.includes('@') &&
      normalizedReference !== actor.id
    ) {
      throw new BadRequestException(
        'Supervisor so pode associar clientes ao proprio usuario',
      );
    }

    const supervisor = await this.prismaService.user.findFirst({
      where: {
        companyId: actor.companyId,
        role: UserRole.SUPERVISOR,
        active: true,
        deletedAt: null,
        OR: [
          { id: normalizedReference },
          { email: normalizedReference.toLowerCase() },
        ],
      },
      select: {
        id: true,
        region: true,
      },
    });

    if (!supervisor) {
      throw new NotFoundException(
        `Supervisor responsavel nao encontrado: ${normalizedReference}`,
      );
    }

    if (actor.role === UserRole.SUPERVISOR && supervisor.id !== actor.id) {
      throw new BadRequestException(
        'Supervisor so pode associar clientes ao proprio usuario',
      );
    }

    return {
      id: supervisor.id,
      region: supervisor.region ?? null,
    } satisfies SupervisorReference;
  }

  private async resolveSupervisorReferenceCached(
    actor: CustomerActorContext,
    supervisorUserId: string | null,
    cache: ImportReferenceCache,
  ) {
    if (!supervisorUserId) {
      return null;
    }

    if (cache.supervisors.has(supervisorUserId)) {
      return cache.supervisors.get(supervisorUserId) ?? null;
    }

    const supervisor = await this.resolveSupervisorReference(
      actor,
      supervisorUserId,
    );
    cache.supervisors.set(supervisorUserId, supervisor);
    return supervisor;
  }

  private async resolvePromoterReference(
    actor: CustomerActorContext,
    promoterUserId: string | null,
  ) {
    if (!promoterUserId) {
      return null;
    }

    const normalizedReference = normalizeString(promoterUserId);

    const promoter = await this.prismaService.promoter.findFirst({
      where: {
        companyId: actor.companyId,
        active: true,
        deletedAt: null,
        supervisorId: actor.role === UserRole.SUPERVISOR ? actor.id : undefined,
        OR: [
          { id: normalizedReference },
          { user: { email: normalizedReference.toLowerCase() } },
        ],
        user: {
          active: true,
          deletedAt: null,
        },
      },
      select: {
        id: true,
        supervisorId: true,
      },
    });

    if (!promoter) {
      throw new NotFoundException(
        `Promotor padrao nao encontrado: ${normalizedReference}`,
      );
    }

    return {
      id: promoter.id,
      supervisorId: promoter.supervisorId ?? null,
    } satisfies PromoterReference;
  }

  private async resolvePromoterReferenceCached(
    actor: CustomerActorContext,
    promoterUserId: string | null,
    cache: ImportReferenceCache,
  ) {
    if (!promoterUserId) {
      return null;
    }

    if (cache.promoters.has(promoterUserId)) {
      return cache.promoters.get(promoterUserId) ?? null;
    }

    const promoter = await this.resolvePromoterReference(actor, promoterUserId);
    cache.promoters.set(promoterUserId, promoter);
    return promoter;
  }

  private toCustomerCreateInput(
    companyId: string,
    payload: PersistableCustomerPayload,
    options: {
      sourceType: CustomerSourceType;
      importBatchId: string | null;
      lastSyncedAt: Date | null;
    },
  ): Prisma.CustomerCreateInput {
    return {
      company: { connect: { id: companyId } },
      code: payload.code,
      winthorCustomerCode: payload.winthorCustomerCode,
      legalName: payload.legalName,
      tradeName: payload.tradeName,
      cnpj: payload.cnpj,
      documentNumber: payload.cnpj,
      stateRegistration: payload.stateRegistration,
      contactName: payload.contactName,
      phone: payload.phone,
      email: payload.email,
      zipCode: payload.zipCode,
      address: payload.address,
      addressNumber: payload.addressNumber,
      complement: payload.complement,
      district: payload.district,
      city: payload.city,
      state: payload.state,
      latitude: payload.latitude,
      longitude: payload.longitude,
      geofenceRadiusM: payload.geofenceRadiusM,
      routeName: payload.routeName,
      region: payload.region,
      supervisorUser: payload.supervisorUserId
        ? { connect: { id: payload.supervisorUserId } }
        : undefined,
      defaultPromoterUser: payload.defaultPromoterUserId
        ? { connect: { id: payload.defaultPromoterUserId } }
        : undefined,
      visitFrequency: payload.visitFrequency,
      preferredVisitDays: payload.preferredVisitDays,
      preferredVisitTimeStart: payload.preferredVisitTimeStart,
      preferredVisitTimeEnd: payload.preferredVisitTimeEnd,
      notes: payload.notes,
      sourceType: options.sourceType,
      importBatch: options.importBatchId
        ? { connect: { id: options.importBatchId } }
        : undefined,
      lastSyncedAt: options.lastSyncedAt,
      status: payload.status,
      active: payload.active,
      deletedAt: payload.active ? null : undefined,
    };
  }

  private toCustomerUpdateInput(
    payload: PersistableCustomerPayload,
    options: {
      sourceType: CustomerSourceType;
      importBatchId: string | null;
      lastSyncedAt: Date | null;
    },
  ): Prisma.CustomerUpdateInput {
    return {
      code: payload.code,
      winthorCustomerCode: payload.winthorCustomerCode,
      legalName: payload.legalName,
      tradeName: payload.tradeName,
      cnpj: payload.cnpj,
      documentNumber: payload.cnpj,
      stateRegistration: payload.stateRegistration,
      contactName: payload.contactName,
      phone: payload.phone,
      email: payload.email,
      zipCode: payload.zipCode,
      address: payload.address,
      addressNumber: payload.addressNumber,
      complement: payload.complement,
      district: payload.district,
      city: payload.city,
      state: payload.state,
      latitude: payload.latitude,
      longitude: payload.longitude,
      geofenceRadiusM: payload.geofenceRadiusM,
      routeName: payload.routeName,
      region: payload.region,
      supervisorUser: payload.supervisorUserId
        ? { connect: { id: payload.supervisorUserId } }
        : { disconnect: true },
      defaultPromoterUser: payload.defaultPromoterUserId
        ? { connect: { id: payload.defaultPromoterUserId } }
        : { disconnect: true },
      visitFrequency: payload.visitFrequency,
      preferredVisitDays: payload.preferredVisitDays,
      preferredVisitTimeStart: payload.preferredVisitTimeStart,
      preferredVisitTimeEnd: payload.preferredVisitTimeEnd,
      notes: payload.notes,
      sourceType: options.sourceType,
      importBatch: options.importBatchId
        ? { connect: { id: options.importBatchId } }
        : { disconnect: true },
      lastSyncedAt: options.lastSyncedAt,
      status: payload.status,
      active: payload.active,
      deletedAt: payload.active ? null : undefined,
    };
  }

  private async replaceCustomerSchedules(
    transaction: TransactionClient,
    customerId: string,
    schedules: NormalizedCustomerSchedule[],
  ) {
    await transaction.customerSchedule.deleteMany({
      where: {
        customerId,
      },
    });

    if (schedules.length === 0) {
      return;
    }

    await transaction.customerSchedule.createMany({
      data: schedules.map((schedule) => ({
        customerId,
        dayOfWeek: schedule.dayOfWeek,
        visitWindowStart: schedule.visitWindowStart,
        visitWindowEnd: schedule.visitWindowEnd,
        sequenceHint: schedule.sequenceHint,
        active: schedule.active,
      })),
    });
  }

  private detectDuplicateKeysInFile(
    payload: ImportCustomerPayload,
    seenKeys: Map<string, number>,
  ) {
    for (const key of this.buildImportIdentityKeys(payload)) {
      const firstRowNumber = seenKeys.get(key);

      if (firstRowNumber !== undefined) {
        return {
          key,
          firstRowNumber,
        };
      }
    }

    return null;
  }

  private registerSeenKeys(
    payload: ImportCustomerPayload,
    rowNumber: number,
    seenKeys: Map<string, number>,
  ) {
    this.buildImportIdentityKeys(payload).forEach((key) => {
      if (!seenKeys.has(key)) {
        seenKeys.set(key, rowNumber);
      }
    });
  }

  private buildImportIdentityKeys(
    payload: Pick<
      ImportCustomerPayload,
      'code' | 'winthorCustomerCode' | 'cnpj'
    >,
  ) {
    return [
      `code:${payload.code}`,
      payload.winthorCustomerCode
        ? `winthor:${payload.winthorCustomerCode}`
        : null,
      payload.cnpj ? `cnpj:${payload.cnpj}` : null,
    ].filter(Boolean) as string[];
  }

  private resolveMatchedCustomers(
    payload: ImportCustomerPayload,
    maps: {
      existingByCode: Map<string, ExistingCustomerIdentity>;
      existingByWinthorCode: Map<string, ExistingCustomerIdentity>;
      existingByCnpj: Map<string, ExistingCustomerIdentity>;
    },
  ) {
    const matched = new Set<ExistingCustomerIdentity>();
    const byCode = maps.existingByCode.get(payload.code);

    if (byCode) {
      matched.add(byCode);
    }

    if (payload.winthorCustomerCode) {
      const byWinthor = maps.existingByWinthorCode.get(
        payload.winthorCustomerCode,
      );

      if (byWinthor) {
        matched.add(byWinthor);
      }
    }

    if (payload.cnpj) {
      const byCnpj = maps.existingByCnpj.get(payload.cnpj);

      if (byCnpj) {
        matched.add(byCnpj);
      }
    }

    return matched;
  }

  private resolveConflictKeys(
    payload: ImportCustomerPayload,
    matchedCustomers: Set<ExistingCustomerIdentity>,
  ) {
    const customers = [...matchedCustomers];
    const keys: string[] = [];

    if (customers.some((item) => item.code === payload.code)) {
      keys.push('customer_code');
    }

    if (
      payload.winthorCustomerCode &&
      customers.some(
        (item) => item.winthorCustomerCode === payload.winthorCustomerCode,
      )
    ) {
      keys.push('winthor_customer_code');
    }

    if (payload.cnpj && customers.some((item) => item.cnpj === payload.cnpj)) {
      keys.push('cnpj');
    }

    return keys;
  }

  private hasCustomerChanges(
    existing: ExistingCustomerIdentity,
    payload: PersistableCustomerPayload,
  ) {
    return (
      existing.code !== payload.code ||
      existing.winthorCustomerCode !== payload.winthorCustomerCode ||
      existing.cnpj !== payload.cnpj ||
      existing.tradeName !== payload.tradeName ||
      existing.legalName !== payload.legalName ||
      existing.address !== payload.address ||
      existing.city !== payload.city ||
      existing.state !== payload.state ||
      existing.latitude !== payload.latitude ||
      existing.longitude !== payload.longitude ||
      existing.geofenceRadiusM !== payload.geofenceRadiusM ||
      existing.routeName !== payload.routeName ||
      existing.region !== payload.region ||
      existing.supervisorUserId !== payload.supervisorUserId ||
      existing.defaultPromoterUserId !== payload.defaultPromoterUserId ||
      existing.contactName !== payload.contactName ||
      existing.phone !== payload.phone ||
      existing.email !== payload.email ||
      existing.zipCode !== payload.zipCode ||
      existing.addressNumber !== payload.addressNumber ||
      existing.complement !== payload.complement ||
      existing.district !== payload.district ||
      existing.stateRegistration !== payload.stateRegistration ||
      existing.visitFrequency !== payload.visitFrequency ||
      existing.preferredVisitTimeStart !== payload.preferredVisitTimeStart ||
      existing.preferredVisitTimeEnd !== payload.preferredVisitTimeEnd ||
      existing.notes !== payload.notes ||
      existing.status !== payload.status ||
      existing.active !== payload.active ||
      existing.preferredVisitDays.join(',') !==
        payload.preferredVisitDays.join(',') ||
      existing.deletedAt !== null
    );
  }

  private countImportDecisions(decisions: ImportDecision[]) {
    return decisions.reduce(
      (accumulator, decision) => {
        switch (decision.status) {
          case CustomerImportItemStatus.CREATE:
            accumulator.createdCount += 1;
            break;
          case CustomerImportItemStatus.UPDATE:
            accumulator.updatedCount += 1;
            break;
          case CustomerImportItemStatus.IGNORE:
            accumulator.ignoredCount += 1;
            break;
          case CustomerImportItemStatus.ERROR:
            accumulator.errorCount += 1;
            break;
        }

        return accumulator;
      },
      {
        createdCount: 0,
        updatedCount: 0,
        ignoredCount: 0,
        errorCount: 0,
      },
    );
  }

  private buildImportSummaryLog(
    prefix: string,
    counts: {
      createdCount: number;
      updatedCount: number;
      ignoredCount: number;
      errorCount: number;
    },
    applied: boolean,
  ) {
    return `${prefix}: ${applied ? 'aplicado' : 'preview'} com ${counts.createdCount} criados, ${counts.updatedCount} atualizados, ${counts.ignoredCount} ignorados e ${counts.errorCount} com erro`;
  }

  private async assertBatchAccess(
    actor: CustomerActorContext,
    batchId: string,
  ) {
    const batch = await this.prismaService.customerImportBatch.findFirst({
      where: {
        id: batchId,
        companyId: actor.companyId,
        actorUserId: actor.role === UserRole.ADMIN ? undefined : actor.id,
      },
      select: {
        id: true,
      },
    });

    if (!batch) {
      throw new NotFoundException('Lote de importacao nao encontrado');
    }
  }

  private pickCsvValue(
    values: Record<string, string>,
    aliases: readonly string[],
  ) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeImportHeader(alias);

      if (normalizedAlias in values) {
        return values[normalizedAlias];
      }
    }

    return '';
  }

  private hasUsableCoordinates(
    latitude: number | null | undefined,
    longitude: number | null | undefined,
  ) {
    return (
      latitude !== null &&
      latitude !== undefined &&
      longitude !== null &&
      longitude !== undefined &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      !(latitude === 0 && longitude === 0)
    );
  }

  private rethrowKnownConstraintError(error: unknown): never | void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Ja existe cliente com codigo, codigo Winthor ou CNPJ informado',
      );
    }
  }
}
