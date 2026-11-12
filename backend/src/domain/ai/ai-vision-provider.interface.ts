/**
 * Provider-Abstraktion für KI-Bildanalyse (Doc 01 §16: "KI-Anbieter bleiben
 * austauschbar, z.B. Gemini, OpenAI, Local AI").
 *
 * WICHTIG (Doc 03 §5 Enforcement): `AiAttributeClaim` hat bewusst KEIN
 * `truthState`/`status`-Feld. Ein Provider (oder ein bösartiger Aufrufer)
 * kann strukturell gar nicht versuchen, einen Claim als `USER_CONFIRMED`
 * auszugeben — das ist nicht nur eine Laufzeitprüfung, sondern durch den
 * Typ selbst ausgeschlossen. `ProductAnalysisService` vergibt truthState
 * (`INFERRED` oder `UNKNOWN`) ausschließlich selbst, siehe dort.
 */
export interface AiAttributeClaim {
  key: string;
  /** null/leer => UNKNOWN, sonst wird der Claim als INFERRED übernommen. */
  value: string | null;
  /** 0..1. Unter 0,65 zeigt die Oberfläche das Feld als unsicher. */
  confidence: number;
}

export interface AiAnalysisResult {
  attributes: AiAttributeClaim[];
  modelId: string;
  promptVersion: string;
}

export interface AiVisionProvider {
  analyzeItem(input: { imageUrls: string[]; hint?: string | null }): Promise<AiAnalysisResult>;
}

export const AI_VISION_PROVIDER = Symbol('AI_VISION_PROVIDER');
