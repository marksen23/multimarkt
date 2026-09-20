import { ArrayNotEmpty, IsArray, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateBundleDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class AddBundleItemsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  itemIds: string[];
}
