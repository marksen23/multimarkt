import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { DataSource, Repository } from 'typeorm';
import { MarketplaceSaleWebhookDto } from '../dto/webhooks.dto';
import { CanonicalListingEntity, MarketplaceProjectionEntity } from '../../infrastructure/database/entities';
import { SaleConflictSchedulerService } from '../../application/sale-conflict/sale-conflict-scheduler.service';
import { SaleIngestionService } from '../../application/sale-conflict/sale-ingestion.service';
import { WebhookSignatureService } from './webhook-signature.service';

/**
 * Doc 04 §14: `POST /webhooks/:marketplace`. Actor: WEBHOOK — durchläuft
 * bewusst NICHT `ActorContextGuard` (der ist für die Domain-Routen gedacht),
 * sondern die dedizierte, marktplatzspezifische Signaturprüfung. Antwortet
 * so schnell wie möglich (Doc 04 §14: "asynchron HTTP 200/202"), OHNE im
 * selben Request-Zyklus die SALE_CONFLICT-Auswertung zu fahren — das ist
 * bewusstes Design, siehe SaleIngestionService.
 */
@Controller('webhooks')
export class WebhooksController {
  constructor(
    @InjectRepository(MarketplaceProjectionEntity)
    private readonly projectionRepo: Repository<MarketplaceProjectionEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly signatureService: WebhookSignatureService,
    private readonly saleIngestion: SaleIngestionService,
    private readonly scheduler: SaleConflictSchedulerService,
  ) {}

  @Post(':marketplace')
  @HttpCode(HttpStatus.ACCEPTED)
  async receive(
    @Param('marketplace') marketplace: string,
    @Body() body: MarketplaceSaleWebhookDto,
    @Headers('x-webhook-signature') signature: string | undefined,
    @Req() request: Request & { rawBody?: Buffer },
  ): Promise<{ received: true }> {
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(body));
    if (!this.signatureService.verify(marketplace, rawBody, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const projection = await this.projectionRepo.findOneBy({
      marketplaceId: marketplace.toUpperCase(),
      externalPlatformId: body.externalPlatformId,
    });
    if (!projection) {
      // Kein Konstrukt erfinden (Doc 04.2) — unbekannte externe IDs werden
      // explizit abgelehnt statt stillschweigend ignoriert.
      throw new NotFoundException(
        `No projection found for ${marketplace}:${body.externalPlatformId}`,
      );
    }

    const outcome = await this.saleIngestion.reportSale({
      projectionId: projection.id,
      externalEventId: body.externalEventId,
      reportedPrice: body.reportedPrice,
    });

    if (outcome === 'RECORDED') {
      const listing = await this.dataSource.manager.findOneByOrFail(CanonicalListingEntity, {
        id: projection.canonicalListingId,
      });
      if (listing.itemId) {
        // Debounce-Fenster (siehe SaleIngestionService-Doku) — Doc 03 §13:
        // ein Replay (outcome === 'IGNORED_DUPLICATE') löst KEINE erneute
        // Business-Logik aus, auch keinen erneuten Auswertungs-Job.
        await this.scheduler.scheduleEvaluation(listing.itemId).catch(() => {
          // Queue-Fehler dürfen die Webhook-Antwort nicht 500en lassen — die
          // Evaluation kann durch einen künftigen Report/Retry nachgeholt werden.
        });
      }
    }

    return { received: true };
  }
}
