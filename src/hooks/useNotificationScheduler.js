// ─────────────────────────────────────────────────────────────────────────────
// Notification scheduler (Phase 5a).
//
// Runs while the app is open (foreground OR backgrounded tab) and fires local
// reminders for exams, personal tasks, events, and a daily digest, according to
// the user's notificationSettings. Already-fired reminders are deduped via
// localStorage so a reminder shows at most once.
//
// Limitation (by design for 5a): reminders only fire while a tab is alive.
// Phase 5b (FCM + Cloud Function) will add true closed-app delivery.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import { useStore, isTaskIncludedInProgress } from '../store/useStore';
import { useTranslation } from './useTranslation';
import { showLocalNotification, getNotificationPermission } from '../lib/notifications';

const FIRED_KEY = 'notifFiredKeys';
const CHECK_INTERVAL_MS = 60 * 1000; // re-evaluate every minute
const FIRE_WINDOW_MS = 5 * 60 * 1000; // fire if we're within 5 min past target

const loadFired = () => {
  try { return new Set(JSON.parse(localStorage.getItem(FIRED_KEY) || '[]')); }
  catch { return new Set(); }
};
const saveFired = (set) => {
  try { localStorage.setItem(FIRED_KEY, JSON.stringify([...set].slice(-800))); }
  catch { /* ignore */ }
};

const parseDate = (v) => {
  if (!v) return null;
  if (typeof v === 'string' && v.length === 10 && v.includes('-')) {
    const parts = v.split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const dayKey = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const useNotificationScheduler = () => {
  const data = useStore((s) => s.data);
  const settings = useStore((s) => s.notificationSettings);
  const { t } = useTranslation();
  const firedRef = useRef(loadFired());

  useEffect(() => {
    if (!settings?.enabled) return undefined;
    if (getNotificationPermission() !== 'granted') return undefined;

    const tick = () => {
      const now = Date.now();
      const fired = firedRef.current;
      const due = [];

      // Queue a reminder if `now` is within the fire window after `fireDate`.
      const consider = (key, fireDate, title, body, url = '/') => {
        if (!fireDate) return;
        const ft = fireDate.getTime();
        if (now >= ft && now < ft + FIRE_WINDOW_MS && !fired.has(key)) {
          due.push({ key, title, body, url });
        }
      };

      // ── Exams ──
      if (settings.exams) {
        (data?.courses || []).forEach((c) => {
          ['moedA', 'moedB', 'moedC'].forEach((moed) => {
            const exam = parseDate(c[moed] || c.exams?.[moed]);
            if (!exam) return;
            const moedLabel = t(moed);
            // N days before (09:00)
            (settings.examLeadDays || []).forEach((d) => {
              const fire = new Date(exam);
              fire.setDate(fire.getDate() - d);
              fire.setHours(9, 0, 0, 0);
              consider(
                `exam:${c.id}:${moed}:${d}`,
                fire,
                t('notifExamTitle'),
                t('notifExamBodyDays')
                  .replace('{course}', c.name)
                  .replace('{moed}', moedLabel)
                  .replace('{n}', d),
              );
            });
            // Morning of the exam (08:00)
            const dayOf = new Date(exam);
            dayOf.setHours(8, 0, 0, 0);
            consider(
              `exam:${c.id}:${moed}:0`,
              dayOf,
              t('notifExamTitle'),
              t('notifExamBodyToday').replace('{course}', c.name).replace('{moed}', moedLabel),
            );
          });
        });
      }

      // ── Personal tasks ──
      if (settings.tasks) {
        (data?.personalTasks || []).forEach((task) => {
          if (task.done || !task.dueDate) return;
          if (task.reminderMinutes === -1) return; // explicitly off
          let fire;
          if (task.dueTime) {
            const dt = parseDate(`${task.dueDate}T${task.dueTime}`);
            if (!dt) return;
            const lead = task.reminderMinutes != null && task.reminderMinutes >= 0
              ? task.reminderMinutes : 0;
            fire = new Date(dt.getTime() - lead * 60000);
          } else {
            // No specific time → morning of the due date (08:00).
            fire = parseDate(`${task.dueDate}T08:00`);
          }
          consider(`task:${task.id}`, fire, t('notifTaskTitle'), task.title || t('navTasks'));
        });
      }

      // ── Events ──
      if (settings.events) {
        (data?.events || []).forEach((ev) => {
          const start = parseDate(ev.start);
          if (!start) return;
          if (ev.reminderMinutes === -1) return; // off
          let fire;
          if (ev.allDay) {
            fire = parseDate(`${String(ev.start).slice(0, 10)}T08:00`);
          } else {
            const lead = ev.reminderMinutes != null && ev.reminderMinutes >= 0
              ? ev.reminderMinutes : (settings.eventLeadMinutes ?? 30);
            fire = new Date(start.getTime() - lead * 60000);
          }
          consider(`event:${ev.id}`, fire, t('notifEventTitle'), ev.title || t('tabEvent'));
        });
      }

      // ── Daily digest ──
      if (settings.dailyDigest) {
        const [h, m] = (settings.dailyDigestTime || '08:00').split(':').map(Number);
        const fire = new Date();
        fire.setHours(h || 8, m || 0, 0, 0);
        const today = new Date();
        const tk = dayKey(today);

        // Count today's items.
        let events = 0, tasks = 0, exams = 0, weekly = 0;
        (data?.events || []).forEach((ev) => {
          const d = parseDate(ev.start);
          if (d && dayKey(d) === tk) events++;
        });
        (data?.personalTasks || []).forEach((task) => {
          if (task.done || !task.dueDate) return;
          const d = parseDate(task.dueDate);
          if (d && dayKey(d) === tk) tasks++;
        });
        (data?.courses || []).forEach((c) => {
          ['moedA', 'moedB', 'moedC'].forEach((moed) => {
            const d = parseDate(c[moed] || c.exams?.[moed]);
            if (d && dayKey(d) === tk) exams++;
          });
        });
        if (settings.weeklyTasks) {
          // Count only unchecked weekly tasks that are included in progress.
          (data?.courses || []).forEach((course) => {
            const courseTasks = data?.tasks?.[course.id];
            if (courseTasks) {
              Object.values(courseTasks).forEach((weeks) => {
                (weeks || []).forEach((wt) => {
                  if (!wt.checked && isTaskIncludedInProgress(wt, course)) {
                    weekly++;
                  }
                });
              });
            }
          });
        }

        const total = events + tasks + exams;
        const body = total === 0 && weekly === 0
          ? t('notifDigestEmpty')
          : t('notifDigestBody')
              .replace('{events}', events)
              .replace('{tasks}', tasks)
              .replace('{exams}', exams);

        consider(`digest:${tk}`, fire, t('notifDigestTitle'), body);
      }

      if (due.length) {
        due.forEach((n) => {
          showLocalNotification(n.title, { body: n.body, tag: n.key, data: { url: n.url } });
          fired.add(n.key);
        });
        saveFired(fired);
      }
    };

    tick(); // evaluate immediately on mount / settings change
    const id = setInterval(tick, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [data, settings, t]);
};
