import { IsNumber, IsPositive, IsString, MinLength } from 'class-validator';

/** Vereinfachtes, plattformneutrales Webhook-Payload-Schema (Doc 04 §14). */
export class MarketplaceSaleWebhookDto {
  @IsString()
  @MinLength(1)
  externalPlatformId: string;

  @IsString()
  @MinLength(1)
  externalEventId: string;

  @IsNumber()
  @IsPositive()
  reportedPrice: number;
}
