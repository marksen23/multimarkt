import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BundleEntity,
  CanonicalListingEntity,
  ItemEntity,
  MarketplaceProjectionEntity,
} from '../../infrastructure/database/entities';
import { StateGuardModule } from '../state-guard/state-guard.module';
import { CanonicalListingService } from './canonical-listing.service';
import { ListingSummaryService } from './listing-summary.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ItemEntity, BundleEntity, CanonicalListingEntity, MarketplaceProjectionEntity]),
    StateGuardModule,
  ],
  providers: [CanonicalListingService, ListingSummaryService],
  exports: [CanonicalListingService, ListingSummaryService],
})
export class CanonicalListingModule {}
