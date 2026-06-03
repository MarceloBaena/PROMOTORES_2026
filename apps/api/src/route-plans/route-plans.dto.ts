import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  RouteItemPriority,
  RoutePlanStatus,
  RoutePlanningViewMode,
  RouteRecurrencePattern,
  ScheduleDayOfWeek,
} from '@prisma/client';
import { toBooleanValue, toTrimmedString } from '../common/dto-transforms';

export class ListRoutePlansQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsEnum(RoutePlanningViewMode)
  view?: RoutePlanningViewMode;

  @IsOptional()
  @toTrimmedString
  @IsString()
  promoterId?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  templateId?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(RoutePlanStatus)
  status?: RoutePlanStatus;

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

export class RoutePlanItemDto {
  @IsOptional()
  @toTrimmedString
  @IsString()
  routePlanItemId?: string;

  @toTrimmedString
  @IsString()
  customerId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sequence!: number;

  @IsOptional()
  @IsEnum(RouteItemPriority)
  priority?: RouteItemPriority;

  @IsOptional()
  @IsDateString()
  plannedStartAt?: string;

  @IsOptional()
  @IsDateString()
  plannedEndAt?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpsertRoutePlanDto {
  @IsDateString()
  routeDate!: string;

  @toTrimmedString
  @IsString()
  promoterId!: string;

  @IsOptional()
  @IsEnum(RoutePlanningViewMode)
  planningView?: RoutePlanningViewMode;

  @IsOptional()
  @IsEnum(RoutePlanStatus)
  status?: RoutePlanStatus;

  @IsOptional()
  @toTrimmedString
  @IsString()
  sourceTemplateId?: string;

  @IsOptional()
  @toBooleanValue
  @IsBoolean()
  publishNow?: boolean;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RoutePlanItemDto)
  items!: RoutePlanItemDto[];
}

export class BatchUpsertRoutePlansDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @toTrimmedString
  @IsString()
  promoterId!: string;

  @IsOptional()
  @IsEnum(RoutePlanningViewMode)
  planningView?: RoutePlanningViewMode;

  @IsOptional()
  @IsEnum(RoutePlanStatus)
  status?: RoutePlanStatus;

  @IsOptional()
  @toTrimmedString
  @IsString()
  sourceTemplateId?: string;

  @IsOptional()
  @toBooleanValue
  @IsBoolean()
  publishNow?: boolean;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(ScheduleDayOfWeek, { each: true })
  weekdays?: ScheduleDayOfWeek[];

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  monthDays?: number[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RoutePlanItemDto)
  items!: RoutePlanItemDto[];
}

export class PublishRoutePlanDto {
  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListRouteTemplatesQueryDto {
  @IsOptional()
  @toTrimmedString
  @IsString()
  promoterId?: string;

  @IsOptional()
  @IsEnum(RouteRecurrencePattern)
  recurrence?: RouteRecurrencePattern;

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

export class RouteTemplateItemDto {
  @IsOptional()
  @toTrimmedString
  @IsString()
  routeTemplateItemId?: string;

  @toTrimmedString
  @IsString()
  customerId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  sequence!: number;

  @IsOptional()
  @IsEnum(RouteItemPriority)
  priority?: RouteItemPriority;

  @IsOptional()
  @toTrimmedString
  @IsString()
  plannedStartTime?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  plannedEndTime?: string;

  @IsOptional()
  @IsEnum(ScheduleDayOfWeek)
  dayOfWeek?: ScheduleDayOfWeek;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  dayOfMonth?: number;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpsertRouteTemplateDto {
  @toTrimmedString
  @IsString()
  @MaxLength(120)
  name!: string;

  @toTrimmedString
  @IsString()
  promoterId!: string;

  @IsEnum(RouteRecurrencePattern)
  recurrence!: RouteRecurrencePattern;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @IsOptional()
  @toBooleanValue
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @IsEnum(ScheduleDayOfWeek, { each: true })
  weekdays?: ScheduleDayOfWeek[];

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  monthDays?: number[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RouteTemplateItemDto)
  items!: RouteTemplateItemDto[];
}

export class ApplyRouteTemplateDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @toBooleanValue
  @IsBoolean()
  publishNow?: boolean;
}

export class ListPromoterNotificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @toBooleanValue
  @IsBoolean()
  unreadOnly?: boolean;
}
