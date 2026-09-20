import { Controller, Get, NotFoundException, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { CurrentActor } from '../auth/actor.decorator';
import { ActorContextGuard } from '../auth/actor-context.guard';
import { ResponseEnvelopeInterceptor } from '../interceptors/response-envelope.interceptor';
import { ActorContext } from '../../domain/actor-context';
import { AccountDeletionService } from '../../application/deletion/account-deletion.service';
import { DeletionAuditLogEntity } from '../../infrastructure/database/entities';

/** Doc 04 §16 — Hard-Delete-Lifecycle (Doc 01 §15). */
@Controller('account')
@UseGuards(ActorContextGuard)
@UseInterceptors(ResponseEnvelopeInterceptor)
export class AccountController {
  constructor(private readonly deletionService: AccountDeletionService) {}

  @Post('deletion-request')
  async requestDeletion(@CurrentActor() actor: ActorContext): Promise<DeletionAuditLogEntity> {
    return this.deletionService.requestDeletion(actor.userId!);
  }

  @Get('deletion-status/:anonymizedUserHash')
  async deletionStatus(
    @Param('anonymizedUserHash') hash: string,
  ): Promise<DeletionAuditLogEntity> {
    const status = await this.deletionService.getDeletionStatus(hash);
    if (!status) throw new NotFoundException('No deletion record found for this hash');
    return status;
  }
}
