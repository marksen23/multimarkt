import { Body, Controller, Get, NotFoundException, Param, Patch, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CurrentActor } from '../auth/actor.decorator';
import { ActorContextGuard } from '../auth/actor-context.guard';
import { ResponseEnvelopeInterceptor } from '../interceptors/response-envelope.interceptor';
import { UpdateMarginAssumptionsDto } from '../dto/margin-assumptions.dto';
import { ActorContext } from '../../domain/actor-context';
import { roundMoney } from '../../domain/pricing/expected-margin';
import { AccountDeletionService } from '../../application/deletion/account-deletion.service';
import { DeletionAuditLogEntity, UserEntity } from '../../infrastructure/database/entities';

export interface MarginAssumptionsView {
  feePercent: number;
  shippingEur: number;
  singleSaleThresholdEur: number | null;
}

/** Doc 04 §16 — Hard-Delete-Lifecycle (Doc 01 §15). */
@Controller('account')
@UseGuards(ActorContextGuard)
@UseInterceptors(ResponseEnvelopeInterceptor)
export class AccountController {
  constructor(
    private readonly deletionService: AccountDeletionService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get('margin-assumptions')
  async getMarginAssumptions(@CurrentActor() actor: ActorContext): Promise<MarginAssumptionsView> {
    const user = await this.requireUser(actor.userId!);
    return this.toAssumptions(user);
  }

  @Patch('margin-assumptions')
  async updateMarginAssumptions(
    @Body() dto: UpdateMarginAssumptionsDto,
    @CurrentActor() actor: ActorContext,
  ): Promise<MarginAssumptionsView> {
    const user = await this.requireUser(actor.userId!);
    user.feePercent = roundMoney(dto.feePercent);
    user.shippingEur = roundMoney(dto.shippingEur);
    user.singleSaleThresholdEur =
      dto.singleSaleThresholdEur == null ? null : roundMoney(dto.singleSaleThresholdEur);
    await this.dataSource.manager.save(user);
    return this.toAssumptions(user);
  }

  private async requireUser(userId: string): Promise<UserEntity> {
    const user = await this.dataSource.manager.findOneBy(UserEntity, { id: userId });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private toAssumptions(user: UserEntity): MarginAssumptionsView {
    return {
      feePercent: user.feePercent,
      shippingEur: user.shippingEur,
      singleSaleThresholdEur: user.singleSaleThresholdEur,
    };
  }

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
