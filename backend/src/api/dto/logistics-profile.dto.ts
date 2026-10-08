import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class UpdateLogisticsProfileDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500_000)
  weightGrams?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.1)
  @Max(1000)
  lengthCm?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.1)
  @Max(1000)
  widthCm?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.1)
  @Max(1000)
  heightCm?: number | null;

  @IsBoolean()
  bulky: boolean;

  @IsBoolean()
  pickupOnly: boolean;

  @IsBoolean()
  shippingPossible: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^$|^\d{5}$/)
  postalCode?: string | null;
}
