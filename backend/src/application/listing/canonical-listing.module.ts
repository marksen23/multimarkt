import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BundleEntity, CanonicalListingEntity, ItemEntity } from '../../infrastructure/database/entities';
import { StateGuardModule } from '../state-guard/state-guard.module';
import { CanonicalListingService } from './canonical-listing.service';

@Module({
  imports: [TypeOrmModule.forFeature([ItemEntity, BundleEntity, CanonicalListingEntity]), StateGuardModule],
  providers: [CanonicalListingService],
  exports: [CanonicalListingService],
})
export class CanonicalListingModule {}
