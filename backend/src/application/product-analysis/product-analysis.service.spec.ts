import { DataSource } from 'typeorm';
import { AiVisionProvider } from '../../domain/ai/ai-vision-provider.interface';
import { ItemAttributeEntity } from '../../infrastructure/database/entities';
import { StateGuardService } from '../state-guard/state-guard.service';
import { ProductAnalysisService } from './product-analysis.service';

const DRILL_ATTRIBUTES = [
  { key: 'category', value: 'Elektronik', confidence: 0.9 },
  { key: 'categoryDetail', value: 'Schlagbohrmaschine', confidence: 0.9 },
  { key: 'brand', value: 'Bosch', confidence: 0.95 },
  { key: 'model', value: 'GBH 2-28 F', confidence: 0.93 },
  { key: 'title', value: 'Bosch GBH 2-28 F Schlagbohrmaschine', confidence: 0.9 },
  { key: 'description', value: 'Blaue Bosch Schlagbohrmaschine im Koffer, Kratzer am Gehäuse.', confidence: 0.7 },
  { key: 'searchTerms', value: 'Bosch GBH 2-28 F Schlagbohrmaschine', confidence: 0.9 },
  { key: 'spec:Leistung', value: '880 W', confidence: 0.8 },
];

function analysisResult() {
  return {
    modelId: 'gemini-flash-latest',
    promptVersion: '2026-11-11-listing',
    attributes: DRILL_ATTRIBUTES,
  };
}

describe('ProductAnalysisService', () => {
  function setup(options: {
    title: string | null;
    titleAttribute?: { truthState: string; source: string; attributeValue: string } | null;
    status?: string;
  }) {
    const item = {
      id: 'item-1',
      title: options.title,
      status: options.status ?? 'ANALYZING',
    };
    const upserts: Array<Record<string, unknown>> = [];
    const manager = {
      findOneBy: jest.fn().mockImplementation((entity: unknown, where: { attributeKey?: string }) => {
        if (entity === ItemAttributeEntity || where?.attributeKey) {
          if (where?.attributeKey === 'title') return options.titleAttribute ?? null;
          return null;
        }
        return item;
      }),
      findBy: jest.fn().mockResolvedValue([{ url: '/uploads/a.jpg' }]),
      findOneByOrFail: jest.fn().mockImplementation(async () => item),
      upsert: jest.fn().mockImplementation((_entity: unknown, row: Record<string, unknown>) => {
        upserts.push(row);
      }),
      update: jest.fn().mockImplementation((_entity: unknown, _where: unknown, patch: { title: string }) => {
        item.title = patch.title;
      }),
    };
    const dataSource = {
      manager,
      transaction: async (fn: (m: typeof manager) => Promise<void>) => fn(manager),
    } as unknown as DataSource;
    const ai: AiVisionProvider = { analyzeItem: jest.fn().mockResolvedValue(analysisResult()) };
    const stateGuard = {
      transitionItem: jest.fn().mockImplementation(async () => ({ ...item, status: 'REVIEW_REQUIRED' })),
    } as unknown as StateGuardService;
    return {
      item,
      upserts,
      ai,
      service: new ProductAnalysisService(dataSource, stateGuard, ai),
    };
  }

  it('stores the drill fields and fills an empty title without confirming them', async () => {
    const { service, ai, item, upserts } = setup({ title: null });

    await service.analyze('item-1', ['/uploads/a.jpg'], { type: 'SYSTEM' }, { hint: '  Bosch Bohrmaschine  ' });

    expect(ai.analyzeItem).toHaveBeenCalledWith({
      imageUrls: ['/uploads/a.jpg'],
      hint: 'Bosch Bohrmaschine',
    });
    expect(item.title).toBe('Bosch GBH 2-28 F Schlagbohrmaschine');
    const keys = upserts.map((row) => row.attributeKey);
    expect(keys).toEqual(
      expect.arrayContaining(['brand', 'model', 'title', 'description', 'searchTerms', 'spec:Leistung', 'category']),
    );
    expect(upserts.every((row) => row.truthState !== 'USER_CONFIRMED')).toBe(true);
    expect(upserts.find((row) => row.attributeKey === 'title')).toMatchObject({
      truthState: 'INFERRED',
      source: 'gemini-flash-latest',
    });
  });

  it('does not replace a title the seller already typed', async () => {
    const { service, item } = setup({ title: 'Mein Bohrer' });

    await service.analyze('item-1', ['/uploads/a.jpg'], { type: 'SYSTEM' });

    expect(item.title).toBe('Mein Bohrer');
  });

  it('keeps a confirmed title on re-analysis and still forwards the hint', async () => {
    const { service, ai, item, upserts } = setup({
      title: 'Mein Bohrer',
      status: 'REVIEW_REQUIRED',
      titleAttribute: { truthState: 'USER_CONFIRMED', source: 'USER_INPUT', attributeValue: 'Mein Bohrer' },
    });

    await service.reanalyzeInPlace('item-1', { hint: 'es ist eine Bosch' });

    expect(ai.analyzeItem).toHaveBeenCalledWith({
      imageUrls: ['/uploads/a.jpg'],
      hint: 'es ist eine Bosch',
    });
    expect(item.title).toBe('Mein Bohrer');
    expect(upserts.some((row) => row.attributeKey === 'title')).toBe(false);
    expect(upserts.find((row) => row.attributeKey === 'model')).toMatchObject({
      attributeValue: 'GBH 2-28 F',
      truthState: 'INFERRED',
    });
  });
});
