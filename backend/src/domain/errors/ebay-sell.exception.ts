import { HttpStatus } from '@nestjs/common';
import { HttpException } from '@nestjs/common';

/**
 * eBay-Verkauf ist nicht möglich, ohne dass die Oberfläche eine deutsche
 * Begründung bekommt. Kein stiller Ersatz durch eine erfundene Anzeigen-ID.
 */
export class EbaySellException extends HttpException {
  constructor(message: string, details: Record<string, unknown> = {}) {
    super({ error_code: 'ERR_EBAY_SELL', message, details }, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}
