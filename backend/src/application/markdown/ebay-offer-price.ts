import { Injectable } from '@nestjs/common';
import { EbaySetupService } from '../ebay/ebay-setup.service';
import { EbaySellException } from '../../domain/errors/ebay-sell.exception';
import { ebaySellGaps } from '../../domain/listing/ebay-sell-readiness';
import { EbaySellClient } from '../../marketplaces/ebay/ebay-sell.client';

/**
 * Preis eines veröffentlichten ebay.de-Angebots. Ohne Token oder Richtlinien
 * wird nichts aufgerufen und nichts als Erfolg ausgegeben.
 */
@Injectable()
export class EbayOfferPriceUpdater {
  constructor(private readonly ebaySetup: EbaySetupService) {}

  async update(input: { sku: string; offerId: string; priceEur: number }): Promise<void> {
    const env = await this.ebaySetup.resolve();
    const gaps = ebaySellGaps(env);
    if (gaps.length > 0) {
      throw new EbaySellException(gaps.map((gap) => gap.message).join(' '));
    }
    await new EbaySellClient(env).updateOfferPrice(input);
  }
}
