import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { integrationStatus, type IntegrationStatus } from '../../application/system/integration-status';
import { ActorContextGuard } from '../auth/actor-context.guard';
import { ResponseEnvelopeInterceptor } from '../interceptors/response-envelope.interceptor';

/**
 * Sagt der Oberfläche, welche Integrationen wirklich scharf sind.
 * Enthält keine Schlüssel, nur ob ein echter Wert gesetzt ist.
 */
@Controller('system')
@UseGuards(ActorContextGuard)
@UseInterceptors(ResponseEnvelopeInterceptor)
export class SystemController {
  constructor(private readonly config: ConfigService) {}

  @Get('integrations')
  integrations(): IntegrationStatus {
    return integrationStatus({
      geminiApiKey: this.config.get<string>('GEMINI_API_KEY'),
      ebayClientId: this.config.get<string>('EBAY_CLIENT_ID'),
      ebayClientSecret: this.config.get<string>('EBAY_CLIENT_SECRET'),
      s3Bucket: this.config.get<string>('S3_BUCKET'),
    });
  }
}
