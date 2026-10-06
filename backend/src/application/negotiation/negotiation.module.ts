import { Module } from '@nestjs/common';
import { PriceTriangulationModule } from '../pricing/price-triangulation.module';
import { NegotiationService } from './negotiation.service';

@Module({
  imports: [PriceTriangulationModule],
  providers: [NegotiationService],
  exports: [NegotiationService],
})
export class NegotiationModule {}
