import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { toTrimmedString } from '../common/dto-transforms';
import { OperationalVisitStatus } from './visit-status';

export class TodayVisitsQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsEnum(OperationalVisitStatus)
  status?: OperationalVisitStatus;

  @IsOptional()
  @toTrimmedString
  @IsString()
  search?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  promoterId?: string;

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

export class UpdateVisitStatusDto {
  @IsEnum(OperationalVisitStatus)
  status!: OperationalVisitStatus;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class UpdateVisitNotesDto {
  @toTrimmedString
  @IsString()
  @MaxLength(1000)
  notes!: string;
}
