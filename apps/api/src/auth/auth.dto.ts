import { IsEmail, IsString, MinLength } from 'class-validator';
import {
  toLowercaseTrimmedString,
  toTrimmedString,
} from '../common/dto-transforms';

export class LoginDto {
  @toLowercaseTrimmedString
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class RefreshTokenDto {
  @toTrimmedString
  @IsString()
  @MinLength(20)
  refreshToken!: string;
}
