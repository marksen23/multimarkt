import { ArrayNotEmpty, IsArray, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateItemDto {
  @IsOptional()
  @IsString()
  title?: string;
}

export class AnalyzeItemDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  imageUrls: string[];
}

export class ConfirmTruthDto {
  // Doc 03 §4: fehlt dieses Feld, blockiert der StateGuardService selbst
  // (422) — die Validierung hier ist nur die erste, schnellste Fehlerquelle
  // (400 statt 422), keine Verlagerung der eigentlichen Invariante.
  @IsString()
  @MinLength(1)
  condition: string;
}

export class PrepareListingDto {
  @IsNumber()
  @IsPositive()
  sellingPrice: number;

  @IsOptional()
  @IsString()
  descriptionText?: string;
}

export class BundleItemsDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  itemIds: string[];
}
