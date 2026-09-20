import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
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
  // Health-Check-Root (Render `healthCheckPath: /`) bleibt unpräfigiert,
  // alle echten API-Routen (Doc 04) liegen unter /api — passend zum
  // Frontend-Dev-Proxy (vite.config.ts).
  app.setGlobalPrefix('api', { exclude: ['/'] });
  // LocalDiskStorageProvider (Dev/Demo — siehe dortige Doku zum flüchtigen
  // Render-Dateisystem). UPLOAD_DIR muss mit dem Provider übereinstimmen.
  app.useStaticAssets(join(process.cwd(), process.env.UPLOAD_DIR ?? 'uploads'), {
    prefix: '/uploads/',
  });
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
