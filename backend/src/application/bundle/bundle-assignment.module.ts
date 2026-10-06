import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  BundleEntity,
  BundleSuggestionDismissalEntity,
  ItemEntity,
} from '../../infrastructure/database/entities';
import { StateGuardModule } from '../state-guard/state-guard.module';
import { BundleAssignmentService } from './bundle-assignment.service';
import { BundleSuggestionService } from './bundle-suggestion.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BundleEntity,
      ItemEntity,
      BundleSuggestionDismissalEntity,
    ]),
    StateGuardModule,
  ],
  providers: [BundleAssignmentService, BundleSuggestionService],
  exports: [BundleAssignmentService, BundleSuggestionService],
})
export class BundleAssignmentModule {}
