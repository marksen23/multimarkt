import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  NEGOTIATION_PLATFORMS,
  NegotiationPlatform,
} from '../../domain/negotiation/negotiation';

/** Eingefügte Käufernachricht. Es wird nichts an ein Portal geschickt. */
export class SuggestNegotiationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message: string;

  @IsOptional()
  @IsIn(NEGOTIATION_PLATFORMS)
  platform?: NegotiationPlatform;
}
