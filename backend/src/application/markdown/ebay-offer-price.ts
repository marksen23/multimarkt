import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EbaySellException } from '../../domain/errors/ebay-sell.exception';
import { ebaySellGaps } from '../../domain/listing/ebay-sell-readiness';
import { EbaySellClient } from '../../marketplaces/ebay/ebay-sell.client';
import { readEbaySellEnv } from '../../marketplaces/ebay/ebay-sell.adapter';

/**
 * Preis eines veröffentlichten ebay.de-Angebots. Ohne Token oder Richtlinien
 * wird nichts aufgerufen und nichts als Erfolg ausgegeben.
 */
@Injectable()
export class EbayOfferPriceUpdater {
  constructor(private readonly config: ConfigService) {}

  async update(input: { sku: string; offerId: string; priceEur: number }): Promise<void> {
    const env = readEbaySellEnv(this.config);
    const gaps = ebaySellGaps(env);
    if (gaps.length > 0) {
      throw new EbaySellException(gaps.map((gap) => gap.message).join(' '));
    }
    await new EbaySellClient(env).updateOfferPrice(input);
  }
}
