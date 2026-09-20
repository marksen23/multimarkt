import { IsNumber, IsPositive, IsString, IsUUID, MinLength } from 'class-validator';

export class ReportSaleDto {
  @IsUUID('4')
  projectionId: string;

  @IsString()
  @MinLength(1)
  externalEventId: string;

  @IsNumber()
  @IsPositive()
  reportedPrice: number;
}

export class ResolveConflictDto {
  @IsUUID('4')
  winningSaleEventId: string;
}
