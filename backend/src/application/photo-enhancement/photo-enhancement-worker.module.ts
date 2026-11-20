import { Module } from '@nestjs/common';
import { PhotoEnhancementModule } from './photo-enhancement.module';
import { PhotoEnhancementProcessor } from './photo-enhancement.processor';

/**
 * Consumer. Läuft im Web-Prozess (Coolify, ein Container) und bleibt
 * auch im optionalen Worker-Prozess registriert.
 */
@Module({
  imports: [PhotoEnhancementModule],
  providers: [PhotoEnhancementProcessor],
})
export class PhotoEnhancementWorkerModule {}
