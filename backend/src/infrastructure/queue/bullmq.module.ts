import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Root Redis connection for BullMQ. Queue-Definitionen (Webhook-Folgejobs,
// Publishing-Retries, S3-Garbage-Collection) folgen in Schritt 5 (Doc 03 §17).
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL', 'redis://localhost:6379'),
        },
      }),
    }),
  ],
})
export class QueueModule {}
