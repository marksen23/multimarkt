import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min, ValidateNested } from 'class-validator';

export class ChannelFeeAssumptionDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  percent: number;

  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  fixedEur: number;
}

export class ChannelFeeAssumptionsDto {
  @ValidateNested()
  @Type(() => ChannelFeeAssumptionDto)
  KLEINANZEIGEN: ChannelFeeAssumptionDto;

  @ValidateNested()
  @Type(() => ChannelFeeAssumptionDto)
  EBAY: ChannelFeeAssumptionDto;

  @ValidateNested()
  @Type(() => ChannelFeeAssumptionDto)
  VINTED: ChannelFeeAssumptionDto;
}

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

  @ValidateNested()
  @Type(() => ChannelFeeAssumptionsDto)
  channels: ChannelFeeAssumptionsDto;
}
