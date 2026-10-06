import { IsNumber, IsOptional, IsPositive, IsUUID, Max } from 'class-validator';

/** Vom Nutzer bestätigter neuer Preis. Der Anzeigentext gehört nicht dazu. */
export class RecordPriceDropDto {
  @IsNumber()
  @IsPositive()
  @Max(1_000_000)
  newPrice: number;

  @IsOptional()
  @IsUUID('4')
  canonicalListingId?: string;
}
