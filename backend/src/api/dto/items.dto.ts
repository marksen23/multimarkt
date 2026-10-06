import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateItemDto {
  @IsOptional()
  @IsString()
  title?: string;
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

export class ConfirmAttributeDto {
  // Optional: fehlt, wird der bestehende (INFERRED) Wert unverändert
  // übernommen — nur die Provenienz hebt sich auf USER_CONFIRMED ("Stimmt"-
  // Button). Gesetzt: Nutzer korrigiert/ergänzt den Wert direkt.
  @IsOptional()
  @IsString()
  @MinLength(1)
  value?: string;
}

export class UpdateTitleDto {
  @IsString()
  @MinLength(1)
  title: string;
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

export class ChannelCardInputDto {
  @IsIn(['KLEINANZEIGEN', 'VINTED', 'EBAY'])
  marketplaceId: 'KLEINANZEIGEN' | 'VINTED' | 'EBAY';

  @IsString()
  @MinLength(1)
  title: string;

  @IsString()
  @MinLength(1)
  descriptionText: string;

  @IsNumber()
  @IsPositive()
  suggestedPrice: number;
}

export class SaveChannelPackageDto {
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => ChannelCardInputDto)
  cards: ChannelCardInputDto[];
}
