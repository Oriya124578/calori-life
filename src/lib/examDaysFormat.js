import { differenceInCalendarDays, startOfDay, parseISO, isValid } from 'date-fns';

/** Parse an exam-date value (ISO string or Date-ish) into a Date, or null. */
export const parseExamDate = (raw) => {
  if (!raw) return null;
  const dt = typeof raw === 'string' ? parseISO(raw) : new Date(raw);
  return isValid(dt) ? dt : null;
};

/**
 * Whole calendar-day distance from `from` to an exam date — ignores time-of-day
 * on BOTH ends, so a 09:00 Friday exam is still "2 days away" on Wednesday
 * evening instead of dropping to "1 day" the moment Wednesday's clock passes
 * 09:00. Use this (never `differenceInDays`, which is elapsed-hours-based)
 * anywhere an exam countdown is shown so every screen agrees.
 */
export const daysUntilExam = (raw, from = new Date()) => {
  const dt = parseExamDate(raw);
  if (!dt) return null;
  return differenceInCalendarDays(startOfDay(dt), startOfDay(from));
};

/**
 * Every upcoming (today or later) exam for one course — both moedA/B/C and
 * customExams — nearest first. Past exams are dropped.
 */
export const collectCourseExams = (course, from = new Date()) => {
  if (!course) return [];
  const exams = [];
  ['moedA', 'moedB', 'moedC'].forEach((moed) => {
    const raw = course[moed] || course.exams?.[moed];
    const dt = parseExamDate(raw);
    if (!dt) return;
    const days = daysUntilExam(raw, from);
    if (days === null || days < 0) return;
    exams.push({
      courseId: course.id, courseName: course.name,
      moed: moed.replace('moed', ''), type: moed, custom: false,
      date: dt, days, hasTime: typeof raw === 'string' && raw.includes('T'),
    });
  });
  (course.customExams || []).forEach((exam) => {
    const dt = parseExamDate(exam.date);
    if (!dt) return;
    const days = daysUntilExam(exam.date, from);
    if (days === null || days < 0) return;
    exams.push({
      courseId: course.id, courseName: course.name,
      moed: exam.name, type: 'custom', custom: true,
      date: dt, days, hasTime: typeof exam.date === 'string' && exam.date.includes('T'),
    });
  });
  return exams.sort((a, b) => a.date.getTime() - b.date.getTime());
};

/**
 * Every upcoming exam across all non-archived courses, nearest first.
 * Deliberately NOT filtered by "active academic year/semester" — an exam is
 * real regardless of which semester tag happens to sit on the course record
 * (older/migrated courses often have neither set), and every screen that
 * shows exams must agree on the same set or their countdowns disagree.
 */
export const collectUpcomingExams = (courses, from = new Date()) => {
  const exams = [];
  (courses || []).forEach((course) => {
    if (course.isArchived) return;
    exams.push(...collectCourseExams(course, from));
  });
  return exams.sort((a, b) => a.date.getTime() - b.date.getTime());
};

/** The single nearest upcoming exam across all courses, or null. */
export const getNearestExam = (courses, from = new Date()) =>
  collectUpcomingExams(courses, from)[0] || null;

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
