import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsIn,
  IsISO8601,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  GpsLogSource,
  PhotoCategory,
  PhotoGpsStatus,
  PhotoType,
  VisitPhotoStage,
  VisitCompletionStatus,
} from '@prisma/client';
import { toTrimmedString } from '../common/dto-transforms';

const checklistItemTypes = ['BOOLEAN', 'TEXT'] as const;

@ValidatorConstraint({ name: 'ChecklistItemValueConstraint', async: false })
class ChecklistItemValueConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments) {
    const item = args.object as ChecklistItemDto;

    if (item.type === 'BOOLEAN') {
      return typeof value === 'boolean';
    }

    if (item.type === 'TEXT') {
      return (
        typeof value === 'string' &&
        value.trim().length > 0 &&
        value.trim().length <= 2_000
      );
    }

    return false;
  }

  defaultMessage(args: ValidationArguments) {
    const item = args.object as ChecklistItemDto;

    return item.type === 'BOOLEAN'
      ? 'value deve ser booleano quando type for BOOLEAN'
      : 'value deve ser texto nao vazio quando type for TEXT';
  }
}

class CoordinatesDto {
  @Type(() => Number)
  @IsNumber()
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  longitude!: number;
}

export class StartJourneyDto {
  @IsISO8601()
  startedAt!: string;

  @ValidateNested()
  @Type(() => CoordinatesDto)
  location!: CoordinatesDto;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(120)
  eventId?: string;
}

export class TrackPointDto {
  @IsISO8601()
  capturedAt!: string;

  @ValidateNested()
  @Type(() => CoordinatesDto)
  location!: CoordinatesDto;

  @IsOptional()
  @IsNumber()
  accuracyM?: number;

  @IsOptional()
  @IsEnum(GpsLogSource)
  source?: GpsLogSource;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(120)
  eventId?: string;
}

export class EndJourneyDto {
  @IsISO8601()
  endedAt!: string;

  @ValidateNested()
  @Type(() => CoordinatesDto)
  location!: CoordinatesDto;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(120)
  eventId?: string;
}

export class CheckInDto {
  @toTrimmedString
  @IsString()
  routeStopId!: string;

  @IsISO8601()
  checkedInAt!: string;

  @ValidateNested()
  @Type(() => CoordinatesDto)
  location!: CoordinatesDto;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(300)
  justification?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(120)
  eventId?: string;
}

export class StartVisitServiceDto {
  @IsISO8601()
  startedAt!: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(120)
  eventId?: string;
}

export class CheckInWithPhotoDto {
  @toTrimmedString
  @IsString()
  routeStopId!: string;

  @IsISO8601()
  checkedInAt!: string;

  @IsISO8601()
  capturedAt!: string;

  @Type(() => Number)
  @IsNumber()
  latitude!: number;

  @Type(() => Number)
  @IsNumber()
  longitude!: number;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(300)
  justification?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(120)
  eventId?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(120)
  clientGeneratedId?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(120)
  photoEventId?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(120)
  photoClientGeneratedId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  photoCapturedLatitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  photoCapturedLongitude?: number;

  @IsOptional()
  @IsEnum(PhotoGpsStatus)
  photoGpsStatus?: PhotoGpsStatus;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(60)
  photoGpsErrorCode?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(300)
  photoGpsErrorMessage?: string;
}

export class ChecklistItemDto {
  @toTrimmedString
  @IsString()
  code!: string;

  @toTrimmedString
  @IsString()
  label!: string;

  @toTrimmedString
  @IsIn(checklistItemTypes)
  type!: (typeof checklistItemTypes)[number];

  @IsBoolean()
  required!: boolean;

  @IsDefined()
  @Validate(ChecklistItemValueConstraint)
  value!: boolean | string;
}

export class SubmitChecklistDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  items!: ChecklistItemDto[];

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(120)
  eventId?: string;
}

export class CheckOutDto {
  @IsISO8601()
  checkedOutAt!: string;

  @ValidateNested()
  @Type(() => CoordinatesDto)
  location!: CoordinatesDto;

  @IsEnum(VisitCompletionStatus)
  completionStatus!: VisitCompletionStatus;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(120)
  eventId?: string;
}

export class UploadPhotoQueryDto {
  @IsEnum(PhotoType)
  type!: PhotoType;

  @IsOptional()
  @IsEnum(PhotoCategory)
  category?: PhotoCategory;

  @IsOptional()
  @IsEnum(VisitPhotoStage)
  stage?: VisitPhotoStage;

  @IsISO8601()
  capturedAt!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  capturedLatitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  capturedLongitude?: number;

  @IsOptional()
  @IsEnum(PhotoGpsStatus)
  gpsStatus?: PhotoGpsStatus;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(60)
  gpsErrorCode?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(300)
  gpsErrorMessage?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(120)
  eventId?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(120)
  clientGeneratedId?: string;
}

export class SyncBatchDto {
  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(120)
  deviceId?: string;

  @IsArray()
  @ArrayMaxSize(200)
  @IsObject({ each: true })
  actions!: Record<string, unknown>[];
}

export class SyncPullQueryDto {
  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(120)
  deviceId?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  routeDate?: string;

  @IsOptional()
  @IsISO8601()
  lastPulledAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lastKnownRouteVersion?: number;
}

export class SyncPushDto extends SyncBatchDto {
  @IsOptional()
  @IsISO8601()
  pushedAt?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  routeDate?: string;

  @IsOptional()
  @IsISO8601()
  lastPulledAt?: string;
}
