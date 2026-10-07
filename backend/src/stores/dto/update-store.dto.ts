import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateStoreDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;
}
