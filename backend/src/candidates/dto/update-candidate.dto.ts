import {
  IsDateString,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateCandidateDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  cpf?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsDateString()
  interviewDate?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  statusId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  storeId?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  vacancyId?: number;

  @IsOptional()
  @IsDateString()
  sentToStoreDate?: string;

  @IsOptional()
  @IsDateString()
  testDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
