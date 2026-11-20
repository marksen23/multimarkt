import { describe, expect, it } from 'vitest';
import { moveItem } from './photo-order';

describe('moveItem', () => {
  it('moves a photo earlier and makes it the cover', () => {
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
  });

  it('moves a photo later', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('leaves the ends alone and does not mutate the input', () => {
    const photos = ['a', 'b'];
    expect(moveItem(photos, 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(photos, 1, 1)).toEqual(['a', 'b']);
    expect(photos).toEqual(['a', 'b']);
  });
});
