// scheduleBuilder.js — Phase 6a
// ONE shared selector that produces the day's timeline from any data state.
// Replaces the two divergent useMemo builders in FocusHub.jsx and
// CommandCenterView.jsx so they cannot drift.
//
// Two modes:
//   1) Primary: a `cl_schedule/{date}` document exists → start from
//      scheduleDoc.blocks and OVERLAY live data via refId (title/done/etc).
//   2) Fallback: no scheduleDoc yet (legacy day) → reproduce the old merge
//      from cl_events + scheduled cl_personalTasks + calori (read-only).
//
// All view-specific knobs go through `options`, never through duplicated code.

import { parseISO, isValid } from 'date-fns';

/** ISO timestamp → "HH:MM" local. Mirrors the helper both files re-implemented. */
const parseToLocalTime = (timestamp) => {
  if (!timestamp) return '00:00';
  const parsed = parseISO(timestamp);
  if (isValid(parsed)) return parsed.toTimeString().substring(0, 5);
  // Fallback for non-ISO strings like "yyyy-MM-ddTHH:mm" without offset.
  return timestamp.substring(11, 16);
};

/** Compute end "HH:MM" given start "HH:MM" + duration in minutes.
 *  FIX: clamps to 23:59 instead of wrapping past midnight. The accordion has
 *  no concept of multi-day blocks; a wrap would silently swap to a 23-hour
 *  block in validateAndRepair. Better to truncate visibly. */
const addMinutes = (hhmm, mins) => {
  const [h, m] = hhmm.split(':').map(Number);
  const total = h * 60 + m + mins;
  if (total >= 24 * 60) return '23:59';
  if (total < 0) return '00:00';
  const eh = String(Math.floor(total / 60)).padStart(2, '0');
  const em = String(total % 60).padStart(2, '0');
  return `${eh}:${em}`;
};

const isBreakish = (b) =>
  b.type === 'leisure' ||
  (typeof b.title === 'string' &&
    (b.title.includes('הפסקה') || b.title.toLowerCase().includes('break')));

/** Normalize a block to the canonical shape regardless of which path produced it.
 *  Ensures downstream dispatch (source/refId/isCompleted/isPointEvent/duration)
 *  doesn't depend on whether a scheduleDoc was present. */
const normalizeBlock = (b) => {
  const out = {
    id: b.id,
    source: b.source || 'schedule',
    refId: b.refId ?? null,
    type: b.type,
    title: b.title,
    startTime: b.startTime,
    endTime: b.endTime,
    isLocked: !!b.isLocked,
    isProposed: !!b.isProposed,
    isCompleted: !!b.isCompleted,
    notes: b.notes || '',
  };
  if (b.duration != null) out.duration = b.duration;
  if (b.status != null) out.status = b.status;
  if (b.isPointEvent || ((b.type === 'meal' || b.type === 'reminder') && b.startTime === b.endTime)) {
    out.isPointEvent = true;
  }
  return out;
};

/**
 * Build the day's timeline.
 *
 * @param {object} params
 * @param {object|null} params.scheduleDoc  cl_schedule doc for this date, if any.
 * @param {Array}        params.events       cl_events array (full).
 * @param {Array}        params.personalTasks cl_personalTasks array (full).
 * @param {object|null}  params.calori       { meals, workouts, coachSessions } from store.
 * @param {string}       params.dateStr      'yyyy-MM-dd'.
 * @param {string}       params.todayStr     'yyyy-MM-dd' of LOCAL today.
 * @param {object}       [params.options]
 * @param {boolean}      [options.filterLeisure=true]
 * @param {boolean|'todayOnly'} [options.includeCalori='todayOnly']
 * @returns {Array} blocks sorted by startTime.
 */
export const buildTimeline = ({
  scheduleDoc,
  events = [],
  personalTasks = [],
  calori = null,
  dateStr,
  todayStr,
  options = {},
}) => {
  const filterLeisure = options.filterLeisure !== false; // default true
  const includeCalori = options.includeCalori ?? 'todayOnly';
  const allowCalori =
    includeCalori === true || (includeCalori === 'todayOnly' && dateStr === todayStr);

  // ---------- Primary path: doc-driven ----------
  if (scheduleDoc && Array.isArray(scheduleDoc.blocks) && scheduleDoc.blocks.length > 0) {
    const taskById = new Map((personalTasks || []).map((t) => [t.id, t]));
    const eventById = new Map((events || []).map((e) => [e.id, e]));
    const mealById = new Map(((calori && calori.meals) || []).map((m) => [m.id, m]));
    const workoutById = new Map(((calori && calori.workouts) || []).map((w) => [w.id, w]));

    const out = [];
    for (const raw of scheduleDoc.blocks) {
      const b = { ...raw };
      if (filterLeisure && isBreakish(b)) continue;
      // Mirror the fallback path: hide read-only calori items on a non-today doc.
      if (!allowCalori && (b.source === 'calori_meal' || b.source === 'calori_workout' || b.source === 'calori_coach')) continue;

      // Overlay live data by refId
      if (b.source === 'task' && b.refId) {
        const t = taskById.get(b.refId);
        if (t) {
          b.title = t.title || b.title;
          b.isCompleted = !!t.done;
          // Default to 'planned' so doc-path and fallback-path tasks match.
          b.status = t.status || b.status || 'planned';
          b.notes = t.notes || b.notes || '';
        } else {
          // Task was deleted — drop block
          continue;
        }
      } else if (b.source === 'event' && b.refId) {
        const ev = eventById.get(b.refId);
        if (ev) {
          b.title = ev.title || b.title;
          // Events are inherently locked unless explicitly unlocked.
          if (ev.isLocked !== undefined) b.isLocked = !!ev.isLocked;
          b.notes = ev.notes || b.notes || '';
        } else {
          continue;
        }
      } else if (b.source === 'calori_meal' && b.refId) {
        const m = mealById.get(b.refId);
        if (m) {
          b.title = m.name || b.title;
        } else continue;
      } else if (b.source === 'calori_workout' && b.refId) {
        const w = workoutById.get(b.refId);
        if (w) {
          b.title = w.name || b.title;
        } else continue;
      }
      // FIX: drop blocks lacking a startTime (untrusted AI/Firestore source)
      // before sorting — prevents a TypeError on localeCompare.
      if (typeof b.startTime !== 'string' || typeof b.endTime !== 'string') continue;
      out.push(normalizeBlock(b));
    }
    return out.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  // ---------- Fallback path: legacy reconstruction ----------
  // Mirrors the OLD logic in CommandCenterView.timelineBlocks + FocusHub.todayBlocks.
  const blocks = [];

  for (const ev of events || []) {
    if (!ev.start || !ev.start.startsWith(dateStr)) continue;
    blocks.push({
      id: ev.id,
      source: 'event',
      refId: ev.id,
      type: ev.type || 'event',
      title: ev.title,
      startTime: parseToLocalTime(ev.start),
      endTime: ev.end ? parseToLocalTime(ev.end) : '23:59',
      isLocked: ev.isLocked !== undefined ? !!ev.isLocked : true,
      isProposed: !!ev.isProposed,
      isCompleted: false,
      notes: ev.notes || '',
    });
  }

  for (const t of personalTasks || []) {
    if (t.scheduledDate !== dateStr || !t.scheduledTime) continue;
    const duration = t.scheduledDuration || 60;
    blocks.push({
      id: `task-${t.id}`,
      source: 'task',
      refId: t.id,
      type: t.category === 'personal' ? 'personal' : 'study',
      title: t.title,
      startTime: t.scheduledTime,
      endTime: addMinutes(t.scheduledTime, duration),
      duration,
      isLocked: !!t.isLocked,
      isProposed: false,
      isCompleted: !!t.done,
      status: t.status || 'planned',
      notes: t.notes || '',
    });
  }

  if (allowCalori && calori) {
    for (const meal of calori.meals || []) {
      if (!meal.timestamp) continue;
      const time = parseToLocalTime(meal.timestamp);
      blocks.push({
        id: `meal-${meal.id}`,
        source: 'calori_meal',
        refId: meal.id,
        type: 'meal',
        title: meal.name,
        startTime: time,
        endTime: time,
        isLocked: true,
        isProposed: false,
        isPointEvent: true,
        notes: `${meal.calories ?? ''} kcal | ${meal.protein ?? ''}g protein`,
      });
    }
    for (const w of calori.workouts || []) {
      if (!w.timestamp) continue;
      const time = parseToLocalTime(w.timestamp);
      const duration = w.durationMinutes || 60;
      blocks.push({
        id: `workout-${w.id}`,
        source: 'calori_workout',
        refId: w.id,
        type: 'workout',
        title: w.name,
        startTime: time,
        endTime: addMinutes(time, duration),
        duration,
        isLocked: true,
        isProposed: false,
        notes: `+${w.caloriesBurned ?? 0} kcal | ${duration} min`,
      });
    }
    // Planned Calori workouts (coach_sessions). These are FUTURE sessions with a
    // scheduled time — surface them as locked workout blocks so the day shows
    // "אימון רגליים 17:00" before it's logged. Skip rest days, already-handled
    // statuses, and sessions without a real time-of-day. Also skip a planned
    // session once an actual workout has been logged in the same window — Calori
    // may not flip the session status, so dedupe by time to avoid a double block.
    const toMin = (hhmm) => {
      const [h, m] = String(hhmm).split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const loggedWindows = (calori.workouts || [])
      .filter((w) => w.timestamp)
      .map((w) => {
        const s = toMin(parseToLocalTime(w.timestamp));
        return [s, s + (w.durationMinutes || 60)];
      });
    for (const cs of calori.coachSessions || []) {
      if (!cs.scheduledDate || cs.type === 'rest') continue;
      if (cs.status === 'completed' || cs.status === 'skipped') continue;
      const time = parseToLocalTime(cs.scheduledDate);
      if (time === '00:00') continue; // date-only → no concrete slot to place
      const duration = cs.estimatedDurationMinutes || 60;
      const csStart = toMin(time);
      const csEnd = csStart + duration;
      // Overlaps an already-logged workout → it was (likely) done; don't double up.
      if (loggedWindows.some(([ls, le]) => csStart < le && ls < csEnd)) continue;
      blocks.push({
        id: `coach-${cs.id}`,
        source: 'calori_coach',
        refId: cs.id,
        type: 'workout',
        title: cs.title || 'אימון מתוכנן',
        startTime: time,
        endTime: addMinutes(time, duration),
        duration,
        isLocked: true,
        isProposed: false,
        notes: `${duration} min`,
      });
    }
  }

  const filtered = filterLeisure ? blocks.filter((b) => !isBreakish(b)) : blocks;
  // Normalize so the doc and fallback paths produce IDENTICAL shapes.
  return filtered
    .map(normalizeBlock)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
};
