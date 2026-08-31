import { FinishRule } from '@zzjl/contracts';
import { IsEnum, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ValidateScoreDto {
  @IsInt() @Min(0) @Max(31) teamAScore!: number;
  @IsInt() @Min(0) @Max(31) teamBScore!: number;
  @IsIn([11, 15, 21, 31]) scoreTo!: 11 | 15 | 21 | 31;
  @IsEnum(FinishRule) finishRule!: FinishRule;
  @IsOptional() @IsInt() @Min(12) @Max(31) scoreCap?: number;
}
