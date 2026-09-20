import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

// Entry point for the Render "Background Worker" service (BullMQ consumers:
// Sale-Conflict-Auswertung, künftig Publishing-Retries, S3-Garbage-
// Collection). Kein HTTP-Listener: reiner Application-Context-Prozess.
async function bootstrap() {
  const logger = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(WorkerModule);
  logger.log('Worker process started (sale-conflict-evaluation processor active).');
  process.on('SIGTERM', async () => {
    await app.close();
    process.exit(0);
  });
}
bootstrap();
