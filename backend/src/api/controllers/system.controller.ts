import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EbaySetupService } from '../../application/ebay/ebay-setup.service';
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
  constructor(
    private readonly config: ConfigService,
    private readonly ebay: EbaySetupService,
  ) {}

  @Get('integrations')
  async integrations(): Promise<IntegrationStatus> {
    const sell = await this.ebay.resolve();
    return integrationStatus({
      geminiApiKey: this.config.get<string>('GEMINI_API_KEY'),
      ebayClientId: sell.clientId,
      ebayClientSecret: sell.clientSecret,
      ebayRefreshToken: sell.refreshToken,
      ebayFulfillmentPolicyId: sell.fulfillmentPolicyId,
      ebayPaymentPolicyId: sell.paymentPolicyId,
      ebayReturnPolicyId: sell.returnPolicyId,
      ebayMerchantLocationKey: sell.merchantLocationKey,
      ebayEnvironment: sell.environment,
      s3Bucket: this.config.get<string>('S3_BUCKET'),
    });
  }
}
