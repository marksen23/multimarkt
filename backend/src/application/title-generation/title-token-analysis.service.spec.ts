import { TitleTokenAnalysisService } from './title-token-analysis.service';

describe('TitleTokenAnalysisService', () => {
  const service = new TitleTokenAnalysisService();

  it('finds tokens that recur across comparable titles but are missing from the own title', () => {
    const result = service.analyze('Herrenjacke', [
      { title: 'Herrenjacke Leder OVP', price: 40 },
      { title: 'Lederjacke Herren OVP sehr gepflegt', price: 50 },
      { title: 'Jacke Leder OVP wie neu', price: 45 },
    ]);

    expect(result.missingTokens).toContain('leder');
    expect(result.missingTokens).toContain('ovp');
    expect(result.missingTokens).not.toContain('herrenjacke');
  });

  it('returns no missing tokens when there are no comparable listings', () => {
    const result = service.analyze('Herrenjacke', []);
    expect(result.missingTokens).toEqual([]);
  });

  it('ignores a token that only appears once across the comparables (noise, not a pattern)', () => {
    const result = service.analyze('Jacke', [
      { title: 'Jacke Vintage Sonderfarbe', price: 40 },
      { title: 'Jacke Leder OVP', price: 45 },
      { title: 'Jacke Leder OVP', price: 45 },
    ]);

    expect(result.missingTokens).not.toContain('vintage');
    expect(result.missingTokens).not.toContain('sonderfarbe');
    expect(result.missingTokens).toContain('leder');
  });

  it('tokenizes the own title so its own words are excluded from the gap list', () => {
    const result = service.analyze('Herrenjacke Leder', [
      { title: 'Herrenjacke Leder OVP', price: 40 },
      { title: 'Herrenjacke Leder OVP', price: 45 },
    ]);

    expect(result.ownTokens).toEqual(expect.arrayContaining(['herrenjacke', 'leder']));
    expect(result.missingTokens).not.toContain('leder');
    expect(result.missingTokens).toContain('ovp');
  });
});
