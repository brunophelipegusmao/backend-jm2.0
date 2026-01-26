import { IsISO8601, IsOptional } from 'class-validator';

export class CreateCheckinDto {
  @IsOptional()
  @IsISO8601()
  checkedInAt?: string;
}
