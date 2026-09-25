import { IsNumber, IsPositive, IsString, IsUUID, MinLength } from 'class-validator';

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
  reportedPrice: number;
}
