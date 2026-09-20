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
import {
  AnalyzeItemDto,
  BundleItemsDto,
  ConfirmTruthDto,
  CreateItemDto,
  PrepareListingDto,
} from '../dto/items.dto';
import { EvaluateDispositionDto } from '../dto/disposition.dto';
import { ActorContext } from '../../domain/actor-context';
import { BundleAssignmentService } from '../../application/bundle/bundle-assignment.service';
import { CanonicalListingService } from '../../application/listing/canonical-listing.service';
import { ConflictResolutionService } from '../../application/conflict-resolution/conflict-resolution.service';
import {
  DispositionEngineService,
  DispositionRecommendation,
} from '../../application/disposition/disposition-engine.service';
import { ProductAnalysisService } from '../../application/product-analysis/product-analysis.service';
import { StateGuardService } from '../../application/state-guard/state-guard.service';
import {
  BundleEntity,
  CanonicalListingEntity,
  ItemAttributeEntity,
  ItemEntity,
  MarketplaceProjectionEntity,
  SaleEventEntity,
} from '../../infrastructure/database/entities';
import { ResolveConflictDto } from '../dto/sale-events.dto';

/** Doc 04 §7/§8/§12 — Item-Aggregat. */
@Controller('items')
@UseGuards(ActorContextGuard)
@UseInterceptors(ResponseEnvelopeInterceptor)
export class ItemsController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stateGuard: StateGuardService,
    private readonly productAnalysis: ProductAnalysisService,
    private readonly canonicalListing: CanonicalListingService,
    private readonly bundleAssignment: BundleAssignmentService,
    private readonly conflictResolution: ConflictResolutionService,
    private readonly dispositionEngine: DispositionEngineService,
  ) {}

  @Post()
  async create(@Body() dto: CreateItemDto, @CurrentActor() actor: ActorContext): Promise<ItemEntity> {
    return this.dataSource.manager.save(ItemEntity, {
      userId: actor.userId!,
      title: dto.title ?? null,
      status: 'NEW',
    });
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<{
    item: ItemEntity;
    attributes: ItemAttributeEntity[];
  }> {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    const attributes = await this.dataSource.manager.find(ItemAttributeEntity, {
      where: { itemId: id },
    });
    return { item, attributes };
  }

  @Post(':id/analyze')
  async analyze(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnalyzeItemDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<ItemEntity> {
    // Foto-Upload (NEW -> ANALYZING) ist Teil desselben User-Requests, da
    // es noch keinen separaten Upload-Endpoint gibt (kein S3-Adapter in
    // diesem Projektstand — siehe Abschlussbericht).
    await this.stateGuard.transitionItem(id, { type: 'UPLOAD_PHOTO', actor });
    return this.productAnalysis.analyze(id, dto.imageUrls, { type: 'SYSTEM' });
  }

  @Post(':id/confirm-truth')
  async confirmTruth(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmTruthDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<ItemEntity> {
    return this.stateGuard.transitionItem(id, {
      type: 'CONFIRM_TRUTH',
      actor,
      condition: dto.condition,
    });
  }

  @Post(':id/prepare-listing')
  async prepareListing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PrepareListingDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<CanonicalListingEntity> {
    return this.canonicalListing.prepareForItem(
      actor.userId!,
      id,
      dto.sellingPrice,
      dto.descriptionText,
      actor,
    );
  }

  @Post(':id/disposition')
  async evaluateDisposition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EvaluateDispositionDto,
  ): Promise<DispositionRecommendation> {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id });
    if (!item) throw new NotFoundException(`Item ${id} not found`);

    // SCHEMA-HINWEIS: Doc 01 (eingefroren) hat keine `target_strategy`-Spalte
    // auf `items` (nur der ältere, überholte Entwurf `producttruth_schema.sql`
    // hatte eine). Diese Route liefert die Empfehlung daher rein
    // berechnend zurück, ohne eine gewählte Strategie zu persistieren — ein
    // Schema-Feld dafür wäre eine bewusste Vertragserweiterung, die hier
    // nicht einseitig vorgenommen wurde (siehe Abschlussbericht).
    return this.dispositionEngine.evaluate({
      id: item.id,
      category: dto.category,
      condition: item.condition ?? 'unknown',
      marketMedianPrice: dto.marketMedianPrice,
      isBulky: dto.isBulky ?? false,
      userGoal: dto.userGoal,
    });
  }

  @Post(':id/bundle')
  async createBundle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BundleItemsDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<BundleEntity> {
    const itemIds = Array.from(new Set([id, ...dto.itemIds]));
    return this.bundleAssignment.createBundleWithItems(actor.userId!, dto.title, itemIds, actor);
  }

  @Post(':id/resolve-conflict')
  async resolveConflict(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveConflictDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<ItemEntity> {
    return this.conflictResolution.resolve(id, dto.winningSaleEventId, actor);
  }

  @Get(':id/sale-events')
  async listSaleEvents(@Param('id', ParseUUIDPipe) id: string): Promise<SaleEventEntity[]> {
    return this.dataSource.manager
      .createQueryBuilder(SaleEventEntity, 'se')
      .innerJoin(MarketplaceProjectionEntity, 'p', 'p.id = se.projection_id')
      .innerJoin(CanonicalListingEntity, 'l', 'l.id = p.canonical_listing_id')
      .where('l.item_id = :itemId', { itemId: id })
      .getMany();
  }
}
