import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

function emptyToNull(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export class EbaySelectionDto {
  @Transform(({ value }) => emptyToNull(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  fulfillmentPolicyId?: string | null;

  @Transform(({ value }) => emptyToNull(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  paymentPolicyId?: string | null;

  @Transform(({ value }) => emptyToNull(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  returnPolicyId?: string | null;

  @Transform(({ value }) => emptyToNull(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  pickupFulfillmentPolicyId?: string | null;

  @Transform(({ value }) => emptyToNull(value))
  @IsOptional()
  @IsString()
  @MaxLength(36)
  merchantLocationKey?: string | null;
}

export class EbayLocationDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Der Standort braucht einen Namen.' })
  @MinLength(1, { message: 'Der Standort braucht einen Namen.' })
  @MaxLength(40, { message: 'Der Name darf höchstens 40 Zeichen haben.' })
  name: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Die Straße fehlt.' })
  @MinLength(1, { message: 'Die Straße fehlt.' })
  @MaxLength(80, { message: 'Die Straße ist zu lang.' })
  street: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Die Postleitzahl braucht fünf Ziffern.' })
  @MinLength(5, { message: 'Die Postleitzahl braucht fünf Ziffern.' })
  @MaxLength(5, { message: 'Die Postleitzahl braucht fünf Ziffern.' })
  postalCode: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Der Ort fehlt.' })
  @MinLength(1, { message: 'Der Ort fehlt.' })
  @MaxLength(40, { message: 'Der Ort ist zu lang.' })
  city: string;
}
