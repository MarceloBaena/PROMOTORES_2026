import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { toBooleanValue, toTrimmedString } from '../common/dto-transforms';

export class ListPromotersQueryDto {
  @IsOptional()
  @toTrimmedString
  @IsString()
  search?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  supervisorId?: string;

  @IsOptional()
  @toBooleanValue
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @toBooleanValue
  @IsBoolean()
  eligibleForRoutePlanning?: boolean;

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
