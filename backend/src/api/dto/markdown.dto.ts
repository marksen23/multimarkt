import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { MARKDOWN_STATUSES, MarkdownStatus } from '../../domain/pricing/markdown-plan';

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  return Number(value);
}

export class UpdateMarkdownSettingsDto {
  @IsBoolean({ message: 'Die automatische Senkung ist an oder aus.' })
  enabled: boolean;

  @Type(() => Number)
  @IsNumber({}, { message: 'Der Prozentsatz muss eine Zahl sein.' })
  @Min(1, { message: 'Die Senkung muss mindestens 1 % sein.' })
  @Max(90, { message: 'Die Senkung darf höchstens 90 % sein.' })
  percent: number;

  @Type(() => Number)
  @IsInt({ message: 'Die Tage müssen eine ganze Zahl sein.' })
  @Min(1, { message: 'Der Abstand muss mindestens 1 Tag sein.' })
  @Max(90, { message: 'Der Abstand darf höchstens 90 Tage sein.' })
  intervalDays: number;

  @Type(() => Number)
  @IsInt({ message: 'Die Wiedervorlage muss eine ganze Zahl von Tagen sein.' })
  @Min(7, { message: 'Die Wiedervorlage beginnt frühestens nach 7 Tagen.' })
  @Max(180, { message: 'Die Wiedervorlage liegt höchstens bei 180 Tagen.' })
  attentionAfterDays: number;
}

export class UpdateItemMarkdownDto {
  @IsIn(MARKDOWN_STATUSES, { message: 'Der Status muss Vorgabe, an, pausiert oder gestoppt sein.' })
  status: MarkdownStatus;

  @Transform(({ value }) => nullableNumber(value))
  @IsOptional()
  @IsNumber({}, { message: 'Der Prozentsatz muss eine Zahl sein.' })
  @Min(1, { message: 'Die Senkung muss mindestens 1 % sein.' })
  @Max(90, { message: 'Die Senkung darf höchstens 90 % sein.' })
  percent?: number | null;

  @Transform(({ value }) => nullableNumber(value))
  @IsOptional()
  @IsInt({ message: 'Die Tage müssen eine ganze Zahl sein.' })
  @Min(1, { message: 'Der Abstand muss mindestens 1 Tag sein.' })
  @Max(90, { message: 'Der Abstand darf höchstens 90 Tage sein.' })
  intervalDays?: number | null;

  @Transform(({ value }) => nullableNumber(value))
  @IsOptional()
  @IsNumber({}, { message: 'Der Mindestpreis muss eine Zahl sein.' })
  @Min(0.01, { message: 'Der Mindestpreis muss über 0 € liegen.' })
  @Max(1_000_000, { message: 'Der Mindestpreis ist zu hoch.' })
  floorPrice?: number | null;
}
