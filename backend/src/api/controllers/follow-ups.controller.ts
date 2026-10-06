import { Controller, Get, UseGuards, UseInterceptors } from '@nestjs/common';
import {
  FollowUpCard,
  FollowUpService,
} from '../../application/listing/follow-up.service';
import { ActorContext } from '../../domain/actor-context';
import { CurrentActor } from '../auth/actor.decorator';
import { ActorContextGuard } from '../auth/actor-context.guard';
import { ResponseEnvelopeInterceptor } from '../interceptors/response-envelope.interceptor';

/** Feature-Plan 3.6 — Anzeigen, die nach 7 oder 14 Tagen noch online sind. */
@Controller('follow-ups')
@UseGuards(ActorContextGuard)
@UseInterceptors(ResponseEnvelopeInterceptor)
export class FollowUpsController {
  constructor(private readonly followUps: FollowUpService) {}

  @Get()
  async list(@CurrentActor() actor: ActorContext): Promise<FollowUpCard[]> {
    return this.followUps.listForUser(actor.userId!);
  }
}
