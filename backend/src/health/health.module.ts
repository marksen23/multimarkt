import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadinessRedis, READINESS_REDIS } from './readiness-redis';
import { ReadinessService } from './readiness.service';
import { ReadyController } from './ready.controller';

@Module({
  controllers: [ReadyController],
  providers: [
    ReadinessService,
    {
      provide: READINESS_REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createReadinessRedis(config),
    },
  ],
})
export class HealthModule {}
