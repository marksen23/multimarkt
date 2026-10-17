import {
  LogisticsProfile,
  shippingPortalsAllowed,
} from './logistics-profile';

/**
 * Textvorlage Abholung versus Versand (Feature-Plan 3.5).
 * Ein kleines Paket enthält keinen Nur-Abholung-Text. Ein Sofa
 * (kein Versand) enthält keinen Versandtext.
 */

const PICKUP_SENTENCE = /abholung|abholbar|selbstabhol/i;
const SHIPPING_SENTENCE = /versand/i;

export function formatWeight(grams: number | null): string | null {
  if (grams == null) return null;
  if (grams >= 1000) {
    const kg = Math.round((grams / 1000) * 10) / 10;
    const text = Number.isInteger(kg) ? String(kg) : kg.toFixed(1);
    return `${text} kg`;
  }
  return `${Math.round(grams)} g`;
}

export function formatDimensions(profile: LogisticsProfile): string | null {
  const { lengthCm, widthCm, heightCm } = profile;
  if (lengthCm == null || widthCm == null || heightCm == null) return null;
  return `${formatCm(lengthCm)} × ${formatCm(widthCm)} × ${formatCm(heightCm)} cm`;
}

export function fulfillmentClause(profile: LogisticsProfile): string {
  if (shippingPortalsAllowed(profile)) return 'Versand möglich.';
  const postalCode = profile.postalCode?.trim();
  return postalCode ? `Nur Abholung in ${postalCode}. Kein Versand.` : 'Nur Abholung. Kein Versand.';
}

export function applyLogisticsListingText(input: {
  body: string;
  title: string | null;
  condition: string | null;
  profile: LogisticsProfile;
}): string {
  if (!input.profile.captured) return input.body;

  const mode = shippingPortalsAllowed(input.profile) ? 'shipping' : 'pickup';
  let cleaned = stripFulfillmentSentences(input.body, mode);
  if (!cleaned) {
    const title = input.title?.trim() || 'Artikel';
    const condition = input.condition?.trim() || 'unbekannt';
    cleaned = `${title}. Zustand: ${condition}.`;
  }

  const facts = [formatWeight(input.profile.weightGrams), formatDimensions(input.profile)]
    .filter((part): part is string => part != null)
    .join(', ');
  const block = [fulfillmentClause(input.profile), facts ? `${facts}.` : '']
    .filter((part) => part.length > 0)
    .join(' ');
  return `${cleaned}\n\n${block}`;
}

function stripFulfillmentSentences(body: string, mode: 'shipping' | 'pickup'): string {
  const banned = mode === 'shipping' ? PICKUP_SENTENCE : SHIPPING_SENTENCE;
  return body
    .split(/\n+/)
    .map((paragraph) =>
      paragraph
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => sentence.trim().length > 0 && !banned.test(sentence))
        .join(' '),
    )
    .filter((paragraph) => paragraph.trim().length > 0)
    .join('\n\n')
    .trim();
}

function formatCm(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
