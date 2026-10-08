import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isDurablePhotoStorage } from '../../infrastructure/storage/durable-photo-storage';
import { ActorContextGuard } from '../auth/actor-context.guard';
import { ResponseEnvelopeInterceptor } from '../interceptors/response-envelope.interceptor';

export interface PhotoStorageStatus {
  durable: boolean;
}

/**
 * Foto-Ansicht braucht das, um vor flüchtigem Speicher zu warnen.
 * `durable` ist nur wahr, wenn `S3_BUCKET` gesetzt ist.
 */
@Controller('storage')
@UseGuards(ActorContextGuard)
@UseInterceptors(ResponseEnvelopeInterceptor)
export class StorageController {
  constructor(private readonly config: ConfigService) {}

  @Get('status')
  status(): PhotoStorageStatus {
    return { durable: isDurablePhotoStorage(this.config) };
  }
}
