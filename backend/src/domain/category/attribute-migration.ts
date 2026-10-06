import {
  canonicalAttributeKey,
  canonicalCategory,
  normalizeFunctionChecked,
  resolveCategory,
} from './taxonomy';

export interface StoredAttribute {
  id: string;
  itemId: string;
  attributeKey: string;
  attributeValue: string | null;
  truthState: 'UNKNOWN' | 'INFERRED' | 'USER_CONFIRMED';
  source: string;
}

export type AttributeMigrationOp =
  | {
      op: 'update';
      id: string;
      attributeKey: string;
      attributeValue: string | null;
      truthState: StoredAttribute['truthState'];
    }
  | { op: 'delete'; id: string }
  | {
      op: 'insert';
      itemId: string;
      attributeKey: string;
      attributeValue: string | null;
      truthState: StoredAttribute['truthState'];
      source: string;
    };

const TRUTH_RANK: Record<StoredAttribute['truthState'], number> = {
  USER_CONFIRMED: 3,
  INFERRED: 2,
  UNKNOWN: 1,
};

/**
 * Bestehende Freitext-Attribute auf die kanonischen Schlüssel und die
 * Taxonomie legen. Der ursprüngliche Wortlaut bleibt in `categoryDetail`,
 * wenn er mehr sagt als das Label. Was sich keiner Kategorie zuordnen
 * lässt, wird nicht still zu Sonstiges: die Kategorie wird UNKNOWN, der
 * Text bleibt als Artikelart erhalten.
 */
export function planFreeTextAttributeMigration(rows: StoredAttribute[]): AttributeMigrationOp[] {
  const byItem = new Map<string, StoredAttribute[]>();
  for (const row of rows) {
    const list = byItem.get(row.itemId) ?? [];
    list.push(row);
    byItem.set(row.itemId, list);
  }

  const ops: AttributeMigrationOp[] = [];
  for (const [itemId, itemRows] of byItem) {
    ops.push(...planItem(itemId, itemRows));
  }
  return ops;
}

function planItem(itemId: string, rows: StoredAttribute[]): AttributeMigrationOp[] {
  const ops: AttributeMigrationOp[] = [];
  const buckets = new Map<string, StoredAttribute[]>();

  for (const row of rows) {
    const key = canonicalAttributeKey(row.attributeKey);
    if (!key) continue;
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }

  const winners = new Map<string, StoredAttribute>();
  for (const [key, list] of buckets) {
    const ranked = [...list].sort(compareRows(key));
    winners.set(key, ranked[0]);
    for (const loser of ranked.slice(1)) ops.push({ op: 'delete', id: loser.id });
  }

  const category = winners.get('category');
  const detail = winners.get('categoryDetail') ?? null;
  let detailValue = detail?.attributeValue?.trim() || null;
  let detailTruth: StoredAttribute['truthState'] = detail?.truthState ?? 'INFERRED';

  if (category) {
    const mapped = mapCategoryRow(itemId, category, detail, detailValue, ops);
    detailValue = mapped.detailValue;
    detailTruth = mapped.detailTruth;
    if (
      category.attributeKey !== 'category' ||
      category.attributeValue !== mapped.value ||
      category.truthState !== mapped.truthState
    ) {
      ops.push({
        op: 'update',
        id: category.id,
        attributeKey: 'category',
        attributeValue: mapped.value,
        truthState: mapped.truthState,
      });
    }
  }

  if (
    detail &&
    (detail.attributeKey !== 'categoryDetail' ||
      (detail.attributeValue ?? null) !== detailValue ||
      detail.truthState !== detailTruth)
  ) {
    ops.push({
      op: 'update',
      id: detail.id,
      attributeKey: 'categoryDetail',
      attributeValue: detailValue,
      truthState: detailValue ? detailTruth : 'UNKNOWN',
    });
  }

  for (const [key, winner] of winners) {
    if (key === 'category' || key === 'categoryDetail') continue;
    const next = normalizeFact(key, winner.attributeValue, winner.truthState);
    if (
      winner.attributeKey !== key ||
      winner.attributeValue !== next.value ||
      winner.truthState !== next.truthState
    ) {
      ops.push({
        op: 'update',
        id: winner.id,
        attributeKey: key,
        attributeValue: next.value,
        truthState: next.truthState,
      });
    }
  }

  return ops;
}

function compareRows(canonicalKey: string) {
  return (a: StoredAttribute, b: StoredAttribute) => {
    const byTruth = TRUTH_RANK[b.truthState] - TRUTH_RANK[a.truthState];
    if (byTruth !== 0) return byTruth;
    const aCanonical = a.attributeKey === canonicalKey ? 1 : 0;
    const bCanonical = b.attributeKey === canonicalKey ? 1 : 0;
    if (aCanonical !== bCanonical) return bCanonical - aCanonical;
    return (b.attributeValue ? 1 : 0) - (a.attributeValue ? 1 : 0);
  };
}

function mapCategoryRow(
  itemId: string,
  category: StoredAttribute,
  detail: StoredAttribute | null,
  detailValue: string | null,
  ops: AttributeMigrationOp[],
): {
  value: string | null;
  truthState: StoredAttribute['truthState'];
  detailValue: string | null;
  detailTruth: StoredAttribute['truthState'];
} {
  const original = category.attributeValue?.trim() || null;
  const exact = canonicalCategory(original);
  const resolved = exact ?? resolveCategory(original);
  let nextDetail = detailValue;
  let detailTruth: StoredAttribute['truthState'] = detail?.truthState ?? 'INFERRED';

  const keepPhrase = (phrase: string) => {
    if (nextDetail) return;
    const truthState: StoredAttribute['truthState'] =
      category.truthState === 'UNKNOWN' ? 'INFERRED' : category.truthState;
    if (!detail) {
      ops.push({
        op: 'insert',
        itemId,
        attributeKey: 'categoryDetail',
        attributeValue: phrase,
        truthState,
        source: category.source,
      });
      nextDetail = phrase;
      detailTruth = truthState;
      return;
    }
    nextDetail = phrase;
    detailTruth = detail.truthState === 'UNKNOWN' ? truthState : detail.truthState;
  };

  if (original && resolved && !exact) {
    keepPhrase(original);
    return {
      value: resolved,
      truthState: category.truthState === 'UNKNOWN' ? 'INFERRED' : category.truthState,
      detailValue: nextDetail,
      detailTruth,
    };
  }

  if (original && !resolved) {
    keepPhrase(original);
    return { value: null, truthState: 'UNKNOWN', detailValue: nextDetail, detailTruth };
  }

  return {
    value: exact,
    truthState: exact ? category.truthState : 'UNKNOWN',
    detailValue: nextDetail,
    detailTruth,
  };
}

function normalizeFact(
  key: string,
  value: string | null,
  truthState: StoredAttribute['truthState'],
): { value: string | null; truthState: StoredAttribute['truthState'] } {
  if (key === 'functionChecked') {
    const normalized = normalizeFunctionChecked(value);
    if (!value?.trim()) return { value: null, truthState: 'UNKNOWN' };
    if (!normalized) return { value: value.trim(), truthState };
    return {
      value: normalized,
      truthState: truthState === 'UNKNOWN' ? 'INFERRED' : truthState,
    };
  }

  const trimmed = value?.trim() ? value.trim() : null;
  if (!trimmed) return { value: null, truthState: 'UNKNOWN' };
  return { value: trimmed, truthState };
}
