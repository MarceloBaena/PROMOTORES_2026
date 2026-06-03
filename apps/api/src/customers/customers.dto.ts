import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CustomerImportBatchStatus,
  CustomerImportItemStatus,
  CustomerImportSourceType,
  CustomerSourceType,
  CustomerStatus,
  ScheduleDayOfWeek,
} from '@prisma/client';
import {
  toBooleanValue,
  toDigitsOnly,
  toLowercaseTrimmedString,
  toTrimmedString,
  toTrimmedStringArray,
  toUppercaseTrimmedString,
} from '../common/dto-transforms';

const customerSortFields = [
  'tradeName',
  'customerCode',
  'code',
  'winthorCustomerCode',
  'legalName',
  'city',
  'routeName',
  'region',
  'status',
  'lastSyncedAt',
  'createdAt',
] as const;

const sortDirections = ['asc', 'desc'] as const;

export class CustomerScheduleDto {
  @IsEnum(ScheduleDayOfWeek)
  dayOfWeek!: ScheduleDayOfWeek;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  visitWindowStart?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  visitWindowEnd?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sequenceHint?: number;

  @IsOptional()
  @toBooleanValue
  @IsBoolean()
  active?: boolean;
}

export class ListCustomersQueryDto {
  @IsOptional()
  @toTrimmedString
  @IsString()
  search?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  customerCode?: string;

  @IsOptional()
  @toDigitsOnly
  @Matches(/^\d{14}$/, { message: 'CNPJ invalido' })
  cnpj?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  city?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  routeName?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  region?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  supervisorUserId?: string;

  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @IsOptional()
  @IsEnum(CustomerSourceType)
  sourceType?: CustomerSourceType;

  @IsOptional()
  @toBooleanValue
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @toTrimmedString
  @IsIn(customerSortFields)
  sortBy?: (typeof customerSortFields)[number];

  @IsOptional()
  @toLowercaseTrimmedString
  @IsIn(sortDirections)
  sortDirection?: (typeof sortDirections)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class UpsertCustomerDto {
  @toUppercaseTrimmedString
  @IsString()
  @MaxLength(40)
  code!: string;

  @IsOptional()
  @toUppercaseTrimmedString
  @IsString()
  @MaxLength(40)
  winthorCustomerCode?: string;

  @toTrimmedString
  @IsString()
  @MaxLength(160)
  legalName!: string;

  @toTrimmedString
  @IsString()
  @MaxLength(160)
  tradeName!: string;

  @toDigitsOnly
  @Matches(/^\d{14}$/, { message: 'Informe um CNPJ valido com 14 digitos.' })
  cnpj!: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(40)
  stateRegistration?: string;

  @toTrimmedString
  @IsString()
  @MaxLength(120)
  contactName!: string;

  @toTrimmedString
  @IsString()
  @MaxLength(30)
  phone!: string;

  @IsOptional()
  @toLowercaseTrimmedString
  @IsEmail({}, { message: 'Informe um email valido.' })
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @toDigitsOnly
  @Matches(/^\d{8}$/, { message: 'CEP invalido' })
  zipCode?: string;

  @toTrimmedString
  @IsString()
  @MaxLength(180)
  address!: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(30)
  addressNumber?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(100)
  complement?: string;

  @toTrimmedString
  @IsString()
  @MaxLength(120)
  district!: string;

  @toTrimmedString
  @IsString()
  @MaxLength(120)
  city!: string;

  @toUppercaseTrimmedString
  @Matches(/^[A-Z]{2}$/, { message: 'UF invalida' })
  state!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @Type(() => Number)
  @IsInt()
  @Min(20)
  @Max(1000)
  geofenceRadiusM!: number;

  @toTrimmedString
  @IsString()
  @MaxLength(80)
  routeName!: string;

  @toTrimmedString
  @IsString()
  @MaxLength(80)
  region!: string;

  @toTrimmedString
  @IsString()
  supervisorUserId!: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  defaultPromoterUserId?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(40)
  visitFrequency?: string;

  @IsOptional()
  @toTrimmedStringArray
  @IsArray()
  @ArrayMaxSize(7)
  @Matches(/^[A-Z_]+$/, {
    each: true,
    message: 'Dias preferenciais invalidos',
  })
  preferredVisitDays?: string[];

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(5)
  preferredVisitTimeStart?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(5)
  preferredVisitTimeEnd?: string;

  @toTrimmedString
  @IsString()
  @MaxLength(2000)
  notes!: string;

  @IsEnum(CustomerStatus)
  status!: CustomerStatus;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CustomerScheduleDto)
  schedules?: CustomerScheduleDto[];
}

export class UpdateCustomerStatusDto {
  @IsEnum(CustomerStatus)
  status!: CustomerStatus;
}

class CustomerImportOptionsDto {
  @IsOptional()
  @toBooleanValue
  @IsBoolean()
  apply?: boolean;

  @IsOptional()
  @toBooleanValue
  @IsBoolean()
  allowCreate?: boolean;

  @IsOptional()
  @toBooleanValue
  @IsBoolean()
  allowUpdate?: boolean;

  @IsOptional()
  @toBooleanValue
  @IsBoolean()
  ignoreDuplicates?: boolean;

  @IsOptional()
  @toTrimmedString
  @IsString()
  fallbackSupervisorUserId?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  fallbackDefaultPromoterUserId?: string;
}

export class ImportCustomersCsvDto extends CustomerImportOptionsDto {
  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(1)
  delimiter?: string;
}

export class ImportCustomersWinthorDto extends CustomerImportOptionsDto {
  @IsOptional()
  @IsDateString()
  changedSince?: string;
}

export class ListCustomerImportBatchesQueryDto {
  @IsOptional()
  @IsEnum(CustomerImportSourceType)
  sourceType?: CustomerImportSourceType;

  @IsOptional()
  @IsEnum(CustomerImportBatchStatus)
  status?: CustomerImportBatchStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class ListCustomerImportBatchItemsQueryDto {
  @IsOptional()
  @IsEnum(CustomerImportItemStatus)
  status?: CustomerImportItemStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
