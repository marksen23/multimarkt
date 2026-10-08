import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import { SalesOverview, SalesOverviewService } from '../../application/sales/sales-overview.service';
import { ActorContext } from '../../domain/actor-context';
import { CurrentActor } from '../auth/actor.decorator';
import { ActorContextGuard } from '../auth/actor-context.guard';
import { ResponseEnvelopeInterceptor } from '../interceptors/response-envelope.interceptor';

/** Feature-Plan 3.4 — offene Artikel, Verkäufe, Marge der letzten Wochen. */
@Controller('sales')
@UseGuards(ActorContextGuard)
@UseInterceptors(ResponseEnvelopeInterceptor)
export class SalesController {
  constructor(private readonly salesOverview: SalesOverviewService) {}

  @Get()
  async overview(@CurrentActor() actor: ActorContext): Promise<SalesOverview> {
    return this.salesOverview.overview(actor.userId!);
  }
}
