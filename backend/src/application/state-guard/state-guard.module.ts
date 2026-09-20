import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BundleEntity,
  CanonicalListingEntity,
  ItemAttributeEntity,
  ItemEntity,
  MarketplaceProjectionEntity,
} from '../../infrastructure/database/entities';
import { StateGuardService } from './state-guard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ItemEntity,
      ItemAttributeEntity,
      BundleEntity,
      CanonicalListingEntity,
      MarketplaceProjectionEntity,
    ]),
  ],
  providers: [StateGuardService],
  exports: [StateGuardService],
})
export class StateGuardModule {}
