import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ReadinessService } from './readiness.service';

/**
 * Liveness bleibt /healthz (AppController, kein DB-/Redis-Zugriff), damit
 * Render-healthCheckPath und das Docker-HEALTHCHECK den Prozess als lebendig
 * sehen, sobald er lauscht. /ready ist die Abhängigkeitsprüfung.
 */
@Controller()
export class ReadyController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get('ready')
  async ready(): Promise<{ status: 'ready'; database: 'ok'; redis: 'ok' }> {
    const checks = await this.readiness.check();
    if (checks.database !== 'ok' || checks.redis !== 'ok') {
      throw new ServiceUnavailableException({
        error_code: 'ERR_NOT_READY',
        message: 'Database or Redis is not ready.',
        details: checks,
      });
    }
    return { status: 'ready', database: 'ok', redis: 'ok' };
  }
}
