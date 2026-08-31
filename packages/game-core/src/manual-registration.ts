import { Gender, type ManualParticipantDraft } from '@zzjl/contracts';

export interface ManualRosterIssue { index: number; field: 'participantNumber' | 'nickname' | 'gender' | 'level'; code: string; message: string; }
export interface ManualRosterValidation { valid: boolean; issues: ManualRosterIssue[]; normalized: ManualParticipantDraft[]; }

/**
 * 校验并标准化组织者录入名单。编号与昵称都按去空格、大小写不敏感规则判重，
 * 但保留原始大小写展示；数据库身份仍使用服务端 participantId，避免修改编号或
 * 昵称后破坏历史对阵、比分和积分关联。
 */
export function validateManualRoster(entries: readonly ManualParticipantDraft[]): ManualRosterValidation {
  const issues: ManualRosterIssue[] = [];
  const seenNumbers = new Map<string, number>(); const seenNicknames = new Map<string, number>();
  const normalized = entries.map((entry, index) => {
    const participantNumber = entry.participantNumber.trim(); const nickname = entry.nickname.trim(); const level = entry.level?.trim() || undefined;
    validateUnique(participantNumber, index, seenNumbers, () => issues.push(issue(index, 'participantNumber', 'NUMBER_DUPLICATED', '编号重复')));
    validateUnique(nickname, index, seenNicknames, () => issues.push(issue(index, 'nickname', 'NICKNAME_DUPLICATED', '昵称重复')));
    if (participantNumber.length < 1 || participantNumber.length > 20) issues.push(issue(index, 'participantNumber', 'NUMBER_LENGTH_INVALID', '编号长度应为 1～20 个字符'));
    if (nickname.length < 1 || nickname.length > 20) issues.push(issue(index, 'nickname', 'NICKNAME_LENGTH_INVALID', '昵称长度应为 1～20 个字符'));
    if (entry.gender !== Gender.Male && entry.gender !== Gender.Female) issues.push(issue(index, 'gender', 'GENDER_REQUIRED', '请选择性别'));
    if (level && level.length > 30) issues.push(issue(index, 'level', 'LEVEL_LENGTH_INVALID', '水平说明不能超过 30 个字符'));
    return { participantNumber, nickname, gender: entry.gender, level };
  });
  return { valid: issues.length === 0, issues, normalized };
}

function validateUnique(value: string, index: number, seen: Map<string, number>, duplicated: () => void): void {
  if (!value) return; const key = value.toLocaleLowerCase('zh-CN'); const first = seen.get(key);
  if (first !== undefined) duplicated(); else seen.set(key, index);
}
function issue(index: number, field: ManualRosterIssue['field'], code: string, message: string): ManualRosterIssue { return { index, field, code, message }; }
