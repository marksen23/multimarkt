import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';

/** Doc 04 §17: jede erfolgreiche Response wird als `{ data, meta }` umhüllt. */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        // Datei-Download (Sicherung) bleibt der reine Body, nicht die Hülle.
        if (data instanceof StreamableFile) return data;
        return {
          data,
          meta: { timestamp: new Date().toISOString(), version: 'v2' },
        };
      }),
    );
  }
}
