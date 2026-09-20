import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Response } from 'express';

/**
 * Doc 04 §5: jede API-Fehlerantwort hat die Form
 * `{ error_code, message, details }`. Domain-Exceptions (Doc 04 §18)
 * bringen dieses Format bereits mit (siehe `state-transition.errors.ts`) —
 * dieser Filter normalisiert zusätzlich Nests eingebaute Exceptions
 * (ValidationPipe, NotFoundException, UnauthorizedException, ...) auf
 * dieselbe Form, damit Clients nie zwei unterschiedliche Fehlerschemata
 * sehen.
 */
@Catch(HttpException)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
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
