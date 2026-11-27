import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EbayConnectionEntity, EbayOauthStateEntity } from '../../infrastructure/database/entities';
import { EbaySetupClient } from '../../marketplaces/ebay/ebay-setup.client';
import { EbaySetupService } from './ebay-setup.service';
import { EbaySetupStore, TypeOrmEbaySetupStore } from './ebay-setup.store';

@Module({
  imports: [TypeOrmModule.forFeature([EbayConnectionEntity, EbayOauthStateEntity])],
  providers: [
    EbaySetupClient,
    TypeOrmEbaySetupStore,
    { provide: EbaySetupStore, useExisting: TypeOrmEbaySetupStore },
    EbaySetupService,
  ],
  exports: [EbaySetupService],
})
export class EbaySetupModule {}
