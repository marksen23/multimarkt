import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BundleEntity, ItemEntity } from '../../infrastructure/database/entities';
import { StateGuardModule } from '../state-guard/state-guard.module';
import { BundleAssignmentService } from './bundle-assignment.service';

@Module({
  imports: [TypeOrmModule.forFeature([BundleEntity, ItemEntity]), StateGuardModule],
  providers: [BundleAssignmentService],
  exports: [BundleAssignmentService],
})
export class BundleAssignmentModule {}
