import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnkaufProfileService } from '../../application/ankauf/ankauf-profile.service';
import type {
  AnkaufResearchResult,
  AnkaufSearchProfile,
  AnkaufSearchSummary,
} from '../../domain/ankauf/ankauf.types';
import type { ActorContext } from '../../domain/actor-context';
import { CurrentActor } from '../auth/actor.decorator';
import { ActorContextGuard } from '../auth/actor-context.guard';
import { AnkaufSearchRequestDto, UpdateAnkaufProfileDto } from '../dto/ankauf.dto';
import { ResponseEnvelopeInterceptor } from '../interceptors/response-envelope.interceptor';

/** Feature-Plan 2.6 — Ankaufsuche an PLZ und Umkreis des Nutzers. */
@Controller('ankauf')
@UseGuards(ActorContextGuard)
@UseInterceptors(ResponseEnvelopeInterceptor)
export class AnkaufController {
  constructor(private readonly profile: AnkaufProfileService) {}

  @Get('profile')
  getProfile(@CurrentActor() actor: ActorContext): Promise<AnkaufSearchProfile> {
    return this.profile.getProfile(actor.userId!);
  }

  @Patch('profile')
  updateProfile(
    @Body() dto: UpdateAnkaufProfileDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<AnkaufSearchProfile> {
    return this.profile.updateProfile(actor.userId!, dto);
  }

  @Get('searches')
  list(@CurrentActor() actor: ActorContext): Promise<AnkaufSearchSummary[]> {
    return this.profile.list(actor.userId!);
  }

  @Get('searches/:id')
  open(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<AnkaufResearchResult> {
    return this.profile.open(actor.userId!, id);
  }

  @Post('search')
  @HttpCode(200)
  search(
    @Body() body: AnkaufSearchRequestDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<AnkaufResearchResult> {
    return this.profile.search(actor.userId!, body.keywords ?? '');
  }
}
