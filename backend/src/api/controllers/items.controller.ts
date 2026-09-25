import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { memoryStorage } from 'multer';
import { CurrentActor } from '../auth/actor.decorator';
import { ActorContextGuard } from '../auth/actor-context.guard';
import { ResponseEnvelopeInterceptor } from '../interceptors/response-envelope.interceptor';
import {
  BundleItemsDto,
  ConfirmAttributeDto,
  ConfirmTruthDto,
  CreateItemDto,
  PrepareListingDto,
} from '../dto/items.dto';
import { EvaluateDispositionDto } from '../dto/disposition.dto';
import { ActorContext } from '../../domain/actor-context';
import { SalesGoal } from '../../domain/ai/description-generation-provider.interface';
import { ItemLifecycleState } from '../../domain/state-vocabulary';
import { BundleAssignmentService } from '../../application/bundle/bundle-assignment.service';
import { CanonicalListingService } from '../../application/listing/canonical-listing.service';
import {
  ListingSummary,
  ListingSummaryService,
} from '../../application/listing/listing-summary.service';
import { ConflictResolutionService } from '../../application/conflict-resolution/conflict-resolution.service';
import {
  DispositionEngineService,
  DispositionRecommendation,
} from '../../application/disposition/disposition-engine.service';
import { ItemAttributeConfirmationService } from '../../application/product-analysis/item-attribute-confirmation.service';
import { ProductAnalysisService } from '../../application/product-analysis/product-analysis.service';
import {
  ImageOptimizationService,
  OptimizedPhoto,
} from '../../application/image-optimization/image-optimization.service';
import {
  PriceResearchResult,
  PriceTriangulationService,
} from '../../application/pricing/price-triangulation.service';
import { StateGuardService } from '../../application/state-guard/state-guard.service';
import { STORAGE_PROVIDER, StorageProvider } from '../../domain/storage/storage-provider.interface';
import {
  BundleEntity,
  CanonicalListingEntity,
  ItemAttributeEntity,
  ItemEntity,
  ItemPhotoEntity,
  MarketplaceProjectionEntity,
  SaleEventEntity,
} from '../../infrastructure/database/entities';
import { ResolveConflictDto } from '../dto/sale-events.dto';

const MAX_PHOTOS_PER_UPLOAD = 10;
const MAX_PHOTO_SIZE_BYTES = 15 * 1024 * 1024;
const ALLOWED_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
const SALES_GOALS: SalesGoal[] = ['MAX_PROFIT', 'BALANCED', 'FAST_SALE', 'MINIMAL_EFFORT'];

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
    private readonly priceTriangulation: PriceTriangulationService,
    private readonly imageOptimization: ImageOptimizationService,
    private readonly listingSummary: ListingSummaryService,
    private readonly attributeConfirmation: ItemAttributeConfirmationService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  @Post()
  async create(@Body() dto: CreateItemDto, @CurrentActor() actor: ActorContext): Promise<ItemEntity> {
    return this.dataSource.manager.save(ItemEntity, {
      userId: actor.userId!,
      title: dto.title ?? null,
      status: 'NEW',
    });
  }

  /**
   * NICHT Teil des ursprünglichen Doc 04 — bewusste, dokumentierte
   * Erweiterung (siehe Abschlussbericht "Vertragslücken"), da das README
   * ein "zentrales Dashboard: Status pro Listing pro Plattform" als
   * MVP-Feature vorschreibt, das ohne einen Listen-Endpoint nicht baubar ist.
   * Folgt denselben Konventionen wie der Rest von Doc 04 (Actor-Gate,
   * Response-Envelope, Single-User-Scoping über `actor.userId`).
   */
  @Get()
  async list(
    @CurrentActor() actor: ActorContext,
    @Query('status') status?: ItemLifecycleState,
  ): Promise<{ item: ItemEntity; listings: ListingSummary[]; thumbnailUrl: string | null }[]> {
    const items = await this.dataSource.manager.find(ItemEntity, {
      where: status ? { userId: actor.userId!, status } : { userId: actor.userId! },
      order: { createdAt: 'DESC' },
    });
    const listingsByItem = await this.listingSummary.forItemIds(items.map((i) => i.id));
    // Fotogalerie (September 2026): nur das jeweils erste Foto je Item für
    // die Dashboard-Kachel — die volle Galerie liefert erst GET /items/:id.
    const photos = items.length
      ? await this.dataSource.manager
          .createQueryBuilder(ItemPhotoEntity, 'p')
          .where('p.item_id IN (:...ids)', { ids: items.map((i) => i.id) })
          .orderBy('p.created_at', 'ASC')
          .getMany()
      : [];
    const thumbnailByItem = new Map<string, string>();
    for (const photo of photos) {
      if (!thumbnailByItem.has(photo.itemId)) thumbnailByItem.set(photo.itemId, photo.url);
    }
    return items.map((item) => ({
      item,
      listings: listingsByItem.get(item.id) ?? [],
      thumbnailUrl: thumbnailByItem.get(item.id) ?? null,
    }));
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<{
    item: ItemEntity;
    attributes: ItemAttributeEntity[];
    listings: ListingSummary[];
    photos: ItemPhotoEntity[];
  }> {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    const attributes = await this.dataSource.manager.find(ItemAttributeEntity, {
      where: { itemId: id },
    });
    const listings = await this.listingSummary.forItem(id);
    const photos = await this.dataSource.manager.find(ItemPhotoEntity, {
      where: { itemId: id },
      order: { createdAt: 'ASC' },
    });
    return { item, attributes, listings, photos };
  }

  /**
   * README §3 Schritt 1 "Foto-Erfassung": der Workflow beginnt mit dem Foto.
   * `multipart/form-data`, Feldname `files` — echter Upload über
   * StorageProvider (austauschbar, siehe Doku dort) statt der früheren
   * Platzhalter-Lösung (rohe Bild-URLs per Hand einfügen).
   */
  @Post(':id/analyze')
  @UseInterceptors(
    FilesInterceptor('files', MAX_PHOTOS_PER_UPLOAD, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PHOTO_SIZE_BYTES },
    }),
  )
  async analyze(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentActor() actor: ActorContext,
  ): Promise<ItemEntity> {
    if (!files?.length) {
      throw new BadRequestException('At least one photo is required (field "files")');
    }
    for (const file of files) {
      if (!ALLOWED_PHOTO_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException(`Unsupported image type: ${file.mimetype}`);
      }
    }

    await this.stateGuard.transitionItem(id, { type: 'UPLOAD_PHOTO', actor });

    const uploaded = await Promise.all(
      files.map((file) =>
        this.storage.upload({
          buffer: file.buffer,
          mimeType: file.mimetype,
          originalName: file.originalname,
        }),
      ),
    );

    // Fotogalerie (September 2026): dauerhaft mit dem Item verknüpfen,
    // unabhängig vom Ausgang der KI-Analyse unten — die Fotos wurden
    // real hochgeladen, das bleibt so, auch wenn die Analyse scheitert.
    await this.dataSource.manager.insert(
      ItemPhotoEntity,
      uploaded.map((f) => ({ itemId: id, url: f.url, storageKey: f.key })),
    );

    return this.productAnalysis.analyze(
      id,
      uploaded.map((f) => f.url),
      { type: 'SYSTEM' },
    );
  }

  /**
   * §9e-Ergänzung (September 2026): Bildoptimierung ("Nano Banana") als
   * eigenständige, opt-in Aktion — liefert ein ZUSÄTZLICHES Bild, ersetzt
   * nie das Original. Kein StateGuard-Transition (verändert den
   * Item-Lifecycle nicht), daher nur ein Existenz-Check.
   */
  @Post(':id/optimize-photo')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_PHOTO_SIZE_BYTES } }))
  async optimizePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<OptimizedPhoto | { url: null }> {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    if (!file) throw new BadRequestException('A photo is required (field "file")');
    if (!ALLOWED_PHOTO_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`Unsupported image type: ${file.mimetype}`);
    }

    const optimized = await this.imageOptimization.optimize({
      buffer: file.buffer,
      mimeType: file.mimetype,
      originalName: file.originalname,
    });
    return optimized ?? { url: null };
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

  /**
   * Bewusste Doc-04-Erweiterung — siehe ItemAttributeConfirmationService.
   * `:key` ist der `attribute_key` (z.B. "brand", "color"), nicht "condition"
   * (dafür bleibt `confirm-truth` zuständig, da es zusätzlich eine
   * State-Machine-Transition auf dem Item auslöst).
   */
  @Post(':id/attributes/:key/confirm')
  async confirmAttribute(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('key') key: string,
    @Body() dto: ConfirmAttributeDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<ItemAttributeEntity> {
    return this.attributeConfirmation.confirm(id, key, dto.value, actor);
  }

  // §9b/§9e-Ergänzung: reine Vorschau, kein Speichern — das Frontend füllt
  // damit nur das editierbare Beschreibungsfeld vor, wie beim Preis-
  // Vorschlag (siehe PriceResearchPanel-Prinzip "keine Automatik ohne
  // Bestätigung"). `salesGoal` steuert nur den Ton (RealGeminiDescriptionProvider),
  // eine unbekannte/fehlende Query landet bewusst bei `null` (= BALANCED),
  // statt einen Fehler zu werfen — das ist reine Formulierungshilfe.
  @Get(':id/generate-description')
  async generateDescription(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('salesGoal') salesGoal?: string,
  ): Promise<{ descriptionText: string }> {
    const goal = SALES_GOALS.includes(salesGoal as SalesGoal) ? (salesGoal as SalesGoal) : null;
    return { descriptionText: await this.canonicalListing.generateDescription(id, goal) };
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

  // Doc04-Erweiterung (docs/README.md §9e): rein lesend/berechnend, kein
  // StateGuard-Transition — wie `disposition()` unten. Schreibt intern
  // einen Beratungs-Cache (`item_price_research`), nie einen Preis in
  // `canonical_listings`.
  @Get(':id/price-research')
  async researchPrice(@Param('id', ParseUUIDPipe) id: string): Promise<PriceResearchResult> {
    return this.priceTriangulation.research(id);
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
