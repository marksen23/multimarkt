import { Injectable } from '@nestjs/common';
import { ComparableListingRef } from '../../domain/ai/description-generation-provider.interface';

// Kurze, häufige deutsche Füllwörter, die für eine Titel-Lückenanalyse
// keine Aussagekraft haben. Bewusst kurz gehalten statt einer vollen
// Stopwortliste — hier geht es nur darum, die offensichtlichsten
// Nicht-Suchbegriffe rauszufiltern, nicht um linguistische Vollständigkeit.
const STOPWORDS = new Set([
  'der',
  'die',
  'das',
  'und',
  'mit',
  'für',
  'von',
  'ein',
  'eine',
  'sehr',
  'top',
  'neu',
  'gut',
  'guter',
  'gute',
]);

export interface TitleGapAnalysis {
  ownTokens: string[];
  /** Tokens, die in Vergleichstiteln häufig vorkommen, im eigenen Titel aber fehlen. */
  missingTokens: string[];
}

/**
 * Deterministische Titel-Lückenanalyse (Methodik-Anfrage September 2026,
 * Abschnitt 2.3): welche Suchbegriffe nutzen Vergleichsangebote, die im
 * eigenen Titel fehlen? Reine Textstatistik über bereits vorhandene, echte
 * Vergleichstitel (aus der Gemini-Grounding-Preisrecherche) — keine KI,
 * keine Erfindung, kein Konkurrenz-Bildscoring (dafür gibt es keine
 * zugängliche Datenquelle, siehe RealImageOptimizationProvider-Kommentar).
 */
@Injectable()
export class TitleTokenAnalysisService {
  analyze(ownTitle: string | null, comparableListings: ComparableListingRef[]): TitleGapAnalysis {
    const ownTokens = this.tokenize(ownTitle ?? '');
    const ownTokenSet = new Set(ownTokens);

    const frequency = new Map<string, number>();
    for (const listing of comparableListings) {
      const seenInThisListing = new Set(this.tokenize(listing.title));
      for (const token of seenInThisListing) {
        frequency.set(token, (frequency.get(token) ?? 0) + 1);
      }
    }

    const minOccurrences = Math.max(2, Math.ceil(comparableListings.length * 0.3));
    const missingTokens = [...frequency.entries()]
      .filter(([token, count]) => count >= minOccurrences && !ownTokenSet.has(token))
      .sort((a, b) => b[1] - a[1])
      .map(([token]) => token);

    return { ownTokens, missingTokens };
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[|,.!?()"'"]/g, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
  }
}
