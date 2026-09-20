import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CanonicalListingEntity, MarketplaceProjectionEntity } from '../../infrastructure/database/entities';
import { SaleIngestionModule } from '../../application/sale-conflict/sale-ingestion.module';
import { WebhookSignatureService } from './webhook-signature.service';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MarketplaceProjectionEntity, CanonicalListingEntity]),
    SaleIngestionModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhookSignatureService],
})
export class WebhooksModule {}
