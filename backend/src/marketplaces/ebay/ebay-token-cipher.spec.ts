import { decryptEbayToken, ebayTokenSecret, encryptEbayToken, EbayTokenCipherError } from './ebay-token-cipher';

const SECRET = 'ci-not-a-secret-but-long-enough';
const TOKEN = 'v^1.1#i^1#f^0#r^1#refresh-token-not-for-logs';

describe('ebay token cipher', () => {
  it('round-trips a refresh token and does not store the plaintext', () => {
    const ciphertext = encryptEbayToken(TOKEN, SECRET);
    expect(ciphertext.startsWith('v1.')).toBe(true);
    expect(ciphertext).not.toContain(TOKEN);
    expect(ciphertext).not.toContain('refresh-token');
    expect(decryptEbayToken(ciphertext, SECRET)).toBe(TOKEN);
  });

  it('rejects a tampered ciphertext and a different secret', () => {
    const ciphertext = encryptEbayToken(TOKEN, SECRET);
    const flipped = `${ciphertext.slice(0, -4)}aaaa`;
    expect(() => decryptEbayToken(flipped, SECRET)).toThrow(EbayTokenCipherError);
    expect(() => decryptEbayToken(ciphertext, 'other-secret-value')).toThrow(EbayTokenCipherError);
    expect(() => decryptEbayToken('plain-token', SECRET)).toThrow(EbayTokenCipherError);
    try {
      decryptEbayToken(ciphertext, 'other-secret-value');
    } catch (error) {
      expect((error as Error).message).not.toContain(TOKEN);
      expect((error as Error).message).not.toContain(ciphertext);
    }
  });

  it('prefers EBAY_TOKEN_SECRET and otherwise uses JWT_SECRET', () => {
    expect(ebayTokenSecret({ get: (key) => (key === 'EBAY_TOKEN_SECRET' ? ' dedicated ' : 'jwt') })).toBe('dedicated');
    expect(ebayTokenSecret({ get: (key) => (key === 'JWT_SECRET' ? 'jwt-secret' : '') })).toBe('jwt-secret');
    expect(ebayTokenSecret({ get: () => '  ' })).toBeNull();
  });
});
