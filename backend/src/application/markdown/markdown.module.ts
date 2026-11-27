import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PRICE_MARKDOWN_QUEUE } from '../../infrastructure/queue/queue-names';
import { EbaySetupModule } from '../ebay/ebay-setup.module';
import { PriceTriangulationModule } from '../pricing/price-triangulation.module';
import { EbayOfferPriceUpdater } from './ebay-offer-price';
import { MarkdownSchedulerService } from './markdown-scheduler.service';
import { MarkdownService } from './markdown.service';

@Module({
  imports: [PriceTriangulationModule, EbaySetupModule, BullModule.registerQueue({ name: PRICE_MARKDOWN_QUEUE })],
  providers: [MarkdownService, MarkdownSchedulerService, EbayOfferPriceUpdater],
  exports: [MarkdownService],
})
export class MarkdownModule {}
