import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateStatusDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
