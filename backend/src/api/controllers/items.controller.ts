import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentActor } from '../auth/actor.decorator';
import { ActorContextGuard } from '../auth/actor-context.guard';
import { ResponseEnvelopeInterceptor } from '../interceptors/response-envelope.interceptor';
import {
  AssignPhotoShotDto,
  BundleItemsDto,
  ConfirmAttributeDto,
  ConfirmTruthDto,
  CreateItemDto,
  PrepareListingDto,
  ReanalyzeItemDto,
  SaveChannelPackageDto,
  UpdateTitleDto,
} from '../dto/items.dto';
import { CreateFromPurchaseDto, UpdatePurchaseDto } from '../dto/purchase.dto';
import { UpdateLogisticsProfileDto } from '../dto/logistics-profile.dto';
import { SuggestNegotiationDto } from '../dto/negotiation.dto';
import { RecordPriceDropDto } from '../dto/price-drop.dto';
import { RecordSaleCloseoutDto } from '../dto/sale-closeout.dto';
import { EvaluateDispositionDto } from '../dto/disposition.dto';
import { ActorContext } from '../../domain/actor-context';
import { DescriptionChannel, SalesGoal } from '../../domain/ai/description-generation-provider.interface';
import { HumanGateBypassException } from '../../domain/errors/state-transition.errors';
import { ItemLifecycleState } from '../../domain/state-vocabulary';
import { BundleAssignmentService } from '../../application/bundle/bundle-assignment.service';
import {
  CanonicalListingService,
  DescriptionSuggestion,
} from '../../application/listing/canonical-listing.service';
import {
  FollowUpService,
  ItemFollowUp,
  PriceDropResult,
} from '../../application/listing/follow-up.service';
import {
  MarketplaceRecommendationResult,
  MarketplaceRecommenderService,
} from '../../application/listing/marketplace-recommender.service';
import {
  ChannelPackageService,
  ChannelPackageView,
} from '../../application/listing/channel-package.service';
import {
  ListingSummary,
  ListingSummaryService,
} from '../../application/listing/listing-summary.service';
import { ConflictResolutionService } from '../../application/conflict-resolution/conflict-resolution.service';
import {
  DispositionEngineService,
  DispositionRecommendation,
} from '../../application/disposition/disposition-engine.service';
import { channelFeesFromUser } from '../../domain/pricing/channel-fees';
import {
  computeExpectedMargin,
  ExpectedMargin,
  individualSaleNotice,
  roundMoney,
} from '../../domain/pricing/expected-margin';
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
import { PhotoEnhancementService } from '../../application/photo-enhancement/photo-enhancement.service';
import { PhotoQualityService } from '../../application/photo-quality/photo-quality.service';
import { buildListingCopyFacts } from '../../domain/listing/kleinanzeigen-category';
import { buildStoreZip, photoZipName } from '../../domain/listing/photo-zip';
import { coverThumbnailUrl, publishablePhoto, toPublicPhoto } from '../../domain/photo/publishable-photo';
import { buildPhotoBriefing, isPhotoShot } from '../../domain/photo-quality/photo-briefing';
import { PhotoQualityReport } from '../../domain/photo-quality/photo-quality.types';
import {
  TitleGenerationService,
  TitleSuggestion,
} from '../../application/title-generation/title-generation.service';
import { ListingChannel } from '../../domain/ai/title-generation-provider.interface';
import {
  NegotiationService,
  NegotiationSuggestion,
} from '../../application/negotiation/negotiation.service';
import { SaleCloseoutService } from '../../application/sales/sale-closeout.service';
import { toLogisticsProfile } from '../../domain/logistics/logistics-profile';
import { StateGuardService } from '../../application/state-guard/state-guard.service';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '../../domain/storage/storage-provider.interface';
import {
  BundleEntity,
  CanonicalListingEntity,
  ItemAttributeEntity,
  ItemEntity,
  ItemPhotoEntity,
  MarketplaceProjectionEntity,
  SaleEventEntity,
  UserEntity,
} from '../../infrastructure/database/entities';
import { ResolveConflictDto } from '../dto/sale-events.dto';

const MAX_PHOTOS_PER_UPLOAD = 10;
const MAX_PHOTO_SIZE_BYTES = 15 * 1024 * 1024;
const ALLOWED_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
const SALES_GOALS: SalesGoal[] = ['MAX_PROFIT', 'BALANCED', 'FAST_SALE', 'MINIMAL_EFFORT'];
const DESCRIPTION_CHANNELS: DescriptionChannel[] = ['KLEINANZEIGEN', 'EBAY', 'VINTED', 'GENERIC'];
const LISTING_CHANNELS: ListingChannel[] = ['KLEINANZEIGEN', 'EBAY', 'VINTED'];

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
    private readonly channelPackage: ChannelPackageService,
    private readonly bundleAssignment: BundleAssignmentService,
    private readonly conflictResolution: ConflictResolutionService,
    private readonly dispositionEngine: DispositionEngineService,
    private readonly priceTriangulation: PriceTriangulationService,
    private readonly imageOptimization: ImageOptimizationService,
    private readonly photoEnhancement: PhotoEnhancementService,
    private readonly photoQuality: PhotoQualityService,
    private readonly titleGeneration: TitleGenerationService,
    private readonly listingSummary: ListingSummaryService,
    private readonly attributeConfirmation: ItemAttributeConfirmationService,
    private readonly saleCloseout: SaleCloseoutService,
    private readonly followUps: FollowUpService,
    private readonly negotiation: NegotiationService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly marketplaceRecommender: MarketplaceRecommenderService,
  ) {}

  @Post()
  async create(
    @Body() dto: CreateItemDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<ItemEntity> {
    return this.dataSource.manager.save(ItemEntity, {
      userId: actor.userId!,
      title: dto.title ?? null,
      status: 'NEW',
    });
  }

  /**
   * Feature-Plan 3.3: aus der Ankaufsuche wird ein Artikel mit Einstand
   * (Preis, Portal, Datum, Zustand, Link). Der bestätigte Artikelzustand
   * bleibt unberührt — der Einkaufszustand steht nur am Einkauf.
   */
  @Post('from-purchase')
  async createFromPurchase(
    @Body() dto: CreateFromPurchaseDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<ItemEntity> {
    return this.dataSource.manager.save(ItemEntity, {
      userId: actor.userId!,
      title: dto.title.trim(),
      status: 'NEW',
      purchasePriceEur: roundMoney(dto.price),
      purchasePortal: dto.portal.trim(),
      purchaseDate: dto.date ?? todayIsoDate(),
      purchaseCondition: blankToNull(dto.condition),
      purchaseUrl: blankToNull(dto.url),
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
  ): Promise<{ item: ItemEntity; listings: ListingSummary[]; thumbnailUrl: string | null; soldPrice: number | null }[]> {
    const items = await this.dataSource.manager.find(ItemEntity, {
      where: status
        ? { userId: actor.userId!, status }
        : { userId: actor.userId! },
      order: { createdAt: 'DESC' },
    });
    const listingsByItem = await this.listingSummary.forItemIds(
      items.map((i) => i.id),
    );
    // Fotogalerie (September 2026): nur das jeweils erste Foto je Item für
    // die Dashboard-Kachel — die volle Galerie liefert erst GET /items/:id.
    const photos = items.length
      ? await this.dataSource.manager
          .createQueryBuilder(ItemPhotoEntity, 'p')
          .where('p.item_id IN (:...ids)', { ids: items.map((i) => i.id) })
          .getMany()
      : [];
    const thumbnailByItem = coverThumbnailUrl(photos);
    // Tatsächlicher Verkaufspreis (Gewinner-SaleEvent) statt Listingpreis,
    // damit Erlös-Statistiken nicht den Angebotspreis aufsummieren.
    const winners: { itemId: string; price: string }[] = items.length
      ? await this.dataSource.manager.query(
          `SELECT cl.item_id AS "itemId", se.reported_price AS "price"
             FROM sale_events se
             JOIN marketplace_projections mp ON mp.id = se.projection_id
             JOIN canonical_listings cl ON cl.id = mp.canonical_listing_id
            WHERE se.is_winner = true AND cl.item_id = ANY($1)`,
          [items.map((i) => i.id)],
        )
      : [];
    const soldPriceByItem = new Map(winners.map((w) => [w.itemId, Number(w.price)]));
    return items.map((item) => ({
      item,
      listings: listingsByItem.get(item.id) ?? [],
      thumbnailUrl: thumbnailByItem.get(item.id) ?? null,
      soldPrice: soldPriceByItem.get(item.id) ?? null,
    }));
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string): Promise<{
    item: ItemEntity;
    attributes: ItemAttributeEntity[];
    listings: ListingSummary[];
    photos: ReturnType<typeof toPublicPhoto>[];
  }> {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    const attributes = await this.dataSource.manager.find(ItemAttributeEntity, {
      where: { itemId: id },
    });
    const listings = await this.listingSummary.forItem(id);
    const photos = await this.photosFor(id);
    return { item, attributes, listings, photos: photos.map((photo) => toPublicPhoto(photo)) };
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
    @Body('hint') hint?: string,
  ): Promise<ItemEntity> {
    if (!files?.length) {
      throw new BadRequestException(
        'At least one photo is required (field "files")',
      );
    }
    for (const file of files) {
      if (!ALLOWED_PHOTO_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException(
          `Unsupported image type: ${file.mimetype}`,
        );
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
    await this.storePhotos(
      id,
      uploaded.map((file) => ({ url: file.url, storageKey: file.key })),
      null,
    );

    return this.productAnalysis.analyze(
      id,
      uploaded.map((f) => f.url),
      { type: 'SYSTEM' },
      { hint },
    );
  }

  /**
   * Re-Analyse auf vorhandenen Fotos (REVIEW_REQUIRED only).
   * Aktualisiert UNKNOWN/INFERRED-Attribute ohne State-Transition.
   * USER_CONFIRMED-Attribute werden nicht überschrieben.
   */
  @Post(':id/reanalyze')
  async reanalyze(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReanalyzeItemDto,
  ): Promise<ItemEntity> {
    return this.productAnalysis.reanalyzeInPlace(id, { hint: dto.hint });
  }

  /**
   * Neue Fotos hinzufügen + sofort neu analysieren (REVIEW_REQUIRED only).
   * Speichert die Fotos dauerhaft und ruft dann reanalyzeInPlace auf,
   * sodass alle Fotos (alt + neu) in die KI-Analyse einfließen.
   */
  @Post(':id/upload-more-photos')
  @UseInterceptors(
    FilesInterceptor('files', MAX_PHOTOS_PER_UPLOAD, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PHOTO_SIZE_BYTES },
    }),
  )
  async uploadMorePhotos(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('hint') hint?: string,
  ): Promise<ItemEntity> {
    if (!files?.length) {
      throw new BadRequestException('At least one photo is required (field "files")');
    }
    for (const file of files) {
      if (!ALLOWED_PHOTO_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException(`Unsupported image type: ${file.mimetype}`);
      }
    }

    const uploaded = await Promise.all(
      files.map((file) =>
        this.storage.upload({
          buffer: file.buffer,
          mimeType: file.mimetype,
          originalName: file.originalname,
        }),
      ),
    );

    await this.storePhotos(
      id,
      uploaded.map((file) => ({ url: file.url, storageKey: file.key })),
      null,
    );

    return this.productAnalysis.reanalyzeInPlace(id, { hint });
  }

  /**
   * §9e-Ergänzung (September 2026): Bildoptimierung ("Nano Banana") als
   * eigenständige, opt-in Aktion — liefert ein ZUSÄTZLICHES Bild, ersetzt
   * nie das Original. Kein StateGuard-Transition (verändert den
   * Item-Lifecycle nicht), daher nur ein Existenz-Check.
   */
  @Post(':id/optimize-photo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PHOTO_SIZE_BYTES },
    }),
  )
  async optimizePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<OptimizedPhoto | { url: null }> {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    if (!file)
      throw new BadRequestException('A photo is required (field "file")');
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

  // Usability-Lücke (September 2026): bislang gab es keinen Weg, ein
  // versehentlich angelegtes/dupliziertes Item wieder loszuwerden — nur der
  // komplette Account-Reset in AccountController half. Neue DISCARD-
  // Transition (Doc 02 §4-Erweiterung) erlaubt das Verwerfen VOR dem
  // Listing-Start (NEW/ANALYZING/REVIEW_REQUIRED/READY -> CANCELLED);
  // sobald gelistet, bleibt Sale-Conflict/-Confirmation der einzige Weg
  // nach CANCELLED (Doc 02 Invariante I2, Human-Gate).
  @Post(':id/discard')
  async discard(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<ItemEntity> {
    return this.stateGuard.transitionItem(id, { type: 'DISCARD', actor });
  }

  @Post(':id/mark-sold')
  async markSold(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<ItemEntity> {
    return this.stateGuard.transitionItem(id, { type: 'MARK_SOLD_MANUALLY', actor });
  }

  @Post(':id/confirm-truth')
  async confirmTruth(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmTruthDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<ItemEntity> {
    const item = await this.stateGuard.transitionItem(id, {
      type: 'CONFIRM_TRUTH',
      actor,
      condition: dto.condition,
    });
    // Pre-warm price research cache so the first PrepareListingStep load is instant.
    // Fire-and-forget — never blocks the response.
    if (item.status === 'READY') {
      void this.priceTriangulation.research(id, {}).catch(() => {});
    }
    return item;
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
    @Query('channel') channel?: string,
  ): Promise<DescriptionSuggestion> {
    const goal = SALES_GOALS.includes(salesGoal as SalesGoal) ? (salesGoal as SalesGoal) : null;
    const resolvedChannel = DESCRIPTION_CHANNELS.includes(channel as DescriptionChannel)
      ? (channel as DescriptionChannel)
      : null;
    return this.canonicalListing.generateDescription(id, goal, resolvedChannel);
  }

  // Pixel-Check (Schärfe/Belichtung/Auflösung/Duplikate) plus Foto-Briefing.
  // Fehlende Aufnahmen sind ein Hinweis und blockieren das Speichern nicht.
  @Get(':id/photo-quality')
  async photoQualityReport(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PhotoQualityReport> {
    const photos = await this.photosFor(id);
    const attributes = await this.dataSource.manager.find(ItemAttributeEntity, {
      where: { itemId: id },
    });
    const pixel = await this.photoQuality.check(photos.map((p) => p.url));
    return {
      ...pixel,
      ...buildPhotoBriefing(
        attributes,
        photos.map((p) => p.shot),
      ),
    };
  }

  /** Kategorie, Zustand und Kleinanzeigen-Pfad für die Kopieransicht. Kein KI-Aufruf. */
  @Get(':id/listing-copy')
  async listingCopy(@Param('id', ParseUUIDPipe) id: string) {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    const attributes = await this.dataSource.manager.find(ItemAttributeEntity, { where: { itemId: id } });
    const value = (key: string) =>
      attributes.find((attribute) => attribute.attributeKey === key)?.attributeValue ?? null;
    return buildListingCopyFacts({
      category: value('category'),
      categoryDetail: value('categoryDetail'),
      title: item.title,
      condition: item.condition ?? value('condition'),
    });
  }

  /** Fotos als ZIP zum Hochladen bei Kleinanzeigen. Kein Portal wird angesprochen. */
  @Get(':id/photo-archive')
  async photoArchive(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    const photos = await this.photosFor(id);
    if (photos.length === 0) {
      throw new BadRequestException('Für diesen Artikel sind keine Fotos gespeichert.');
    }

    const files = [];
    for (const [index, photo] of photos.entries()) {
      const published = publishablePhoto(photo);
      let bytes: Buffer;
      try {
        bytes = await this.storage.read(published.storageKey);
      } catch {
        throw new NotFoundException(
          'Ein Foto liegt nicht mehr im Speicher. Lade es erneut hoch, bevor du das Archiv herunterlädst.',
        );
      }
      files.push({ name: photoZipName(index, published.storageKey), bytes });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="anzeigen-fotos.zip"');
    return new StreamableFile(buildStoreZip(files));
  }

  /**
   * Weiteres Foto, ohne die Analyse neu zu starten und ohne den
   * Artikelstatus zu ändern. Die Aufnahme (`shot`) ist optional.
   */
  @Post(':id/photos')
  @UseInterceptors(
    FilesInterceptor('files', MAX_PHOTOS_PER_UPLOAD, {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PHOTO_SIZE_BYTES },
    }),
  )
  async addPhotos(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('shot') shot?: string,
  ) {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    if (!files?.length) {
      throw new BadRequestException('At least one photo is required (field "files")');
    }
    for (const file of files) {
      if (!ALLOWED_PHOTO_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException(`Unsupported image type: ${file.mimetype}`);
      }
    }
    const assigned = shot == null || shot === '' ? null : shot;
    if (assigned != null && !isPhotoShot(assigned)) {
      throw new BadRequestException(`Unknown photo shot: ${assigned}`);
    }

    const uploaded = await Promise.all(
      files.map((file) =>
        this.storage.upload({
          buffer: file.buffer,
          mimeType: file.mimetype,
          originalName: file.originalname,
        }),
      ),
    );
    return this.storePhotos(
      id,
      uploaded.map((file) => ({ url: file.url, storageKey: file.key })),
      assigned,
    );
  }

  @Patch(':id/photos/:photoId')
  async assignPhotoShot(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
    @Body() dto: AssignPhotoShotDto,
  ) {
    const photo = await this.dataSource.manager.findOneBy(ItemPhotoEntity, {
      id: photoId,
      itemId: id,
    });
    if (!photo) throw new NotFoundException(`Photo ${photoId} not found`);
    if (dto.preferEnhanced !== undefined) photo.preferEnhanced = dto.preferEnhanced;
    if (dto.shot !== undefined || dto.preferEnhanced === undefined) photo.shot = dto.shot ?? null;
    const saved = await this.dataSource.manager.save(photo);
    return toPublicPhoto(saved);
  }

  /** Das gewählte Foto wird das Titelbild. Beide Fassungen werden neu gerechnet, damit der weiße Hintergrund mitwandert. */
  @Post(':id/photos/:photoId/cover')
  async makeCoverPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ) {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    const photos = await this.photoEnhancement.makeCover(id, photoId);
    return photos.map((photo) => toPublicPhoto(photo));
  }

  // §9e-Ergänzung (September 2026): reine Vorschau wie bei generate-description
  // — inkl. deterministischer Titel-Lückenanalyse (echte Vergleichstitel aus
  // der Preisrecherche, keine KI, keine Erfindung). Eine unbekannte/fehlende
  // Channel-Query fällt auf KLEINANZEIGEN zurück.
  @Get(':id/generate-title')
  async generateTitle(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('channel') channel?: string,
  ): Promise<TitleSuggestion> {
    const resolvedChannel = LISTING_CHANNELS.includes(channel as ListingChannel)
      ? (channel as ListingChannel)
      : 'KLEINANZEIGEN';
    return this.titleGeneration.generateTitle(id, resolvedChannel);
  }

  @Get(':id/marketplace-recommendations')
  async marketplaceRecommendations(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('salesGoal') salesGoal?: string,
  ): Promise<MarketplaceRecommendationResult> {
    const goal = SALES_GOALS.includes(salesGoal as (typeof SALES_GOALS)[number])
      ? (salesGoal as (typeof SALES_GOALS)[number])
      : null;
    return this.marketplaceRecommender.recommend(id, goal);
  }

  // Bislang gab es keinen Weg, den bei der Item-Anlage gesetzten Titel
  // nachträglich zu ändern — ohne diesen Endpunkt wäre der Titel-Vorschlag
  // oben unbenutzbar. Keine State-Machine-Transition nötig: `title` ist kein
  // Status-Feld (siehe StateGuardService-Zuständigkeit nur für `status`).
  @Patch(':id/purchase')
  async updatePurchase(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseDto,
  ): Promise<ItemEntity> {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    if (dto.price !== undefined) {
      item.purchasePriceEur = dto.price == null ? null : roundMoney(dto.price);
    }
    if (dto.portal !== undefined) item.purchasePortal = blankToNull(dto.portal);
    if (dto.date !== undefined) item.purchaseDate = dto.date ?? null;
    if (dto.condition !== undefined)
      item.purchaseCondition = blankToNull(dto.condition);
    if (dto.url !== undefined) item.purchaseUrl = blankToNull(dto.url);
    return this.dataSource.manager.save(item);
  }

  /**
   * Feature-Plan 3.5: kurzes Logistikprofil nach der Zustandsbestätigung.
   * Keine State-Machine-Transition — Gewicht und Versand sind keine
   * Produktwahrheit.
   */
  @Patch(':id/logistics')
  async updateLogistics(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateLogisticsProfileDto,
  ): Promise<ItemEntity> {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    item.weightGrams = dto.weightGrams ?? null;
    item.lengthCm = dto.lengthCm ?? null;
    item.widthCm = dto.widthCm ?? null;
    item.heightCm = dto.heightCm ?? null;
    item.logisticsBulky = dto.bulky;
    item.pickupOnly = dto.pickupOnly;
    item.shippingPossible = dto.shippingPossible;
    item.postalCode = blankToNull(dto.postalCode);
    item.logisticsCaptured = true;
    return this.dataSource.manager.save(item);
  }

  @Patch(':id/title')
  async updateTitle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTitleDto,
  ): Promise<ItemEntity> {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id });
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    await this.dataSource.manager.update(
      ItemEntity,
      { id },
      { title: dto.title },
    );
    return { ...item, title: dto.title };
  }

  @Get(':id/channel-package')
  async getChannelPackage(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('salesGoal') salesGoal?: string,
    @Query('fresh') fresh?: string,
  ): Promise<ChannelPackageView> {
    const goal = SALES_GOALS.includes(salesGoal as SalesGoal) ? (salesGoal as SalesGoal) : null;
    return this.channelPackage.getPackage(id, goal, fresh === 'true');
  }

  @Post(':id/channel-package')
  async saveChannelPackage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveChannelPackageDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<ChannelPackageView> {
    return this.channelPackage.save(actor.userId!, id, dto.cards, actor);
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
  async researchPrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('forceRefresh') forceRefresh?: string,
    @Query('salesGoal') salesGoal?: string,
  ): Promise<PriceResearchResult> {
    const goal = SALES_GOALS.includes(salesGoal as SalesGoal)
      ? (salesGoal as SalesGoal)
      : null;
    return this.priceTriangulation.research(id, {
      forceRefresh: forceRefresh === 'true',
      salesGoal: goal,
    });
  }

  @Post(':id/disposition')
  async evaluateDisposition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EvaluateDispositionDto,
  ): Promise<
    DispositionRecommendation & {
      margin: ExpectedMargin;
      individualSaleNotice: string | null;
    }
  > {
    const item = await this.dataSource.manager.findOneBy(ItemEntity, { id });
    if (!item) throw new NotFoundException(`Item ${id} not found`);

    // SCHEMA-HINWEIS: Doc 01 (eingefroren) hat keine `target_strategy`-Spalte
    // auf `items` (nur der ältere, überholte Entwurf `producttruth_schema.sql`
    // hatte eine). Diese Route liefert die Empfehlung daher rein
    // berechnend zurück, ohne eine gewählte Strategie zu persistieren — ein
    // Schema-Feld dafür wäre eine bewusste Vertragserweiterung, die hier
    // nicht einseitig vorgenommen wurde (siehe Abschlussbericht).
    //
    // Feature-Plan 2.3: kein Ankaufs-Quote (Momox-Mock) fließt hier ein.
    // Feature-Plan 3.5: Versandkosten der Disposition kommen aus dem
    // Logistikprofil, nicht aus der Ja/Nein-Sperrig-Flagge und nicht aus
    // den pauschalen 1,50 €. Solange das Profil fehlt, bleibt die vom
    // Nutzer gepflegte Versandannahme in der Marge (Feature-Plan 3.3).
    // Feature-Plan 3.10: Gebührenannahmen je Kanal. Der Netto der
    // Kanalliste zieht sie ab und sortiert danach, nicht nach dem Median.
    const user = await this.dataSource.manager.findOneBy(UserEntity, {
      id: item.userId,
    });
    const recommendation = this.dispositionEngine.evaluate({
      id: item.id,
      category: dto.category,
      condition: item.condition ?? 'unknown',
      marketMedianPrice: dto.marketMedianPrice,
      logistics: toLogisticsProfile(item),
      userGoal: dto.userGoal,
      channelFees: channelFeesFromUser(user),
      shippingFlatEur: user?.shippingEur ?? 0,
    });
    const margin = computeExpectedMargin({
      salePriceEur: dto.marketMedianPrice,
      purchasePriceEur: item.purchasePriceEur,
      feePercent: user?.feePercent ?? 0,
      shippingEur: item.logisticsCaptured
        ? recommendation.shippingCostEur
        : (user?.shippingEur ?? 0),
      singleSaleThresholdEur: user?.singleSaleThresholdEur ?? null,
    });
    return {
      ...recommendation,
      margin,
      individualSaleNotice: individualSaleNotice(margin),
    };
  }

  @Post(':id/bundle')
  async createBundle(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: BundleItemsDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<BundleEntity> {
    const itemIds = Array.from(new Set([id, ...dto.itemIds]));
    return this.bundleAssignment.createBundleWithItems(
      actor.userId!,
      dto.title,
      itemIds,
      actor,
    );
  }

  @Post(':id/resolve-conflict')
  async resolveConflict(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveConflictDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<ItemEntity> {
    return this.conflictResolution.resolve(id, dto.winningSaleEventId, actor);
  }

  /**
   * Feature-Plan 3.4: Abschluss nachholen, wenn der Artikel schon verkauft
   * ist (Konfliktauflösung, Webhook) und die Kosten noch fehlen.
   */
  @Post(':id/sale-closeout')
  async recordSaleCloseout(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordSaleCloseoutDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<ItemEntity> {
    if (actor.type !== 'USER') {
      throw new HumanGateBypassException(
        'Only a USER actor may record a sale closeout',
      );
    }
    return this.saleCloseout.recordForSoldItem(id, {
      proceedsEur: dto.proceedsEur,
      portal: dto.portal,
      feeEur: dto.feeEur,
      shippingEur: dto.shippingEur,
      paymentMethod: dto.paymentMethod ?? null,
    });
  }

  /** Feature-Plan 3.6: fälliges Nachfassen und bereits eingetragene Preissenkungen. */
  @Get(':id/follow-up')
  async followUp(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<ItemFollowUp> {
    return this.followUps.forItem(actor.userId!, id);
  }

  /**
   * Feature-Plan 3.6: der Nutzer bestätigt den neuen Preis. Gespeichert
   * werden nur dieser Preis, der bisherige Preis und der Vermerk. Der
   * Anzeigentext bleibt, die Live-Anzeige wird nicht angefasst.
   */
  @Post(':id/price-drop')
  async recordPriceDrop(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordPriceDropDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<PriceDropResult> {
    if (actor.type !== 'USER') {
      throw new HumanGateBypassException(
        'Only a USER actor may record a price drop',
      );
    }
    return this.followUps.recordPriceDrop({
      userId: actor.userId!,
      itemId: id,
      newPrice: dto.newPrice,
      canonicalListingId: dto.canonicalListingId,
    });
  }

  /**
   * Feature-Plan 3.7: Käufernachricht einfügen, mit P_min und P_target
   * dieses Artikels vergleichen, drei Antworten zurückgeben. Nichts wird
   * gesendet und kein Portal-Chat gelesen.
   */
  @Post(':id/negotiation')
  async suggestNegotiation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SuggestNegotiationDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<NegotiationSuggestion> {
    return this.negotiation.suggest({
      userId: actor.userId ?? '',
      itemId: id,
      message: dto.message,
      platform: dto.platform,
    });
  }

  @Get(':id/sale-events')
  async listSaleEvents(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SaleEventEntity[]> {
    return this.dataSource.manager
      .createQueryBuilder(SaleEventEntity, 'se')
      .innerJoin(MarketplaceProjectionEntity, 'p', 'p.id = se.projection_id')
      .innerJoin(CanonicalListingEntity, 'l', 'l.id = p.canonical_listing_id')
      .where('l.item_id = :itemId', { itemId: id })
      .getMany();
  }

  private async photosFor(itemId: string): Promise<ItemPhotoEntity[]> {
    const photos = await this.dataSource.manager.find(ItemPhotoEntity, { where: { itemId } });
    photos.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime());
    return photos;
  }

  private async storePhotos(
    itemId: string,
    uploaded: Array<{ url: string; storageKey: string }>,
    shot: string | null,
  ) {
    const existing = await this.photosFor(itemId);
    const start = existing.reduce((max, photo) => Math.max(max, photo.sortOrder), -1) + 1;
    const saved = await this.dataSource.manager.save(
      ItemPhotoEntity,
      uploaded.map((file, index) => ({
        itemId,
        url: file.url,
        storageKey: file.storageKey,
        shot,
        sortOrder: start + index,
        enhancementStatus: 'pending' as const,
        preferEnhanced: true,
        tips: [],
        suggestedCover: false,
      })),
    );
    await this.photoEnhancement.enqueue(saved.map((photo) => photo.id));
    return saved.map((photo) => toPublicPhoto(photo));
  }
}

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
