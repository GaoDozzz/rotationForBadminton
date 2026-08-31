import { Body, Controller, Inject, Post } from '@nestjs/common';
import type { ScoreValidationResult } from '@zzjl/game-core';
import { RulesService } from './rules.service';
import { ValidateScoreDto } from './validate-score.dto';

@Controller('rules')
export class RulesController {
  /**
   * The development server uses tsx/esbuild for fast reloads. Unlike tsc, esbuild does
   * not emit TypeScript's design:paramtypes metadata, so relying on an inferred constructor
   * type makes Nest inject undefined in development while the production build still works.
   * An explicit token keeps dependency injection identical in both execution modes.
   */
  constructor(@Inject(RulesService) private readonly rulesService: RulesService) {}

  /**
   * 为计分器提供与服务端一致的终局预校验，减少用户提交后才发现比分无效。
   * 正式的比分提交接口仍会再次调用同一领域函数；不能因为客户端调用过此接口
   * 就跳过服务端校验，否则攻击者可以直接绕过小程序提交非法比分。
   */
  @Post('score/validate')
  validateScore(@Body() dto: ValidateScoreDto): ScoreValidationResult {
    return this.rulesService.validateScore(dto);
  }
}

