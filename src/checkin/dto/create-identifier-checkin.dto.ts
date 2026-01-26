import { IsEmail, IsISO8601, IsOptional, IsString } from 'class-validator';

export class CreateIdentifierCheckinDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  cpf?: string;

  @IsOptional()
  @IsISO8601()
  checkedInAt?: string;
}
