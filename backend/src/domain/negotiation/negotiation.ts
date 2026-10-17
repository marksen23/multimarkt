import { roundMoney } from '../pricing/expected-margin';

/**
 * Verhandlung an der Schmerzgrenze (Feature-Plan 3.7).
 *
 * Die Käufernachricht kommt per Copy-Paste. Das Gebot wird daraus gelesen
 * und mit P_min und P_target dieses Artikels verglichen. Drei Antworten
 * zum Kopieren: annehmen, Gegenangebot, höflich ablehnen. Nichts wird
 * gespeichert oder gesendet, und es wird kein Portal gelesen.
 */

export const NEGOTIATION_PLATFORMS = [
  'KLEINANZEIGEN',
  'VINTED',
  'EBAY',
] as const;
export type NegotiationPlatform = (typeof NEGOTIATION_PLATFORMS)[number];

export type OfferPosition =
  'NO_OFFER' | 'BELOW_MIN' | 'AT_MIN' | 'BETWEEN' | 'AT_OR_ABOVE_TARGET';

export type NegotiationReplyId = 'accept' | 'counter' | 'decline';

export interface NegotiationReply {
  id: NegotiationReplyId;
  label: string;
  text: string;
  price: number | null;
  recommended: boolean;
}

export interface NegotiationDraft {
  targetPrice: number;
  minPrice: number;
  platform: NegotiationPlatform;
  offer: number | null;
  position: OfferPosition;
  assessment: string;
  replies: NegotiationReply[];
}

const AMOUNT = String.raw`\d{1,3}(?:[.\s]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?`;
const VERB = String.raw`biet(?:e|en|est|et)?|gebot(?:en)?|zahl(?:e|en|t)?|für|fuer|nehme(?:n)?|letzt(?:er|en|e)?\s+preis`;

interface AmountHit {
  value: number;
  index: number;
  raw: string;
}

export function formatEuro(value: number): string {
  const rounded = roundMoney(value);
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  const cents = Math.round(abs * 100) % 100;
  const euros = Math.floor(abs + 1e-9);
  const grouped = euros.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const body =
    cents === 0 ? grouped : `${grouped},${String(cents).padStart(2, '0')}`;
  return `${sign}${body} €`;
}

export function parseGermanAmount(raw: string): number | null {
  const compact = raw.replace(/[\s\u00a0]/g, '');
  let normalized: string | null = null;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(compact)) {
    normalized = compact.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(compact)) {
    normalized = compact.replace(/,/g, '');
  } else if (/^\d{1,7},\d{1,2}$/.test(compact)) {
    normalized = compact.replace(',', '.');
  } else if (/^\d{1,7}\.\d{1,2}$/.test(compact)) {
    normalized = compact;
  } else if (/^\d{1,7}$/.test(compact)) {
    normalized = compact;
  }
  if (normalized == null) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000) return null;
  return roundMoney(value);
}

/** Liest ein Gebot. Ohne Betrag wird keiner erfunden. */
export function parseOffer(message: string): number | null {
  const text = message.trim();
  if (!text) return null;

  const priced = currencyHits(text);
  const pricedPick = pickHit(text, priced);
  if (pricedPick) return pricedPick.value;

  const verbal = pickHit(text, keywordHits(text));
  if (verbal) return verbal.value;

  // Ein reiner Versandpreis ist kein Gebot. Nicht auf die Betrag-Suche zurückfallen.
  if (priced.length > 0) return null;
  return soleAmount(text);
}

export function offerPosition(
  offer: number | null,
  minPrice: number,
  targetPrice: number,
): OfferPosition {
  if (offer == null) return 'NO_OFFER';
  const bid = roundMoney(offer);
  const floor = roundMoney(minPrice);
  const target = roundMoney(targetPrice);
  if (bid + 0.001 < floor) return 'BELOW_MIN';
  if (Math.abs(bid - floor) <= 0.001 && bid + 0.001 < target) return 'AT_MIN';
  if (bid + 0.001 >= target && bid + 0.001 >= floor)
    return 'AT_OR_ABOVE_TARGET';
  return 'BETWEEN';
}

/**
 * Gegenangebot liegt nie unter der Schmerzgrenze und nie über dem
 * höheren von Zielpreis und Schmerzgrenze. Liegt das Gebot schon darüber,
 * gibt es keinen höheren Vorschlag.
 */
export function counterPrice(
  offer: number,
  minPrice: number,
  targetPrice: number,
): number {
  const bid = roundMoney(offer);
  const floor = roundMoney(minPrice);
  const target = roundMoney(targetPrice);
  const ceiling = roundMoney(Math.max(floor, target));
  if (bid >= ceiling - 0.001) return ceiling;

  const midpoint = roundMoney((bid + ceiling) / 2);
  let counter = Math.min(ceiling, Math.max(floor, midpoint));
  if (counter <= bid + 0.001) {
    counter = Math.min(ceiling, roundMoney(Math.max(floor, bid + 1)));
  }
  const whole = roundMoney(Math.round(counter));
  if (
    whole + 0.001 >= floor &&
    whole <= ceiling + 0.001 &&
    whole > bid + 0.001
  ) {
    return whole;
  }
  return roundMoney(counter);
}

export function suggestNegotiation(input: {
  message: string;
  minPrice: number;
  targetPrice: number;
  platform: NegotiationPlatform;
}): NegotiationDraft {
  const minPrice = roundMoney(input.minPrice);
  const targetPrice = roundMoney(input.targetPrice);
  const offer = parseOffer(input.message);
  const position = offerPosition(offer, minPrice, targetPrice);
  const counter =
    offer == null ? minPrice : counterPrice(offer, minPrice, targetPrice);
  const recommended = recommendedReply(position, offer, targetPrice);
  const hint = fulfillmentHint(input.message);

  return {
    targetPrice,
    minPrice,
    platform: input.platform,
    offer,
    position,
    assessment: buildAssessment(position, offer, minPrice, targetPrice),
    replies: [
      acceptReply(offer, targetPrice, hint, recommended === 'accept'),
      counterReply(
        offer,
        counter,
        minPrice,
        targetPrice,
        hint,
        recommended === 'counter',
      ),
      declineReply(offer, position, recommended === 'decline'),
    ],
  };
}

function recommendedReply(
  position: OfferPosition,
  offer: number | null,
  targetPrice: number,
): NegotiationReplyId | null {
  if (position === 'NO_OFFER' || offer == null) return null;
  if (position === 'BELOW_MIN') return 'decline';
  if (position === 'AT_OR_ABOVE_TARGET') return 'accept';
  if (targetPrice - offer < 1) return 'accept';
  return 'counter';
}

function buildAssessment(
  position: OfferPosition,
  offer: number | null,
  minPrice: number,
  targetPrice: number,
): string {
  const floor = formatEuro(minPrice);
  const target = formatEuro(targetPrice);
  if (offer == null) {
    return `In der Nachricht steht kein Betrag. Zielpreis ${target}, Schmerzgrenze ${floor}. Es wird kein Gebot erfunden.`;
  }
  const bid = formatEuro(offer);
  if (position === 'BELOW_MIN') {
    return `Das Gebot ${bid} liegt ${formatEuro(minPrice - offer)} unter der Schmerzgrenze ${floor}. Zielpreis ${target}.`;
  }
  if (position === 'AT_MIN') {
    return `Das Gebot ${bid} liegt auf der Schmerzgrenze ${floor}. Zielpreis ${target}.`;
  }
  if (position === 'AT_OR_ABOVE_TARGET') {
    return `Das Gebot ${bid} liegt auf oder über dem Zielpreis ${target}. Schmerzgrenze ${floor}.`;
  }
  return `Das Gebot ${bid} liegt zwischen Schmerzgrenze ${floor} und Zielpreis ${target}.`;
}

function acceptReply(
  offer: number | null,
  targetPrice: number,
  hint: string | null,
  recommended: boolean,
): NegotiationReply {
  if (offer == null) {
    return {
      id: 'accept',
      label: `Zielpreis zusagen: ${formatEuro(targetPrice)}`,
      text: joinSentences(
        'Hallo, danke für deine Nachricht.',
        `Zu ${formatEuro(targetPrice)} können wir das machen.`,
        hint,
        'Wann passt es dir?',
      ),
      price: targetPrice,
      recommended,
    };
  }
  return {
    id: 'accept',
    label: `Annehmen: ${formatEuro(offer)}`,
    text: joinSentences(
      'Hallo, danke für dein Angebot.',
      `${formatEuro(offer)} passt.`,
      hint,
      'Wann passt es dir?',
    ),
    price: offer,
    recommended,
  };
}

function counterReply(
  offer: number | null,
  counter: number,
  minPrice: number,
  targetPrice: number,
  hint: string | null,
  recommended: boolean,
): NegotiationReply {
  if (offer == null) {
    const same = Math.abs(minPrice - targetPrice) <= 0.001;
    return {
      id: 'counter',
      label: same
        ? `Preis nennen: ${formatEuro(targetPrice)}`
        : `Gegenangebot: ${formatEuro(minPrice)}`,
      text: same
        ? joinSentences(
            'Hallo, danke für deine Nachricht.',
            `Mein Preis ist ${formatEuro(targetPrice)}.`,
            'Was möchtest du zahlen?',
          )
        : joinSentences(
            'Hallo, danke für deine Nachricht.',
            `Ich kann bis ${formatEuro(minPrice)} gehen.`,
            'Welchen Preis stellst du dir vor?',
          ),
      price: same ? targetPrice : minPrice,
      recommended,
    };
  }

  if (counter <= offer + 0.001) {
    return {
      id: 'counter',
      label: 'Gegenangebot unnötig',
      text: joinSentences(
        'Hallo, danke für dein Angebot.',
        `Ich bleibe bei ${formatEuro(offer)} und gehe nicht noch einmal runter.`,
        hint,
        'Wann passt es dir?',
      ),
      price: offer,
      recommended,
    };
  }

  const belowFloor = offer + 0.001 < minPrice;
  return {
    id: 'counter',
    label: `Gegenangebot: ${formatEuro(counter)}`,
    text: belowFloor
      ? joinSentences(
          'Hallo, danke für dein Angebot.',
          `${formatEuro(offer)} ist mir zu wenig.`,
          `Für ${formatEuro(counter)} können wir uns einigen.`,
          hint,
          'Wie sieht es aus?',
        )
      : joinSentences(
          'Hallo, danke für dein Angebot.',
          `Bei ${formatEuro(counter)} können wir uns einigen.`,
          hint,
          'Wie sieht es aus?',
        ),
    price: counter,
    recommended,
  };
}

function declineReply(
  offer: number | null,
  position: OfferPosition,
  recommended: boolean,
): NegotiationReply {
  const tooLow = offer != null && position === 'BELOW_MIN';
  return {
    id: 'decline',
    label: 'Höflich ablehnen',
    text: tooLow
      ? joinSentences(
          'Hallo, danke für dein Angebot.',
          `${formatEuro(offer)} ist mir leider zu wenig.`,
          'Viel Erfolg bei der weiteren Suche!',
        )
      : joinSentences(
          'Hallo, danke für deine Nachricht.',
          'Ich verkaufe den Artikel doch nicht.',
          'Viel Erfolg bei der weiteren Suche!',
        ),
    price: null,
    recommended,
  };
}

function fulfillmentHint(message: string): string | null {
  const pickup = /abhol/i.test(message);
  const shipping = /versand|versenden|zuschicken/i.test(message);
  if (pickup && !shipping) return 'Abholung passt.';
  if (shipping && !pickup) return 'Versand können wir klären.';
  return null;
}

function joinSentences(...parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function currencyHits(message: string): AmountHit[] {
  const pattern = new RegExp(
    String.raw`(?:€|eur(?:o)?)\s*(${AMOUNT})|(${AMOUNT})\s*(?:€|eur(?:o)?)`,
    'gi',
  );
  return collect(message, pattern);
}

function keywordHits(message: string): AmountHit[] {
  const after = new RegExp(
    String.raw`(?:${VERB})\s*(?:ist|sind|wäre|waere|bei|auf|von|:|[?.!,])*\s*(${AMOUNT})`,
    'gi',
  );
  const before = new RegExp(
    String.raw`(${AMOUNT})\s*(?:€|eur(?:o)?)?\s*(?:${VERB})`,
    'gi',
  );
  return [...collect(message, after), ...collect(message, before)];
}

function soleAmount(message: string): number | null {
  const pattern = new RegExp(`(${AMOUNT})`, 'gi');
  const hits = collect(message, pattern).filter(
    (hit) => !implausibleWithoutCurrency(hit),
  );
  return hits.length === 1 ? hits[0].value : null;
}

function collect(message: string, pattern: RegExp): AmountHit[] {
  const hits: AmountHit[] = [];
  for (const match of message.matchAll(pattern)) {
    const raw = match[1] ?? match[2];
    if (!raw || match.index == null) continue;
    const value = parseGermanAmount(raw);
    if (value == null) continue;
    const index = match.index + match[0].indexOf(raw);
    if (rejectedContext(message, index, raw)) continue;
    hits.push({ value, index, raw });
  }
  return hits;
}

function pickHit(message: string, hits: AmountHit[]): AmountHit | null {
  if (hits.length === 0) return null;
  const unique = dedupe(hits);
  const ranked = unique
    .map((hit) => ({
      hit,
      score: scoreHit(message, hit),
      distance: verbDistance(message, hit),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.distance - b.distance ||
        a.hit.index - b.hit.index,
    );
  if (ranked[0].score <= 0) return null;
  return ranked[0].hit;
}

function dedupe(hits: AmountHit[]): AmountHit[] {
  const seen = new Set<string>();
  const unique: AmountHit[] = [];
  for (const hit of hits) {
    const key = `${hit.index}:${hit.raw}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(hit);
  }
  return unique;
}

function scoreHit(message: string, hit: AmountHit): number {
  const from = Math.max(0, hit.index - 40);
  const to = Math.min(message.length, hit.index + hit.raw.length + 40);
  const window = message.slice(from, to);
  let score = 1;
  if (/biet|gebot|zahl|preis|für|fuer|nehme|lass|letzte/i.test(window))
    score += 5;
  if (/\bversand\b|porto|provision|gebühr|gebuehr/i.test(window)) score -= 4;
  return score;
}

function verbDistance(message: string, hit: AmountHit): number {
  const verbs = new RegExp(VERB, 'gi');
  let best = 10_000;
  for (const match of message.matchAll(verbs)) {
    const index = match.index ?? 0;
    best = Math.min(best, Math.abs(index - hit.index));
  }
  return best;
}

function rejectedContext(
  message: string,
  numberIndex: number,
  raw: string,
): boolean {
  const after = message.slice(numberIndex + raw.length);
  if (/^\s*(?:%|gb|tb|mb|kg|cm|mm|zoll|stück|stk\.?|uhr|mal)\b/i.test(after))
    return true;
  if (/^\s*x\b/i.test(after)) return true;
  if (/^\s*:\d{2}/.test(after)) return true;
  const before = message.slice(Math.max(0, numberIndex - 16), numberIndex);
  return /(?:plz|postleitzahl|größe|groesse|size|tel\.?|telefon)\s*$/i.test(
    before,
  );
}

function implausibleWithoutCurrency(hit: AmountHit): boolean {
  if (/^\d{5}$/.test(hit.raw)) return true;
  return /^(?:19|20)\d{2}$/.test(hit.raw);
}
