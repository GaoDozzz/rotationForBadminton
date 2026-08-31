export const MAX_DRAFTS_PER_USER = 3;

/**
 * A draft update does not consume a new slot. Only creation is rejected when the
 * current local user already owns three drafts. The backend must enforce the same
 * rule by organizer userId after WeChat authentication is connected; local storage
 * enforcement is an immediate UX guard, not a security boundary.
 */
export function canSaveDraft(existingIds: readonly string[], editingId?: string): boolean {
  if (editingId && existingIds.includes(editingId)) return true;
  return existingIds.length < MAX_DRAFTS_PER_USER;
}

