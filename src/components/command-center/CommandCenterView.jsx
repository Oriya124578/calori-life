import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Calendar as CalendarIcon, Clock, Sparkles, Trash2, Save,
  AlertTriangle, Plus, MapPin,
  Dumbbell, Utensils, ChevronLeft, ChevronRight, X,
  Lock, Unlock, Moon, Sun, MoreVertical, Bell, ListTodo, CalendarRange
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore, getCourseProgressSummary } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import { cn } from '../../lib/utils';
import { swrFetch } from '../../lib/cacheService';
import { dateKey } from '../../lib/caloriRepo';
import { generateDailySchedule, tuneSchedule } from '../../lib/gemini';
import { buildTimeline } from '../../lib/scheduleBuilder';
import { validateAndRepair, timeToMin } from '../../lib/scheduleEngine';
import { fetchShabbatTimes } from '../../lib/shabbatService';
import { calculateTravelTime } from '../../lib/mapsService';
import { format, parseISO, isValid, isSameDay, addDays, subDays } from 'date-fns';
import { he } from 'date-fns/locale';
import { toast } from '../../store/useToast';
import { MorningCoachOverlay } from './MorningCoachOverlay';
import { WeekPlanner } from './WeekPlanner';
import { getWeeklyPlan } from '../../lib/firestoreRepo';
import { SmartClarifier } from './SmartClarifier';
import { BlockActionSheet } from './BlockActionSheet';
import { BlockEditModal } from './BlockEditModal';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, TouchSensor } from '@dnd-kit/core';
import { DroppableHour, DraggableBlock, DraggableSidebarTask } from './DndComponents';
import { initGoogleCalendarAuth, connectGoogleCalendar, fetchGoogleEvents } from '../../lib/googleCalendar';

const parseToLocalTime = (timestamp) => {
  if (!timestamp) return '00:00';
  const parsed = parseISO(timestamp);
  return isValid(parsed) ? format(parsed, 'HH:mm') : timestamp.substring(11, 16);
};

// One-tap day templates — each becomes the AI planner directive (dayProfile).
const DAY_TEMPLATES = [
  { key: 'study', labelHe: 'יום לימודים מלא', labelEn: 'Full study day',
    he: 'תכנן לי יום לימודים מלא — בלוקי לימוד לאורך כל היום עם רווחים קצרים ביניהם, וכל המשימות הפתוחות שלי להיום.',
    en: 'Plan a full study day — study blocks across the day with short gaps between them, plus all my open tasks for today.' },
  { key: 'half', labelHe: 'חצי יום לימודים', labelEn: 'Half study day',
    he: 'תכנן חצי יום לימודים בבוקר ועד הצהריים, ושאר היום השאר פנוי.',
    en: 'Plan a half study day from morning until noon, leave the rest of the day open.' },
  { key: 'tasks', labelHe: 'יום משימות', labelEn: 'Tasks day',
    he: 'שבץ את כל המשימות הפתוחות שלי להיום בלי בלוקי לימוד גנריים.',
    en: 'Schedule all my open tasks for today, without generic study blocks.' },
  { key: 'rest', labelHe: 'יום מנוחה', labelEn: 'Rest day',
    he: 'יום מנוחה — אל תשבץ לימודים, רק את האירועים הקבועים שלי ותזכורות למשימות דחופות.',
    en: 'Rest day — no study blocks, only my fixed events and reminders for urgent tasks.' },
];

export const CommandCenterView = () => {
  const {
    data,
    language,
    scheduleTask,
    unscheduleTask,
    saveDraftSchedule,
    clearDaySchedule,
    draftSchedule,
    setDraftSchedule,
    updatePersonalTask,
    updateEvent,
    deleteEvent,
    saveSchedule,
    setProfile,
    setScheduleDate,
    updateScheduleBlock,
    googleCalendarToken,
    setGoogleCalendarToken,
    openCoachChat,
    pendingTuneCommand,
    setPendingTuneCommand,
    scheduleLoadedDate,
  } = useStore();

  const { t } = useTranslation();
  const isRTL = language === 'he';
  const locale = isRTL ? he : undefined;

  useEffect(() => {
    initGoogleCalendarAuth().catch(console.error);
  }, []);

  const [currentDate, setCurrentDate] = useState(new Date());
  const dateStr = useMemo(() => {
    const y = currentDate.getFullYear();
    const m = String(currentDate.getMonth() + 1).padStart(2, '0');
    const d = String(currentDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [currentDate]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [tuneCommand, setTuneCommand] = useState('');
  const [shabbatTimes, setShabbatTimes] = useState(null);
  const [activeSubTab] = useState('schedule'); // 'schedule', 'calendar', 'pomodoro'
  const [gpsLocation, setGpsLocation] = useState(null);
  const [activeTaskTab, setActiveTaskTab] = useState('all'); // 'all' | 'high' | 'med' | 'low'
  const [timePickerModal, setTimePickerModal] = useState(null); // { taskId, title, hourStr } for manual slot assign
  const [showMorningCoach, setShowMorningCoach] = useState(false);
  const [showWeekPlanner, setShowWeekPlanner] = useState(false);
  const [weeklyPlan, setWeeklyPlan] = useState(null);
  // When the user picks a day from the week plan, its directive seeds the coach.
  const [weeklySeed, setWeeklySeed] = useState(null); // { date, directive }
  const [clarifierText, setClarifierText] = useState(null);
  const [activeActionBlock, setActiveActionBlock] = useState(null);
  const [editingBlock, setEditingBlock] = useState(null);
  const [activeDragItem, setActiveDragItem] = useState(null);
  const hasEvaluatedMorningCoach = useRef(false);

  // Keep the cl_schedule subscription in sync with the viewed day,
  // and restore it to today when leaving the screen.
  useEffect(() => {
    setScheduleDate(dateStr);
  }, [dateStr, setScheduleDate]);
  useEffect(() => () => {
    useStore.getState().setScheduleDate(dateKey());
  }, []);

  // Load the saved weekly plan (reloads after the planner closes so a freshly
  // generated plan seeds the per-day coach).
  useEffect(() => {
    const uid = useStore.getState().uid;
    if (!uid) return;
    getWeeklyPlan(uid).then(setWeeklyPlan).catch(() => {});
  }, [showWeekPlanner]);

  // Directive that seeds the Morning Coach for the viewed day: an explicit pick
  // from the week plan wins, else the saved weekly plan's row for this date.
  const morningSeed =
    (weeklySeed?.date === dateStr ? weeklySeed.directive : null) ||
    weeklyPlan?.days?.find((d) => d.date === dateStr)?.directive ||
    '';

  const handlePickWeekDay = (date, directive) => {
    setShowWeekPlanner(false);
    setWeeklySeed({ date, directive });
    const dt = parseISO(date);
    if (isValid(dt)) setCurrentDate(dt);
    setShowMorningCoach(true);
  };

  // dnd-kit sensors (iOS style long press ~500ms)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 500,
        tolerance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 500,
        tolerance: 5,
      },
    })
  );

  // Weather State
  const [weather, setWeather] = useState({ temp: null, min: null, max: null, city: null, loading: true, error: false, isNight: false });

  // "Now" indicator — ticks every minute so the red line and the active block
  // highlight stay accurate while the screen is open.
  const [nowTick, setNowTick] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNowTick(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  const isViewingToday = dateStr === dateKey();
  const nowMin = nowTick.getHours() * 60 + nowTick.getMinutes();

  // Auto-scroll the timeline to "now" so opening the screen at 14:30 doesn't
  // land you at the morning hours. Re-arms when navigating back to today.
  const nowRowRef = useRef(null);
  const hasScrolledToNow = useRef(false);
  useEffect(() => { hasScrolledToNow.current = false; }, [dateStr]);
  const isBlockNow = (b) => {
    if (!isViewingToday) return false;
    try {
      const s = timeToMin(b.startTime);
      const e = timeToMin(b.endTime);
      return nowMin >= s && nowMin < (e > s ? e : s + 1);
    } catch {
      return false;
    }
  };

  // Fetch weather and location (relocated to top of Personal Manager page)
  useEffect(() => {
    let mounted = true;
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        if (!mounted) return;
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        
        const cacheKey = `weather_geo_${lat.toFixed(2)}_${lon.toFixed(2)}`;
        
        const fetcher = async () => {
          const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=he`);
          const geoData = await geoRes.json();
          const city = geoData.city || geoData.locality || 'מיקום נוכחי';

          const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=auto`);
          const weatherData = await weatherRes.json();
          
          return {
            temp: Math.round(weatherData.current_weather.temperature),
            min: Math.round(weatherData.daily.temperature_2m_min[0]),
            max: Math.round(weatherData.daily.temperature_2m_max[0]),
            city,
            isNight: weatherData.current_weather.is_day === 0
          };
        };

        // Revalidate every 2 hours (2 * 60 * 60 * 1000)
        swrFetch(cacheKey, fetcher, (data) => {
          if (!mounted) return;
          setWeather({
            ...data,
            loading: false,
            error: false,
          });
        }, 2 * 60 * 60 * 1000).catch(() => {
          if (mounted) setWeather(w => ({ ...w, loading: false, error: true }));
        });
      }, () => {
        if (mounted) setWeather(w => ({ ...w, loading: false, error: true }));
      });
    } else {
      setWeather(w => ({ ...w, loading: false, error: true }));
    }
    return () => { mounted = false; };
  }, []);

  // Fetch Shabbat times based on GPS or settings
  useEffect(() => {
    let mounted = true;
    const loadShabbat = async () => {
      if (!data?.profile?.shabbatMode) {
        if (mounted) setShabbatTimes(null);
        return;
      }

      let locationParam = { city: data?.profile?.selectedCity || 'tel_aviv' };

      const onDataCb = (times) => {
        if (mounted) setShabbatTimes(times);
      };

      if (data?.profile?.useGPS) {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              if (!mounted) return;
              const coords = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              };
              setGpsLocation(coords);
              fetchShabbatTimes(coords, dateStr, onDataCb);
            },
            (err) => {
              console.warn('[GPS] Geolocation blocked or failed, using city fallback:', err);
              if (!mounted) return;
              fetchShabbatTimes(locationParam, dateStr, onDataCb);
            }
          );
          return;
        }
      }

      fetchShabbatTimes(locationParam, dateStr, onDataCb);
    };

    loadShabbat();
    return () => { mounted = false; };
  }, [data?.profile?.shabbatMode, data?.profile?.useGPS, data?.profile?.selectedCity, dateStr]);

  // Aggregate blocks for the timeline (Phase 6a: unified builder).
  // If a draft is in progress (in-memory unsaved edit), it wins over the
  // persisted/projected data. Otherwise buildTimeline picks the right path:
  // doc-driven if cl_schedule exists for this date, fallback otherwise.
  const timelineBlocks = useMemo(() => {
    // A draft belongs to the day it was generated for — never leak it to other days.
    if (draftSchedule?.date === dateStr && draftSchedule?.blocks?.length > 0) {
      return draftSchedule.blocks.filter(
        (b) => b.type !== 'leisure' && !b.title?.includes('הפסקה') && !b.title?.toLowerCase().includes('break')
      );
    }
    // Ignore a schedule doc that belongs to a different date (stale snapshot
    // while the per-day subscription catches up).
    const scheduleDoc =
      data?.schedule && (!data.schedule._docDate || data.schedule._docDate === dateStr)
        ? data.schedule
        : null;
    return buildTimeline({
      scheduleDoc,
      events: data?.events,
      personalTasks: data?.personalTasks,
      calori: data?.calori,
      dateStr,
      todayStr: dateKey(),
      options: { filterLeisure: true, includeCalori: 'todayOnly' },
    });
  }, [data, dateStr, draftSchedule]);

  // Scroll to "now" once the timeline is on screen (today only).
  useEffect(() => {
    if (!isViewingToday || hasScrolledToNow.current) return;
    const el = nowRowRef.current;
    if (!el) return;
    hasScrolledToNow.current = true;
    const id = setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 200);
    return () => clearTimeout(id);
  }, [isViewingToday, timelineBlocks]);

  // Filter tasks in sidebar
  const sidebarTasks = useMemo(() => {
    return (data?.personalTasks || []).filter((task) => {
      // Show tasks that are not done and not scheduled for today (or not scheduled at all)
      const isScheduledForToday = task.scheduledDate === dateStr;
      if (task.done || isScheduledForToday) return false;

      if (activeTaskTab === 'high') return task.priority === 'high';
      if (activeTaskTab === 'med') return task.priority === 'med';
      if (activeTaskTab === 'low') return task.priority === 'low' || !task.priority;
      return true;
    });
  }, [data.personalTasks, dateStr, activeTaskTab]);

  // Coach Note (from profile or draft)
  const coachNote = useMemo(() => {
    if (draftSchedule?.date === dateStr && draftSchedule?.coachNote) return draftSchedule.coachNote;
    if (data?.schedule?._docDate === dateStr && data.schedule.coachNote) return data.schedule.coachNote;
    return data?.profile?.coachNotes?.[dateStr] || '';
  }, [data?.profile?.coachNotes, data?.schedule, draftSchedule, dateStr]);

  // Shabbat constraints indicator
  const shabbatBlockIndicator = useMemo(() => {
    if (!shabbatTimes) return null;
    const startObj = new Date(shabbatTimes.start);
    const endObj = new Date(shabbatTimes.end);
    
    const isFriday = isSameDay(currentDate, startObj);
    const isSaturday = isSameDay(currentDate, endObj);

    if (isFriday) {
      // 1 hour before Shabbat starts
      const blockStart = new Date(startObj.getTime() - 60 * 60 * 1000);
      return {
        type: 'shabbat_start',
        time: format(blockStart, 'HH:mm'),
        title: t('ccShabbatStartTitle'),
        desc: t('ccShabbatStartDesc').replace('{enter}', format(startObj, 'HH:mm')).replace('{lock}', format(blockStart, 'HH:mm')),
      };
    }

    if (isSaturday) {
      // 1 hour after Shabbat ends
      const blockEnd = new Date(endObj.getTime() + 60 * 60 * 1000);
      return {
        type: 'shabbat_end',
        time: format(blockEnd, 'HH:mm'),
        title: t('ccShabbatEndTitle'),
        desc: t('ccShabbatEndDesc').replace('{exit}', format(endObj, 'HH:mm')).replace('{unlock}', format(blockEnd, 'HH:mm')),
      };
    }

    return null;
  }, [shabbatTimes, currentDate, t]);

  const isTimeDuringShabbat = (timeStr) => {
    if (!data?.profile?.shabbatMode || !shabbatTimes) return false;
    
    const offset = shabbatTimes.start.substring(19) || '+02:00';
    const targetDate = new Date(`${dateStr}T${timeStr}:00${offset}`);
    if (!isValid(targetDate)) return false;

    const startObj = new Date(shabbatTimes.start);
    const endObj = new Date(shabbatTimes.end);

    const blockStart = new Date(startObj.getTime() - 60 * 60 * 1000);
    const blockEnd = new Date(endObj.getTime() + 60 * 60 * 1000);

    return targetDate >= blockStart && targetDate <= blockEnd;
  };

  // Day navigation
  const prevDay = () => setCurrentDate(subDays(currentDate, 1));
  const nextDay = () => setCurrentDate(addDays(currentDate, 1));
  const setToday = () => setCurrentDate(new Date());

  // Bounds for validateAndRepair: wake/sleep window + Shabbat forbidden window.
  const getRepairBounds = useCallback(() => {
    let wakeMin = 7 * 60;
    let sleepMin = 23 * 60;
    try { wakeMin = timeToMin(data?.profile?.wakeTime || '07:00'); } catch { /* default */ }
    try { sleepMin = timeToMin(data?.profile?.sleepTime || '23:00'); } catch { /* default */ }
    // A bedtime at/after midnight (e.g. 00:00, 01:30) means the END of the
    // waking day — NOT 00:00 this morning. Without this, sleepMin=0 collapses the
    // window and EVERY block is dropped as out-of-bounds.
    if (sleepMin <= wakeMin) sleepMin += 24 * 60;
    // Planning TODAY mid-day → the window starts NOW, not at the morning wake time.
    if (isSameDay(currentDate, new Date())) {
      const n = new Date();
      const nowMin = n.getHours() * 60 + Math.ceil(n.getMinutes() / 15) * 15;
      if (nowMin > wakeMin && nowMin < sleepMin) wakeMin = nowMin;
    }
    // Treat Shabbat as a SHORTENED normal day (clamp wake/sleep), NOT as a
    // separate "forbidden interval". The forbidden-interval path trayed every
    // study block on Friday instead of relocating it into the morning; folding
    // the cutoff into sleepMin/wakeMin lets the standard relocation pack them.
    if (data?.profile?.shabbatMode && shabbatTimes) {
      const startObj = new Date(shabbatTimes.start);
      const endObj = new Date(shabbatTimes.end);
      if (isValid(startObj) && isSameDay(currentDate, startObj)) {
        const cutoff = new Date(startObj.getTime() - 60 * 60 * 1000);
        sleepMin = Math.min(sleepMin, cutoff.getHours() * 60 + cutoff.getMinutes());
      } else if (isValid(endObj) && isSameDay(currentDate, endObj)) {
        const startAfter = new Date(endObj.getTime() + 60 * 60 * 1000);
        wakeMin = Math.max(wakeMin, startAfter.getHours() * 60 + startAfter.getMinutes());
      }
    }
    return { wakeMin, sleepMin, shabbat: null };
  }, [data?.profile?.wakeTime, data?.profile?.sleepTime, data?.profile?.shabbatMode, shabbatTimes, currentDate]);

  // Normalize AI output: drop sleep/leisure/break noise, ensure ids, then
  // run the deterministic repair pass (overlaps, out-of-bounds, Shabbat).
  const sanitizeAiBlocks = useCallback((blocks, originalBlocks = []) => {
    const cleaned = (blocks || [])
      .filter((b) => b.type !== 'sleep' && b.type !== 'leisure' && !b.title?.includes('הפסקה') && !b.title?.toLowerCase().includes('break'))
      .map((b) => ({
        ...b,
        id: b.id || `draft-${Math.random().toString(36).substring(2, 7)}`,
      }));
    const repaired = validateAndRepair(cleaned, getRepairBounds(), originalBlocks);
    return repaired.blocks;
  }, [getRepairBounds]);

  // Call Gemini to Auto-Plan. When autoSave is true (the day questionnaire /
  // "build my day" flow) the generated plan is persisted to cl_schedule
  // immediately instead of left as an unsaved draft the user might lose.
  const handleAutoPlan = useCallback(async (dayProfile = null, autoSave = false, extras = {}) => {
    setLoading(true);
    try {
      const fixedEvents = [];
      const meals = [];

      // Trip from the questionnaire: compute the REAL drive time from the user's
      // current location to the named destination (Google Maps / OSRM) and add it
      // as a located fixed event so the generator places travel blocks around it
      // (rule 4 inserts a travel leg of travelTimeMinutes before/after).
      if (extras?.destination) {
        let travelMin = 0;
        try {
          const origin = extras.origin || gpsLocation || data?.profile?.selectedCity || 'Tel Aviv';
          travelMin = await Promise.race([
            calculateTravelTime(origin, extras.destination),
            new Promise((res) => setTimeout(() => res(0), 6000)),
          ]);
        } catch { travelMin = 0; }
        const depart = extras.departTime || '12:00';
        const dur = travelMin > 0 ? travelMin : 30; // fallback estimate
        const [dh, dm] = depart.split(':').map(Number);
        const endTotal = (dh * 60 + dm + dur);
        const departEnd = `${String(Math.floor(endTotal / 60) % 24).padStart(2, '0')}:${String(endTotal % 60).padStart(2, '0')}`;
        // ONE locked travel block of the REAL drive time. We bake the duration
        // into start/end and intentionally omit `location` + `travelTimeMinutes`
        // so the generator does NOT add a second (duplicate) travel leg around it.
        fixedEvents.push({
          id: `trip-${Date.now()}`,
          title: `נסיעה ל${extras.destination}`,
          type: 'travel',
          start: depart,
          end: departEnd,
          isLocked: true,
        });
      }

      // Collect fixed events
      (data?.events || []).forEach((ev) => {
        if (ev.start && ev.start.startsWith(dateStr)) {
          fixedEvents.push({
            id: ev.id,
            title: ev.title,
            start: parseToLocalTime(ev.start),
            end: ev.end ? parseToLocalTime(ev.end) : '23:59',
            location: ev.location || '',
          });
        }
      });

      // Live awareness: pull the day's Google Calendar events (from the user's
      // selected calendars) so the plan is built around them even if they were
      // never imported into cl_events. Best-effort — never blocks planning.
      try {
        const gEvents = await fetchGoogleEvents(`${dateStr}T12:00:00`);
        const seen = new Set(fixedEvents.map((e) => `${e.title}-${e.start}`));
        for (const gev of gEvents || []) {
          const start = parseToLocalTime(gev.start);
          const key = `${gev.title}-${start}`;
          if (seen.has(key)) continue;
          seen.add(key);
          fixedEvents.push({
            id: gev.googleEventId || gev.id,
            title: gev.title,
            start,
            end: gev.end ? parseToLocalTime(gev.end) : '23:59',
            location: gev.location || '',
          });
        }
      } catch (e) {
        // Not connected / offline — plan from local data only.
        console.debug('Live Google Calendar fetch skipped:', e?.message);
      }

      // Calori data
      if (dateStr === dateKey()) {
        (data?.calori?.meals || []).forEach((m) => {
          meals.push({ name: m.name, time: parseToLocalTime(m.timestamp), calories: m.calories });
        });
      }

      // Collect planned coach workouts (Calori coach_sessions). Map to a clean
      // shape the AI can act on: a scheduledTime means LOCK it there and build
      // study around it; null means the AI may propose a slot. Only sessions for
      // the planned day are sent (the subscription follows the viewed calori day).
      const plannedWorkouts = (data?.calori?.coachSessions || [])
        .filter((cs) => cs.type !== 'rest' && cs.status !== 'completed' && cs.status !== 'skipped')
        // Sessions are subscribed for the viewed calori day; a date-less session
        // is only trustworthy when we're planning today.
        .filter((cs) => (cs.scheduledDate ? cs.scheduledDate.slice(0, 10) === dateStr : dateStr === dateKey()))
        .map((cs) => {
          const tm = cs.scheduledDate ? parseToLocalTime(cs.scheduledDate) : null;
          return {
            title: cs.title || 'אימון',
            durationMinutes: cs.estimatedDurationMinutes || 60,
            scheduledTime: tm && tm !== '00:00' ? tm : null,
          };
        });

      // Upcoming exams sorted by date
      const upcomingExams = [];
      (data?.courses || []).forEach((course) => {
        ['moedA', 'moedB', 'moedC'].forEach((moed) => {
          const examDate = course[moed] || course.exams?.[moed];
          if (examDate) {
            const dt = parseISO(examDate);
            // Compare by DATE (string), so an exam ON the planned day isn't
            // dropped just because its midnight is already in the past.
            if (isValid(dt) && examDate.slice(0, 10) >= dateStr) {
              upcomingExams.push({
                course: course.name,
                moed: moed.replace('moed', ''),
                date: examDate.substring(0, 10),
              });
            }
          }
        });
      });

      // All open, not-already-scheduled tasks — independent of the sidebar's
      // priority filter, so the AI always sees the full task set.
      const unscheduledTasks = (data?.personalTasks || [])
        .filter((t) => !t.done && t.scheduledDate !== dateStr)
        .map((t) => {
          const due = (t.dueDate || '').slice(0, 10);
          return {
            id: t.id,
            title: t.title,
            priority: t.priority || 'medium',
            dueToday: due === dateStr || t.list === 'today',
            overdue: !!due && due < dateStr,
            // User's time estimate (minutes). When set → schedule as a time block
            // of this length; when null → a point reminder.
            duration: t.duration ?? null,
          };
        });

      // Calculate travel times dynamically (best-effort). These hit external
      // geocoding/routing services with no built-in timeout, so we cap each call
      // and run them in parallel — a slow/hanging maps lookup must never freeze
      // schedule generation (this was the "stuck, no schedule" bug, now that
      // imported Google Calendar events carry a location).
      const withTimeout = (p, ms) =>
        Promise.race([p, new Promise((res) => setTimeout(() => res(0), ms))]);
      await Promise.all(
        fixedEvents
          .filter((ev) => ev.location)
          .map(async (ev) => {
            try {
              ev.travelTimeMinutes = await withTimeout(
                calculateTravelTime(gpsLocation || 'Tel Aviv', ev.location),
                4000,
              );
            } catch {
              ev.travelTimeMinutes = 0;
            }
          }),
      );

      // Shabbat is only relevant when the PLANNED day is Friday or Saturday.
      // On any other weekday we must NOT send Shabbat context — otherwise the AI
      // sees Shabbat times + "mode on" and wrongly fills e.g. a Tuesday with
      // "Shabbat preparation" blocks.
      const plannedDow = currentDate.getDay(); // 0=Sun … 5=Fri, 6=Sat
      const shabbatRelevant = plannedDow === 5 || plannedDow === 6;
      const courseProgress = getCourseProgressSummary(data?.courses || [], data?.tasks || {});

      // Reframe the planning window around Shabbat so the model never proposes
      // blocks that the repair step would later drop (the "outside free hours"
      // failure). On Friday the day ENDS 1h before Shabbat; on Saturday it
      // STARTS 1h after Shabbat ends.
      const hhmmToMin = (s) => { const [h, m] = (s || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
      const minToHhmm = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
      let wakeTime = data?.profile?.wakeTime || '07:00';
      let sleepTime = data?.profile?.sleepTime || '23:00';
      // A midnight/after-midnight bedtime ("00:00") means end of the waking day —
      // send a late evening time to the model instead of 00:00 (which it reads as
      // the start of the day and then has no room to plan).
      if (hhmmToMin(sleepTime) <= hhmmToMin(wakeTime)) sleepTime = '23:59';

      // Current-time awareness: when building TODAY mid-day, the day starts NOW —
      // there's no point planning from the morning that already passed. (Future
      // days keep the normal wake time.)
      const isToday = dateStr === dateKey();
      let nowTime = null;
      if (isToday) {
        const n = new Date();
        const nowMin = n.getHours() * 60 + Math.ceil(n.getMinutes() / 15) * 15;
        nowTime = minToHhmm(Math.min(nowMin, 23 * 60 + 45));
        if (nowMin > hhmmToMin(wakeTime)) {
          wakeTime = minToHhmm(Math.min(nowMin, hhmmToMin(sleepTime) - 15));
        }
      }
      if (shabbatRelevant && shabbatTimes) {
        const sStart = shabbatTimes.start.substring(11, 16);
        const sEnd = shabbatTimes.end.substring(11, 16);
        if (plannedDow === 5) {
          sleepTime = minToHhmm(Math.max(0, Math.min(hhmmToMin(sleepTime), hhmmToMin(sStart) - 60)));
        } else if (plannedDow === 6) {
          wakeTime = minToHhmm(Math.max(hhmmToMin(wakeTime), hhmmToMin(sEnd) + 60));
        }
      }

      const context = {
        todayDate: dateStr,
        dayOfWeek: format(currentDate, 'EEEE', { locale }),
        currentTime: nowTime, // when planning today: the first block must start at/after this
        dayProfile: typeof dayProfile === 'string' && dayProfile.trim() ? dayProfile : null,
        settings: {
          wakeTime,
          sleepTime,
          studyBlockDuration: data?.profile?.studyBlockDuration || 90,
          shabbatMode: !!data?.profile?.shabbatMode && shabbatRelevant,
          studyPreferences: data?.profile?.studyPreferences || {},
        },
        shabbatTimes: (shabbatTimes && shabbatRelevant) ? {
          start: shabbatTimes.start.substring(11, 16),
          end: shabbatTimes.end.substring(11, 16)
        } : null,
        fixedEvents,
        upcomingExams,
        tasks: unscheduledTasks,
        courseProgress,
        workouts: plannedWorkouts,
        meals,
        dailyAnalytics: data?.recentDailyAnalytics || [],
      };

      const result = await generateDailySchedule(context);

      // No Gemini key configured → tell the user to set one (Settings → AI)
      // instead of a generic "planning failed".
      if (result?.error === 'MISSING_KEY') {
        toast.error(t('ccMissingGeminiKey'));
        return;
      }

      const processedBlocks = sanitizeAiBlocks(result?.blocks);
      // Never overwrite the day with an empty plan (malformed/empty AI response).
      if (!processedBlocks || processedBlocks.length === 0) {
        // The model DID return blocks but they were all dropped by repair — almost
        // always because they fell outside the usable window (e.g. the pre-Shabbat
        // cutoff on Friday). Give a specific, actionable message, not a generic one.
        const hadRaw = Array.isArray(result?.blocks) && result.blocks.length > 0;
        toast.error(
          hadRaw
            ? 'הלוז שנבנה יצא מחוץ לשעות הפנויות (למשל לפני כניסת שבת) — נסה פחות שעות או יום אחר'
            : t('ccPlanError'),
        );
        return;
      }

      if (autoSave) {
        // Questionnaire / "build my day": persist straight to cl_schedule so it
        // survives reloads and shows on the home timeline — no separate Save tap.
        try {
          await saveDraftSchedule(dateStr, processedBlocks, result.coachNote);
        } catch (saveErr) {
          console.error('saveDraftSchedule failed:', saveErr, processedBlocks);
          // Keep the work as an unsaved draft so it isn't lost.
          setDraftSchedule({ date: dateStr, blocks: processedBlocks, coachNote: result.coachNote });
          toast.error(t('ccPlanError'));
          return;
        }
        setDraftSchedule({ date: null, blocks: [], coachNote: '' });
        toast.success(t('ccScheduleBuiltSaved', 'הלו"ז נבנה ונשמר ✓'));
      } else {
        setDraftSchedule({ date: dateStr, blocks: processedBlocks, coachNote: result.coachNote });
        toast.success(t('ccDraftCreated'));
      }
    } catch (err) {
      if (err.message === 'MISSING_GEMINI_KEY') {
        toast.error(t('ccMissingGeminiKey'));
      } else {
        console.error('handleAutoPlan failed:', err);
        toast.error(t('ccPlanError'));
      }
    } finally {
      setLoading(false);
    }
  }, [data, dateStr, gpsLocation, currentDate, locale, shabbatTimes, setDraftSchedule, saveDraftSchedule, sanitizeAiBlocks, t]);

  // NOTE: silent auto-plan on entry was removed on purpose — it regenerated a
  // fresh AI schedule on every visit and shadowed the saved cl_schedule doc.
  // Planning now starts only from the Morning Coach overlay or the AI button.

  // Morning Coach overlay: decide once per mount whether to show.
  // Predicate per Phase 6b spec.
  useEffect(() => {
    if (hasEvaluatedMorningCoach.current) return;
    // Wait for profile AND the schedule doc snapshot before evaluating —
    // otherwise we'd offer a new plan while the saved one is still loading.
    // (data.schedule is null both when loading AND when there's no saved doc, so
    // we gate on the explicit "snapshot arrived for this date" marker instead.)
    if (!data?.profile) return;
    if (scheduleLoadedDate !== dateStr) return;
    hasEvaluatedMorningCoach.current = true;

    const now = new Date();
    const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const minutes = now.getHours() * 60 + now.getMinutes();

    const lastShown = data.profile.lastCoachShownDate;
    const dismissed = data.profile.coachOverlayDismissedDate;

    const noSaved = !data?.schedule || !data.schedule.blocks || data.schedule.blocks.length === 0;
    const noDraft = !draftSchedule?.blocks || draftSchedule.blocks.length === 0;

    const shouldShow =
      todayLocal !== lastShown &&
      todayLocal !== dismissed &&
      minutes >= 5 * 60 &&
      dateStr === todayLocal &&
      noSaved &&
      noDraft;

    if (shouldShow) {
      setShowMorningCoach(true);
      // Stamp immediately so re-opens stay silent.
      setProfile({ lastCoachShownDate: todayLocal });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.profile, data?.schedule, draftSchedule, dateStr, scheduleLoadedDate]);

  // Detect whether "now" is inside Shabbat window (uses shabbatTimes already loaded).
  const isNowDuringShabbat = useMemo(() => {
    if (!data?.profile?.shabbatMode || !shabbatTimes) return false;
    const now = new Date();
    const startObj = new Date(shabbatTimes.start);
    const endObj = new Date(shabbatTimes.end);
    if (!isValid(startObj) || !isValid(endObj)) return false;
    const blockStart = new Date(startObj.getTime() - 60 * 60 * 1000);
    const blockEnd = new Date(endObj.getTime() + 60 * 60 * 1000);
    return now >= blockStart && now <= blockEnd;
  }, [data?.profile?.shabbatMode, shabbatTimes]);

  // Overlay handlers
  const handleCoachDismissSession = () => {
    setShowMorningCoach(false);
  };
  const handleCoachDismissToday = () => {
    const now = new Date();
    const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    setProfile({ coachOverlayDismissedDate: todayLocal });
    setShowMorningCoach(false);
  };
  const handleCoachSubmit = (dayProfile, extras = {}) => {
    setShowMorningCoach(false);
    handleAutoPlan(dayProfile, true, extras); // questionnaire → build & save immediately
  };

  // Tune schedule with input query
  const handleTuneSchedule = async (cmdOverride) => {
    const cmd = typeof cmdOverride === 'string' ? cmdOverride : tuneCommand;
    if (!cmd || !cmd.trim()) return;
    setLoading(true);
    try {
      const hhmmToMin = (s) => { const [h, m] = (s || '').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
      const minToHhmm = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
      let tWake = data?.profile?.wakeTime || '07:00';
      let tSleep = data?.profile?.sleepTime || '23:00';
      if (hhmmToMin(tSleep) <= hhmmToMin(tWake)) tSleep = '23:59';

      // Reframe around Shabbat (Friday ends 1h before; Saturday starts 1h after).
      const plannedDow = currentDate.getDay();
      const shabbatRelevant = plannedDow === 5 || plannedDow === 6;
      if (shabbatRelevant && shabbatTimes) {
        const sStart = shabbatTimes.start.substring(11, 16);
        const sEnd = shabbatTimes.end.substring(11, 16);
        if (plannedDow === 5) tSleep = minToHhmm(Math.max(0, Math.min(hhmmToMin(tSleep), hhmmToMin(sStart) - 60)));
        else if (plannedDow === 6) tWake = minToHhmm(Math.max(hhmmToMin(tWake), hhmmToMin(sEnd) + 60));
      }

      // Current-time awareness — tuning TODAY mid-day starts from now.
      const tIsToday = dateStr === dateKey();
      const tNow = tIsToday ? new Date().toTimeString().slice(0, 5) : null;
      if (tIsToday) {
        const n = new Date();
        const nowMin = n.getHours() * 60 + Math.ceil(n.getMinutes() / 15) * 15;
        if (nowMin > hhmmToMin(tWake)) tWake = minToHhmm(Math.min(nowMin, hhmmToMin(tSleep) - 15));
      }

      // Full data context, so commands like "תוסיף משימות" / "תוסיף בלוק למבחן"
      // act on the user's real tasks and exams (not just the visible blocks).
      const unscheduledTasks = (data?.personalTasks || [])
        .filter((tk) => !tk.done && tk.scheduledDate !== dateStr)
        .map((tk) => {
          const due = (tk.dueDate || '').slice(0, 10);
          return {
            id: tk.id, title: tk.title, priority: tk.priority || 'medium',
            dueToday: due === dateStr || tk.list === 'today',
            overdue: !!due && due < dateStr,
            duration: tk.duration ?? null,
          };
        });
      const upcomingExams = [];
      (data?.courses || []).forEach((course) => {
        ['moedA', 'moedB', 'moedC'].forEach((moed) => {
          const e = course[moed] || course.exams?.[moed];
          if (e && String(e).slice(0, 10) >= dateStr) {
            upcomingExams.push({ course: course.name, moed: moed.replace('moed', ''), date: String(e).slice(0, 10) });
          }
        });
      });

      const context = {
        settings: { wakeTime: tWake, sleepTime: tSleep },
        currentTime: tNow, // keep existing/new blocks at or after now when tuning today
        tasks: unscheduledTasks,
        upcomingExams,
        shabbatTimes: (shabbatTimes && shabbatRelevant) ? {
          start: shabbatTimes.start.substring(11, 16),
          end: shabbatTimes.end.substring(11, 16)
        } : null,
      };

      const result = await tuneSchedule(timelineBlocks, cmd, context);

      // Pass the current blocks as originals so locked blocks the AI moved
      // get restored to their place.
      const processedBlocks = sanitizeAiBlocks(result.blocks, timelineBlocks);

      setDraftSchedule({ date: dateStr, blocks: processedBlocks, coachNote: result.coachNote });
      if (!cmdOverride) setTuneCommand('');
      toast.success(t('ccTuneSuccess'));
    } catch {
      toast.error(t('ccTuneError'));
    } finally {
      setLoading(false);
    }
  };

  // One input, two behaviors: with an existing timeline the command TUNES it;
  // with an empty day it PLANS from scratch using the text as the day directive
  // ("יש לי מחר מבחן, שאלמד כל היום" / "יש לי נסיעה ב-16:00").
  const handleAiCommand = () => {
    const cmd = tuneCommand.trim();
    if (!cmd) return;
    if (timelineBlocks.length === 0) {
      setTuneCommand('');
      setClarifierText(cmd);
    } else {
      handleTuneSchedule();
    }
  };

  const handleClarifierSubmit = (directive) => {
    setClarifierText(null);
    handleAutoPlan(directive);
  };

  // Consume a replan/tune command handed off from the global manager chat.
  useEffect(() => {
    if (!pendingTuneCommand) return;
    // Wait until the saved schedule for this day has loaded — otherwise
    // timelineBlocks is still empty and a "tune my plan" request would be
    // mis-routed into plan-from-scratch, wiping the existing day.
    if (scheduleLoadedDate !== dateStr) return;
    const cmd = pendingTuneCommand;
    setPendingTuneCommand(null);
    if (timelineBlocks.length === 0) {
      setClarifierText(cmd);
    } else {
      handleTuneSchedule(cmd);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTuneCommand, scheduleLoadedDate, dateStr]);

  // Save the schedule Draft to Firestore
  const handleSaveSchedule = async () => {
    // Guard: only persist a draft that actually belongs to the viewed day, so we
    // never write one day's plan onto another's cl_schedule doc.
    if (draftSchedule?.date !== dateStr || !(draftSchedule?.blocks?.length > 0)) return;
    setLoading(true);
    try {
      await saveDraftSchedule(dateStr, draftSchedule.blocks, draftSchedule.coachNote);
      toast.success(t('ccSaveSuccess'));
    } catch {
      toast.error(t('ccSaveError'));
    } finally {
      setLoading(false);
    }
  };

  // Google Calendar Sync
  // Ready Google Calendar import flow — implemented but not yet wired to a button.
  // eslint-disable-next-line no-unused-vars
  const handleGoogleCalendarSync = async () => {
    setLoading(true);
    try {
      let token = googleCalendarToken;
      if (!token) {
        token = await connectGoogleCalendar();
        setGoogleCalendarToken(token);
      }
      
      const events = await fetchGoogleEvents(dateStr, token);
      
      if (events.length === 0) {
        toast.success('לא נמצאו אירועים חדשים ביומן Google');
        return;
      }
      
      // Inject events into draft (if drafting) or merge and set as draft
      const currentBlocks = (draftSchedule?.date === dateStr && draftSchedule?.blocks?.length > 0) ? draftSchedule.blocks : [...timelineBlocks];
      const newBlocks = [...currentBlocks, ...events].sort((a, b) => a.startTime.localeCompare(b.startTime));
      
      setDraftSchedule({
        date: dateStr,
        blocks: newBlocks,
        coachNote: draftSchedule?.coachNote || 'סונכרנו אירועים מ-Google Calendar. לחץ על שמור כדי לעדכן את הלוז.'
      });
      
      toast.success(`יובאו ${events.length} אירועים מיומן Google`);
    } catch (err) {
      console.error(err);
      toast.error('שגיאה בסנכרון עם Google Calendar');
      // If auth failed, clear token
      if (err?.error) setGoogleCalendarToken(null);
    } finally {
      setLoading(false);
    }
  };

  // Clear day schedule
  const handleClearSchedule = async () => {
    if (window.confirm(t('ccConfirmClearSchedule'))) {
      setLoading(true);
      try {
        await clearDaySchedule(dateStr);
        setDraftSchedule({ date: null, blocks: [], coachNote: '' });
        toast.success(t('ccClearSuccess'));
      } catch {
        toast.error(t('ccClearError'));
      } finally {
        setLoading(false);
      }
    }
  };

  // Manual scheduling via Time Picker
  const handleManualSchedule = (taskId, startTime) => {
    if (!startTime) return;
    if (isTimeDuringShabbat(startTime)) {
      toast.error(t('ccCannotScheduleShabbat', 'לא ניתן לשבץ משימות במהלך השבת'));
      return;
    }
    const duration = data?.profile?.studyBlockDuration || 90;
    scheduleTask(taskId, dateStr, startTime, duration);
    setTimePickerModal(null);
    toast.success(t('ccTaskScheduled'));
  };

  // Drag and Drop handlers for dnd-kit
  const handleDragStart = (e) => {
    setActiveDragItem(e.active.data.current);
  };

  const handleDragEnd = (e) => {
    const { active, over } = e;
    setActiveDragItem(null);

    if (!over) return; // Dropped outside any valid target

    const hourStr = over.id; // Droppable ID is the hour
    if (isTimeDuringShabbat(hourStr)) {
      toast.error(t('ccCannotScheduleShabbat', 'לא ניתן לשבץ משימות במהלך השבת'));
      return;
    }

    const draggedData = active.data.current;

    if (draggedData?.isTimelineBlock) {
      // Re-arranging an existing block inside the timeline.
      // Decide by where the block actually lives (draft vs saved doc vs task),
      // not by id prefix — saved doc blocks keep their 'draft-' ids.
      const sourceBlockId = draggedData.id;
      const computeEnd = (duration) => {
        const [h, m] = hourStr.split(':').map(Number);
        const endMin = h * 60 + m + duration;
        const endH = String(Math.floor(endMin / 60) % 24).padStart(2, '0');
        const endM = String(endMin % 60).padStart(2, '0');
        return `${endH}:${endM}`;
      };
      const isInDraft = draftSchedule?.date === dateStr &&
        (draftSchedule?.blocks || []).some((b) => b.id === sourceBlockId);

      if (isInDraft) {
        const updatedBlocks = (draftSchedule?.blocks || []).map(b => {
          if (b.id === sourceBlockId) {
            const duration = b.duration || 60;
            return { ...b, startTime: hourStr, endTime: computeEnd(duration) };
          }
          return b;
        }).sort((a, b) => a.startTime.localeCompare(b.startTime));
        setDraftSchedule({ ...draftSchedule, blocks: updatedBlocks });
        toast.success(t('ccTaskScheduledAtTime', 'שובץ בשעה {time}').replace('{time}', hourStr));
      } else if (sourceBlockId.startsWith('task-')) {
        const refId = sourceBlockId.replace('task-', '');
        const task = data?.personalTasks?.find(t => t.id === refId);
        const duration = task?.scheduledDuration || data?.profile?.studyBlockDuration || 90;
        scheduleTask(refId, dateStr, hourStr, duration);
        toast.success(t('ccTaskScheduledAtTime', 'שובץ בשעה {time}').replace('{time}', hourStr));
      } else if ((data?.schedule?.blocks || []).some((b) => b.id === sourceBlockId)) {
        // Persisted schedule-doc block — move it in place.
        const duration = draggedData.duration ||
          (data.schedule.blocks.find((b) => b.id === sourceBlockId)?.duration) || 60;
        updateScheduleBlock(dateStr, sourceBlockId, { startTime: hourStr, endTime: computeEnd(duration), duration });
        toast.success(t('ccTaskScheduledAtTime', 'שובץ בשעה {time}').replace('{time}', hourStr));
      }
    } else if (draggedData?.isSidebarTask) {
      // Dropped a new task from the sidebar
      const taskId = draggedData.id;
      const task = data?.personalTasks?.find(t => t.id === taskId);
      const duration = task?.scheduledDuration || data?.profile?.studyBlockDuration || 90;
      scheduleTask(taskId, dateStr, hourStr, duration);
      toast.success(t('ccTaskScheduledAtTime', 'שובץ בשעה {time}').replace('{time}', hourStr));
    }
  };

  const handleDragCancel = () => {
    setActiveDragItem(null);
  };

  // Block Action Sheet
  const handleBlockAction = (block, action) => {
    if (action === 'edit') {
      setEditingBlock(block);
      setActiveActionBlock(null);
    } else if (action === 'delete') {
      handleDeleteBlock(block);
      setActiveActionBlock(null);
    } else if (action === 'interrupted') {
      handleTuneSchedule('הייתה לי הפרעה במשימה הזו, תכנן מחדש את שאר היום');
    } else if (action === 'postpone') {
      if (block.refId) {
        // Find task and change due date to tomorrow, then unschedule
        const tomorrow = format(addDays(currentDate, 1), 'yyyy-MM-dd');
        updatePersonalTask(block.refId, { dueDate: tomorrow });
        unscheduleTask(block.refId);
        toast.success('המשימה נדחתה למחר');
      }
    } else if (action === 'swap') {
      // Just unschedule the current one and open the manual time picker for this hour?
      // Actually it says "open modal to pick another task". We can reuse timePickerModal logic in a reverse way
      // But simpler: just unschedule and let them pick from sidebar!
      if (block.refId) {
        unscheduleTask(block.refId);
        setTimePickerModal({ hourStr: block.startTime }); // Opens task picker for that hour!
      }
    }
  };

  const handleSaveBlock = async (updatedBlock) => {
    setEditingBlock(null);
    setLoading(true);
    try {
      const isNew = updatedBlock.id.startsWith('temp-new-');
      const isInDraft = draftSchedule?.date === dateStr &&
        (draftSchedule?.blocks || []).some((b) => b.id === updatedBlock.id);

      if (isNew) {
        // Creating a new block
        const newBlock = {
          ...updatedBlock,
          id: `custom-${Date.now()}`
        };

        if (draftSchedule?.date === dateStr && draftSchedule?.blocks?.length > 0) {
          const updatedBlocks = [...draftSchedule.blocks, newBlock].sort((a, b) => a.startTime.localeCompare(b.startTime));
          setDraftSchedule({ ...draftSchedule, blocks: updatedBlocks });
        } else {
          const current = [...timelineBlocks, newBlock].sort((a, b) => a.startTime.localeCompare(b.startTime));
          await saveSchedule(dateStr, current, data?.schedule?.coachNote || '');
        }
        toast.success(t('ccTaskScheduled'));
      } else {
        // Editing an existing block
        if (isInDraft) {
          const updatedBlocks = draftSchedule.blocks.map(b =>
            b.id === updatedBlock.id ? updatedBlock : b
          ).sort((a, b) => a.startTime.localeCompare(b.startTime));
          setDraftSchedule({ ...draftSchedule, blocks: updatedBlocks });
          toast.success(t('ccTaskScheduled'));
        } else {
          if ((data?.schedule?.blocks || []).some((b) => b.id === updatedBlock.id)) {
            await updateScheduleBlock(dateStr, updatedBlock.id, updatedBlock);
            if (updatedBlock.source === 'task' && updatedBlock.refId) {
              await updatePersonalTask(updatedBlock.refId, { title: updatedBlock.title });
            }
            toast.success(t('ccTaskScheduled'));
          } else if (updatedBlock.id.startsWith('task-')) {
            await updatePersonalTask(updatedBlock.refId, {
              title: updatedBlock.title,
              scheduledTime: updatedBlock.startTime,
              scheduledDuration: updatedBlock.duration,
              isLocked: updatedBlock.isLocked
            });
            toast.success(t('ccTaskScheduled'));
          } else {
            // Personal event
            const start = `${dateStr}T${updatedBlock.startTime}:00`;
            const end = updatedBlock.endTime ? `${dateStr}T${updatedBlock.endTime}:00` : null;
            await updateEvent(updatedBlock.id, { 
              title: updatedBlock.title, 
              start, 
              end, 
              isLocked: updatedBlock.isLocked,
              notes: updatedBlock.notes 
            });
            toast.success(t('ccTaskScheduled'));
          }
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(t('ccPlanError'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBlock = async (blockToDelete) => {
    setEditingBlock(null);
    setLoading(true);
    try {
      const isInDraft = draftSchedule?.date === dateStr &&
        (draftSchedule?.blocks || []).some((b) => b.id === blockToDelete.id);

      if (isInDraft) {
        const updatedBlocks = draftSchedule.blocks.filter(b => b.id !== blockToDelete.id);
        setDraftSchedule({ ...draftSchedule, blocks: updatedBlocks });
        if (blockToDelete.refId && (blockToDelete.source === 'task' || blockToDelete.type === 'study')) {
          await unscheduleTask(blockToDelete.refId);
        }
        toast.success(t('ccClearSuccess'));
      } else {
        if ((data?.schedule?.blocks || []).some((b) => b.id === blockToDelete.id)) {
          const current = data.schedule.blocks || [];
          const next = current.filter(b => b.id !== blockToDelete.id);
          await saveSchedule(dateStr, next, data.schedule.coachNote || '');
          if (blockToDelete.refId) {
            await unscheduleTask(blockToDelete.refId);
          }
          toast.success(t('ccClearSuccess'));
        } else if (blockToDelete.id.startsWith('task-') || blockToDelete.refId) {
          await unscheduleTask(blockToDelete.refId);
          toast.success(t('ccClearSuccess'));
        } else {
          await deleteEvent(blockToDelete.id);
          toast.success(t('ccClearSuccess'));
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(t('ccClearError'));
    } finally {
      setLoading(false);
    }
  };

  // Toggle Lock/Unlock on scheduled blocks
  const toggleBlockLock = (block) => {
    const isInDraft = draftSchedule?.date === dateStr &&
      (draftSchedule?.blocks || []).some((b) => b.id === block.id);
    if (isInDraft) {
      const updatedBlocks = (draftSchedule?.blocks || []).map(b =>
        b.id === block.id ? { ...b, isLocked: !b.isLocked } : b
      );
      setDraftSchedule({ ...draftSchedule, blocks: updatedBlocks });
      toast.success(!block.isLocked ? 'הבלוק ננעל לשינויי AI' : 'הבלוק שוחרר מנעילה');
    } else if ((data?.schedule?.blocks || []).some((b) => b.id === block.id)) {
      updateScheduleBlock(dateStr, block.id, { isLocked: !block.isLocked });
      toast.success(!block.isLocked ? 'הבלוק ננעל לשינויי AI' : 'הבלוק שוחרר מנעילה');
    } else if (block.id.startsWith('task-')) {
      const task = data?.personalTasks?.find(t => t.id === block.refId);
      updatePersonalTask(block.refId, { isLocked: !task?.isLocked });
      toast.success(!task?.isLocked ? 'הבלוק ננעל לשינויי AI' : 'הבלוק שוחרר מנעילה');
    } else {
      // Personal event
      const ev = data?.events?.find(e => e.id === block.id);
      if (ev) {
        updateEvent(block.id, { isLocked: !ev.isLocked });
        toast.success(!ev.isLocked ? 'הבלוק ננעל לשינויי AI' : 'הבלוק שוחרר מנעילה');
      }
    }
  };

  // Check if an hour is covered by a block starting earlier
  const isHourCovered = (hourStr) => {
    const [h, m] = hourStr.split(':').map(Number);
    const hourMinutes = h * 60 + m;

    return timelineBlocks.some(b => {
      if (b.isPointEvent || b.startTime === b.endTime) return false;
      const [startH, startM] = b.startTime.split(':').map(Number);
      const [endH, endM] = b.endTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      return startMinutes < hourMinutes && endMinutes > hourMinutes;
    });
  };

  // Get blocks starting in the hour interval
  const getBlocksStartingAtHour = (hourStr) => {
    const [h, m] = hourStr.split(':').map(Number);
    const hourMinutes = h * 60 + m;

    return timelineBlocks.filter(b => {
      const [startH, startM] = b.startTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      return startMinutes >= hourMinutes && startMinutes < hourMinutes + 60;
    });
  };

  // Generate 24-hour array for drops and slots
  const hoursRange = useMemo(() => {
    const hours = [];
    const startHour = parseInt((data?.profile?.wakeTime || '07:00').split(':')[0]);
    let endHour = parseInt((data?.profile?.sleepTime || '23:00').split(':')[0]);
    // A bedtime at/after midnight (00:00 → 0, 01:00 → 1) means END of the day,
    // not early morning. Without this the loop never runs and the timeline shows
    // NO hour rows (an empty schedule even when blocks exist).
    if (endHour <= startHour) endHour = 23;

    for (let i = startHour; i <= endHour; i++) {
      hours.push(String(i).padStart(2, '0') + ':00');
    }
    return hours;
  }, [data?.profile?.wakeTime, data?.profile?.sleepTime]);

  const blockColors = {
    sleep: 'border-slate-500/20 bg-slate-500/5 text-slate-400',
    study: 'border-blue-500/20 bg-blue-500/5 text-blue-600 dark:text-blue-400',
    event: 'border-slate-500/20 bg-card text-foreground',
    meal: 'border-[#059669]/20 bg-[#D1FAE5]/40 text-[#059669] dark:bg-[#059669]/10 dark:text-[#34D399]',
    workout: 'border-[#7C3AED]/20 bg-purple-100/40 text-[#7C3AED] dark:bg-purple-900/20 dark:text-[#A78BFA]',
    travel: 'border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400',
    leisure: 'border-rose-500/20 bg-rose-500/5 text-rose-500 dark:text-rose-400',
    task: 'border-[#059669]/20 bg-[#ECFDF5] text-[#065F46] dark:bg-[#059669]/10 dark:text-[#34D399]',
    reminder: 'border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
  };

  const blockIcons = {
    sleep: Clock,
    study: CalendarIcon,
    event: CalendarIcon,
    meal: Utensils,
    workout: Dumbbell,
    travel: MapPin,
    leisure: Clock,
    task: ListTodo,
    reminder: Bell,
  };

  // Cream v3 shared styles
  const ccCard = { background: '#fff', borderRadius: 22, border: '1px solid rgba(180,140,80,.14)', boxShadow: '0 4px 24px rgba(40,20,0,.07)' };
  const ccBlockCard = { background: '#fff', borderRadius: 14, border: '1px solid rgba(180,140,80,.12)', boxShadow: '0 1px 6px rgba(40,20,0,.04)' };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
    <div className="max-w-6xl mx-auto px-4 py-5 sm:px-6 space-y-5 animate-in fade-in duration-300 pb-28" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* AI Hero — cream v3 */}
      <div className="relative overflow-hidden" style={{ ...ccCard, padding: '22px 20px' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #065F46, #7C3AED 50%, #2563EB)' }} />
        <div style={{ position: 'absolute', top: -60, left: -40, width: 180, height: 180, borderRadius: '50%', background: 'radial-gradient(circle, rgba(124,58,237,.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div className="flex items-center gap-[6px] mb-1.5" style={{ fontSize: 10, fontWeight: 600, color: '#8A7A6A', letterSpacing: '.14em', textTransform: 'uppercase' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#7C3AED', display: 'inline-block' }} className="animate-pulse" />
          {t('ccTitle')}
        </div>
        <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 24, fontWeight: 400, color: '#2A1A0A', letterSpacing: '-.04em', lineHeight: 1.05, marginBottom: 6 }}>
          {format(currentDate, 'EEEE, d MMMM', { locale })}
        </h1>
        <div className="flex items-center gap-1.5" style={{ fontSize: 13, color: '#5A4A3A', lineHeight: 1.6 }}>
          {!weather.loading && !weather.error && (
            <>
              <MapPin className="w-3.5 h-3.5" style={{ color: '#059669' }} />
              <span>{weather.city}</span>
              <span style={{ opacity: 0.5 }}>·</span>
              <span>{weather.min}°–{weather.max}°</span>
              {weather.isNight ? <Moon className="w-3.5 h-3.5" style={{ color: '#7C3AED' }} /> : <Sun className="w-3.5 h-3.5" style={{ color: '#D97706' }} />}
            </>
          )}
        </div>
        {/* Date nav + actions */}
        {activeSubTab === 'schedule' && (
          <div className="flex items-center gap-3 mt-3 pt-3" style={{ borderTop: '1px solid rgba(180,140,80,.1)' }}>
            <button onClick={prevDay} className="p-2 active:scale-95 transition-all cursor-pointer" style={{ borderRadius: '50%', background: '#fff', border: '1px solid rgba(180,140,80,.18)' }}>
              <ChevronRight className="w-4 h-4" style={{ color: '#2A1A0A' }} />
            </button>
            <button onClick={setToday} className="px-4 py-1.5 active:scale-95 transition-all cursor-pointer" style={{ borderRadius: 999, background: '#F0FDF4', border: '1px solid rgba(5,150,105,.2)', fontSize: 11, fontWeight: 600, color: '#065F46' }}>
              {t('today')}
            </button>
            <span className="flex-1" />
            <button onClick={nextDay} className="p-2 active:scale-95 transition-all cursor-pointer" style={{ borderRadius: '50%', background: '#fff', border: '1px solid rgba(180,140,80,.18)' }}>
              <ChevronLeft className="w-4 h-4" style={{ color: '#2A1A0A' }} />
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start animate-in fade-in duration-200">
        
        {/* Left/Middle: Timeline (Spans 2 columns) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Coach Note — cream v3 */}
          {coachNote && (
            <div
              onClick={openCoachChat}
              className="relative overflow-hidden animate-in slide-in-from-top-4 duration-500 cursor-pointer transition-all select-none"
              style={{ ...ccBlockCard, padding: '14px 16px', borderColor: 'rgba(124,58,237,.15)', background: '#fff' }}
            >
              <div className="flex gap-2.5 items-start">
                <div className="shrink-0 flex items-center justify-center" style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #7C3AED, #5B21B6)', color: '#fff', fontSize: 14 }}>
                  <Sparkles className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 style={{ fontSize: 10, fontWeight: 600, color: '#7C3AED', letterSpacing: '.12em', textTransform: 'uppercase' }}>{t('ccCoachNote')}</h4>
                  </div>
                  <p className="mt-1 leading-relaxed" style={{ fontSize: 13, color: '#5A4A3A', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{coachNote}</p>
                </div>
              </div>
            </div>
          )}

          {/* Shabbat Warning */}
          {shabbatBlockIndicator && (
            <div className="flex gap-3 items-center" style={{ ...ccBlockCard, padding: '12px 14px', borderColor: 'rgba(217,119,6,.15)', background: '#FFFBEB' }}>
              <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: '#D97706' }} />
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: '#92400E' }}>{shabbatBlockIndicator.title}</h4>
                <p style={{ fontSize: 11, color: '#8A7A6A', marginTop: 2 }}>{shabbatBlockIndicator.desc}</p>
              </div>
            </div>
          )}

          {/* Timeline Card — cream v3 */}
          <div className="space-y-4" style={{ ...ccCard, padding: '16px 16px' }}>

            {/* Header / Actions */}
            <div className="flex items-center justify-between pb-3" style={{ borderBottom: '1px solid rgba(180,140,80,.1)' }}>
              <h3 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 20, fontWeight: 400, color: '#2A1A0A', letterSpacing: '-.02em' }}>
                <em style={{ fontStyle: 'italic', color: '#7C3AED' }}>{isRTL ? 'הלו״ז שלי' : 'My schedule'}</em>
              </h3>
              <div className="flex gap-2 flex-wrap">
                {(draftSchedule?.date === dateStr && draftSchedule?.blocks?.length > 0) ? (
                  <>
                    <button onClick={handleSaveSchedule} className="px-3 py-1.5 flex items-center gap-1 active:scale-95 transition-all cursor-pointer" style={{ borderRadius: 11, background: '#059669', color: '#fff', fontSize: 11, fontWeight: 700, border: 'none' }}>
                      <Save className="w-3.5 h-3.5" /> {t('ccSaveSchedule')}
                    </button>
                    <button onClick={() => setDraftSchedule({ date: null, blocks: [], coachNote: '' })} className="px-3 py-1.5 flex items-center gap-1 active:scale-95 transition-all cursor-pointer" style={{ borderRadius: 11, background: '#F5F0E8', color: '#8A7A6A', fontSize: 11, fontWeight: 700, border: 'none' }}>
                      <X className="w-3.5 h-3.5" /> {t('ccDiscardDraft')}
                    </button>
                  </>
                ) : (
                  <>
                    {/* Opens the day questionnaire — the answers become the AI directive */}
                    <button onClick={() => setShowMorningCoach(true)} disabled={loading} className="px-3 py-1.5 flex items-center gap-1 active:scale-95 transition-all cursor-pointer" style={{ borderRadius: 11, background: '#7C3AED', color: '#fff', fontSize: 11, fontWeight: 700, border: 'none' }}>
                      <Sparkles className="w-3.5 h-3.5" /> {loading ? t('ccPlanning') : t('ccOrganizeWithAi')}
                    </button>
                    <button onClick={() => setShowWeekPlanner(true)} disabled={loading} className="px-3 py-1.5 flex items-center gap-1 active:scale-95 transition-all cursor-pointer" style={{ borderRadius: 11, background: '#fff', color: '#7C3AED', fontSize: 11, fontWeight: 700, border: '1px solid rgba(124,58,237,.3)' }}>
                      <CalendarRange className="w-3.5 h-3.5" /> תכנן שבוע
                    </button>
                    {timelineBlocks.length > 0 && (
                      <button onClick={handleClearSchedule} className="p-1.5 active:scale-95 transition-all cursor-pointer" style={{ borderRadius: 8, background: '#F5F0E8', border: 'none', color: '#8A7A6A' }} title={t('ccClearDaySchedule')}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Time Slots Layout — cream v3 */}
            <div className="space-y-2 relative">
              <div className="overflow-hidden" style={{ borderRadius: 18, border: '1px solid rgba(180,140,80,.12)', background: '#FAF7F2' }}>
                {timelineBlocks.length === 0 && (
                  <div className="text-center px-4 py-5" style={{ borderBottom: '1px solid rgba(180,140,80,.08)' }}>
                    <p style={{ fontFamily: "'Instrument Serif', serif", fontSize: 16, color: '#5A4A3A' }}>
                      {isRTL ? 'אין עדיין לוז ליום הזה' : 'No schedule for this day yet'}
                    </p>
                    <p style={{ fontSize: 11, color: '#8A7A6A', marginTop: 2 }}>
                      {isRTL ? 'לחץ על "סדר עם AI" או גרור משימות לשעות' : 'Tap "Organize with AI" or drag tasks onto the hours'}
                    </p>
                    {/* Day templates — one-tap directives for the AI planner */}
                    {!loading && (
                      <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                        {DAY_TEMPLATES.map((tpl) => (
                          <button
                            key={tpl.key}
                            onClick={() => handleAutoPlan(isRTL ? tpl.he : tpl.en, false)}
                            className="px-3 py-1.5 active:scale-95 transition-all cursor-pointer"
                            style={{ borderRadius: 999, background: '#fff', border: '1px solid rgba(124,58,237,.25)', color: '#7C3AED', fontSize: 11, fontWeight: 700 }}
                          >
                            {isRTL ? tpl.labelHe : tpl.labelEn}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {hoursRange.map((hour, hourIdx) => {
                  const isCovered = isHourCovered(hour);
                  if (isCovered) return null;

                  const hourBlocks = getBlocksStartingAtHour(hour);
                  const hourMin = timeToMin(hour);
                  const isNowHour = isViewingToday && nowMin >= hourMin && nowMin < hourMin + 60;

                  return (
                    <div
                      key={hour}
                      // The ref lands on the LAST rendered row at/before "now" —
                      // i.e. the nearest visible row to the current time.
                      ref={isViewingToday && hourMin <= nowMin ? nowRowRef : undefined}
                      className={cn(
                        'flex gap-4 items-stretch relative hover:bg-muted/10 transition-colors',
                        hourBlocks.length > 0 ? 'p-3 sm:p-4 min-h-[4.5rem]' : 'px-3 py-1.5 sm:px-4'
                      )}
                      style={hourIdx > 0 ? { borderTop: '1px solid rgba(180,140,80,.07)' } : undefined}
                    >
                      {/* "Now" line — red marker at the current minute */}
                      {isNowHour && (
                        <div className="absolute inset-x-0 z-10 pointer-events-none flex items-center gap-1 px-2" style={{ top: `${((nowMin - hourMin) / 60) * 100}%` }}>
                          <span dir="ltr" style={{ background: '#DC2626', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 999, padding: '1px 6px', lineHeight: '14px' }}>
                            {format(nowTick, 'HH:mm')}
                          </span>
                          <div className="flex-1" style={{ height: 2, borderRadius: 2, background: '#DC2626', opacity: 0.6 }} />
                        </div>
                      )}

                      {/* Hour Indicator — Fraunces */}
                      <div className={cn('w-12 flex items-center justify-start shrink-0 select-none pe-2', hourBlocks.length === 0 && 'opacity-70')} style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontStyle: 'italic', fontSize: hourBlocks.length > 0 ? 17 : 13, letterSpacing: '-.03em', color: '#8A7A6A', borderInlineEnd: '1px solid rgba(180,140,80,.1)' }} dir="ltr">
                        {hour}
                      </div>

                      {/* Content area */}
                      <DroppableHour id={hour} isCovered={isCovered}>
                        <div className="flex-1 flex flex-col gap-2.5 justify-center h-full min-h-[3rem] min-w-0">
                          {hourBlocks.length > 0 ? (
                            hourBlocks.map((block, blockIdx) => {
                              const Icon = blockIcons[block.type] || CalendarIcon;
                              return (
                                <DraggableBlock
                                  key={block.id}
                                  id={block.id}
                                  isLocked={block.isLocked}
                                  data={{ ...block, isTimelineBlock: true }}
                                  onShortTap={() => setActiveActionBlock(block)}
                                >
                                  <div
                                    style={{ animationDelay: `${Math.min(blockIdx * 50, 250)}ms` }}
                                    className={cn(
                                      'rise-in p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm transition-all min-w-0 overflow-hidden',
                                      blockColors[block.type] || 'border-border bg-card',
                                      isBlockNow(block) && 'ring-2 ring-[#059669]/50 shadow-md',
                                      block.isCompleted && 'opacity-55',
                                      block.isLocked && 'bg-[url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPSc0JyBoZWlnaHQ9JzQnPgo8cmVjdCB3aWR0aD0nNCcgaGVpZ2h0PSc0JyBmaWxsPScjZmZmJyBmaWxsLW9wYWNpdHk9JzAnLz4KPHBhdGggZD0nTS0xLDFMMSwtMU0zLDVMNSwzJyBzdHJva2U9JyMwMDAnIHN0cm9rZS1vcGFjaXR5PScwLjA1JyBzdHJva2Utd2lkdGg9JzEnLz4KPC9zdmc+")] opacity-80 border-dashed hover:shadow-none'
                                    )}
                                  >
                                    <div className="flex gap-3 items-center min-w-0 pointer-events-none">
                                      <div className="w-8 h-8 rounded-xl bg-background/50 flex items-center justify-center shrink-0 border border-border/20">
                                        <Icon className="w-4 h-4" />
                                      </div>
                                      <div className="min-w-0 text-start">
                                        <h4 className="font-bold text-sm truncate text-foreground">{block.title}</h4>
                                        {(() => {
                                          const [sh, sm] = (block.startTime || '').split(':').map(Number);
                                          const [eh, em] = (block.endTime || '').split(':').map(Number);
                                          const dur = (eh * 60 + em) - (sh * 60 + sm);
                                          const durLabel = dur > 0 ? (dur >= 60 ? `${Math.floor(dur/60)} שע׳` + (dur % 60 ? ` ${dur%60} דק׳` : '') : `${dur} דק׳`) : null;
                                          const typeLabel = block.type === 'travel' ? (isRTL ? 'נסיעה' : 'Travel') : null;
                                          const sub = [typeLabel, durLabel].filter(Boolean).join(' · ');
                                          return sub ? <p className="text-[11px] opacity-60 mt-0.5">{sub}</p> : null;
                                        })()}
                                        {block.notes && <p className="text-xs opacity-75 mt-0.5 truncate">{block.notes}</p>}
                                      </div>
                                    </div>
                                    
                                    <div className="flex items-center justify-between sm:justify-end gap-2 flex-wrap min-w-0" onClick={(e) => e.stopPropagation()}>
                                  {block.isProposed && (
                                    <span className="text-[10px] font-bold bg-primary/10 text-primary border border-primary/10 px-2 py-0.5 rounded-full shrink-0">
                                      {t('ccAiProposal')}
                                    </span>
                                  )}

                                  {/* Lock / Unlock Toggle Button */}
                                  <button
                                    onClick={() => toggleBlockLock(block)}
                                    className={cn(
                                      "p-1.5 rounded-lg transition-colors border active:scale-90 cursor-pointer",
                                      block.isLocked
                                        ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
                                        : "bg-muted text-muted-foreground border-border/60 hover:bg-muted/80 hover:text-foreground"
                                    )}
                                    title={block.isLocked ? "נעול לשינויי AI (לחץ לפתיחה)" : "פתוח לשינויי AI (לחץ לנעילה)"}
                                  >
                                    {block.isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                                  </button>

                                  {isBlockNow(block) && (
                                    <span className="shrink-0" style={{ background: '#059669', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 999, padding: '2px 8px' }}>
                                      {isRTL ? 'עכשיו' : 'Now'}
                                    </span>
                                  )}

                                  <div className="flex items-center gap-1 text-xs font-semibold whitespace-nowrap" dir="ltr">
                                    <Clock className="w-3.5 h-3.5 opacity-60" />
                                    <span>{block.type === 'meal' || block.startTime === block.endTime
                                      ? block.startTime
                                      : `${block.startTime} - ${block.endTime}`}</span>
                                  </div>
                                  
                                  <button onClick={() => setActiveActionBlock(block)} className="p-1 hover:bg-secondary rounded-lg transition-colors">
                                    <MoreVertical className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </DraggableBlock>
                            );
                          })
                        ) : (
                          <div
                            onClick={() => {
                              setTimePickerModal({ hourStr: hour });
                            }}
                            className="group h-8 flex items-center justify-between hover:bg-primary/5 border border-dashed border-transparent hover:border-primary/20 rounded-xl px-3 transition-all cursor-pointer select-none"
                          >
                            <span className="font-semibold text-[11px] text-muted-foreground/45 group-hover:text-primary transition-colors">
                              + {isRTL ? 'שבץ לשעה זו' : 'Schedule here'}
                            </span>
                            <Plus className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                          </div>
                        )}
                        </div>
                      </DroppableHour>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* AI Input — cream v3. Always visible: plans an empty day, tunes an existing one. */}
          <div className="space-y-3">
            <div className="flex items-center gap-[10px]" style={{ background: '#fff', border: '1.5px solid rgba(124,58,237,.2)', borderRadius: 16, padding: '13px 16px' }}>
              <div className="shrink-0 flex items-center justify-center" style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #7C3AED, #5B21B6)', color: '#fff', fontSize: 14 }}>
                <Sparkles className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={tuneCommand}
                onChange={(e) => setTuneCommand(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAiCommand()}
                placeholder={timelineBlocks.length === 0
                  ? t('ccPlanPlaceholder', 'ספר לי על היום — "מבחן מחר, שאלמד כל היום" / "נסיעה ב-16:00"')
                  : t('ccTunePlaceholder')}
                className="flex-1 outline-none bg-transparent text-start"
                style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 15, color: '#2A1A0A' }}
                disabled={loading}
              />
              <button
                onClick={handleAiCommand}
                disabled={loading || !tuneCommand.trim()}
                className="shrink-0 flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                style={{ width: 30, height: 30, borderRadius: 8, background: tuneCommand.trim() ? '#7C3AED' : '#F5F0E8', color: tuneCommand.trim() ? '#fff' : '#8A7A6A', border: 'none' }}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(timelineBlocks.length === 0
                ? [
                    t('ccChipStudyAllDayGeneric', 'ללמוד כל היום — בלוקי לימוד כלליים'),
                    t('ccChipExamTomorrow', 'יש לי מבחן מחר — שאלמד כל היום'),
                    t('ccChipTripToday', 'יש לי נסיעה היום'),
                    t('ccChipLightDay', 'יום קל — רק הדברים החשובים'),
                  ]
                : [t('ccChipTired'), t('ccChipStudyMorning'), t('ccChipWorkoutEvening'), t('ccChipSpreadTasks')]
              ).map((cmd) => (
                <button key={cmd} onClick={() => setTuneCommand(cmd)} className="active:scale-95 transition-colors cursor-pointer" style={{ borderRadius: 999, padding: '5px 11px', fontSize: 11, fontWeight: 600, background: '#F5F0E8', color: '#8A7A6A', border: 'none' }}>
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Sidebar - Unscheduled Tasks Tray */}
        <div className="lg:col-span-1 space-y-6">
          {/* Unscheduled Tasks — cream v3 */}
          <div className="space-y-4" style={{ ...ccCard, padding: '16px 14px' }}>
            <div>
              <h3 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 18, fontWeight: 400, color: '#2A1A0A', letterSpacing: '-.02em' }}>
                {t('ccUnscheduledTray')}
              </h3>
              <p style={{ fontSize: 11, color: '#8A7A6A', marginTop: 2 }}>{t('ccUnscheduledTrayHint')}</p>
            </div>

            {/* Filter Tabs — cream v3 pills */}
            <div className="flex gap-[6px]">
              {[
                { key: 'all', label: t('ccFilterAll') },
                { key: 'high', label: t('priorityHigh') },
                { key: 'med', label: t('priorityMed') },
                { key: 'low', label: t('priorityLow') },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTaskTab(tab.key)}
                  className="flex-1 text-center transition-colors cursor-pointer active:scale-95"
                  style={{
                    padding: '5px 8px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: activeTaskTab === tab.key ? 600 : 500,
                    background: activeTaskTab === tab.key ? '#7C3AED' : '#F5F0E8',
                    color: activeTaskTab === tab.key ? '#fff' : '#8A7A6A',
                    border: 'none',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tasks list */}
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {sidebarTasks.length > 0 ? (
                sidebarTasks.map((task) => (
                  <DraggableSidebarTask key={task.id} id={task.id} data={{ ...task, isSidebarTask: true }}>
                    <div
                      className="p-3 border border-border rounded-2xl bg-muted/20 hover:bg-muted/40 transition-colors flex items-center justify-between gap-3 group pointer-events-auto"
                    >
                      <div className="flex items-center gap-2 min-w-0 text-start pointer-events-none">
                        <span className={cn(
                          'w-2 h-2 rounded-full shrink-0',
                          task.priority === 'high' ? 'bg-red-500' : task.priority === 'med' ? 'bg-amber-500' : 'bg-slate-400'
                        )} />
                        <p className="text-xs font-semibold truncate text-foreground">{task.title}</p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setTimePickerModal({ taskId: task.id, title: task.title })}
                          className="p-1 rounded bg-background border hover:border-primary text-primary transition-all active:scale-90"
                          title={t('ccManualSchedule')}
                        >
                          <Clock className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </DraggableSidebarTask>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  {t('ccNoUnscheduledTasks')}
                </div>
              )}
            </div>

            {/* Quick manual block generator */}
            <button
              onClick={async () => {
                const label = window.prompt(t('ccEnterBlockTitle'));
                if (!label || !label.trim()) return;
                // Create a real personal task so scheduling actually persists.
                const id = await useStore.getState().addPersonalTask({ title: label.trim(), priority: 'med' });
                if (id) setTimePickerModal({ taskId: id, title: label.trim() });
              }}
              className="w-full py-2.5 rounded-2xl border border-dashed border-border hover:border-primary text-xs font-bold text-muted-foreground hover:text-primary transition-all flex items-center justify-center gap-1"
            >
              <Plus className="w-4 h-4" />
              {t('ccAddCustomBlock')}
            </button>
          </div>
        </div>
      </div>

      {/* Manual Time Picker Dialog (Upgraded to support dual direction) */}
      {timePickerModal && timePickerModal.taskId && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-card border border-border p-6 rounded-3xl max-w-sm w-full shadow-lg space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-foreground">{t('ccPickStartTime')}</h3>
              <button
                onClick={() => setTimePickerModal(null)}
                className="p-1 hover:bg-secondary rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{t('ccScheduleTaskForDay').replace('{title}', timePickerModal.title)}</p>
            
            <div className="grid grid-cols-3 gap-2 max-h-[200px] overflow-y-auto py-1">
              {hoursRange.map((hour) => (
                <button
                  key={hour}
                  onClick={() => handleManualSchedule(timePickerModal.taskId, hour)}
                  className="py-2 border border-border rounded-xl bg-card hover:bg-primary hover:text-primary-foreground hover:border-primary active:scale-95 transition-all text-xs font-bold"
                >
                  {hour}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {timePickerModal && timePickerModal.hourStr && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-card border border-border p-6 rounded-3xl max-w-md w-full shadow-lg space-y-4 animate-in zoom-in-95 duration-200" dir={isRTL ? 'rtl' : 'ltr'}>
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-foreground">שבץ משימה לשעה {timePickerModal.hourStr}</h3>
              <button
                onClick={() => setTimePickerModal(null)}
                className="p-1 hover:bg-secondary rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => {
                const hour = timePickerModal.hourStr;
                setTimePickerModal(null);
                setEditingBlock({
                  id: `temp-new-${Date.now()}`,
                  title: '',
                  type: 'study',
                  startTime: hour,
                  isLocked: true,
                  isProposed: false,
                  notes: ''
                });
              }}
              className="w-full py-2.5 px-4 mb-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-2xl transition-all cursor-pointer font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              {isRTL ? 'יצירת בלוק מותאם אישית' : 'Create Custom Block'}
            </button>
            
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 py-1">
              {sidebarTasks.length > 0 ? (
                sidebarTasks.map((task) => (
                  <button
                    key={task.id}
                    onClick={() => {
                      if (isTimeDuringShabbat(timePickerModal.hourStr)) {
                        toast.error(t('ccCannotScheduleShabbat', 'לא ניתן לשבץ משימות במהלך השבת'));
                        return;
                      }
                      const duration = task.scheduledDuration || data?.profile?.studyBlockDuration || 90;
                      scheduleTask(task.id, dateStr, timePickerModal.hourStr, duration);
                      setTimePickerModal(null);
                      toast.success(t('ccTaskScheduled'));
                    }}
                    className="w-full text-start p-3 border border-border rounded-2xl hover:bg-primary/5 hover:border-primary/30 transition-all flex items-center gap-3"
                  >
                    <span className={cn(
                      'w-2 h-2 rounded-full shrink-0',
                      task.priority === 'high' ? 'bg-red-500' : task.priority === 'med' ? 'bg-amber-500' : 'bg-slate-400'
                    )} />
                    <span className="text-sm font-semibold text-foreground truncate">{task.title}</span>
                  </button>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  אין משימות לא משובצות.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Morning Coach Overlay (Phase 6b) */}
      <MorningCoachOverlay
        isOpen={showMorningCoach}
        isShabbat={isNowDuringShabbat}
        dateStr={dateStr}
        seedText={morningSeed}
        onSubmit={handleCoachSubmit}
        onDismissSession={handleCoachDismissSession}
        onDismissToday={handleCoachDismissToday}
      />

      <WeekPlanner
        isOpen={showWeekPlanner}
        onClose={() => setShowWeekPlanner(false)}
        onPickDay={handlePickWeekDay}
      />

      <AnimatePresence>
        {clarifierText && (
          <SmartClarifier
            userText={clarifierText}
            courses={data?.courses || []}
            onSubmit={handleClarifierSubmit}
            onCancel={() => setClarifierText(null)}
          />
        )}
      </AnimatePresence>

      {/* Drag Overlay for dnd-kit */}
      <DragOverlay dropAnimation={{ duration: 250, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
        {activeDragItem ? (
          activeDragItem.isSidebarTask ? (
            <div className="p-3 border-2 border-primary rounded-2xl bg-card shadow-2xl flex items-center justify-between gap-3 w-64 rotate-2 scale-105 opacity-90" dir={isRTL ? 'rtl' : 'ltr'}>
              <div className="flex items-center gap-2 min-w-0 text-start">
                <span className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  activeDragItem.priority === 'high' ? 'bg-red-500' : activeDragItem.priority === 'med' ? 'bg-amber-500' : 'bg-slate-400'
                )} />
                <p className="text-xs font-semibold truncate text-foreground">{activeDragItem.title}</p>
              </div>
            </div>
          ) : activeDragItem.isTimelineBlock ? (
            <div className={cn(
              "p-4 rounded-2xl border-2 border-primary bg-card shadow-2xl flex flex-col sm:flex-row sm:items-center gap-3 w-72 sm:w-80 rotate-2 scale-105 opacity-95",
              blockColors[activeDragItem.type]
            )} dir={isRTL ? 'rtl' : 'ltr'}>
              <div className="flex gap-3 items-center min-w-0">
                <div className="w-8 h-8 rounded-xl bg-background/50 flex items-center justify-center shrink-0 border border-border/20">
                  <CalendarIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0 text-start">
                  <h4 className="font-bold text-sm truncate text-foreground">{activeDragItem.title}</h4>
                </div>
              </div>
            </div>
          ) : null
        ) : null}
      </DragOverlay>

      {/* Action Sheet */}
      <BlockActionSheet 
        isOpen={!!activeActionBlock}
        block={activeActionBlock}
        onClose={() => setActiveActionBlock(null)}
        onAction={(action) => handleBlockAction(activeActionBlock, action)}
      />

      {/* Block Edit Modal */}
      <BlockEditModal
        isOpen={!!editingBlock}
        block={editingBlock}
        onSave={handleSaveBlock}
        onDelete={handleDeleteBlock}
        onClose={() => setEditingBlock(null)}
      />

      {/* Loading Overlay — animated "schedule being built" skeleton */}
      {loading && (
        <div className="fixed inset-0 bg-background/60 backdrop-blur-md z-[110] flex flex-col items-center justify-center gap-6 px-8">
          <motion.div
            animate={{ rotate: [0, 12, -12, 0], scale: [1, 1.08, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            className="flex items-center justify-center"
            style={{ width: 56, height: 56, borderRadius: 18, background: 'linear-gradient(135deg, #7C3AED, #5B21B6)', boxShadow: '0 8px 30px rgba(124,58,237,.35)' }}
          >
            <Sparkles className="w-7 h-7 text-white" />
          </motion.div>

          {/* Mini timeline that assembles itself in a loop */}
          <div className="w-full max-w-[260px] flex flex-col gap-2" dir={isRTL ? 'rtl' : 'ltr'}>
            {[{ w: '85%', c: 'rgba(37,99,235,.25)' }, { w: '60%', c: 'rgba(5,150,105,.3)' }, { w: '75%', c: 'rgba(124,58,237,.25)' }, { w: '50%', c: 'rgba(217,119,6,.3)' }].map((bar, i) => (
              <div key={i} className="flex items-center gap-2">
                <span style={{ fontFamily: "'Fraunces', serif", fontStyle: 'italic', fontSize: 10, color: '#8A7A6A', width: 26 }} dir="ltr">
                  {String(8 + i * 3).padStart(2, '0')}:00
                </span>
                <motion.div
                  initial={{ scaleX: 0, opacity: 0 }}
                  animate={{ scaleX: [0, 1, 1, 0], opacity: [0, 1, 1, 0] }}
                  transition={{ duration: 2.4, times: [0, 0.25, 0.8, 1], repeat: Infinity, delay: i * 0.22, ease: 'easeInOut' }}
                  className="h-[14px] rounded-md origin-right"
                  style={{ width: bar.w, background: bar.c, transformOrigin: isRTL ? 'right' : 'left' }}
                />
              </div>
            ))}
          </div>

          <p className="text-sm font-black text-foreground">{t('ccAiCalculating')}</p>
        </div>
      )}

    </div>
    </DndContext>
  );
};
