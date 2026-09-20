import { Injectable } from '@nestjs/common';
import {
  BuybackAnchorProvider,
  BuybackAnchorQuery,
  BuybackQuote,
} from '../../domain/pricing/buyback-anchor-provider.interface';

/**
 * Deterministischer Platzhalter für eine echte Ankaufportal-Anbindung
 * (docs/README.md §9e). Ob momox/reBuy/Zoxs eine automatisierbare
 * Preis-Abfrage anbieten, ist NICHT web-verifiziert (§9e-Hinweis) — dieser
 * Stub dient nur dazu, den `PriceTriangulationService` und das Interface
 * zu testen, nicht als Behauptung über ein echtes Portal.
 */
@Injectable()
export class MockMomoxProvider implements BuybackAnchorProvider {
  async quote(query: BuybackAnchorQuery): Promise<BuybackQuote | null> {
    if (!query.brand) return null;

    return {
      buybackPrice: 15,
      currency: 'EUR',
      portalName: 'momox (Mock)',
    };
  }
}
