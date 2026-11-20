import { buildStoreZip, photoZipName } from './photo-zip';

describe('buildStoreZip', () => {
  it('stores the photo bytes under a stable name', () => {
    const zip = buildStoreZip(
      [{ name: photoZipName(0, 'abc.jpeg'), bytes: Buffer.from('jpeg-bytes') }],
      new Date('2026-01-02T03:04:05Z'),
    );
    expect(zip.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(zip.subarray(-22, -18).toString('hex')).toBe('504b0506');
    expect(zip.includes(Buffer.from('01.jpg'))).toBe(true);
    expect(zip.includes(Buffer.from('jpeg-bytes'))).toBe(true);
  });

  it('refuses an empty archive', () => {
    expect(() => buildStoreZip([])).toThrow(/Keine Fotos/);
  });
});
