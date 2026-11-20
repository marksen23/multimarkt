import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import {
  attentionCard,
  AttentionCard,
  clampAttentionDays,
  clampIntervalDays,
  clampPercent,
  describeMarkdown,
  EffectiveMarkdown,
  MarkdownItemState,
  MarkdownOverride,
  MarkdownSettings,
  MarkdownStatus,
  marketplaceLabel,
  planConfirm,
} from '../../domain/pricing/markdown-plan';
import { roundMoney } from '../../domain/pricing/expected-margin';
import {
  CanonicalListingEntity,
  ItemEntity,
  ItemMarkdownPlanEntity,
  ItemPhotoEntity,
  ItemPriceHistoryEntity,
  ItemPriceResearchEntity,
  ListingPriceChangeEntity,
  MarkdownTaskEntity,
  MarketplaceProjectionEntity,
  UserEntity,
} from '../../infrastructure/database/entities';
import { PriceRecommendationService } from '../pricing/price-recommendation.service';
import { PriceResearchSourceResult } from '../pricing/price-triangulation.service';
import { MarkdownStore } from './markdown-run';

export interface MarkdownSettingsView {
  enabled: boolean;
  percent: number;
  intervalDays: number;
  attentionAfterDays: number;
}

export interface PriceHistoryView {
  id: string;
  previousPrice: number;
  newPrice: number;
  note: string;
  source: 'AUTOMATIC' | 'MANUAL_CONFIRM' | 'FOLLOW_UP';
  marketplaceId: string | null;
  changedAt: string;
}

export interface MarkdownTaskView {
  id: string;
  itemId: string;
  itemTitle: string | null;
  projectionId: string | null;
  marketplaceId: string;
  marketplaceLabel: string;
  targetPrice: number;
  previousPrice: number;
  kind: 'MANUAL_PRICE' | 'EBAY_ERROR';
  message: string;
  detail: string | null;
  copyText: string;
  createdAt: string;
}

export interface ItemMarkdownView {
  itemId: string;
  title: string | null;
  status: MarkdownStatus;
  percent: number | null;
  intervalDays: number | null;
  floorPrice: number | null;
  effective: EffectiveMarkdown;
  tasks: MarkdownTaskView[];
  history: PriceHistoryView[];
}

export interface TaskActionResult {
  applied: boolean;
  message: string;
}

export interface ItemMarkdownInput {
  status: MarkdownStatus;
  percent: number | null;
  intervalDays: number | null;
  floorPrice: number | null;
}

export class TypeOrmMarkdownStore implements MarkdownStore {
  constructor(
    private readonly manager: EntityManager,
    private readonly prices: PriceRecommendationService,
  ) {}

  async loadLocked(itemId: string): Promise<MarkdownItemState | null> {
    return this.load(itemId, true);
  }

  async read(itemId: string): Promise<MarkdownItemState | null> {
    return this.load(itemId, false);
  }

  async setSellingPrice(listingId: string, price: number): Promise<void> {
    await this.manager.update(CanonicalListingEntity, { id: listingId }, { sellingPrice: roundMoney(price) });
  }

  async setSuggestedPrice(projectionId: string, price: number): Promise<void> {
    await this.manager.update(
      MarketplaceProjectionEntity,
      { id: projectionId },
      { suggestedPrice: roundMoney(price) },
    );
  }

  async addHistory(entry: {
    itemId: string;
    listingId: string | null;
    previousPrice: number;
    newPrice: number;
    source: 'AUTOMATIC' | 'MANUAL_CONFIRM';
    marketplaceId: string | null;
    note: string;
  }): Promise<void> {
    await this.manager.save(
      this.manager.create(ItemPriceHistoryEntity, {
        itemId: entry.itemId,
        canonicalListingId: entry.listingId,
        previousPrice: roundMoney(entry.previousPrice),
        newPrice: roundMoney(entry.newPrice),
        source: entry.source,
        marketplaceId: entry.marketplaceId,
        note: entry.note,
      }),
    );
  }

  async saveTask(entry: {
    itemId: string;
    userId: string;
    projectionId: string | null;
    marketplaceId: string;
    targetPrice: number;
    previousPrice: number;
    kind: 'MANUAL_PRICE' | 'EBAY_ERROR';
    message: string;
    detail: string | null;
    copyText: string;
  }): Promise<void> {
    await this.manager.save(
      this.manager.create(MarkdownTaskEntity, {
        itemId: entry.itemId,
        userId: entry.userId,
        projectionId: entry.projectionId,
        marketplaceId: entry.marketplaceId,
        targetPrice: roundMoney(entry.targetPrice),
        previousPrice: roundMoney(entry.previousPrice),
        status: 'OPEN',
        kind: entry.kind,
        message: entry.message,
        detail: entry.detail,
        copyText: entry.copyText,
      }),
    );
  }

  async supersedeOpenManual(itemId: string, now: Date): Promise<void> {
    await this.manager.update(
      MarkdownTaskEntity,
      { itemId, status: 'OPEN', kind: 'MANUAL_PRICE' },
      { status: 'SUPERSEDED', resolvedAt: now },
    );
  }

  async dismissOpenErrors(itemId: string, now: Date): Promise<void> {
    await this.manager.update(
      MarkdownTaskEntity,
      { itemId, status: 'OPEN', kind: 'EBAY_ERROR' },
      { status: 'DISMISSED', resolvedAt: now },
    );
  }

  async touchPlan(
    itemId: string,
    userId: string,
    patch: { lastAppliedAt?: Date | null; lastAttemptAt?: Date | null; lastError: string | null },
  ): Promise<void> {
    let plan = await this.manager.findOneBy(ItemMarkdownPlanEntity, { itemId });
    if (!plan) {
      plan = this.manager.create(ItemMarkdownPlanEntity, {
        itemId,
        userId,
        status: 'INHERIT',
        percent: null,
        intervalDays: null,
        floorPrice: null,
        lastAppliedAt: null,
        lastAttemptAt: null,
        lastError: null,
      });
    }
    if (patch.lastAppliedAt !== undefined) plan.lastAppliedAt = patch.lastAppliedAt;
    if (patch.lastAttemptAt !== undefined) plan.lastAttemptAt = patch.lastAttemptAt;
    plan.lastError = patch.lastError;
    await this.manager.save(plan);
  }

  async settings(userId: string): Promise<MarkdownSettingsView> {
    const user = await this.requireUser(userId);
    return toSettings(user);
  }

  async saveSettings(
    userId: string,
    input: MarkdownSettingsView,
  ): Promise<MarkdownSettingsView> {
    const user = await this.requireUser(userId);
    user.markdownEnabled = input.enabled;
    user.markdownPercent = clampPercent(input.percent);
    user.markdownIntervalDays = clampIntervalDays(input.intervalDays);
    user.attentionAfterDays = clampAttentionDays(input.attentionAfterDays);
    await this.manager.save(user);
    return toSettings(user);
  }

  async savePlan(userId: string, itemId: string, input: ItemMarkdownInput): Promise<void> {
    const item = await this.manager.findOneBy(ItemEntity, { id: itemId, userId });
    if (!item) throw new NotFoundException('Artikel nicht gefunden.');
    let plan = await this.manager.findOneBy(ItemMarkdownPlanEntity, { itemId });
    if (!plan) {
      plan = this.manager.create(ItemMarkdownPlanEntity, {
        itemId,
        userId,
        status: 'INHERIT',
        percent: null,
        intervalDays: null,
        floorPrice: null,
        lastAppliedAt: null,
        lastAttemptAt: null,
        lastError: null,
      });
    }
    plan.status = input.status;
    plan.percent = input.status === 'ACTIVE' ? input.percent : null;
    plan.intervalDays = input.status === 'ACTIVE' ? input.intervalDays : null;
    plan.floorPrice = input.floorPrice;
    await this.manager.save(plan);
  }

  async view(userId: string, itemId: string, now: Date): Promise<ItemMarkdownView> {
    const state = await this.read(itemId);
    if (!state || state.userId !== userId) throw new NotFoundException('Artikel nicht gefunden.');
    return {
      itemId: state.itemId,
      title: state.title,
      status: state.override?.status ?? 'INHERIT',
      percent: state.override?.status === 'ACTIVE' ? state.override.percent : null,
      intervalDays: state.override?.status === 'ACTIVE' ? state.override.intervalDays : null,
      floorPrice: state.override?.floorPrice ?? null,
      effective: describeMarkdown(state, now),
      tasks: (await this.openTasks(state.userId)).filter((task) => task.itemId === state.itemId),
      history: await this.history(itemId),
    };
  }

  async attention(userId: string, now: Date): Promise<AttentionCard[]> {
    const items = await this.manager.find(ItemEntity, { where: { userId, status: 'LISTED' } });
    const cards: AttentionCard[] = [];
    for (const item of items) {
      const state = await this.load(item.id, false);
      if (!state) continue;
      const card = attentionCard(state, now);
      if (card) cards.push(card);
    }
    cards.sort(
      (a, b) => b.daysOnline - a.daysOnline || (a.title ?? '').localeCompare(b.title ?? '', 'de'),
    );
    return cards;
  }

  async openTasks(userId: string): Promise<MarkdownTaskView[]> {
    const tasks = await this.manager.find(MarkdownTaskEntity, {
      where: { userId, status: 'OPEN' },
      order: { createdAt: 'ASC' },
    });
    const itemIds = [...new Set(tasks.map((task) => task.itemId))];
    const items = itemIds.length
      ? await this.manager.find(ItemEntity, { where: { id: In(itemIds) } })
      : [];
    const titles = new Map(items.map((item) => [item.id, item.title]));
    return tasks.map((task) => toTaskView(task, task.itemId, titles.get(task.itemId) ?? null, task.createdAt));
  }

  async confirm(userId: string, taskId: string, now: Date): Promise<TaskActionResult> {
    const peek = await this.manager.findOne(MarkdownTaskEntity, { where: { id: taskId, userId } });
    if (!peek) throw new NotFoundException('Aufgabe nicht gefunden.');
    const state = await this.load(peek.itemId, true);
    if (!state || state.userId !== userId) throw new NotFoundException('Artikel nicht gefunden.');
    const task = await this.manager.findOne(MarkdownTaskEntity, {
      where: { id: taskId, userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!task || task.kind !== 'MANUAL_PRICE' || task.status !== 'OPEN') {
      throw new BadRequestException('Diese Aufgabe ist schon erledigt.');
    }
    if (state.currentPrice == null || !state.listingId) {
      throw new BadRequestException('Noch kein Verkaufspreis.');
    }
    const decision = planConfirm({
      itemStatus: state.itemStatus,
      currentPrice: state.currentPrice,
      targetPrice: Number(task.targetPrice),
      floorPrice: state.override?.floorPrice ?? state.suggestionFloor,
    });
    if (decision.type === 'reject') throw new BadRequestException(decision.message);
    if (decision.type === 'dismiss') {
      task.status = 'DISMISSED';
      task.resolvedAt = now;
      await this.manager.save(task);
      return { applied: false, message: decision.message };
    }
    if (decision.changePrice) {
      await this.setSellingPrice(state.listingId, decision.nextPrice);
      if (task.projectionId) await this.setSuggestedPrice(task.projectionId, decision.nextPrice);
      await this.addHistory({
        itemId: state.itemId,
        listingId: state.listingId,
        previousPrice: decision.previousPrice,
        newPrice: decision.nextPrice,
        source: 'MANUAL_CONFIRM',
        marketplaceId: task.marketplaceId,
        note: `Preis auf ${marketplaceLabel(task.marketplaceId)} gesenkt.`,
      });
      await this.touchPlan(state.itemId, state.userId, {
        lastAppliedAt: now,
        lastAttemptAt: now,
        lastError: null,
      });
    }
    task.status = 'DONE';
    task.resolvedAt = now;
    await this.manager.save(task);
    return { applied: decision.changePrice, message: decision.message };
  }

  async dismiss(userId: string, taskId: string, now: Date): Promise<TaskActionResult> {
    const task = await this.manager.findOne(MarkdownTaskEntity, { where: { id: taskId, userId } });
    if (!task) throw new NotFoundException('Aufgabe nicht gefunden.');
    if (task.kind !== 'EBAY_ERROR') {
      throw new BadRequestException('Diese Preisaufgabe bestätigst du mit „Preis gesenkt“.');
    }
    if (task.status !== 'OPEN') return { applied: false, message: 'Die Meldung ist schon geschlossen.' };
    task.status = 'DISMISSED';
    task.resolvedAt = now;
    await this.manager.save(task);
    return { applied: false, message: 'Meldung geschlossen.' };
  }

  async history(itemId: string): Promise<PriceHistoryView[]> {
    const auto = await this.manager.find(ItemPriceHistoryEntity, {
      where: { itemId },
      order: { createdAt: 'DESC' },
    });
    const listings = await this.manager.find(CanonicalListingEntity, {
      where: { itemId },
      select: { id: true },
    });
    const listingIds = listings.map((listing) => listing.id);
    const followUps = listingIds.length
      ? await this.manager.find(ListingPriceChangeEntity, {
          where: { canonicalListingId: In(listingIds) },
          order: { createdAt: 'DESC' },
        })
      : [];
    const rows: PriceHistoryView[] = [
      ...auto.map((row) => ({
        id: row.id,
        previousPrice: roundMoney(row.previousPrice),
        newPrice: roundMoney(row.newPrice),
        note: row.note,
        source: row.source,
        marketplaceId: row.marketplaceId,
        changedAt: row.createdAt.toISOString(),
      })),
      ...followUps.map((row) => ({
        id: row.id,
        previousPrice: roundMoney(row.previousPrice),
        newPrice: roundMoney(row.newPrice),
        note: row.note,
        source: 'FOLLOW_UP' as const,
        marketplaceId: null,
        changedAt: row.createdAt.toISOString(),
      })),
    ];
    rows.sort((a, b) => b.changedAt.localeCompare(a.changedAt));
    return rows;
  }

  private async load(itemId: string, lock: boolean): Promise<MarkdownItemState | null> {
    const item = await this.manager.findOne(ItemEntity, {
      where: { id: itemId },
      lock: lock ? { mode: 'pessimistic_write' } : undefined,
    });
    if (!item) return null;
    const user = await this.manager.findOneBy(UserEntity, { id: item.userId });
    if (!user) return null;
    const plan = await this.manager.findOneBy(ItemMarkdownPlanEntity, { itemId });
    const listings = await this.manager.find(CanonicalListingEntity, {
      where: { itemId },
      order: { createdAt: 'DESC' },
    });
    const listing = await this.chooseListing(listings, lock);
    const projections = listing
      ? await this.manager.find(MarketplaceProjectionEntity, {
          where: { canonicalListingId: listing.id },
        })
      : [];
    const tasks = await this.manager.find(MarkdownTaskEntity, { where: { itemId, status: 'OPEN' } });
    const photoCount = await this.manager.count(ItemPhotoEntity, { where: { itemId } });
    const onlineSince = projections.reduce<Date | null>((earliest, projection) => {
      if (projection.status !== 'ONLINE' || !projection.onlineSince) return earliest;
      if (!earliest || projection.onlineSince < earliest) return projection.onlineSince;
      return earliest;
    }, null);

    return {
      userId: item.userId,
      itemId: item.id,
      itemStatus: item.status,
      title: item.title,
      settings: toDomainSettings(user),
      override: plan ? toOverride(plan) : null,
      currentPrice: listing ? roundMoney(listing.sellingPrice) : null,
      listingId: listing?.id ?? null,
      onlineSince,
      suggestionFloor: await this.suggestionFloor(item),
      projections: projections.map((projection) => ({
        id: projection.id,
        marketplaceId: projection.marketplaceId,
        status: projection.status,
        externalPlatformId: projection.externalPlatformId,
        publishMeta: projection.publishMeta ?? {},
        onlineSince: projection.onlineSince,
      })),
      openTasks: tasks.map((task) => ({
        id: task.id,
        projectionId: task.projectionId,
        marketplaceId: task.marketplaceId,
        targetPrice: roundMoney(task.targetPrice),
        previousPrice: roundMoney(task.previousPrice),
        status: task.status,
        kind: task.kind,
        message: task.message,
        detail: task.detail,
        copyText: task.copyText,
      })),
      photoCount,
    };
  }

  private async chooseListing(
    listings: CanonicalListingEntity[],
    lock: boolean,
  ): Promise<CanonicalListingEntity | null> {
    if (listings.length === 0) return null;
    const projections = await this.manager.find(MarketplaceProjectionEntity, {
      where: { canonicalListingId: In(listings.map((listing) => listing.id)) },
    });
    const online = new Set(
      projections
        .filter((projection) => projection.status === 'ONLINE')
        .map((projection) => projection.canonicalListingId),
    );
    const chosen = listings.find((listing) => online.has(listing.id)) ?? listings[0];
    if (!lock) return chosen;
    return this.manager.findOne(CanonicalListingEntity, {
      where: { id: chosen.id },
      lock: { mode: 'pessimistic_write' },
    });
  }

  private async suggestionFloor(item: ItemEntity): Promise<number | null> {
    const rows = await this.manager.find(ItemPriceResearchEntity, {
      where: { itemId: item.id },
      order: { fetchedAt: 'DESC' },
    });
    if (rows.length === 0) return null;
    const newest = rows[0].fetchedAt.getTime();
    const batch = rows.filter((row) => row.fetchedAt.getTime() === newest);
    const sources: PriceResearchSourceResult[] = batch.map((row) => ({
      source: row.source,
      providerLabel: row.providerLabel,
      median: row.median,
      p25: row.p25,
      p75: row.p75,
      sampleSize: row.sampleSize,
      currency: row.currency,
      detail: row.rawResponse ?? undefined,
    }));
    const recommendation = this.prices.recommend(sources, null, { condition: item.condition });
    if (!recommendation || !(recommendation.minPrice > 0)) return null;
    return roundMoney(recommendation.minPrice);
  }

  private async requireUser(userId: string): Promise<UserEntity> {
    const user = await this.manager.findOneBy(UserEntity, { id: userId });
    if (!user) throw new NotFoundException('Konto nicht gefunden.');
    return user;
  }
}

function toSettings(user: UserEntity): MarkdownSettingsView {
  return {
    enabled: user.markdownEnabled,
    percent: clampPercent(Number(user.markdownPercent)),
    intervalDays: clampIntervalDays(user.markdownIntervalDays),
    attentionAfterDays: clampAttentionDays(user.attentionAfterDays),
  };
}

function toDomainSettings(user: UserEntity): MarkdownSettings {
  return toSettings(user);
}

function toOverride(plan: ItemMarkdownPlanEntity): MarkdownOverride {
  return {
    status: plan.status,
    percent: plan.percent,
    intervalDays: plan.intervalDays,
    floorPrice: plan.floorPrice,
    lastAppliedAt: plan.lastAppliedAt,
    lastAttemptAt: plan.lastAttemptAt,
    lastError: plan.lastError,
  };
}

function toTaskView(
  task: {
    id: string;
    projectionId: string | null;
    marketplaceId: string;
    targetPrice: number;
    previousPrice: number;
    kind: 'MANUAL_PRICE' | 'EBAY_ERROR';
    message: string;
    detail: string | null;
    copyText: string;
    createdAt?: Date;
  },
  itemId: string,
  itemTitle: string | null,
  createdAt?: Date,
): MarkdownTaskView {
  const at = createdAt ?? task.createdAt ?? new Date(0);
  return {
    id: task.id,
    itemId,
    itemTitle,
    projectionId: task.projectionId,
    marketplaceId: task.marketplaceId,
    marketplaceLabel: marketplaceLabel(task.marketplaceId),
    targetPrice: roundMoney(task.targetPrice),
    previousPrice: roundMoney(task.previousPrice),
    kind: task.kind,
    message: task.message,
    detail: task.detail,
    copyText: task.copyText,
    createdAt: at.toISOString(),
  };
}
