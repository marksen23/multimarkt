import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PhotoQualityService } from './photo-quality.service';

@Module({
  imports: [ConfigModule],
  providers: [PhotoQualityService],
  exports: [PhotoQualityService],
})
export class PhotoQualityModule {}
