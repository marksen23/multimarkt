import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'v1';
const AAD = Buffer.from('ebay-refresh-token');

export class EbayTokenCipherError extends Error {
  constructor() {
    super('Das gespeicherte eBay-Token lässt sich nicht lesen.');
    this.name = 'EbayTokenCipherError';
  }
}

/**
 * AES-256-GCM. Der Schlüssel ist SHA-256 von einem festen Präfix plus
 * EBAY_TOKEN_SECRET oder, wenn das leer ist, JWT_SECRET. Coolify setzt
 * JWT_SECRET bereits (langes Zufallsgeheimnis). Der Klartext steht nie in
 * der Datenbank. Ein kurzes Passwort wäre hier zu schwach; der Wert muss
 * zufällig und lang sein.
 */
export function encryptEbayToken(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptEbayToken(payload: string, secret: string): string {
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) throw new EbayTokenCipherError();
  const [, ivPart, tagPart, dataPart] = parts;
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(ivPart, 'base64url'));
    decipher.setAAD(AAD);
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new EbayTokenCipherError();
  }
}

export function ebayTokenSecret(config: { get(key: string): string | undefined }): string | null {
  const dedicated = config.get('EBAY_TOKEN_SECRET')?.trim();
  if (dedicated) return dedicated;
  const jwt = config.get('JWT_SECRET')?.trim();
  return jwt || null;
}

function encryptionKey(secret: string): Buffer {
  return createHash('sha256').update(`resaleos.ebay-token.v1:${secret}`).digest();
}
