import { Injectable } from '@nestjs/common';
import {
  MarketplaceAdapter,
  MarketplacePublishInput,
  MarketplacePublishResult,
} from '../../domain/marketplace/marketplace-adapter.interface';

/**
 * Kleinanzeigen.de hat keine autorisierte Dritt-API (README §4b: die AGB
 * untersagen automatisierten Zugriff ausdrücklich). Dieser Adapter
 * automatisiert daher NICHTS — er bereitet nur den Text vor (in einer
 * echten Umsetzung: Web-Share-API-Payload, Doc 01 §9) und liefert bewusst
 * KEINE externe ID zurück, weil es noch kein echtes Listing gibt. Der
 * Nutzer bestätigt selbst, dass er es manuell eingestellt hat
 * (`requiresManualConfirmation: true`).
 */
@Injectable()
export class FormattingHelperAdapter implements MarketplaceAdapter {
  async publish(input: MarketplacePublishInput): Promise<MarketplacePublishResult> {
    void input;
    return { externalPlatformId: null, requiresManualConfirmation: true };
  }

  async delist(): Promise<void> {
    // Kein API-Zugriff möglich — Storno ist ausschließlich Nutzer-Aktion
    // (Doc 02 §9 Pfad B), siehe MarketplacePublishingService.confirmCancellation.
  }
}
