import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateMarginAssumptionsDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  feePercent: number;

  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  shippingEur: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  singleSaleThresholdEur?: number | null;
}
