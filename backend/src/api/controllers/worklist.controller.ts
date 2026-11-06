import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import {
  WorklistService,
  WorklistView,
} from '../../application/worklist/worklist.service';
import { ActorContext } from '../../domain/actor-context';
import { CurrentActor } from '../auth/actor.decorator';
import { ActorContextGuard } from '../auth/actor-context.guard';
import { ResponseEnvelopeInterceptor } from '../interceptors/response-envelope.interceptor';

/**
 * Gruppierte Startseite (Feature-Plan §2.5 / §3.1). Bewusste Erweiterung
 * neben `GET /items`: die flache Liste bleibt, diese Abfrage sagt, welcher
 * Handgriff als Nächstes ansteht. Kein Schreibpfad.
 */
@Controller('worklist')
@UseGuards(ActorContextGuard)
@UseInterceptors(ResponseEnvelopeInterceptor)
export class WorklistController {
  constructor(private readonly worklist: WorklistService) {}

  @Get()
  list(@CurrentActor() actor: ActorContext): Promise<WorklistView> {
    return this.worklist.forUser(actor.userId!);
  }
}
