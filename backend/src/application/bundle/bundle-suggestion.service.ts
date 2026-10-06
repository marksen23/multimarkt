import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { ActorContext } from '../../domain/actor-context';
import {
  BundleSuggestionCandidate,
  BundleSuggestionResult,
  MarketPriceSample,
  pickMarketSalePrice,
  suggestBundles,
} from '../../domain/bundle/bundle-suggestions';
import {
  shippingCostEur,
  toLogisticsProfile,
} from '../../domain/logistics/logistics-profile';
import { roundMoney } from '../../domain/pricing/expected-margin';
import {
  BundleEntity,
  BundleSuggestionDismissalEntity,
  ItemAttributeEntity,
  ItemEntity,
  ItemPriceResearchEntity,
  UserEntity,
} from '../../infrastructure/database/entities';
import { BundleAssignmentService } from './bundle-assignment.service';

/**
 * Liest den bereiten Bestand und legt ein angenommenes Paket über die
 * bestehende Bundle-Zuordnung an. Verworfene Vorschläge bleiben verworfen,
 * solange dieselben Artikel denselben Treffer bilden.
 */
@Injectable()
export class BundleSuggestionService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly assignment: BundleAssignmentService,
  ) {}

  async list(userId: string): Promise<BundleSuggestionResult> {
    const user = await this.dataSource.manager.findOneBy(UserEntity, {
      id: userId,
    });
    const threshold = user?.singleSaleThresholdEur ?? null;
    if (!user || threshold == null) {
      return { thresholdEur: null, suggestions: [] };
    }

    const items = await this.dataSource.manager.find(ItemEntity, {
      where: { userId, status: 'READY' },
    });
    if (items.length < 2) {
      return { thresholdEur: threshold, suggestions: [] };
    }

    const ids = items.map((item) => item.id);
    const [attributes, research, dismissals] = await Promise.all([
      this.dataSource.manager.find(ItemAttributeEntity, {
        where: { itemId: In(ids) },
      }),
      this.dataSource.manager.find(ItemPriceResearchEntity, {
        where: { itemId: In(ids) },
      }),
      this.dataSource.manager.find(BundleSuggestionDismissalEntity, {
        where: { userId },
      }),
    ]);

    return suggestBundles({
      items: toCandidates(items, attributes, research, user.shippingEur),
      feePercent: user.feePercent,
      singleSaleThresholdEur: threshold,
      dismissedFingerprints: dismissals.map((row) => row.fingerprint),
    });
  }

  async accept(
    userId: string,
    fingerprint: string,
    actor: ActorContext,
  ): Promise<BundleEntity> {
    const suggestion = (await this.list(userId)).suggestions.find(
      (entry) => entry.fingerprint === fingerprint,
    );
    if (!suggestion) {
      throw new NotFoundException(`Bundle suggestion ${fingerprint} not found`);
    }
    return this.assignment.createBundleWithItems(
      userId,
      suggestion.title,
      suggestion.itemIds,
      actor,
      suggestion.description,
    );
  }

  async dismiss(
    userId: string,
    fingerprint: string,
  ): Promise<{ dismissed: true }> {
    const suggestion = (await this.list(userId)).suggestions.find(
      (entry) => entry.fingerprint === fingerprint,
    );
    if (!suggestion) {
      throw new NotFoundException(`Bundle suggestion ${fingerprint} not found`);
    }
    await this.dataSource.manager
      .createQueryBuilder()
      .insert()
      .into(BundleSuggestionDismissalEntity)
      .values({ userId, fingerprint })
      .orIgnore()
      .execute();
    return { dismissed: true };
  }
}

function toCandidates(
  items: ItemEntity[],
  attributes: ItemAttributeEntity[],
  research: ItemPriceResearchEntity[],
  userShippingEur: number,
): BundleSuggestionCandidate[] {
  const attributesByItem = new Map<
    string,
    BundleSuggestionCandidate['attributes']
  >();
  for (const attribute of attributes) {
    const list = attributesByItem.get(attribute.itemId) ?? [];
    list.push({ key: attribute.attributeKey, value: attribute.attributeValue });
    attributesByItem.set(attribute.itemId, list);
  }

  const samplesByItem = new Map<string, MarketPriceSample[]>();
  for (const row of research) {
    const list = samplesByItem.get(row.itemId) ?? [];
    list.push({
      source: row.source,
      median: row.median,
      sampleSize: row.sampleSize,
      fetchedAtMs: row.fetchedAt.getTime(),
    });
    samplesByItem.set(row.itemId, list);
  }

  return items.flatMap((item) => {
    const salePriceEur = pickMarketSalePrice(samplesByItem.get(item.id) ?? []);
    if (salePriceEur == null) return [];
    return [
      {
        id: item.id,
        title: item.title,
        salePriceEur,
        purchasePriceEur: item.purchasePriceEur,
        singleShippingEur: item.logisticsCaptured
          ? shippingCostEur(toLogisticsProfile(item))
          : roundMoney(userShippingEur),
        attributes: attributesByItem.get(item.id) ?? [],
      },
    ];
  });
}
