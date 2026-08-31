import type { MatchFormat, ScoreRule } from '@zzjl/contracts';

export interface ConfirmedMatch {
  id: string;
  format: MatchFormat;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  teamAScore: number;
  teamBScore: number;
  scoreRule: ScoreRule;
  resultType?: 'NORMAL' | 'WALKOVER';
}

export interface RankingEntry {
  participantId: string;
  rank: number;
  points: number;
  wins: number;
  losses: number;
  scored: number;
  conceded: number;
  matchesPlayed: number;
}

