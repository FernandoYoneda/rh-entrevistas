import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateStatusDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
