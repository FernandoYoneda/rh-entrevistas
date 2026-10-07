import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateCandidateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsString()
  @IsNotEmpty()
  cpf: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsDateString()
  interviewDate: string;

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
