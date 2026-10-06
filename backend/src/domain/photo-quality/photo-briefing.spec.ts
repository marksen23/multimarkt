import { buildPhotoBriefing, CATEGORY_PHOTO_SHOTS, PHOTO_SHOT_LABELS } from './photo-briefing';

function categoryRow(
  value: string | null,
  truthState: 'UNKNOWN' | 'INFERRED' | 'USER_CONFIRMED' = 'INFERRED',
) {
  return { attributeKey: 'category', attributeValue: value, truthState };
}

describe('photo briefing', () => {
  it('names the five shots in German', () => {
    expect(PHOTO_SHOT_LABELS).toEqual({
      WHOLE: 'Gesamtes Stück',
      LABEL: 'Etikett',
      SOLE: 'Sohle',
      DEFECT: 'Defekt',
      ACCESSORY: 'Zubehör',
    });
  });

  it('asks only for the shots that category needs', () => {
    expect(CATEGORY_PHOTO_SHOTS.Kleidung).toEqual(['WHOLE', 'LABEL', 'DEFECT']);
    expect(CATEGORY_PHOTO_SHOTS.Schuhe).toEqual(['WHOLE', 'LABEL', 'SOLE', 'DEFECT']);
    expect(CATEGORY_PHOTO_SHOTS.Elektronik).toEqual(['WHOLE', 'LABEL', 'DEFECT', 'ACCESSORY']);
    expect(CATEGORY_PHOTO_SHOTS.Medien).toEqual(['WHOLE']);
    expect(CATEGORY_PHOTO_SHOTS.Haushalt).toEqual(['WHOLE', 'DEFECT']);
    expect(CATEGORY_PHOTO_SHOTS.Möbel).toEqual(['WHOLE', 'DEFECT']);
    expect(CATEGORY_PHOTO_SHOTS.Sonstiges).toEqual(['WHOLE']);
    expect(CATEGORY_PHOTO_SHOTS.Kleidung).not.toContain('SOLE');
    expect(CATEGORY_PHOTO_SHOTS.Kleidung).not.toContain('ACCESSORY');
    expect(CATEGORY_PHOTO_SHOTS.Schuhe).not.toContain('ACCESSORY');
    expect(CATEGORY_PHOTO_SHOTS.Elektronik).toContain('ACCESSORY');
    expect(CATEGORY_PHOTO_SHOTS.Schuhe).toContain('SOLE');
  });

  it('lists every required shot as missing until a photo covers it', () => {
    const open = buildPhotoBriefing([categoryRow('Schuhe')], [null, 'WHOLE']);

    expect(open.category).toBe('Schuhe');
    expect(open.missingShots.map((shot) => shot.label)).toEqual(['Etikett', 'Sohle', 'Defekt']);
    expect(open.missingShots.map((shot) => shot.message)).toEqual([
      'Etikett fehlt noch.',
      'Sohle fehlt noch.',
      'Defekt fehlt noch.',
    ]);

    const done = buildPhotoBriefing([categoryRow('Schuhe', 'USER_CONFIRMED')], [
      'WHOLE',
      'LABEL',
      'SOLE',
      'DEFECT',
      'DEFECT',
    ]);
    expect(done.missingShots).toEqual([]);
  });

  it('stays quiet until the category is known', () => {
    expect(buildPhotoBriefing([categoryRow(null, 'UNKNOWN')], ['WHOLE']).missingShots).toEqual([]);
    expect(buildPhotoBriefing([categoryRow('Sneaker')], []).category).toBeNull();
    expect(buildPhotoBriefing([], []).requiredShots).toEqual([]);
  });

  it('prefers the confirmed category over an older guess', () => {
    const briefing = buildPhotoBriefing(
      [categoryRow('Kleidung', 'INFERRED'), categoryRow('Schuhe', 'USER_CONFIRMED')],
      [],
    );
    expect(briefing.category).toBe('Schuhe');
    expect(briefing.missingShots.map((shot) => shot.shot)).toContain('SOLE');
  });
});
