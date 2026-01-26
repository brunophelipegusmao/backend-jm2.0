import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { userRole } from '../../drizzle/schema/users';

export class CreateUserDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsNotEmpty()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*\W).{6,}$/)
  password: string;

  @IsNotEmpty()
  cpf: string;

  @IsOptional()
  address?: string;

  @IsOptional()
  phone?: string;

  @IsOptional()
  active?: boolean;

  @IsOptional()
  @IsIn(userRole.enumValues)
  role?: (typeof userRole.enumValues)[number];
}
