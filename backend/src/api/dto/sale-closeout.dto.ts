import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const SALE_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Erfasster Abschluss, nachdem der Artikel verkauft ist. */
export class RecordSaleCloseoutDto {
  @IsNumber()
  @IsPositive()
  @Max(1_000_000)
  proceedsEur: number;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  portal: string;

  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  feeEur: number;

  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  shippingEur: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  paymentMethod?: string | null;

  @IsOptional()
  @IsString()
  @Matches(SALE_DAY, { message: 'Das Verkaufsdatum muss die Form JJJJ-MM-TT haben.' })
  soldOn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  buyer?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

/** Abschluss direkt beim „verkauft“-Klick. Alle Felder optional, damit ein leerer Aufruf nur den Status setzt. */
export class ManualMarkSoldDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(1_000_000)
  proceedsEur?: number;

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

  @IsOptional()
  @IsString()
  @Matches(SALE_DAY, { message: 'Das Verkaufsdatum muss die Form JJJJ-MM-TT haben.' })
  soldOn?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  buyer?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}
