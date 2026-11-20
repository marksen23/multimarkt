import { Module } from '@nestjs/common';
import { MarkdownProcessor } from './markdown.processor';
import { MarkdownModule } from './markdown.module';

/**
 * Consumer. Läuft im Web-Prozess (Coolify, ein Container) und bleibt
 * auch im optionalen Worker-Prozess registriert.
 */
@Module({
  imports: [MarkdownModule],
  providers: [MarkdownProcessor],
})
export class MarkdownWorkerModule {}
