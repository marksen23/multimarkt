import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ANKAUF_RADIUS_OPTIONS_KM } from '../../domain/ankauf/search-place';

export class UpdateAnkaufProfileDto {
  @IsString()
  @Matches(/^\d{5}$/, { message: 'Die PLZ braucht fünf Ziffern.' })
  postalCode: string;

  @IsInt()
  @IsIn([...ANKAUF_RADIUS_OPTIONS_KM], { message: 'Dieser Umkreis ist nicht vorgesehen.' })
  radiusKm: number;
}

export class AnkaufSearchRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  keywords?: string;
}
