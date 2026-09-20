import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';

/** Doc 04 §17: jede erfolgreiche Response wird als `{ data, meta }` umhüllt. */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((data) => ({
        data,
        meta: { timestamp: new Date().toISOString(), version: 'v2' },
      })),
    );
  }
}
