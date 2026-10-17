import { roundMoney } from '../pricing/expected-margin';

/**
 * Nachfassen (Feature-Plan 3.6).
 *
 * Eine Anzeige, die 7 oder 14 volle Tage online ist, bekommt einen
 * Preisvorschlag. Liegt der aktuelle Preis über P_target, ist der
 * Vorschlag nach 7 Tagen P_target und nach 14 Tagen ein Schritt darunter.
 * Liegt er schon auf dem Zielpreis, ist der 14-Tage-Vorschlag ebenfalls
 * ein Schritt unter P_target. Ohne P_target, oder wenn der Preis darunter
 * liegt, ein Schritt unter dem aktuellen Preis. Der Text dazu ist nur zum
 * Kopieren. Die Frist ist abgelaufene Zeit seit `online_since`, nicht ein
 * Kalendertag.
 */

export const FOLLOW_UP_STAGES = [7, 14] as const;
export type FollowUpStage = (typeof FOLLOW_UP_STAGES)[number];

export type SuggestionBasis = 'P_TARGET' | 'ONE_STEP_BELOW';
export type SuggestionAnchor = 'P_TARGET' | 'CURRENT';

export interface PriceSuggestion {
  price: number;
  basis: SuggestionBasis;
  anchor: SuggestionAnchor;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysOnline(onlineSince: Date, now: Date): number {
  const elapsed = now.getTime() - onlineSince.getTime();
  if (elapsed < 0) return 0;
  return Math.floor(elapsed / DAY_MS);
}

/**
 * Die höhere fällige Frist gewinnt. Ein eingetragenes Senken schließt
 * diese Frist und jede kürzere.
 */
export function pendingFollowUpStage(
  days: number,
  recordedStages: number[],
): FollowUpStage | null {
  const closedThrough = recordedStages.reduce(
    (max, stage) => Math.max(max, stage),
    0,
  );
  if (days >= 14 && closedThrough < 14) return 14;
  if (days >= 7 && closedThrough < 7) return 7;
  return null;
}

/**
 * Ein Preisschritt: 1 € unter 20 €, sonst 5 €. Immer unter dem Anker,
 * auf Cent gerundet.
 */
export function oneStepBelow(anchor: number): number {
  const rounded = roundMoney(anchor);
  const step = rounded >= 20 ? 5 : 1;
  return roundMoney(rounded - step);
}

export function suggestFollowUpPrice(input: {
  currentPrice: number;
  targetPrice: number | null;
  stage: FollowUpStage;
}): PriceSuggestion | null {
  const current = roundMoney(input.currentPrice);
  if (!(current > 0)) return null;

  const target =
    input.targetPrice != null && input.targetPrice > 0
      ? roundMoney(input.targetPrice)
      : null;
  const targetBelow = target != null && target <= current - 0.01;

  if (input.stage === 7 && targetBelow && target != null) {
    return { price: target, basis: 'P_TARGET', anchor: 'P_TARGET' };
  }

  // Nach 14 Tagen einen Schritt unter P_target, solange der Preis noch
  // auf oder über dem Zielpreis liegt. Darunter zählt der aktuelle Preis.
  if (input.stage === 14 && target != null && target <= current + 0.001) {
    const stepped = priceBelowCurrent(
      oneStepBelow(Math.min(target, current)),
      current,
    );
    if (stepped != null) {
      return { price: stepped, basis: 'ONE_STEP_BELOW', anchor: 'P_TARGET' };
    }
  }

  const stepped = priceBelowCurrent(oneStepBelow(current), current);
  if (stepped == null) return null;
  return { price: stepped, basis: 'ONE_STEP_BELOW', anchor: 'CURRENT' };
}

export function priceLoweredNote(at: Date): string {
  const formatted = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).format(at);
  return `Preis am ${formatted} gesenkt`;
}

/** Neuer Anzeigentext. Nur zum Kopieren, nie zurück in die Anzeige schreiben. */
export function followUpCopyText(
  description: string,
  suggestedPrice: number,
): string {
  const line = `Preis: ${roundMoney(suggestedPrice).toFixed(2)} €.`;
  const body = description.trim();
  if (!body) return line;
  if (body.endsWith(line)) return body;
  return `${body}\n\n${line}`;
}

export function followUpHeadline(days: number, stage: FollowUpStage): string {
  return `Seit ${days} Tagen online. Nachfassen nach ${stage} Tagen.`;
}

export function suggestionLabel(
  suggestion: PriceSuggestion,
  targetPrice: number | null,
): string {
  const price = `${suggestion.price.toFixed(2)} €`;
  if (suggestion.basis === 'P_TARGET') {
    return `Vorschlag: ${price}, der Zielpreis (P_target).`;
  }
  if (suggestion.anchor === 'P_TARGET' && targetPrice != null) {
    return `Vorschlag: ${price}, ein Schritt unter dem Zielpreis ${roundMoney(targetPrice).toFixed(2)} €.`;
  }
  return `Vorschlag: ${price}, ein Schritt unter dem aktuellen Preis.`;
}

export interface BuiltFollowUp {
  daysOnline: number;
  stage: FollowUpStage;
  suggestedPrice: number;
  suggestionBasis: SuggestionBasis;
  suggestionAnchor: SuggestionAnchor;
  headline: string;
  suggestionLabel: string;
  copyText: string;
}

export function buildFollowUp(input: {
  currentPrice: number;
  descriptionText: string;
  targetPrice: number | null;
  onlineSince: Date;
  recordedStages: number[];
  now: Date;
}): BuiltFollowUp | null {
  const online = daysOnline(input.onlineSince, input.now);
  const stage = pendingFollowUpStage(online, input.recordedStages);
  if (!stage) return null;
  const suggestion = suggestFollowUpPrice({
    currentPrice: input.currentPrice,
    targetPrice: input.targetPrice,
    stage,
  });
  if (!suggestion) return null;
  return {
    daysOnline: online,
    stage,
    suggestedPrice: suggestion.price,
    suggestionBasis: suggestion.basis,
    suggestionAnchor: suggestion.anchor,
    headline: followUpHeadline(online, stage),
    suggestionLabel: suggestionLabel(suggestion, input.targetPrice),
    copyText: followUpCopyText(input.descriptionText, suggestion.price),
  };
}

function priceBelowCurrent(candidate: number, current: number): number | null {
  const price = roundMoney(candidate);
  if (price <= 0) return null;
  if (price > current - 0.01) return null;
  return price;
}
