// Phase 6d: Pure helpers for recurring task rules on personalTasks.
//
// A recurring task rule lives in users/{uid}/cl_personalTasks/{id} with shape:
//   {
//     title: string,
//     recurrence: {
//       type: 'daily'|'weekly'|'monthly',
//       interval: number,
//       byWeekday: number[]|null,
//       byMonthday: number[]|null,
//       startDate: 'yyyy-MM-dd',
//       endDate: 'yyyy-MM-dd'|null,
//       time: 'HH:MM'|null,
//       durationMinutes: number,
//       exceptions: { 'yyyy-MM-dd': { time, durationMinutes } },
//       skips: { 'yyyy-MM-dd': true }
//     }
//   }

const parseLocalDate = (s) => {
  if (!s || typeof s !== 'string') return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const toDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const daysBetween = (a, b) => {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / 86400000);
};

const monthsBetween = (a, b) => {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
};

export const recurrenceMatches = (task, date) => {
  if (!task || !task.recurrence || !date) return false;
  
  const rec = task.recurrence;
  if (rec.active === false) return false;
  
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const start = parseLocalDate(rec.startDate);
  if (!start) return false;
  if (target < start) return false;

  if (rec.endDate) {
    const end = parseLocalDate(rec.endDate);
    if (end && target > end) return false;
  }

  const key = toDateKey(target);
  if (rec.skips && rec.skips[key]) return false;

  const interval = Math.max(1, Number(rec.interval) || 1);
  const type = rec.type || 'daily';

  if (type === 'daily') {
    const diff = daysBetween(start, target);
    return diff >= 0 && diff % interval === 0;
  }

  if (type === 'weekly') {
    const weekday = target.getDay();
    if (Array.isArray(rec.byWeekday) && rec.byWeekday.length > 0) {
      if (!rec.byWeekday.includes(weekday)) return false;
    } else {
      if (weekday !== start.getDay()) return false;
    }
    const startWeek = new Date(start);
    startWeek.setDate(start.getDate() - start.getDay());
    const targetWeek = new Date(target);
    targetWeek.setDate(target.getDate() - target.getDay());
    const weekDiff = Math.round(daysBetween(startWeek, targetWeek) / 7);
    return weekDiff >= 0 && weekDiff % interval === 0;
  }

  if (type === 'monthly') {
    const day = target.getDate();
    if (Array.isArray(rec.byMonthday) && rec.byMonthday.length > 0) {
      if (!rec.byMonthday.includes(day)) return false;
    } else {
      if (day !== start.getDate()) return false;
    }
    const monthDiff = monthsBetween(start, target);
    return monthDiff >= 0 && monthDiff % interval === 0;
  }

  return false;
};

export const generateFutureInstances = (task, count, fromDate = new Date()) => {
  if (!task || !task.recurrence) return [];
  const instances = [];
  const current = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  
  let iterationLimit = 365 * 5;
  let iterations = 0;
  
  while (instances.length < count && iterations < iterationLimit) {
    if (recurrenceMatches(task, current)) {
      instances.push(toDateKey(current));
    }
    current.setDate(current.getDate() + 1);
    iterations++;
  }
  
  return instances;
};

export const recurringInstancesForDate = (personalTasks, dateStr) => {
  if (!Array.isArray(personalTasks) || !dateStr) return [];
  const date = parseLocalDate(dateStr);
  if (!date) return [];

  const out = [];
  for (const task of personalTasks) {
    if (!task || !task.recurrence) continue;
    
    // If the task has a specific exception that spawns a detached task, we assume the skip
    // logic handles hiding the recurrence here because we added it to `skips` when detaching.
    
        if (!recurrenceMatches(task, date)) continue;

    const rec = task.recurrence;
    if (rec.completions && rec.completions[dateStr] && rec.completions[dateStr].done) continue;
    
    let time = rec.time;
    let durationMinutes = rec.durationMinutes;

    if (rec.exceptions && rec.exceptions[dateStr]) {
      const exception = rec.exceptions[dateStr];
      if (exception.time !== undefined) time = exception.time;
      if (exception.durationMinutes !== undefined) durationMinutes = exception.durationMinutes;
    }

    if (!time) continue;

    const duration = Math.max(1, Number(durationMinutes) || 30);
    const [hh, mm] = time.split(':').map(Number);
    const startMin = hh * 60 + mm;
    const endMin = Math.min(startMin + duration, 24 * 60 - 1);
    const endHH = String(Math.floor(endMin / 60)).padStart(2, '0');
    const endMM = String(endMin % 60).padStart(2, '0');

    out.push({
      id: `recur-${task.id}-${dateStr}`,
      source: 'task', // Unified with tasks
      refId: task.id,
      type: 'task',
      title: task.title || '',
      startTime: time,
      endTime: `${endHH}:${endMM}`,
      duration,
      isLocked: true,
      isCompleted: false,
      status: 'planned',
      isProposed: false,
      notes: task.notes || '',
    });
  }
  return out;
};
