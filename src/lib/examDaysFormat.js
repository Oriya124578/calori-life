/**
 * Unified "days until exam" formatter.
 * 
 * Returns a human-friendly label for exam countdown:
 *   0 → "היום" / "Today"
 *   1 → "מחר" / "Tomorrow"
 *   2 → "מחרתיים" / "In 2 days"
 *   N → "בעוד N ימים" / "In N days"
 */
export const formatExamDays = (days, isRTL = true) => {
  if (days <= 0) return isRTL ? 'היום' : 'Today';
  if (days === 1) return isRTL ? 'מחר' : 'Tomorrow';
  if (days === 2) return isRTL ? 'מחרתיים' : 'In 2 days';
  return isRTL ? `בעוד ${days} ימים` : `In ${days} days`;
};

/**
 * Short label for compact badges (number + subtitle).
 * Returns { number, label }.
 *   0 → { number: '!', label: 'היום' / 'Today' }
 *   1 → { number: '1', label: 'מחר' / 'Tomorrow' }
 *   2 → { number: '2', label: 'מחרתיים' / 'Day after' }
 *   N → { number: N, label: 'ימים' / 'days' }
 */
export const formatExamDaysBadge = (days, isRTL = true) => {
  if (days <= 0) return { number: '!', label: isRTL ? 'היום' : 'Today' };
  if (days === 1) return { number: '1', label: isRTL ? 'מחר' : 'Tomorrow' };
  if (days === 2) return { number: '2', label: isRTL ? 'מחרתיים' : 'Day after' };
  return { number: String(days), label: isRTL ? 'ימים' : 'days' };
};
