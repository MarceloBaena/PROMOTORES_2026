import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TeamStatus } from '@prisma/client';
import {
  toTrimmedString,
  toTrimmedStringArray,
  toUppercaseTrimmedString,
} from '../common/dto-transforms';

export class ListTeamsQueryDto {
  @IsOptional()
  @toTrimmedString
  @IsString()
  search?: string;

  @IsOptional()
  @toUppercaseTrimmedString
  @IsString()
  code?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  supervisorUserId?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  region?: string;

  @IsOptional()
  @IsEnum(TeamStatus)
  status?: TeamStatus;

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

class TeamBaseDto {
  @toTrimmedString
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @toUppercaseTrimmedString
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  code!: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(120)
  region?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  supervisorUserId?: string;

  @IsEnum(TeamStatus)
  status!: TeamStatus;

  @IsOptional()
  @toTrimmedStringArray
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  promoterIds?: string[];
}

export class CreateTeamDto extends TeamBaseDto {}

export class UpdateTeamDto extends TeamBaseDto {}

export class UpdateTeamStatusDto {
  @IsEnum(TeamStatus)
  status!: TeamStatus;
}

export class UpdateTeamMembersDto {
  @toTrimmedStringArray
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  promoterIds!: string[];
}
