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
import { CreateListingDto } from '../dto/listings.dto';
import { ActorContext } from '../../domain/actor-context';
import {
  CapabilityCheckResult,
  CapabilityCheckService,
} from '../../application/capability-check/capability-check.service';
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
    const projection = await this.dataSource.manager.findOneByOrFail(MarketplaceProjectionEntity, {
      id,
    });
    // Doc 03 §6: CapabilityCheck MUSS vor jedem PUBLISHING-Event laufen.
    const { fallbackData } = await this.capabilityCheck.check(
      projection.canonicalListingId,
      projection.marketplaceId,
    );
    if (Object.keys(fallbackData).length > 0) {
      await this.dataSource.manager.update(MarketplaceProjectionEntity, { id }, { fallbackData });
    }
    return this.stateGuard.transitionProjection(id, { type: 'PUBLISH', actor });
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

  @Post(':id/confirm-cancellation')
  async confirmCancellation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<MarketplaceProjectionEntity> {
    return this.stateGuard.transitionProjection(id, { type: 'CONFIRM_CANCELLATION', actor });
  }
}
