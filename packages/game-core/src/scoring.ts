import { FinishRule, type ScoreRule } from '@zzjl/contracts';

export type ScoreValidationResult =
  | { valid: true; winner: 'A' | 'B'; pointDifference: number }
  | { valid: false; code: string; message: string };

/**
 * 校验一局比赛是否已经形成合法终局比分。
 *
 * 这里不只判断“较大的一方是否超过目标分”。如果忽略比赛应当在何时结束，
 * 30:20 也可能被误判为合法 21 分制结果。业务层一旦接受这种比分，排名虽然
 * 数学上可以计算，但无法还原真实比赛过程，因此终局规则必须集中在服务端校验。
 *
 * 弃权比分由独立的弃权接口生成，不经过领先两分校验；调用方通过 resultType
 * 区分正常完赛与弃权，避免为了接受弃权而放宽所有正常比分。
 */
export function validateFinalScore(
  teamAScore: number,
  teamBScore: number,
  rule: ScoreRule,
): ScoreValidationResult {
  if (!Number.isInteger(teamAScore) || !Number.isInteger(teamBScore)) {
    return invalid('SCORE_NOT_INTEGER', '比分必须是整数');
  }

  if (teamAScore < 0 || teamBScore < 0) {
    return invalid('SCORE_NEGATIVE', '比分不能为负数');
  }

  if (teamAScore === teamBScore) {
    return invalid('SCORE_TIED', '比赛结束时不能同分');
  }

  const winner = teamAScore > teamBScore ? 'A' : 'B';
  const winningScore = Math.max(teamAScore, teamBScore);
  const losingScore = Math.min(teamAScore, teamBScore);

  if (rule.finishRule === FinishRule.FirstTo) {
    if (winningScore !== rule.scoreTo || losingScore >= rule.scoreTo) {
      return invalid(
        'SCORE_FIRST_TO_INVALID',
        `先到即胜模式必须由一方恰好先得到 ${rule.scoreTo} 分`,
      );
    }
    return valid(winner, winningScore - losingScore);
  }

  const cap = rule.scoreCap;
  if (!Number.isInteger(cap) || cap === undefined || cap <= rule.scoreTo) {
    return invalid('SCORE_CAP_INVALID', '领先两分模式必须配置大于目标分的封顶分');
  }

  if (winningScore > cap || losingScore >= cap) {
    return invalid('SCORE_OVER_CAP', `比分不能超过封顶分 ${cap}`);
  }

  // 对手没有进入平分区时，比赛应在目标分立即结束，例如 21:19。
  if (losingScore <= rule.scoreTo - 2) {
    return winningScore === rule.scoreTo
      ? valid(winner, winningScore - losingScore)
      : invalid('SCORE_SHOULD_HAVE_ENDED', `比赛应在 ${rule.scoreTo} 分时结束`);
  }

  const difference = winningScore - losingScore;

  // 未到封顶分时必须领先两分；22:20 合法，22:21 不合法。
  if (winningScore < cap) {
    return difference === 2
      ? valid(winner, difference)
      : invalid('SCORE_DEUCE_LEAD_INVALID', '平分后必须领先 2 分才能结束');
  }

  /*
   * 到达封顶分时，30:29 因封顶规则合法，30:28 也可能由 28:28 后连得两分产生。
   * 差距超过 2（例如 30:27）说明比赛本应更早结束，不能作为正常完赛比分。
   */
  return difference === 1 || difference === 2
    ? valid(winner, difference)
    : invalid('SCORE_CAP_SEQUENCE_INVALID', '封顶比分与领先两分过程不一致');
}

function valid(winner: 'A' | 'B', pointDifference: number): ScoreValidationResult {
  return { valid: true, winner, pointDifference };
}

function invalid(code: string, message: string): ScoreValidationResult {
  return { valid: false, code, message };
}

