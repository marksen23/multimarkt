import {
  Controller,
  Get,
  Query,
  Res,
  StreamableFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  BackupExportService,
  MonthlySummaryResponse,
} from '../../application/export/backup-export.service';
import { ActorContext } from '../../domain/actor-context';
import { CurrentActor } from '../auth/actor.decorator';
import { ActorContextGuard } from '../auth/actor-context.guard';
import { ResponseEnvelopeInterceptor } from '../interceptors/response-envelope.interceptor';

/** Feature-Plan 3.12 — Sicherung als Datei und eine Monatszahl. Nur lesen. */
@Controller('export')
@UseGuards(ActorContextGuard)
@UseInterceptors(ResponseEnvelopeInterceptor)
export class ExportController {
  constructor(private readonly backup: BackupExportService) {}

  @Get('month')
  async month(
    @CurrentActor() actor: ActorContext,
    @Query('month') month?: string,
  ): Promise<MonthlySummaryResponse> {
    return this.backup.month(actor.userId!, month);
  }

  @Get('download')
  async download(
    @CurrentActor() actor: ActorContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.backup.file(actor.userId!);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );
    return new StreamableFile(Buffer.from(file.body, 'utf8'));
  }
}
