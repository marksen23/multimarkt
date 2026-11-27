import { HttpStatus } from '@nestjs/common';
import { HttpException } from '@nestjs/common';

/**
 * eBay-Verkauf ist nicht möglich, ohne dass die Oberfläche eine deutsche
 * Begründung bekommt. Kein stiller Ersatz durch eine erfundene Anzeigen-ID.
 */
export class EbaySellException extends HttpException {
  /** True, wenn eBay den Zugang selbst abgelehnt hat (401 oder invalid_grant). */
  readonly tokenRejected: boolean;

  constructor(message: string, details: Record<string, unknown> = {}, tokenRejected = false) {
    super({ error_code: 'ERR_EBAY_SELL', message, details }, HttpStatus.UNPROCESSABLE_ENTITY);
    this.tokenRejected = tokenRejected;
  }
}
