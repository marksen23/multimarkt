import { Module } from '@nestjs/common';
import { CanonicalListingModule } from '../listing/canonical-listing.module';
import { WorklistService } from './worklist.service';

@Module({
  imports: [CanonicalListingModule],
  providers: [WorklistService],
  exports: [WorklistService],
})
export class WorklistModule {}
