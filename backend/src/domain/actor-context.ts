/**
 * Authority Model (Doc 03 §2 / Doc 04 §2): jeder Zustandsübergang wird einem
 * von drei Actor-Typen zugeordnet.
 *
 * - USER: authentifizierte Session, darf Human-Gates passieren.
 * - SYSTEM: interner Worker/Job (z.B. nach verifizierter API-Antwort). Darf
 *   NIEMALS ein Human-Gate passieren.
 * - WEBHOOK: externe Plattform. Darf ausschließlich Events/Evidence
 *   injizieren (sale_events), niemals direkte Zustandsübergänge am
 *   Aggregat erzwingen.
 */
export type ActorType = 'USER' | 'SYSTEM' | 'WEBHOOK';

export interface ActorContext {
  type: ActorType;
  userId?: string;
}
