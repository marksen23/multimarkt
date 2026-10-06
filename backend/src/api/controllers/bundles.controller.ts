import {
  BadRequestException,
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
import { DataSource, In } from 'typeorm';
import { CurrentActor } from '../auth/actor.decorator';
import { ActorContextGuard } from '../auth/actor-context.guard';
import { ResponseEnvelopeInterceptor } from '../interceptors/response-envelope.interceptor';
import { AddBundleItemsDto, CreateBundleDto } from '../dto/bundles.dto';
import { PrepareListingDto } from '../dto/items.dto';
import { ActorContext } from '../../domain/actor-context';
import { BundleAssignmentService } from '../../application/bundle/bundle-assignment.service';
import { CanonicalListingService } from '../../application/listing/canonical-listing.service';
import {
  ListingSummary,
  ListingSummaryService,
} from '../../application/listing/listing-summary.service';
import {
  BundleEntity,
  BundleItemEntity,
  CanonicalListingEntity,
  ItemEntity,
} from '../../infrastructure/database/entities';

/** Doc 04 §10 — Bundle-Aggregat (Doc 01 §11). */
@Controller('bundles')
@UseGuards(ActorContextGuard)
@UseInterceptors(ResponseEnvelopeInterceptor)
export class BundlesController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly bundleAssignment: BundleAssignmentService,
    private readonly canonicalListing: CanonicalListingService,
    private readonly listingSummary: ListingSummaryService,
  ) {}

  @Post()
  async create(
    @Body() dto: CreateBundleDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<BundleEntity> {
    return this.dataSource.manager.save(BundleEntity, {
      userId: actor.userId!,
      title: dto.title,
      description: dto.description ?? null,
      status: 'NEW',
    });
  }

  /** Bewusste Doc-04-Erweiterung — siehe items.controller.ts `list()`. */
  @Get()
  async list(
    @CurrentActor() actor: ActorContext,
  ): Promise<{ bundle: BundleEntity; listings: ListingSummary[]; itemCount: number }[]> {
    const bundles = await this.dataSource.manager.find(BundleEntity, {
      where: { userId: actor.userId! },
      order: { createdAt: 'DESC' },
    });
    const bundleIds = bundles.map((b) => b.id);
    const [listingsByBundle, rawCounts] = await Promise.all([
      this.listingSummary.forBundleIds(bundleIds),
      bundleIds.length
        ? this.dataSource.manager
            .createQueryBuilder(BundleItemEntity, 'bi')
            .select('bi.bundleId', 'bundleId')
            .addSelect('COUNT(*)', 'count')
            .where('bi.bundleId IN (:...ids)', { ids: bundleIds })
            .groupBy('bi.bundleId')
            .getRawMany<{ bundleId: string; count: string }>()
        : Promise.resolve([]),
    ]);
    const itemCountMap = new Map(rawCounts.map((r) => [r.bundleId, Number(r.count)]));
    return bundles.map((bundle) => ({
      bundle,
      listings: listingsByBundle.get(bundle.id) ?? [],
      itemCount: itemCountMap.get(bundle.id) ?? 0,
    }));
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<{
    bundle: BundleEntity;
    items: ItemEntity[];
    listings: ListingSummary[];
  }> {
    const bundle = await this.dataSource.manager.findOneBy(BundleEntity, { id });
    if (!bundle) throw new NotFoundException(`Bundle ${id} not found`);

    const memberships = await this.dataSource.manager.find(BundleItemEntity, {
      where: { bundleId: id },
    });
    const items = memberships.length
      ? await this.dataSource.manager.findBy(ItemEntity, {
          id: In(memberships.map((m) => m.itemId)),
        })
      : [];
    const listings = await this.listingSummary.forBundle(id);
    return { bundle, items, listings };
  }

  @Post(':id/items')
  async addItems(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddBundleItemsDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<BundleEntity> {
    return this.bundleAssignment.addItemsToExistingBundle(id, dto.itemIds, actor);
  }

  @Post(':id/prepare-listing')
  async prepareListing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PrepareListingDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<CanonicalListingEntity> {
    if (!dto.descriptionText) {
      throw new BadRequestException('descriptionText is required for bundle listings');
    }
    return this.canonicalListing.prepareForBundle(
      actor.userId!,
      id,
      dto.sellingPrice,
      dto.descriptionText,
      actor,
    );
  }
}
