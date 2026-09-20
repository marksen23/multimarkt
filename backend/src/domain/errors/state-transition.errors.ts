import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Fehler-Taxonomie aus Doc 04 §5 (Error Model) / §18 (Error Codes).
 * Jede Exception trägt den Response-Body `{ error_code, message, details }`,
 * den Doc 04 §5 für alle API-Fehler vorschreibt, und den passenden
 * HTTP-Status — sodass ein künftiger Controller (Schritt 5) diese Exceptions
 * unverändert durchreichen kann und Nest sie korrekt serialisiert.
 */
abstract class DomainHttpException extends HttpException {
  protected constructor(
    errorCode: string,
    message: string,
    status: HttpStatus,
    details: Record<string, unknown> = {},
  ) {
    super({ error_code: errorCode, message, details }, status);
  }
}

/** Doc 04 §18: Aufruf ignoriert den State-Machine-Flow (z.B. State-Jump, CANCEL_PENDING ohne Bestätigungspfad). */
export class InvalidStateTransitionException extends DomainHttpException {
  constructor(message: string, details?: Record<string, unknown>) {
    super('ERR_STATE_TRANSITION_INVALID', message, HttpStatus.CONFLICT, details);
  }
}

/** Doc 04 §18: Webhook/Job versucht, eine Human-Verification zu überspringen. */
export class HumanGateBypassException extends DomainHttpException {
  constructor(message: string, details?: Record<string, unknown>) {
    super('ERR_HUMAN_GATE_BYPASS', message, HttpStatus.FORBIDDEN, details);
  }
}

/** Doc 04 §18: Versuch, ein Item ohne bestätigten Zustand zu listen/freizugeben (Doc 02 §11). */
export class UnconfirmedConditionException extends DomainHttpException {
  constructor(message: string, details?: Record<string, unknown>) {
    super('ERR_UNCONFIRMED_CONDITION', message, HttpStatus.UNPROCESSABLE_ENTITY, details);
  }
}

/** Doc 04 §18: Pflichtfelder für die Zielplattform fehlen (CapabilityCheckService, Schritt 4). */
export class CapabilityCheckFailedException extends DomainHttpException {
  constructor(message: string, details?: Record<string, unknown>) {
    super('ERR_CAPABILITY_CHECK_FAILED', message, HttpStatus.UNPROCESSABLE_ENTITY, details);
  }
}
