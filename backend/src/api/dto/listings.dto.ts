import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateListingDto {
  @IsUUID('4')
  canonicalListingId: string;

  @IsString()
  @MinLength(1)
  marketplaceId: string;
}

export class MarkSoldDto {
  @IsNumber()
  @IsPositive()
  @Max(1_000_000)
  reportedPrice: number;

  // Feature-Plan 3.4. Fehlt das Portal, bleibt es bei der bisherigen
  // Verkaufsmeldung ohne Kostenbestandteile (Webhook- und Bestandsclients).
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  portal?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  feeEur?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  shippingEur?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  paymentMethod?: string | null;
}
