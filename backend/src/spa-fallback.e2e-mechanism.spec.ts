import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import request from 'supertest';

/**
 * Beweist die exakte Single-Domain-Merge-Verkabelung aus main.ts (September
 * 2026: Frontend läuft nicht mehr als eigener Render-Service, sondern wird
 * vom Backend-Prozess mitausgeliefert) — isoliert, ohne echte DB/Redis,
 * damit sie in dieser Sandbox tatsächlich AUSGEFÜHRT statt nur gelesen
 * werden kann. Deckt genau das Risiko ab, das bei so einer Fallback-Route
 * am leichtesten schiefgeht: dass sie API- oder Upload-Pfade verschluckt,
 * die eigentlich 404 liefern sollten.
 */
@Controller('ping')
class PingController {
  @Get()
  ping(): string {
    return 'pong';
  }
}

@Controller()
class HealthController {
  @Get('healthz')
  healthz(): string {
    return 'ok';
  }
}

@Module({ controllers: [PingController, HealthController] })
class SpaFallbackProbeModule {}

describe('Single-domain SPA fallback (frontend served by the backend process)', () => {
  let app: INestApplication;
  let distDir: string;

  beforeAll(async () => {
    distDir = mkdtempSync(join(tmpdir(), 'spa-fallback-'));
    mkdirSync(join(distDir, 'assets'));
    writeFileSync(join(distDir, 'index.html'), 'SPA_SHELL');
    writeFileSync(join(distDir, 'assets', 'app.js'), "console.log('app')");

    const nestApp = await NestFactory.create<NestExpressApplication>(SpaFallbackProbeModule, {
      logger: false,
    });
    // Exakt dieselbe Verkabelung/Reihenfolge wie main.ts, nur mit einem
    // Fixture-Ordner statt dem echten ../frontend/dist.
    nestApp.setGlobalPrefix('api', { exclude: ['/healthz'] });
    nestApp.useStaticAssets(distDir, { index: false });

    // Muss VOR app.init()/app.listen() registriert werden — Nest
    // beantwortet unbekannte Pfade selbst mit einem fertigen 404 statt per
    // next() weiterzureichen, eine später registrierte Fallback-Route
    // würde also nie erreicht (das war der ursprüngliche Fehler, den
    // dieser Test aufgedeckt hat).
    nestApp.use((req: Request, res: Response, next: NextFunction) => {
      if (
        req.method !== 'GET' ||
        req.path.startsWith('/api') ||
        req.path.startsWith('/uploads') ||
        req.path === '/healthz'
      ) {
        return next();
      }
      res.sendFile(join(distDir, 'index.html'));
    });

    app = nestApp;
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    rmSync(distDir, { recursive: true, force: true });
  });

  it('serves API routes under /api, unaffected by the SPA fallback', async () => {
    await request(app.getHttpServer()).get('/api/ping').expect(200).expect('pong');
  });

  it('serves the health check at /healthz, excluded from the /api prefix', async () => {
    await request(app.getHttpServer()).get('/healthz').expect(200).expect('ok');
  });

  it('serves real static assets directly', async () => {
    const res = await request(app.getHttpServer()).get('/assets/app.js').expect(200);
    expect(res.text).toContain("console.log('app')");
  });

  it('falls back to index.html for unknown client-side routes (React Router)', async () => {
    await request(app.getHttpServer()).get('/items/abc123').expect(200).expect('SPA_SHELL');
  });

  it('does NOT swallow an unknown /api/* route into the SPA shell — real 404', async () => {
    await request(app.getHttpServer()).get('/api/does-not-exist').expect(404);
  });

  it('does NOT swallow an unknown /uploads/* route into the SPA shell — real 404', async () => {
    await request(app.getHttpServer()).get('/uploads/does-not-exist').expect(404);
  });
});
