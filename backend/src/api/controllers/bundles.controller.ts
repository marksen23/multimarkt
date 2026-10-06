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
import {
  AddBundleItemsDto,
  BundleSuggestionFingerprintDto,
  CreateBundleDto,
} from '../dto/bundles.dto';
import { PrepareListingDto } from '../dto/items.dto';
import { ActorContext } from '../../domain/actor-context';
import { BundleAssignmentService } from '../../application/bundle/bundle-assignment.service';
import { BundleSuggestionService } from '../../application/bundle/bundle-suggestion.service';
import { BundleSuggestionResult } from '../../domain/bundle/bundle-suggestions';
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
    private readonly bundleSuggestions: BundleSuggestionService,
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
  ): Promise<{ bundle: BundleEntity; listings: ListingSummary[] }[]> {
    const bundles = await this.dataSource.manager.find(BundleEntity, {
      where: { userId: actor.userId! },
      order: { createdAt: 'DESC' },
    });
    const listingsByBundle = await this.listingSummary.forBundleIds(
      bundles.map((b) => b.id),
    );
    return bundles.map((bundle) => ({
      bundle,
      listings: listingsByBundle.get(bundle.id) ?? [],
    }));
  }

  /** Feature-Plan 3.8. Statische Route vor `:id`. */
  @Get('suggestions')
  async suggestions(
    @CurrentActor() actor: ActorContext,
  ): Promise<BundleSuggestionResult> {
    return this.bundleSuggestions.list(actor.userId!);
  }

  @Post('suggestions/accept')
  async acceptSuggestion(
    @Body() dto: BundleSuggestionFingerprintDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<BundleEntity> {
    return this.bundleSuggestions.accept(actor.userId!, dto.fingerprint, actor);
  }

  @Post('suggestions/dismiss')
  async dismissSuggestion(
    @Body() dto: BundleSuggestionFingerprintDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<{ dismissed: true }> {
    return this.bundleSuggestions.dismiss(actor.userId!, dto.fingerprint);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<{
    bundle: BundleEntity;
    items: ItemEntity[];
    listings: ListingSummary[];
  }> {
    const bundle = await this.dataSource.manager.findOneBy(BundleEntity, {
      id,
    });
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
    return this.bundleAssignment.addItemsToExistingBundle(
      id,
      dto.itemIds,
      actor,
    );
  }

  @Post(':id/prepare-listing')
  async prepareListing(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PrepareListingDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<CanonicalListingEntity> {
    if (!dto.descriptionText) {
      throw new BadRequestException(
        'descriptionText is required for bundle listings',
      );
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
