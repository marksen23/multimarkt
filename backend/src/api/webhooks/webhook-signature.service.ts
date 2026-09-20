import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Signatur-Prüfung für eingehende Marktplatz-Webhooks (Doc 03 §12, Doc 04
 * §14: "Überprüfung der Plattform-Signatur, z.B. X-EBAY-SIGNATURE").
 *
 * VEREINFACHUNG: generisches HMAC-SHA256 über den rohen Request-Body mit
 * einem per Marktplatz konfigurierten Shared Secret. Das bildet das
 * PRINZIP korrekt ab (Payload wird vor jeder Verarbeitung kryptographisch
 * geprüft), ist aber NICHT das exakte, plattformspezifische Schema jedes
 * echten Anbieters (eBays reales Notification-Schema ist deutlich
 * komplexer). Zu härten, sobald echte Marktplatz-Zugänge existieren (siehe
 * Abschlussbericht).
 */
@Injectable()
export class WebhookSignatureService {
  constructor(private readonly config: ConfigService) {}

  verify(marketplaceId: string, rawBody: Buffer, signatureHeader: string | undefined): boolean {
    if (!signatureHeader) return false;

    const secret = this.config.get<string>(`WEBHOOK_SECRET_${marketplaceId.toUpperCase()}`);
    if (!secret) return false;

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const provided = signatureHeader.replace(/^sha256=/, '');

    const expectedBuf = Buffer.from(expected, 'hex');
    const providedBuf = Buffer.from(provided, 'hex');
    if (expectedBuf.length !== providedBuf.length) return false;

    return timingSafeEqual(expectedBuf, providedBuf);
  }
}
