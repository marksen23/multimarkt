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
import { SalesOverview, SalesOverviewService } from '../../application/sales/sales-overview.service';
import { ActorContext } from '../../domain/actor-context';
import { CurrentActor } from '../auth/actor.decorator';
import { ActorContextGuard } from '../auth/actor-context.guard';
import { ResponseEnvelopeInterceptor } from '../interceptors/response-envelope.interceptor';

/** Verkäufe & Gewinn: Kennzahlen, Kanäle, DAC7-Zähler und CSV. */
@Controller('sales')
@UseGuards(ActorContextGuard)
@UseInterceptors(ResponseEnvelopeInterceptor)
export class SalesController {
  constructor(private readonly salesOverview: SalesOverviewService) {}

  @Get()
  async overview(
    @CurrentActor() actor: ActorContext,
    @Query('period') period?: string,
  ): Promise<SalesOverview> {
    return this.salesOverview.overview(actor.userId!, period);
  }

  @Get('csv')
  async csv(
    @CurrentActor() actor: ActorContext,
    @Query('period') period: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.salesOverview.csv(actor.userId!, period);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    return new StreamableFile(Buffer.from(file.body, 'utf8'));
  }
}
