import { Injectable } from '@nestjs/common';
import { OracleReadonlyService } from './oracle-readonly.service';

export const WINTHOR_ADAPTER = Symbol('WINTHOR_ADAPTER');
export const WINTHOR_CUSTOMER_GATEWAY = WINTHOR_ADAPTER;

export interface ReadonlyWinthorCustomerRecord {
  customerCode: string;
  winthorCustomerCode: string;
  legalName: string;
  tradeName: string;
  cnpj?: string | null;
  stateRegistration?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  zipCode?: string | null;
  address: string;
  addressNumber?: string | null;
  complement?: string | null;
  district?: string | null;
  city: string;
  state: string;
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadiusM?: number | null;
  routeName?: string | null;
  region?: string | null;
  visitFrequency?: string | null;
  preferredVisitDays?: string[];
  preferredVisitTimeStart?: string | null;
  preferredVisitTimeEnd?: string | null;
  notes?: string | null;
  lastSyncedAt?: Date | null;
}

export interface FetchWinthorCustomersInput {
  changedSince?: Date;
}

export interface FetchWinthorCustomersResult {
  records: ReadonlyWinthorCustomerRecord[];
  adapter: string;
  unavailableReason?: string;
  retryable?: boolean;
}

export interface WinthorAdapter {
  fetchCustomers(
    input: FetchWinthorCustomersInput,
  ): Promise<FetchWinthorCustomersResult>;
}

export type WinthorCustomerGateway = WinthorAdapter;
type OracleCustomerRow = Record<string, unknown>;

@Injectable()
export class OracleWinthorAdapter implements WinthorAdapter {
  constructor(private readonly oracleReadonlyService: OracleReadonlyService) {}

  async fetchCustomers(
    input: FetchWinthorCustomersInput,
  ): Promise<FetchWinthorCustomersResult> {
    const sql = process.env.WINTHOR_ORACLE_CUSTOMERS_QUERY?.trim();

    if (!sql) {
      return {
        records: [],
        adapter: 'winthor-oracle',
        unavailableReason:
          'Consulta de clientes do Winthor nao configurada. Defina WINTHOR_ORACLE_CUSTOMERS_QUERY com um SELECT somente leitura.',
        retryable: false,
      };
    }

    const binds: Record<string, unknown> = {};

    if (input.changedSince && /:changedSince\b/i.test(sql)) {
      binds.changedSince = input.changedSince;
    }

    const queryResult =
      await this.oracleReadonlyService.executeReadOnlyQuery<OracleCustomerRow>(
        sql,
        binds,
      );

    if (queryResult.unavailableReason) {
      return {
        records: [],
        adapter: 'winthor-oracle',
        unavailableReason: queryResult.unavailableReason,
        retryable: queryResult.retryable,
      };
    }

    return {
      records: queryResult.rows
        .map((row) => this.mapOracleRow(row))
        .filter(
          (record): record is ReadonlyWinthorCustomerRecord => record !== null,
        ),
      adapter: 'winthor-oracle',
    };
  }

  private mapOracleRow(
    row: OracleCustomerRow,
  ): ReadonlyWinthorCustomerRecord | null {
    const customerCode = this.pickString(row, [
      'CUSTOMER_CODE',
      'customer_code',
      'CODIGO_CLIENTE',
      'CODCLI',
    ]);
    const winthorCustomerCode = this.pickString(row, [
      'WINTHOR_CUSTOMER_CODE',
      'winthor_customer_code',
      'CODCLI',
      'CODIGO_WINTHOR',
    ]);
    const legalName = this.pickString(row, [
      'LEGAL_NAME',
      'legal_name',
      'RAZAO_SOCIAL',
      'CLIENTE',
    ]);
    const tradeName = this.pickString(row, [
      'TRADE_NAME',
      'trade_name',
      'NOME_FANTASIA',
      'FANTASIA',
    ]);
    const address = this.pickString(row, ['ADDRESS', 'address', 'ENDERECO']);
    const city = this.pickString(row, ['CITY', 'city', 'MUNICIPIO', 'CIDADE']);
    const state = this.pickString(row, ['STATE', 'state', 'UF', 'ESTADO']);

    if (
      !customerCode ||
      !winthorCustomerCode ||
      !legalName ||
      !tradeName ||
      !address ||
      !city ||
      !state
    ) {
      return null;
    }

    return {
      customerCode,
      winthorCustomerCode,
      legalName,
      tradeName,
      cnpj: this.pickOptionalString(row, ['CNPJ', 'cnpj']),
      stateRegistration: this.pickOptionalString(row, [
        'STATE_REGISTRATION',
        'state_registration',
        'INSCRICAO_ESTADUAL',
      ]),
      contactName: this.pickOptionalString(row, [
        'CONTACT_NAME',
        'contact_name',
        'CONTATO',
      ]),
      phone: this.pickOptionalString(row, ['PHONE', 'phone', 'TELEFONE']),
      email: this.pickOptionalString(row, ['EMAIL', 'email']),
      zipCode: this.pickOptionalString(row, ['ZIP_CODE', 'zip_code', 'CEP']),
      address,
      addressNumber: this.pickOptionalString(row, [
        'ADDRESS_NUMBER',
        'address_number',
        'NUMERO',
      ]),
      complement: this.pickOptionalString(row, [
        'COMPLEMENT',
        'complement',
        'COMPLEMENTO',
      ]),
      district: this.pickOptionalString(row, [
        'DISTRICT',
        'district',
        'BAIRRO',
      ]),
      city,
      state,
      latitude: this.pickOptionalNumber(row, ['LATITUDE', 'latitude']),
      longitude: this.pickOptionalNumber(row, ['LONGITUDE', 'longitude']),
      geofenceRadiusM: this.pickOptionalNumber(row, [
        'GEOFENCE_RADIUS_M',
        'geofence_radius_m',
      ]),
      routeName: this.pickOptionalString(row, [
        'ROUTE_NAME',
        'route_name',
        'ROTA',
      ]),
      region: this.pickOptionalString(row, ['REGION', 'region', 'REGIAO']),
      visitFrequency: this.pickOptionalString(row, [
        'VISIT_FREQUENCY',
        'visit_frequency',
      ]),
      preferredVisitDays: this.pickOptionalString(row, [
        'PREFERRED_VISIT_DAYS',
        'preferred_visit_days',
      ])
        ?.split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      preferredVisitTimeStart: this.pickOptionalString(row, [
        'PREFERRED_VISIT_TIME_START',
        'preferred_visit_time_start',
      ]),
      preferredVisitTimeEnd: this.pickOptionalString(row, [
        'PREFERRED_VISIT_TIME_END',
        'preferred_visit_time_end',
      ]),
      notes: this.pickOptionalString(row, ['NOTES', 'notes', 'OBSERVACOES']),
      lastSyncedAt: this.pickOptionalDate(row, [
        'LAST_SYNCED_AT',
        'last_synced_at',
        'DTULTALT',
      ]),
    };
  }

  private pickString(row: OracleCustomerRow, keys: string[]) {
    const value = this.pickOptionalString(row, keys);
    return value && value.length > 0 ? value : null;
  }

  private pickOptionalString(row: OracleCustomerRow, keys: string[]) {
    const value = this.pickValue(row, keys);

    if (value === null || value === undefined) {
      return null;
    }

    const normalized = this.normalizeScalar(value);
    return normalized.length > 0 ? normalized : null;
  }

  private pickOptionalNumber(row: OracleCustomerRow, keys: string[]) {
    const value = this.pickValue(row, keys);

    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private pickOptionalDate(row: OracleCustomerRow, keys: string[]) {
    const value = this.pickValue(row, keys);

    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return value;
    }

    const normalized = this.normalizeScalar(value);
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private pickValue(row: OracleCustomerRow, keys: string[]) {
    for (const key of keys) {
      if (key in row) {
        return row[key];
      }
    }

    return null;
  }

  private normalizeScalar(value: unknown) {
    if (typeof value === 'string') {
      return value.trim();
    }

    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value).trim();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    return '';
  }
}

@Injectable()
export class DisabledWinthorAdapter implements WinthorAdapter {
  fetchCustomers(): Promise<FetchWinthorCustomersResult> {
    return Promise.resolve({
      records: [],
      adapter: 'disabled',
      unavailableReason:
        'Adaptador Winthor somente leitura ainda nao configurado. Use a importacao CSV/Excel enquanto isso.',
      retryable: false,
    });
  }
}

export const DisabledWinthorCustomerGateway = DisabledWinthorAdapter;
