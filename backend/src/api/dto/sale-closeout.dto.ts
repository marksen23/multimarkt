import { IsNumber, IsOptional, IsPositive, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

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
}
