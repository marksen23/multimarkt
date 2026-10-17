import { IsIn, IsNumber, IsPositive, IsString, MinLength } from 'class-validator';
import { DispositionUserGoal } from '../../application/disposition/disposition-engine.service';

const USER_GOALS: DispositionUserGoal[] = ['MAX_PROFIT', 'BALANCED', 'FAST_SALE', 'MINIMAL_EFFORT'];

export class EvaluateDispositionDto {
  @IsString()
  @MinLength(1)
  category: string;

  @IsNumber()
  @IsPositive()
  marketMedianPrice: number;

  @IsIn(USER_GOALS)
  userGoal: DispositionUserGoal;
}
