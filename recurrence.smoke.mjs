// Phase 6d smoke test for recurrence helpers. Run: `node recurrence.smoke.mjs`
import { recurrenceMatches, recurringInstancesForDate, generateFutureInstances } from './src/lib/recurrence.js';

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name); }
};

const d = (s) => {
  const [y, m, day] = s.split('-').map(Number);
  return new Date(y, m - 1, day);
};

console.log('-- daily --');
const daily = {
  recurrence: {
    type: 'daily',
    interval: 1,
    startDate: '2026-01-01',
    active: true
  }
};
ok('daily fires on start',        recurrenceMatches(daily, d('2026-01-01')) === true);
ok('daily fires next day',        recurrenceMatches(daily, d('2026-01-02')) === true);
ok('daily rejects before start',  recurrenceMatches(daily, d('2025-12-31')) === false);
const daily3 = {
  recurrence: {
    ...daily.recurrence,
    interval: 3
  }
};
ok('every 3 days hits day 3',     recurrenceMatches(daily3, d('2026-01-04')) === true);
ok('every 3 days skips day 2',    recurrenceMatches(daily3, d('2026-01-03')) === false);

console.log('-- weekly --');
// 2026-01-04 is a Sunday. byWeekday=[1] (Monday)
const weekly = {
  recurrence: {
    type: 'weekly',
    interval: 1,
    byWeekday: [1],
    startDate: '2026-01-04',
    active: true
  }
};
ok('weekly hits Monday',          recurrenceMatches(weekly, d('2026-01-05')) === true);
ok('weekly skips Tuesday',        recurrenceMatches(weekly, d('2026-01-06')) === false);
ok('weekly hits next Monday',     recurrenceMatches(weekly, d('2026-01-12')) === true);

console.log('-- monthly --');
const monthly = {
  recurrence: {
    type: 'monthly',
    interval: 1,
    startDate: '2026-01-15',
    active: true
  }
};
ok('monthly hits 15th',           recurrenceMatches(monthly, d('2026-02-15')) === true);
ok('monthly skips 14th',          recurrenceMatches(monthly, d('2026-02-14')) === false);

console.log('-- skips/endDate/active --');
const dailyWithSkips = {
  recurrence: {
    ...daily.recurrence,
    skips: { '2026-01-02': true }
  }
};
ok('skip wins',                   recurrenceMatches(dailyWithSkips, d('2026-01-02')) === false);

const dailyWithEndDate = {
  recurrence: {
    ...daily.recurrence,
    endDate: '2026-01-03'
  }
};
ok('endDate excludes after',      recurrenceMatches(dailyWithEndDate, d('2026-01-04')) === false);

const dailyInactive = {
  recurrence: {
    ...daily.recurrence,
    active: false
  }
};
ok('inactive never fires',        recurrenceMatches(dailyInactive, d('2026-01-01')) === false);

console.log('-- instances for date --');
const rules = [
  {
    id: 'r1',
    title: 'Meds',
    recurrence: {
      type: 'daily',
      interval: 1,
      startDate: '2026-01-01',
      active: true,
      time: '08:00',
      durationMinutes: 15
    }
  },
  {
    id: 'r2',
    title: 'Run',
    recurrence: {
      type: 'daily',
      interval: 1,
      startDate: '2026-01-01',
      active: true,
      time: null,
      durationMinutes: 30
    }
  }, // skipped: no time
  {
    id: 'r3',
    title: 'Done',
    recurrence: {
      type: 'daily',
      interval: 1,
      startDate: '2026-01-01',
      active: true,
      time: '09:00',
      durationMinutes: 15,
      completions: { '2026-01-02': { done: true } }
    }
  },
  {
    id: 'r4',
    title: 'Exceptions',
    recurrence: {
      type: 'daily',
      interval: 1,
      startDate: '2026-01-01',
      active: true,
      time: '10:00',
      durationMinutes: 30,
      exceptions: { '2026-01-02': { time: '11:00', durationMinutes: 45 } }
    }
  },
];
const insts = recurringInstancesForDate(rules, '2026-01-02');
ok('only timed, uncompleted rules produce instances', insts.length === 2);
if (insts.length >= 2) {
  ok('instance is locked',          insts[0].isLocked === true);
  ok('instance source is recurring',insts[0].source === 'task'); // source is 'task' in recurrence.js
  ok('instance id is deterministic',insts[0].id === 'recur-r1-2026-01-02');
  ok('exception overrides time',    insts[1].startTime === '11:00');
  ok('exception overrides duration',insts[1].duration === 45);
} else {
  fail++;
  console.log('  FAIL instance array too short');
}

console.log('-- generate future instances --');
const futureRules = {
  recurrence: {
    type: 'daily',
    interval: 1,
    startDate: '2026-01-01',
    active: true
  }
};
const futures = generateFutureInstances(futureRules, 3, d('2026-01-02'));
ok('generates count instances', futures.length === 3);
ok('generates correct dates', futures[0] === '2026-01-02' && futures[1] === '2026-01-03' && futures[2] === '2026-01-04');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
