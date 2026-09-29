import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AnkaufResearchService } from '../../application/ankauf/ankauf-research.service';
import type { AnkaufResearchResult, AnkaufSearchRequest } from '../../domain/ankauf/ankauf.types';

@Controller('ankauf')
export class AnkaufController {
  constructor(private readonly ankaufResearch: AnkaufResearchService) {}

  @Post('search')
  @HttpCode(200)
  async search(@Body() body: AnkaufSearchRequest): Promise<AnkaufResearchResult> {
    const keywords = (body.keywords ?? '').trim();
    if (!keywords) {
      return {
        keywords: '',
        location: 'Berlin',
        marketMedianEur: null,
        listings: [],
        conditionPriceImpact: {},
        searchedAt: new Date().toISOString(),
      };
    }
    return this.ankaufResearch.search(keywords);
  }
}
