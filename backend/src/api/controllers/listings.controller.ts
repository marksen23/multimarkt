import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CurrentActor } from '../auth/actor.decorator';
import { ActorContextGuard } from '../auth/actor-context.guard';
import { ResponseEnvelopeInterceptor } from '../interceptors/response-envelope.interceptor';
import { CreateListingDto, MarkSoldDto } from '../dto/listings.dto';
import { ActorContext } from '../../domain/actor-context';
import {
  HumanGateBypassException,
  InvalidStateTransitionException,
} from '../../domain/errors/state-transition.errors';
import {
  CapabilityCheckResult,
  CapabilityCheckService,
} from '../../application/capability-check/capability-check.service';
import { ChannelPackageService } from '../../application/listing/channel-package.service';
import { MarketplacePublishingService } from '../../application/listing/marketplace-publishing.service';
import {
  EvaluateSaleOutcome,
  SaleIngestionService,
} from '../../application/sale-conflict/sale-ingestion.service';
import { StateGuardService } from '../../application/state-guard/state-guard.service';
import { MarketplaceProjectionEntity } from '../../infrastructure/database/entities';

/** Doc 04 §9/§15 — Marketplace Projections ("Listings"). */
@Controller('listings')
@UseGuards(ActorContextGuard)
@UseInterceptors(ResponseEnvelopeInterceptor)
export class ListingsController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stateGuard: StateGuardService,
    private readonly capabilityCheck: CapabilityCheckService,
    private readonly publishing: MarketplacePublishingService,
    private readonly channelPackage: ChannelPackageService,
    private readonly saleIngestion: SaleIngestionService,
  ) {}

  @Post()
  async create(@Body() dto: CreateListingDto): Promise<MarketplaceProjectionEntity> {
    return this.dataSource.manager.save(MarketplaceProjectionEntity, {
      canonicalListingId: dto.canonicalListingId,
      marketplaceId: dto.marketplaceId,
      status: 'DRAFT',
    });
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<MarketplaceProjectionEntity> {
    const projection = await this.dataSource.manager.findOneBy(MarketplaceProjectionEntity, { id });
    if (!projection) throw new NotFoundException(`Listing ${id} not found`);
    return projection;
  }

  @Post(':id/capability-check')
  async checkCapability(@Param('id', ParseUUIDPipe) id: string): Promise<CapabilityCheckResult> {
    const projection = await this.dataSource.manager.findOneByOrFail(MarketplaceProjectionEntity, {
      id,
    });
    return this.capabilityCheck.check(projection.canonicalListingId, projection.marketplaceId);
  }

  @Post(':id/publish')
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<MarketplaceProjectionEntity> {
    return this.publishing.publish(id, actor);
  }

  /**
   * Doc 02 §5 "User Copy" — bewusste Doc-04-Erweiterung: nötig für
   * Formatierungshilfe-Plattformen (Doc 01 §9, z.B. Kleinanzeigen), die
   * `publish()` bewusst in PUBLISHING hält, bis der Nutzer bestätigt, dass
   * er den vorbereiteten Text manuell eingestellt hat.
   */
  @Post(':id/confirm-published')
  async confirmPublished(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<MarketplaceProjectionEntity> {
    return this.publishing.confirmPublished(id, actor);
  }

  @Post(':id/cancel')
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<MarketplaceProjectionEntity> {
    return this.stateGuard.transitionProjection(id, {
      type: 'CANCEL_PENDING_TRIGGERED',
      actor,
    });
  }

  /**
   * §4d/§4e-Gap (September 2026): Kleinanzeigen hat keine API und kann
   * daher nie einen Sale-Webhook schicken (siehe WebhooksController) —
   * ohne diesen Weg gab es für den einzigen aktiven Verkaufskanal keine
   * Möglichkeit, einen Verkauf überhaupt ins System zu bekommen. Explizit
   * ein Human-Gate (nur USER, nicht SYSTEM/WEBHOOK) — eine Verkaufsmeldung
   * ist eine bewusste menschliche Aussage, kein automatisiertes Ereignis.
   */
  /**
   * Kanal-Karte: Entwurf → kopiert. Kopiert nur den Status, ruft keinen
   * Marktplatz auf. Der Mock-eBay-Adapter bleibt außen vor.
   */
  @Post(':id/mark-copied')
  async markCopied(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<MarketplaceProjectionEntity> {
    return this.channelPackage.markCopied(id, actor);
  }

  /** kopiert → online. Der Mensch hat die Anzeige selbst eingestellt. */
  @Post(':id/confirm-online')
  async confirmOnline(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<MarketplaceProjectionEntity> {
    return this.channelPackage.confirmOnline(id, actor);
  }

  @Post(':id/mark-sold')
  async markSold(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkSoldDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ outcome: EvaluateSaleOutcome }> {
    if (actor.type !== 'USER') {
      throw new HumanGateBypassException('Only a USER actor may manually report a sale');
    }
    const projection = await this.dataSource.manager.findOneBy(MarketplaceProjectionEntity, { id });
    if (!projection) throw new NotFoundException(`Listing ${id} not found`);
    if (projection.status !== 'ONLINE') {
      throw new InvalidStateTransitionException(
        'Nur eine online geschaltete Karte kann als verkauft gemeldet werden.',
        { projectionId: id, currentState: projection.status },
      );
    }
    const outcome = await this.saleIngestion.reportAndEvaluate(id, dto.reportedPrice);
    return { outcome };
  }

  @Post(':id/confirm-cancellation')
  async confirmCancellation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<MarketplaceProjectionEntity> {
    return this.publishing.confirmCancellation(id, actor);
  }
}
