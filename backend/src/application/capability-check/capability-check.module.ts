import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CanonicalListingEntity,
  ItemAttributeEntity,
  ItemEntity,
} from '../../infrastructure/database/entities';
import { CapabilityCheckService } from './capability-check.service';

@Module({
  imports: [TypeOrmModule.forFeature([CanonicalListingEntity, ItemEntity, ItemAttributeEntity])],
  providers: [CapabilityCheckService],
  exports: [CapabilityCheckService],
})
export class CapabilityCheckModule {}
