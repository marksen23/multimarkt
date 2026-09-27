import { Injectable } from '@nestjs/common';

export interface VaguePhraseMatch {
  phrase: string;
  suggestion: string;
}

/**
 * Deterministischer Unschärfe-Hinweis (Methodik-Anfrage September 2026,
 * Abschnitt 2.3 Punkt 4: "Wo ist die Konkurrenz unscharf ('guter
 * Zustand'), sodass eine konkrete Formulierung sticht?"). Angewendet auf
 * den EIGENEN generierten/bearbeiteten Text, nicht auf Konkurrenztexte —
 * für Konkurrenztexte gäbe es keine Möglichkeit, das ehrlich zu prüfen,
 * ohne Behauptungen über fremde Angebote zu erfinden. Reiner Mustertreffer
 * auf bekannte Floskeln, keine KI, keine Bewertung des Wahrheitsgehalts.
 */
const VAGUE_PHRASES: { pattern: RegExp; phrase: string; suggestion: string }[] = [
  {
    pattern: /\b(sehr\s+)?gut(e[nmrs]?)?\s+zustand\b/i,
    phrase: 'guter Zustand',
    suggestion: 'Was genau ist gut? z.B. "keine Kratzer, Akku 90%, einmal getragen".',
  },
  {
    pattern: /\bwie\s+neu\b/i,
    phrase: 'wie neu',
    suggestion: 'Konkreter machen: seit wann ungenutzt, noch Rechnung/OVP vorhanden?',
  },
  {
    pattern: /\btop\s*zustand\b/i,
    phrase: 'Topzustand',
    suggestion: 'Konkrete Merkmale nennen statt einer reinen Werbefloskel.',
  },
  {
    pattern: /\bkeine\s+mängel\b/i,
    phrase: 'keine Mängel',
    suggestion: 'Lieber explizit "genau geprüft: kein Kratzer, keine Flecken" statt einer pauschalen Verneinung.',
  },
  {
    pattern: /\bleichte\s+gebrauchsspuren\b/i,
    phrase: 'leichte Gebrauchsspuren',
    suggestion: 'Beschreiben, welche genau (z.B. "kleiner Kratzer am Rand, siehe Foto").',
  },
  {
    pattern: /\bvoll\s+funktionsfähig\b/i,
    phrase: 'voll funktionsfähig',
    suggestion: 'Konkreter: welche Funktion wurde getestet?',
  },
];

@Injectable()
export class VaguePhraseDetectorService {
  detect(text: string): VaguePhraseMatch[] {
    return VAGUE_PHRASES.filter(({ pattern }) => pattern.test(text)).map(({ phrase, suggestion }) => ({
      phrase,
      suggestion,
    }));
  }
}
