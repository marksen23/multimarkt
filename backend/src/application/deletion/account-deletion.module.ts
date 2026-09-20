import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeletionAuditLogEntity, UserEntity } from '../../infrastructure/database/entities';
import { AccountDeletionService } from './account-deletion.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, DeletionAuditLogEntity])],
  providers: [AccountDeletionService],
  exports: [AccountDeletionService],
})
export class AccountDeletionModule {}
