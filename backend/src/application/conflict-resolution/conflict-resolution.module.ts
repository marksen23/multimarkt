import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CanonicalListingEntity,
  ItemEntity,
  MarketplaceProjectionEntity,
  SaleEventEntity,
} from '../../infrastructure/database/entities';
import { StateGuardModule } from '../state-guard/state-guard.module';
import { ConflictResolutionService } from './conflict-resolution.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ItemEntity,
      CanonicalListingEntity,
      MarketplaceProjectionEntity,
      SaleEventEntity,
    ]),
    StateGuardModule,
  ],
  providers: [ConflictResolutionService],
  exports: [ConflictResolutionService],
})
export class ConflictResolutionModule {}
