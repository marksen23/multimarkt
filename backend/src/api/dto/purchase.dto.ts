import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdatePurchaseDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  price?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  portal?: string | null;

  @IsOptional()
  @IsDateString()
  date?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  condition?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string | null;
}

export class CreateFromPurchaseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title: string;

  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  price: number;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  portal: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  condition?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string | null;
}
