import { Injectable } from '@nestjs/common';
import { ItemAttributeEntity } from '../../infrastructure/database/entities';

export type DescriptionQualityIssueType =
  | 'CONDITION_LANGUAGE_MISMATCH'
  | 'MISSING_ATTRIBUTES'
  | 'TOO_SHORT'
  | 'EXTERNAL_CONTACT'
  | 'DEFECT_NOT_MENTIONED';

export type IssueSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface DescriptionQualityIssue {
  type: DescriptionQualityIssueType;
  severity: IssueSeverity;
  message: string;
}

export interface AttributeCoverage {
  key: string;
  value: string;
  mentioned: boolean;
}

export interface DescriptionQualityResult {
  /** 0–100: Gesamtqualität der Beschreibung. */
  score: number;
  issues: DescriptionQualityIssue[];
  /** Welche bestätigten Attribute sind in der Beschreibung erwähnt? */
  attributeCoverage: AttributeCoverage[];
}

// Sprache die "neuwertig" oder besser impliziert — darf nur bei new/like_new stehen
const PREMIUM_CONDITION_PATTERNS = [
  /\bneuwertig\b/i,
  /\bwie\s+neu\b/i,
  /\bunbenutzt\b/i,
  /\bungetragen\b/i,
  /\beinwandfrei\b/i,
  /\bnoch\s+versiegelt\b/i,
  /\bungeöffnet\b/i,
  /\bnever\s+used\b/i,
];

// Zustände wo Hochwertigkeits-Sprache rechtlich riskant ist
const NON_PREMIUM_CONDITIONS = new Set(['good', 'fair', 'defective']);

// Kontaktdaten (auf Kleinanzeigen in der Beschreibung verboten)
const CONTACT_PATTERNS = [
  /\+\d[\d\s\-\/]{6,}/,                       // Telefonnummern mit +
  /\b0\d{3,4}[\s\/\-]\d{3,}\b/,               // DE-Rufnummern ohne +
  /\bwhatsapp\b/i,
  /\btelegram\b/i,
  /\bsignal\b/i,
  /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i, // E-Mail
];

// Attribute die inhaltlich sinnvoll im Text erwähnt werden können
const MENTIONABLE_KEYS = new Set(['brand', 'color', 'material', 'size', 'category']);

/**
 * Deterministischer Qualitäts-Evaluator für Beschreibungstexte (Oktober 2026).
 * Prüft: Vollständigkeit (Attributabdeckung), Konditions-Sprachkonsistenz,
 * rechtliche Risiken (Kontaktdaten) und Mindestlänge. Keine KI, reiner
 * Regelabgleich — damit deterministisch, schnell und ohne externe Abhängigkeit.
 */
@Injectable()
export class DescriptionQualityService {
  evaluate(
    descriptionText: string,
    condition: string | null,
    attributes: ItemAttributeEntity[],
  ): DescriptionQualityResult {
    let score = 100;
    const issues: DescriptionQualityIssue[] = [];

    const lowerDesc = descriptionText.toLowerCase();
    const trimmedLength = descriptionText.trim().length;

    // 1. Mindestlänge
    if (trimmedLength < 80) {
      score -= 15;
      issues.push({
        type: 'TOO_SHORT',
        severity: 'WARNING',
        message: `Beschreibung ist sehr kurz (${trimmedLength} Zeichen). Mindestens 2–3 informative Sätze werden empfohlen.`,
      });
    }

    // 2. Konditions-Sprach-Mismatch: "neuwertig"/"wie neu" bei schlechtem Zustand
    const hasPremiumLanguage = PREMIUM_CONDITION_PATTERNS.some((p) => p.test(descriptionText));
    if (hasPremiumLanguage && condition && NON_PREMIUM_CONDITIONS.has(condition)) {
      score -= 25;
      issues.push({
        type: 'CONDITION_LANGUAGE_MISMATCH',
        severity: 'ERROR',
        message: `Beschreibung enthält Hochwertigkeits-Sprache ("neuwertig", "wie neu" o.ä.), aber der Zustand ist "${condition}". Das kann zu Käufer-Beschwerden und rechtlichen Problemen führen.`,
      });
    }

    // 3. Sichtbare Mängel aus Foto-Analyse nicht erwähnt
    const defectAttr = attributes.find((a) => a.attributeKey === 'visible_defects' && a.attributeValue);
    if (defectAttr) {
      const defectWords = (defectAttr.attributeValue ?? '')
        .toLowerCase()
        .split(/[\s,]+/)
        .filter((w) => w.length > 3);
      const defectMentioned = defectWords.some((w) => lowerDesc.includes(w));
      if (!defectMentioned && condition !== 'new' && condition !== 'like_new') {
        score -= 10;
        issues.push({
          type: 'DEFECT_NOT_MENTIONED',
          severity: 'WARNING',
          message: `Auf den Fotos wurden Mängel erkannt ("${defectAttr.attributeValue}"), die in der Beschreibung nicht erwähnt werden. Transparenz schützt vor Rückabwicklungen.`,
        });
      }
    }

    // 4. Kontaktdaten in der Beschreibung
    const hasContact = CONTACT_PATTERNS.some((p) => p.test(descriptionText));
    if (hasContact) {
      score -= 15;
      issues.push({
        type: 'EXTERNAL_CONTACT',
        severity: 'WARNING',
        message:
          'Beschreibung enthält möglicherweise Kontaktdaten (Telefon/E-Mail/Messenger). Kleinanzeigen lehnt solche Anzeigen oft ab — Kontaktdaten nur ins Profilfeld.',
      });
    }

    // 5. Attributabdeckung: welche bestätigten Werte erscheinen im Text?
    const mentionableAttributes = attributes.filter(
      (a) => a.attributeValue && MENTIONABLE_KEYS.has(a.attributeKey),
    );

    const attributeCoverage: AttributeCoverage[] = mentionableAttributes.map((a) => {
      const value = (a.attributeValue ?? '').toLowerCase().trim();
      // Kurze Werte (<= 2 Zeichen wie "M", "L") direkt als Wortgrenze prüfen
      const mentioned =
        value.length > 0 &&
        (value.length <= 2
          ? new RegExp(`\\b${value}\\b`, 'i').test(descriptionText)
          : lowerDesc.includes(value));
      return { key: a.attributeKey, value: a.attributeValue!, mentioned };
    });

    const missingAttributes = attributeCoverage.filter((a) => !a.mentioned);
    if (missingAttributes.length > 0) {
      const deduction = Math.min(20, missingAttributes.length * 5);
      score -= deduction;
      const missingList = missingAttributes.map((a) => `${a.key} (${a.value})`).join(', ');
      issues.push({
        type: 'MISSING_ATTRIBUTES',
        severity: 'INFO',
        message: `${missingAttributes.length} bestätigte Attribute fehlen in der Beschreibung: ${missingList}. Käufer schätzen vollständige Informationen.`,
      });
    }

    return {
      score: Math.max(0, score),
      issues,
      attributeCoverage,
    };
  }
}
