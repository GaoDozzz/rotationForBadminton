import { Injectable } from '@nestjs/common';
import { validateFinalScore, type ScoreValidationResult } from '@zzjl/game-core';
import type { ValidateScoreDto } from './validate-score.dto';

@Injectable()
export class RulesService {
  validateScore(dto: ValidateScoreDto): ScoreValidationResult {
    return validateFinalScore(dto.teamAScore, dto.teamBScore, {
      scoreTo: dto.scoreTo,
      finishRule: dto.finishRule,
      scoreCap: dto.scoreCap,
    });
  }
}

