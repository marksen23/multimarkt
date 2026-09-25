import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { WebhookSignatureService } from './webhook-signature.service';

function makeConfig(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function sign(secret: string, body: Buffer): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

describe('WebhookSignatureService', () => {
  const secret = 'test-secret-kleinanzeigen';
  const body = Buffer.from(JSON.stringify({ externalEventId: 'evt-1', reportedPrice: 42 }));

  it('accepts a correctly signed request with the sha256= prefix', () => {
    const service = new WebhookSignatureService(makeConfig({ WEBHOOK_SECRET_KLEINANZEIGEN: secret }));
    const signature = `sha256=${sign(secret, body)}`;

    expect(service.verify('kleinanzeigen', body, signature)).toBe(true);
  });

  it('accepts a correctly signed request without the sha256= prefix', () => {
    const service = new WebhookSignatureService(makeConfig({ WEBHOOK_SECRET_KLEINANZEIGEN: secret }));
    const signature = sign(secret, body);

    expect(service.verify('kleinanzeigen', body, signature)).toBe(true);
  });

  it('is case-insensitive on the marketplace id when looking up the configured secret', () => {
    const service = new WebhookSignatureService(makeConfig({ WEBHOOK_SECRET_EBAY: secret }));
    const signature = sign(secret, body);

    expect(service.verify('EbAy', body, signature)).toBe(true);
  });

  it('rejects a missing signature header', () => {
    const service = new WebhookSignatureService(makeConfig({ WEBHOOK_SECRET_KLEINANZEIGEN: secret }));

    expect(service.verify('kleinanzeigen', body, undefined)).toBe(false);
  });

  it('rejects when no secret is configured for the marketplace (fails closed, never treats it as "no check needed")', () => {
    const service = new WebhookSignatureService(makeConfig({}));
    const signature = sign(secret, body);

    expect(service.verify('kleinanzeigen', body, signature)).toBe(false);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const service = new WebhookSignatureService(makeConfig({ WEBHOOK_SECRET_KLEINANZEIGEN: secret }));
    const signature = sign('wrong-secret', body);

    expect(service.verify('kleinanzeigen', body, signature)).toBe(false);
  });

  it('rejects when the body was tampered with after signing', () => {
    const service = new WebhookSignatureService(makeConfig({ WEBHOOK_SECRET_KLEINANZEIGEN: secret }));
    const signature = `sha256=${sign(secret, body)}`;
    const tamperedBody = Buffer.from(JSON.stringify({ externalEventId: 'evt-1', reportedPrice: 999999 }));

    expect(service.verify('kleinanzeigen', tamperedBody, signature)).toBe(false);
  });

  it('rejects a malformed/non-hex signature header without throwing', () => {
    const service = new WebhookSignatureService(makeConfig({ WEBHOOK_SECRET_KLEINANZEIGEN: secret }));

    expect(() => service.verify('kleinanzeigen', body, 'not-a-hex-signature-at-all')).not.toThrow();
    expect(service.verify('kleinanzeigen', body, 'not-a-hex-signature-at-all')).toBe(false);
  });

  it('rejects an empty string signature', () => {
    const service = new WebhookSignatureService(makeConfig({ WEBHOOK_SECRET_KLEINANZEIGEN: secret }));

    expect(service.verify('kleinanzeigen', body, '')).toBe(false);
  });
});
