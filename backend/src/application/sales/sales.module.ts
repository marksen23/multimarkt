import { Module } from '@nestjs/common';
import { SaleCloseoutService } from './sale-closeout.service';
import { SalesOverviewService } from './sales-overview.service';

@Module({
  providers: [SaleCloseoutService, SalesOverviewService],
  exports: [SaleCloseoutService, SalesOverviewService],
})
export class SalesModule {}
