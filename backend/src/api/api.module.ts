import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CanonicalListingEntity,
  ItemAttributeEntity,
  ItemEntity,
  MarketplaceProjectionEntity,
  SaleEventEntity,
} from '../infrastructure/database/entities';
import { BundleAssignmentModule } from '../application/bundle/bundle-assignment.module';
import { CanonicalListingModule } from '../application/listing/canonical-listing.module';
import { CapabilityCheckModule } from '../application/capability-check/capability-check.module';
import { ConflictResolutionModule } from '../application/conflict-resolution/conflict-resolution.module';
import { AccountDeletionModule } from '../application/deletion/account-deletion.module';
import { DispositionEngineModule } from '../application/disposition/disposition-engine.module';
import { ProductAnalysisModule } from '../application/product-analysis/product-analysis.module';
import { SaleIngestionModule } from '../application/sale-conflict/sale-ingestion.module';
import { StateGuardModule } from '../application/state-guard/state-guard.module';
import { AccountController } from './controllers/account.controller';
import { BundlesController } from './controllers/bundles.controller';
import { ItemsController } from './controllers/items.controller';
import { ListingsController } from './controllers/listings.controller';
import { SaleEventsController } from './controllers/sale-events.controller';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ItemEntity,
      ItemAttributeEntity,
      CanonicalListingEntity,
      MarketplaceProjectionEntity,
      SaleEventEntity,
    ]),
    StateGuardModule,
    ProductAnalysisModule,
    CapabilityCheckModule,
    DispositionEngineModule,
    BundleAssignmentModule,
    CanonicalListingModule,
    ConflictResolutionModule,
    SaleIngestionModule,
    AccountDeletionModule,
    WebhooksModule,
  ],
  controllers: [
    ItemsController,
    ListingsController,
    BundlesController,
    SaleEventsController,
    AccountController,
  ],
})
export class ApiModule {}
