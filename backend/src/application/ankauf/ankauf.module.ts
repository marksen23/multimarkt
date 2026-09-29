import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ANKAUF_SEARCH_PROVIDER } from '../../domain/ankauf/ankauf-search-provider.interface';
import type { AnkaufSearchProvider } from '../../domain/ankauf/ankauf-search-provider.interface';
import { MockAnkaufSearchProvider } from '../../infrastructure/ankauf/mock-ankauf-search.provider';
import { RealAnkaufGeminiProvider } from '../../infrastructure/ankauf/real-ankauf-gemini.provider';
import { AnkaufResearchService } from './ankauf-research.service';

const GEMINI_PLACEHOLDER_KEY = 'unused-mock-provider-active';

@Module({
  imports: [ConfigModule],
  providers: [
    AnkaufResearchService,
    {
      provide: ANKAUF_SEARCH_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AnkaufSearchProvider => {
        const key = config.get<string>('GEMINI_API_KEY');
        return key && key !== GEMINI_PLACEHOLDER_KEY
          ? new RealAnkaufGeminiProvider(config)
          : new MockAnkaufSearchProvider();
      },
    },
  ],
  exports: [AnkaufResearchService],
})
export class AnkaufModule {}
