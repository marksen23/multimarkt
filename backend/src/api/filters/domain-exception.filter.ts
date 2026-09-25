import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';
import { EntityNotFoundError } from 'typeorm';

/**
 * Doc 04 §5: jede API-Fehlerantwort hat die Form
 * `{ error_code, message, details }`. Domain-Exceptions (Doc 04 §18)
 * bringen dieses Format bereits mit (siehe `state-transition.errors.ts`) —
 * dieser Filter normalisiert zusätzlich Nests eingebaute Exceptions
 * (ValidationPipe, NotFoundException, UnauthorizedException, ...) auf
 * dieselbe Form, damit Clients nie zwei unterschiedliche Fehlerschemata
 * sehen.
 *
 * Catch-all (September 2026, Bug-Fix): `@Catch(HttpException)` allein ließ
 * TypeORMs `findOneByOrFail`/`findOneOrFail` (wirft `EntityNotFoundError`,
 * KEINE `HttpException`) sowie jeden anderen unerwarteten Fehler an Nests
 * eingebautem Handler vorbei, der ein komplett anderes, nicht dokumentiertes
 * Fehlerschema zurückgibt — ein reines Frontend-`ApiError`-Parsing hätte
 * dort `body.message` als `undefined` gesehen. `EntityNotFoundError` wird
 * jetzt explizit auf 404/ERR_NOT_FOUND gemappt (wie die expliziten
 * `NotFoundException`-Stellen im Code), alles andere Unerwartete auf ein
 * generisches 500 im dokumentierten Format — geloggt, damit der eigentliche
 * Bug serverseitig sichtbar bleibt, statt nur als kryptischer Client-Fehler.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof EntityNotFoundError) {
      response.status(404).json({
        error_code: 'ERR_NOT_FOUND',
        message: 'The requested resource was not found.',
        details: {},
      });
      return;
    }

    if (!(exception instanceof HttpException)) {
      this.logger.error('Unhandled non-HTTP exception', (exception as Error)?.stack ?? exception);
      response.status(500).json({
        error_code: 'ERR_UNKNOWN',
        message: 'An unexpected error occurred.',
        details: {},
      });
      return;
    }

    const status = exception.getStatus();
    const body = exception.getResponse();

    if (typeof body === 'object' && body !== null && 'error_code' in body) {
      response.status(status).json(body);
      return;
    }

    const rawMessage =
      typeof body === 'object' && body !== null && 'message' in body
        ? (body as { message: unknown }).message
        : exception.message;

    response.status(status).json({
      error_code: this.genericCodeFor(status),
      message: Array.isArray(rawMessage) ? rawMessage.join('; ') : String(rawMessage),
      details: {},
    });
  }

  private genericCodeFor(status: number): string {
    switch (status) {
      case 400:
        return 'ERR_VALIDATION';
      case 401:
        return 'ERR_UNAUTHORIZED';
      case 403:
        return 'ERR_FORBIDDEN';
      case 404:
        return 'ERR_NOT_FOUND';
      case 409:
        return 'ERR_CONFLICT';
      case 422:
        return 'ERR_UNPROCESSABLE';
      default:
        return 'ERR_UNKNOWN';
    }
  }
}
