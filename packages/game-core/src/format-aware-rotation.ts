import { MatchFormat } from '@zzjl/contracts';
import { generateBalancedFreeRotation } from './balanced-rotation';
import { generateMixedDoublesRotation } from './mixed-rotation';
import type { GenerateRotationInput, RotationSchedule } from './rotation';

/** 根据比赛形式选择单打、普通双打或严格混双排阵器。 */
export function generateFormatAwareRotation(input: GenerateRotationInput): RotationSchedule {
  return input.format === MatchFormat.MixedDoubles
    ? generateMixedDoublesRotation(input)
    : generateBalancedFreeRotation(input);
}
