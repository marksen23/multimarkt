import { canonicalCategory, fold, ResaleCategory } from '../category/taxonomy';
import { EbayConditionMapping, mapConditionToEbay } from './ebay-condition';

export interface KleinanzeigenCategorySuggestion {
  path: string;
  note: string;
}

export interface ListingCopyFacts {
  category: string | null;
  categoryDetail: string | null;
  condition: string | null;
  ebayCondition: EbayConditionMapping | null;
  kleinanzeigenCategory: KleinanzeigenCategorySuggestion;
}

const NOTE =
  'Vorschlag zum Auswählen im Formular. Die Anzeige wird nicht automatisch eingestellt.';

function textOf(categoryDetail: string | null, title: string | null): string {
  return fold(`${categoryDetail ?? ''} ${title ?? ''}`);
}

function has(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(fold(word)));
}

function pathFor(category: ResaleCategory | null, detail: string): string {
  if (category === 'Schuhe' || has(detail, ['schuh', 'sneaker', 'stiefel', 'sandale'])) {
    return 'Mode & Beauty > Schuhe';
  }
  if (category === 'Kleidung' || has(detail, ['jacke', 'hose', 'kleid', 'hemd', 'pullover', 'shirt'])) {
    return 'Mode & Beauty > Kleidung';
  }
  if (category === 'Elektronik' || has(detail, ['elektronik', 'laptop', 'handy'])) {
    if (has(detail, ['handy', 'smartphone', 'iphone'])) return 'Elektronik > Handy & Telefon';
    if (has(detail, ['laptop', 'notebook', 'computer', 'pc'])) return 'Elektronik > PC-Zubehör & Software';
    if (has(detail, ['kamera', 'objektiv'])) return 'Elektronik > Foto';
    if (has(detail, ['kopfhoerer', 'lautsprecher'])) return 'Elektronik > Audio & Hifi';
    return 'Elektronik';
  }
  if (category === 'Medien' || has(detail, ['buch', 'dvd', 'vinyl', 'cd'])) {
    if (has(detail, ['buch', 'roman', 'zeitschrift'])) return 'Musik, Filme & Bücher > Bücher & Zeitschriften';
    if (has(detail, ['dvd', 'bluray', 'blu-ray', 'film'])) return 'Musik, Filme & Bücher > Film & DVD';
    if (has(detail, ['cd', 'vinyl', 'schallplatte'])) return 'Musik, Filme & Bücher > Musik & CDs';
    return 'Musik, Filme & Bücher';
  }
  if (category === 'Möbel' || has(detail, ['sofa', 'schrank', 'tisch', 'regal', 'bett'])) {
    return 'Haus & Garten > Möbel & Wohnen';
  }
  if (category === 'Haushalt' || has(detail, ['lampe', 'geschirr', 'topf'])) {
    return 'Haus & Garten > Haushaltsgeräte';
  }
  return 'Sonstiges';
}

export function suggestKleinanzeigenCategory(input: {
  category: string | null;
  categoryDetail: string | null;
  title: string | null;
}): KleinanzeigenCategorySuggestion {
  const category = canonicalCategory(input.category);
  const detail = textOf(input.categoryDetail, input.title);
  const path = pathFor(category, detail);
  if (!category && path === 'Sonstiges') {
    return {
      path,
      note: 'Keine Kategorie erkannt. Im Kleinanzeigen-Formular selbst wählen. Die Anzeige wird nicht automatisch eingestellt.',
    };
  }
  return { path, note: NOTE };
}

export function buildListingCopyFacts(input: {
  category: string | null;
  categoryDetail: string | null;
  title: string | null;
  condition: string | null;
}): ListingCopyFacts {
  const category = canonicalCategory(input.category);
  return {
    category,
    categoryDetail: input.categoryDetail?.trim() || null,
    condition: input.condition?.trim() || null,
    ebayCondition: mapConditionToEbay(input.condition),
    kleinanzeigenCategory: suggestKleinanzeigenCategory(input),
  };
}
