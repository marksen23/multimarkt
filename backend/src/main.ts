import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './api/filters/domain-exception.filter';

async function bootstrap() {
  // rawBody: true -> req.rawBody für die Webhook-Signaturprüfung (Doc 03 §12).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new DomainExceptionFilter());
  // Health-Check lebt unter /healthz (siehe app.controller.ts), unpräfigiert.
  // Alle echten API-Routen (Doc 04) liegen unter /api — passend zum
  // Frontend-Dev-Proxy (vite.config.ts).
  app.setGlobalPrefix('api', { exclude: ['/healthz'] });
  // LocalDiskStorageProvider (Dev/Demo — siehe dortige Doku zum flüchtigen
  // Render-Dateisystem). UPLOAD_DIR muss mit dem Provider übereinstimmen.
  app.useStaticAssets(join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads'), {
    prefix: '/uploads/',
  });

  // Single-Domain-Merge (September 2026): das Frontend läuft nicht mehr als
  // eigener Render-Service, sondern wird von diesem Prozess mitausgeliefert
  // (ein Grund: getrennte Services = getrennte onrender.com-Domains, siehe
  // Diskussion). `../frontend/dist` entsteht durch den erweiterten
  // buildCommand in render.yaml (baut frontend/ zusätzlich zum Backend).
  const frontendDistPath = join(process.cwd(), '..', 'frontend', 'dist');
  app.useStaticAssets(frontendDistPath, { index: false });

  // SPA-Fallback: jede GET-Anfrage, die nicht zu einer der drei bekannten
  // Nicht-SPA-Zonen gehört (/api/*, /uploads/*, /healthz) und auf keine
  // echte Datei oben passt (z.B. /items/abc123, ein React-Router-
  // Client-Pfad), bekommt die index.html — React Router übernimmt das
  // Routing danach im Browser.
  //
  // WICHTIG zur Registrierungs-Reihenfolge (per Test gefunden,
  // spa-fallback.e2e-mechanism.spec.ts): das muss VOR jedem `await
  // app.init()`/`app.listen()` passieren, also bevor Nests eigener
  // Dispatcher im Express-Stack hängt. Nest beantwortet unbekannte Pfade
  // nämlich selbst mit einem fertigen 404 (JSON-Exception-Handler), statt
  // per `next()` an nachfolgende Middleware weiterzureichen — eine NACH
  // Nest registrierte Fallback-Route würde also nie erreicht. Deshalb
  // filtert diese Middleware selbst exakt die drei bekannten Nicht-SPA-
  // Präfixe heraus, statt sich auf Nests 404-Verhalten zu verlassen.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      req.method !== 'GET' ||
      req.path.startsWith('/api') ||
      req.path.startsWith('/uploads') ||
      req.path === '/healthz'
    ) {
      return next();
    }
    res.sendFile(join(frontendDistPath, 'index.html'));
  });

  app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
