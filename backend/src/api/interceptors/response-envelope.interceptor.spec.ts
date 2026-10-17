import { StreamableFile } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';

describe('ResponseEnvelopeInterceptor', () => {
  const interceptor = new ResponseEnvelopeInterceptor();

  it('wraps a json body', async () => {
    const result = await lastValueFrom(
      interceptor.intercept({} as never, { handle: () => of({ ok: true }) }),
    );
    expect(result).toEqual({
      data: { ok: true },
      meta: expect.objectContaining({ version: 'v2' }),
    });
  });

  it('leaves a file download unwrapped', async () => {
    const file = new StreamableFile(Buffer.from('{}'));
    const result = await lastValueFrom(
      interceptor.intercept({} as never, { handle: () => of(file) }),
    );
    expect(result).toBe(file);
  });
});
