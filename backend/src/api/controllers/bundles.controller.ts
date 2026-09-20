import {
  BadRequestException,
  Body,
  Controller,
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
import { AddBundleItemsDto, CreateBundleDto } from '../dto/bundles.dto';
import { PrepareListingDto } from '../dto/items.dto';
import { ActorContext } from '../../domain/actor-context';
import { BundleAssignmentService } from '../../application/bundle/bundle-assignment.service';
import { CanonicalListingService } from '../../application/listing/canonical-listing.service';
import { BundleEntity, CanonicalListingEntity } from '../../infrastructure/database/entities';

/** Doc 04 §10 — Bundle-Aggregat (Doc 01 §11). */
@Controller('bundles')
@UseGuards(ActorContextGuard)
@UseInterceptors(ResponseEnvelopeInterceptor)
export class BundlesController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly bundleAssignment: BundleAssignmentService,
    private readonly canonicalListing: CanonicalListingService,
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
