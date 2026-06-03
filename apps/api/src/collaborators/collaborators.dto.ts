import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { EmploymentStatus, UserRole } from '@prisma/client';
import {
  toDigitsOnly,
  toLowercaseTrimmedString,
  toTrimmedString,
  toTrimmedStringArray,
  toUppercaseTrimmedString,
} from '../common/dto-transforms';

export const managedCollaboratorRoles = [
  UserRole.PROMOTER,
  UserRole.SUPERVISOR,
] as const;

const collaboratorSortFields = [
  'name',
  'hireDate',
  'region',
  'employeeCode',
] as const;

const sortDirections = ['asc', 'desc'] as const;

export class ListCollaboratorsQueryDto {
  @IsOptional()
  @toTrimmedString
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(managedCollaboratorRoles)
  role?: (typeof managedCollaboratorRoles)[number];

  @IsOptional()
  @IsEnum(EmploymentStatus)
  status?: EmploymentStatus;

  @IsOptional()
  @toTrimmedString
  @IsString()
  region?: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  supervisorId?: string;

  @IsOptional()
  @toTrimmedString
  @IsIn(collaboratorSortFields)
  sortBy?: (typeof collaboratorSortFields)[number];

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

class CollaboratorBaseDto {
  @toTrimmedString
  @IsString()
  @MaxLength(120)
  name!: string;

  @toLowercaseTrimmedString
  @IsString()
  @IsEmail({}, { message: 'Informe um email valido.' })
  @MaxLength(160)
  email!: string;

  @toTrimmedString
  @IsString()
  @Matches(/^[0-9()+\-\s]{10,20}$/)
  phone!: string;

  @toDigitsOnly
  @IsString()
  @Matches(/^\d{11}$/)
  cpf!: string;

  @toUppercaseTrimmedString
  @IsString()
  @MaxLength(30)
  employeeCode!: string;

  @IsIn(managedCollaboratorRoles)
  role!: (typeof managedCollaboratorRoles)[number];

  @IsEnum(EmploymentStatus)
  status!: EmploymentStatus;

  @IsDateString()
  hireDate!: string;

  @toTrimmedString
  @IsString()
  @MaxLength(80)
  region!: string;

  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ValidateIf((value: CollaboratorBaseDto) => value.role === UserRole.PROMOTER)
  @toTrimmedString
  @IsString()
  supervisorId?: string;

  @ValidateIf((value: CollaboratorBaseDto) => value.role === UserRole.PROMOTER)
  @IsOptional()
  @toTrimmedString
  @IsString()
  @MaxLength(5)
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  defaultJourneyStartTime?: string;

  @ValidateIf((value: CollaboratorBaseDto) => value.role === UserRole.PROMOTER)
  @IsOptional()
  @IsString()
  @MaxLength(5)
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  defaultJourneyEndTime?: string;

  @ValidateIf(
    (value: CollaboratorBaseDto) => value.role === UserRole.SUPERVISOR,
  )
  @IsOptional()
  @toTrimmedStringArray
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  teamPromoterIds?: string[];
}

export class CreateCollaboratorDto extends CollaboratorBaseDto {
  @IsString()
  @MinLength(8)
  @MaxLength(80)
  initialPassword!: string;
}

export class UpdateCollaboratorDto extends CollaboratorBaseDto {}

export class UpdateCollaboratorStatusDto {
  @IsEnum(EmploymentStatus)
  status!: EmploymentStatus;
}

export class ResetCollaboratorPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(80)
  newPassword!: string;
}
