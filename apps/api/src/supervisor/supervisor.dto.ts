import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  AuditEntityType,
  AlertSeverity,
  AlertType,
  PhotoType,
  RouteStopStatus,
  VisitCompletionStatus,
} from '@prisma/client';
import {
  toBooleanValue,
  toLowercaseTrimmedString,
  toTrimmedString,
} from '../common/dto-transforms';

const visitSortFields = ['plannedStartAt', 'status', 'sequence'] as const;
const sortDirections = ['asc', 'desc'] as const;
const teamStatuses = ['ON_ROUTE', 'DELAYED', 'READY', 'IDLE'] as const;

export class VisitsQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  promoterId?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  supervisorId?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  customerId?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(RouteStopStatus)
  status?: RouteStopStatus;

  @IsOptional()
  @IsEnum(VisitCompletionStatus)
  completionStatus?: VisitCompletionStatus;

  @IsOptional()
  @toTrimmedString
  @IsIn(visitSortFields)
  sortBy?: (typeof visitSortFields)[number];

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

export class AlertsQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  promoterId?: string;

  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;

  @IsOptional()
  @IsEnum(AlertType)
  type?: AlertType;

  @IsOptional()
  @toBooleanValue
  @IsBoolean()
  resolved?: boolean;

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

export class DashboardQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  promoterId?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  supervisorId?: string;
}

export class MapQueryDto extends DashboardQueryDto {
  @IsOptional()
  @IsEnum(RouteStopStatus)
  status?: RouteStopStatus;
}

export class TeamQueryDto extends DashboardQueryDto {
  @IsOptional()
  @toTrimmedString
  @IsString()
  search?: string;

  @IsOptional()
  @toTrimmedString
  @IsIn(teamStatuses)
  status?: (typeof teamStatuses)[number];

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

export class EvidenceQueryDto extends DashboardQueryDto {
  @IsOptional()
  @toTrimmedString
  @IsString()
  customerId?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(PhotoType)
  type?: PhotoType;

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

export class ReportsQueryDto extends DashboardQueryDto {}

export class AuditQueryDto extends DashboardQueryDto {
  @IsOptional()
  @IsEnum(AuditEntityType)
  entityType?: AuditEntityType;

  @IsOptional()
  @toTrimmedString
  @IsString()
  action?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  search?: string;

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

export class SyncPendenciesQueryDto extends DashboardQueryDto {
  @IsOptional()
  @toTrimmedString
  @IsString()
  customerId?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(RouteStopStatus)
  status?: RouteStopStatus;

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

export class ResolveAlertDto {
  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(500)
  note?: string;
}
