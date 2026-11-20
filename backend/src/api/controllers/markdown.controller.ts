import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { MarkdownService } from '../../application/markdown/markdown.service';
import {
  ItemMarkdownView,
  MarkdownSettingsView,
  MarkdownTaskView,
  TaskActionResult,
} from '../../application/markdown/markdown.store';
import { AttentionCard } from '../../domain/pricing/markdown-plan';
import { ActorContext } from '../../domain/actor-context';
import { HumanGateBypassException } from '../../domain/errors/state-transition.errors';
import { CurrentActor } from '../auth/actor.decorator';
import { ActorContextGuard } from '../auth/actor-context.guard';
import { UpdateItemMarkdownDto, UpdateMarkdownSettingsDto } from '../dto/markdown.dto';
import { ResponseEnvelopeInterceptor } from '../interceptors/response-envelope.interceptor';

@Controller()
@UseGuards(ActorContextGuard)
@UseInterceptors(ResponseEnvelopeInterceptor)
export class MarkdownController {
  constructor(private readonly markdown: MarkdownService) {}

  @Get('account/markdown-settings')
  settings(@CurrentActor() actor: ActorContext): Promise<MarkdownSettingsView> {
    return this.markdown.settings(actor.userId!);
  }

  @Patch('account/markdown-settings')
  saveSettings(
    @Body() dto: UpdateMarkdownSettingsDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<MarkdownSettingsView> {
    this.requireUser(actor);
    return this.markdown.saveSettings(actor.userId!, dto);
  }

  @Get('markdown/attention')
  attention(@CurrentActor() actor: ActorContext): Promise<AttentionCard[]> {
    return this.markdown.attention(actor.userId!);
  }

  @Get('markdown/tasks')
  tasks(@CurrentActor() actor: ActorContext): Promise<MarkdownTaskView[]> {
    return this.markdown.tasks(actor.userId!);
  }

  @Post('markdown/tasks/:id/confirm')
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<TaskActionResult> {
    this.requireUser(actor);
    return this.markdown.confirmTask(actor.userId!, id);
  }

  @Post('markdown/tasks/:id/dismiss')
  dismiss(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<TaskActionResult> {
    this.requireUser(actor);
    return this.markdown.dismissTask(actor.userId!, id);
  }

  @Get('items/:id/markdown')
  forItem(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentActor() actor: ActorContext,
  ): Promise<ItemMarkdownView> {
    return this.markdown.forItem(actor.userId!, id);
  }

  @Patch('items/:id/markdown')
  savePlan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateItemMarkdownDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<ItemMarkdownView> {
    this.requireUser(actor);
    return this.markdown.savePlan(actor.userId!, id, {
      status: dto.status,
      percent: dto.percent ?? null,
      intervalDays: dto.intervalDays ?? null,
      floorPrice: dto.floorPrice ?? null,
    });
  }

  private requireUser(actor: ActorContext): void {
    if (actor.type !== 'USER') {
      throw new HumanGateBypassException('Nur du kannst die Preissenkung ändern.');
    }
  }
}
