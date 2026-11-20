import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ebaySellGaps } from '../../domain/listing/ebay-sell-readiness';
import {
  AttentionCard,
  DEFAULT_MARKDOWN_RETRY_MS,
} from '../../domain/pricing/markdown-plan';
import { ItemEntity } from '../../infrastructure/database/entities';
import { readEbaySellEnv } from '../../marketplaces/ebay/ebay-sell.adapter';
import { PriceRecommendationService } from '../pricing/price-recommendation.service';
import { EbayOfferPriceUpdater } from './ebay-offer-price';
import { runMarkdownItem } from './markdown-run';
import {
  ItemMarkdownInput,
  ItemMarkdownView,
  MarkdownSettingsView,
  MarkdownTaskView,
  TaskActionResult,
  TypeOrmMarkdownStore,
} from './markdown.store';

/**
 * Automatische Preissenkung und Wiedervorlage.
 * Der Takt kommt aus BullMQ. Dieser Service ändert keinen Preis,
 * wenn der Artikel nicht mehr LISTED ist.
 */
@Injectable()
export class MarkdownService {
  private readonly logger = new Logger(MarkdownService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly prices: PriceRecommendationService,
    private readonly ebay: EbayOfferPriceUpdater,
    private readonly config: ConfigService,
  ) {}

  settings(userId: string): Promise<MarkdownSettingsView> {
    return this.store().settings(userId);
  }

  saveSettings(userId: string, input: MarkdownSettingsView): Promise<MarkdownSettingsView> {
    return this.store().saveSettings(userId, input);
  }

  forItem(userId: string, itemId: string, now = new Date()): Promise<ItemMarkdownView> {
    return this.store().view(userId, itemId, now);
  }

  async savePlan(userId: string, itemId: string, input: ItemMarkdownInput, now = new Date()): Promise<ItemMarkdownView> {
    await this.store().savePlan(userId, itemId, input);
    return this.forItem(userId, itemId, now);
  }

  attention(userId: string, now = new Date()): Promise<AttentionCard[]> {
    return this.store().attention(userId, now);
  }

  tasks(userId: string): Promise<MarkdownTaskView[]> {
    return this.store().openTasks(userId);
  }

  confirmTask(userId: string, taskId: string, now = new Date()): Promise<TaskActionResult> {
    return this.dataSource.transaction((manager) => this.store(manager).confirm(userId, taskId, now));
  }

  dismissTask(userId: string, taskId: string, now = new Date()): Promise<TaskActionResult> {
    return this.store().dismiss(userId, taskId, now);
  }

  async runDue(now = new Date()): Promise<void> {
    const items = await this.dataSource.manager.find(ItemEntity, {
      where: { status: 'LISTED' },
      select: { id: true },
    });
    for (const item of items) {
      try {
        await this.runItem(item.id, now);
      } catch (error) {
        this.logger.error(`Preissenkung für ${item.id} fehlgeschlagen: ${(error as Error).message}`);
      }
    }
  }

  async runItem(itemId: string, now = new Date()): Promise<void> {
    const options = {
      now,
      retryMs: this.retryMs(),
      ebayApiConfigured: ebaySellGaps(readEbaySellEnv(this.config)).length === 0,
    };
    await this.dataSource.transaction((manager) =>
      runMarkdownItem(this.store(manager), this.ebay, itemId, options),
    );
  }

  private store(manager = this.dataSource.manager): TypeOrmMarkdownStore {
    return new TypeOrmMarkdownStore(manager, this.prices);
  }

  private retryMs(): number {
    const raw = Number(this.config.get('MARKDOWN_RETRY_MS', DEFAULT_MARKDOWN_RETRY_MS));
    return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_MARKDOWN_RETRY_MS;
  }
}
