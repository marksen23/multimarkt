import { Module } from '@nestjs/common';
import { DispositionEngineService } from './disposition-engine.service';

@Module({
  providers: [DispositionEngineService],
  exports: [DispositionEngineService],
})
export class DispositionEngineModule {}
