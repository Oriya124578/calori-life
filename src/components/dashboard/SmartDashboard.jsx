import React, { useMemo } from 'react';
import {
  CheckCircle2, Calendar as CalendarIcon, GraduationCap,
  UtensilsCrossed, Dumbbell, Sparkles, Play, ListTodo, Bot, ChevronLeft, ChevronRight,
  Clock, Flame, Plus, Award, Beef, Wheat, Droplet, ExternalLink, Target
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import { cn } from '../../lib/utils';
import { dateKey } from '../../lib/caloriRepo';
import { buildTimeline } from '../../lib/scheduleBuilder';
import {
  format, parseISO, isValid, isSameDay, differenceInCalendarDays,
  startOfDay, addDays
} from 'date-fns';
import { he } from 'date-fns/locale';
import { formatExamDays, formatExamDaysBadge } from '../../lib/examDaysFormat';

const safeParse = (d) => {
  if (!d) return null;
  const dt = typeof d === 'string' ? parseISO(d) : new Date(d);
  return isValid(dt) ? dt : null;
};

export const SmartDashboard = () => {
  const { data, setActiveCategory, togglePersonalTask, draftSchedule, openAddSheet } = useStore();
  const { t, language } = useTranslation();
  const isRTL = language === 'he';
  const locale = isRTL ? he : undefined;
  const displayName = data?.profile?.displayName || '';
  const caloriDate = useStore((s) => s.caloriDate);
  const todayStr = dateKey();

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return t('goodMorning');
    if (h >= 12 && h < 17) return t('goodAfternoon');
    if (h >= 17 && h < 21) return t('goodEvening');
    return t('goodNight');
  };

  // ── Nearest Exam ──
  const nearestExam = useMemo(() => {
    let nearest = null;
    const today = startOfDay(new Date());
    (data?.courses || []).forEach((course) => {
      // 1. Standard Moeds
      ['moedA', 'moedB', 'moedC'].forEach((moed) => {
        const dt = safeParse(course[moed] || course.exams?.[moed]);
        if (!dt) return;
        const days = differenceInCalendarDays(startOfDay(dt), today);
        if (days >= 0 && (!nearest || days < nearest.days)) {
          nearest = { name: course.name, days, moed: moed.replace('moed', '') };
        }
      });
      // 2. Custom Exams
      course.customExams?.forEach((exam) => {
        const dt = safeParse(exam.date);
        if (!dt) return;
        const days = differenceInCalendarDays(startOfDay(dt), today);
        if (days >= 0 && (!nearest || days < nearest.days)) {
          nearest = { name: course.name, days, moed: exam.name };
        }
      });
    });
    return nearest;
  }, [data.courses]);

  // ── Today's tasks count ──
  const todayTasksCount = useMemo(() => {
    const today = new Date();
    return (data?.personalTasks || []).filter(
      (task) => safeParse(task.dueDate) && isSameDay(safeParse(task.dueDate), today) && !task.done
    ).length;
  }, [data.personalTasks]);

  // ── Smart summary ──
  const summaryText = useMemo(() => {
    if (todayTasksCount > 0) return t('summaryTasksToday').replace('{n}', todayTasksCount);
    if (nearestExam) {
      if (nearestExam.days === 0) return t('summaryExamToday').replace('{course}', nearestExam.name);
      if (nearestExam.days === 1) return isRTL
        ? `מבחן ב${nearestExam.name} מחר`
        : `${nearestExam.name} exam tomorrow`;
      if (nearestExam.days === 2) return isRTL
        ? `מבחן ב${nearestExam.name} מחרתיים`
        : `${nearestExam.name} exam day after tomorrow`;
      return t('summaryNextExam').replace('{course}', nearestExam.name).replace('{n}', nearestExam.days);
    }
    return t('summaryAllClear');
  }, [todayTasksCount, nearestExam, t, isRTL]);

  // ── Calori data ──
  const { meals = [], workouts = [], dayHistory, dailyGoal: dbDailyGoal } = data?.calori || {};
  const hasMeals = meals.length > 0;
  const hasWorkouts = workouts.length > 0;
  const totalCalories = hasMeals ? meals.reduce((s, m) => s + (m.calories || 0), 0) : (dayHistory?.calories ?? 0);
  const totalProtein = hasMeals ? meals.reduce((s, m) => s + (m.protein || 0), 0) : (dayHistory?.protein ?? 0);
  const totalCarbs = hasMeals ? meals.reduce((s, m) => s + (m.carbs || 0), 0) : (dayHistory?.carbs ?? 0);
  const totalFats = hasMeals ? meals.reduce((s, m) => s + (m.fats || 0), 0) : (dayHistory?.fats ?? 0);
  const burned = hasWorkouts ? workouts.reduce((s, w) => s + (w.caloriesBurned || 0), 0) : (dayHistory?.workout_calories ?? 0);
  const workoutMin = hasWorkouts ? workouts.reduce((s, w) => s + (w.durationMinutes || 0), 0) : (dayHistory?.workout_minutes ?? 0);
  const dailyGoal = dbDailyGoal || 1300;
  const calsPercentage = Math.min(100, Math.round((totalCalories / dailyGoal) * 100));
  const weight = data?.calori?.weight || data?.calori?.dayHistory?.weight;

  // ── Timeline blocks ──
  // Single source of truth: a today draft wins; otherwise buildTimeline (same
  // selector the manager uses) reads the SAVED cl_schedule doc and overlays
  // events + scheduled tasks + calori. This is what keeps the home "today" list
  // in sync with the schedule created in the manager.
  const todayBlocks = useMemo(() => {
    const ds = todayStr;

    let base;
    if (draftSchedule?.date === ds && draftSchedule?.blocks?.length > 0) {
      base = draftSchedule.blocks;
    } else {
      const scheduleDoc =
        data?.schedule && (!data.schedule._docDate || data.schedule._docDate === ds)
          ? data.schedule
          : null;
      base = buildTimeline({
        scheduleDoc,
        events: data?.events,
        personalTasks: data?.personalTasks,
        calori: data?.calori,
        dateStr: ds,
        todayStr: ds,
        options: { filterLeisure: true, includeCalori: 'todayOnly' },
      });
    }

    const blocks = base
      .filter((b) => b.type !== 'leisure' && !b.title?.includes('הפסקה'))
      .map((b) => ({
        id: b.id,
        type: b.type || 'event',
        title: b.title,
        time: b.startTime || '',
        sub: (b.type === 'meal' || b.type === 'workout') ? (b.notes || '') : '',
      }));

    // All-day exams on top of the timed blocks.
    (data?.courses || []).forEach((course) => {
      ['moedA', 'moedB', 'moedC'].forEach((moed) => {
        const dt = safeParse(course[moed] || course.exams?.[moed]);
        if (dt && isSameDay(dt, new Date())) {
          blocks.push({ id: `exam-${course.id}`, type: 'exam', title: `⏰ ${course.name}`, time: t('allDay'), sub: '' });
        }
      });
    });

    return blocks.sort((a, b) => (a.time || '').localeCompare(b.time || '')).slice(0, 6);
  }, [data, todayStr, draftSchedule, t]);

  // ── Upcoming 7 days ──
  const upcomingItems = useMemo(() => {
    const today = new Date();
    const items = [];
    (data?.courses || []).forEach((course) => {
      ['moedA', 'moedB', 'moedC'].forEach((moed) => {
        const dt = safeParse(course[moed] || course.exams?.[moed]);
        if (dt) {
          const d = differenceInCalendarDays(startOfDay(dt), startOfDay(today));
          if (d > 0 && d <= 7) items.push({ id: `e-${course.id}-${moed}`, kind: 'exam', title: `${course.name} — ${t(moed)}`, date: dt });
        }
      });
    });
    (data?.events || []).forEach((ev) => {
      const dt = safeParse(ev.start);
      if (dt) {
        const d = differenceInCalendarDays(startOfDay(dt), startOfDay(today));
        if (d > 0 && d <= 7) items.push({ id: ev.id, kind: 'event', title: ev.title, date: dt });
      }
    });
    (data?.personalTasks || []).forEach((task) => {
      const dt = safeParse(task.dueDate);
      if (dt && !task.done) {
        const d = differenceInCalendarDays(startOfDay(dt), startOfDay(today));
        if (d > 0 && d <= 7) items.push({ id: task.id, kind: 'task', title: task.title, date: dt });
      }
    });
    return items.sort((a, b) => a.date - b.date).slice(0, 4);
  }, [data, t]);

  const getTimeSegment = (time) => {
    if (!time || time === t('allDay')) return t('evening', 'ערב');
    const h = parseInt(time.split(':')[0], 10);
    if (h < 12) return t('morning', 'בוקר');
    if (h < 17) return t('afternoon', 'צהריים');
    return t('evening', 'ערב');
  };

  return (
    <div className="max-w-lg mx-auto w-full px-3.5 py-3 space-y-2.5 rise-in-stagger" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ══════ HERO CARD — cream v3 unified ══════ */}
      <div
        className="rounded-[22px] p-5 pb-4 relative overflow-hidden"
        style={{
          background: '#FFFFFF',
          border: '1px solid rgba(180,140,80,.14)',
          boxShadow: '0 4px 24px rgba(40,20,0,.07), 0 1px 0 rgba(255,255,255,.8) inset',
        }}
      >
        {/* Green top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: 'linear-gradient(90deg,#065F46,#059669 50%,#047857)' }} />
        {/* Warm texture hint */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 80% 60% at 100% 0%, rgba(255,245,220,.4) 0%, transparent 60%)' }} />

        {/* Top: greeting + exam badge */}
        <div className="flex justify-between items-start mb-4 relative">
          <div>
            <div className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: '#8A7A6A' }}>
              {format(new Date(), 'EEEE · d MMMM yyyy', { locale })}
            </div>
            <div className="mt-1.5" style={{ fontFamily: "'Instrument Serif', serif", fontSize: '27px', fontWeight: 400, color: '#2A1A0A', letterSpacing: '-.04em', lineHeight: 1.05 }}>
              {getGreeting()},<br />
              <span style={{ color: '#059669', fontStyle: 'italic' }}>{displayName || t('user')} 👋</span>
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#059669' }} />
              <span className="text-xs font-semibold" style={{ color: '#8A7A6A' }}>{summaryText}</span>
            </div>
          </div>
          {nearestExam && (
            <div className="text-center shrink-0 rounded-[14px] px-3 py-2.5" style={{ background: '#F0FDF4', border: '1px solid rgba(5,150,105,.2)' }}>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: '26px', fontWeight: 600, fontStyle: 'italic', color: '#065F46', lineHeight: 1, letterSpacing: '-.04em' }}>
                {formatExamDaysBadge(nearestExam.days, isRTL).number}
              </div>
              <div className="text-[9px] mt-0.5" style={{ color: 'rgba(6,95,70,.5)' }}>
                {nearestExam.days <= 2
                  ? formatExamDaysBadge(nearestExam.days, isRTL).label
                  : `${t('daysTo', 'ימים ל')}${nearestExam.name.length > 8 ? nearestExam.name.slice(0, 8) + '…' : nearestExam.name}`
                }
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid rgba(180,140,80,.1)', marginBottom: '14px' }} />

        {/* Nutrition row */}
        <div className="flex items-center gap-3 relative">
          <div className="flex-1">
            <div className="flex gap-0 mb-2.5">
              {/* Calories */}
              <div className="flex-1 pe-2.5">
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: '30px', fontWeight: 600, fontStyle: 'italic', color: '#059669', letterSpacing: '-.04em', lineHeight: 1 }}>
                  {totalCalories}
                </div>
                <div className="text-[10px] mt-1" style={{ color: '#8A7A6A' }}>{t('caloriesShort', 'קק"ל')} / {dailyGoal.toLocaleString()}</div>
              </div>
              {/* Workout */}
              <div className="flex-1 px-2.5" style={{ borderRight: '1px solid rgba(180,140,80,.1)' }}>
                {burned > 0 ? (
                  <>
                    <div style={{ fontFamily: "'Fraunces', serif", fontSize: '20px', fontWeight: 600, fontStyle: 'italic', color: '#7C3AED', letterSpacing: '-.03em', lineHeight: 1 }}>
                      +{burned}
                    </div>
                    <div className="text-[10px] mt-1" style={{ color: '#8A7A6A' }}>{t('caloriesBurned', 'נשרפו')} · {workoutMin}{t('min', 'ד׳')}</div>
                  </>
                ) : (
                  <>
                    <div className="text-sm leading-tight" style={{ color: '#8A7A6A' }}>{t('noWorkoutToday', 'לא היה')}<br />{t('noWorkoutToday2', 'אימון היום')}</div>
                    <div className="text-[10px] mt-1" style={{ color: '#8A7A6A' }}>{t('trySoon', 'נסה בקרוב')}</div>
                  </>
                )}
              </div>
              {/* Weight */}
              <div className="flex-1 px-2.5" style={{ borderRight: '1px solid rgba(180,140,80,.1)' }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: '18px', fontWeight: 600, fontStyle: 'italic', color: '#2A1A0A', letterSpacing: '-.02em', lineHeight: 1 }}>
                  {weight || '—'}
                </div>
                <div className="text-[10px] mt-1" style={{ color: '#8A7A6A' }}>{t('kg', 'ק"ג')} · {t('target', 'יעד')} {data?.calori?.targetWeight || 78}</div>
              </div>
            </div>
            {/* Macros pills */}
            <div className="flex gap-1.5">
              <span className="rounded-md px-2.5 py-1 text-[11px] font-bold" style={{ background: '#ECFDF5', color: '#065F46', border: '1px solid rgba(5,150,105,.15)' }}>
                {t('caloriProtein')} {totalProtein}g
              </span>
              <span className="rounded-md px-2.5 py-1 text-[11px] font-bold" style={{ background: '#FFFBEB', color: '#D97706', border: '1px solid rgba(217,119,6,.15)' }}>
                {totalCarbs}g
              </span>
              <span className="rounded-md px-2.5 py-1 text-[11px] font-bold" style={{ background: '#FFF5F5', color: '#DC2626', border: '1px solid rgba(220,38,38,.12)' }}>
                {t('caloriFats', 'שומן')} {totalFats}g
              </span>
            </div>
          </div>

          {/* Progress rings */}
          <div className="relative shrink-0">
            <svg width="88" height="88" viewBox="0 0 88 88" fill="none">
              <circle cx="44" cy="44" r="37" stroke="rgba(5,150,105,.1)" strokeWidth="10" />
              <circle cx="44" cy="44" r="37" stroke="#059669" strokeWidth="10" strokeLinecap="round"
                strokeDasharray="233" strokeDashoffset={233 - (233 * calsPercentage) / 100}
                transform="rotate(-90 44 44)" className="transition-all duration-700" />
              <circle cx="44" cy="44" r="26" stroke="rgba(124,58,237,.08)" strokeWidth="9" />
              <circle cx="44" cy="44" r="26" stroke="#7C3AED" strokeWidth="9" strokeLinecap="round"
                strokeDasharray="163" strokeDashoffset={163 - (163 * Math.min(100, burned > 0 ? Math.round((burned / 300) * 100) : 0)) / 100}
                transform="rotate(-90 44 44)" className="transition-all duration-700" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[15px] font-extrabold" style={{ color: '#2A1A0A' }}>{calsPercentage}%</span>
              <span className="text-[9px]" style={{ color: '#8A7A6A' }}>{t('completed', 'הושלם')}</span>
            </div>
          </div>
        </div>

        {/* CTA: open calori */}
        <button
          onClick={() => setActiveCategory('calori')}
          className="w-full mt-3.5 pt-3 flex items-center justify-between cursor-pointer"
          style={{ borderTop: '1px solid rgba(180,140,80,.1)', fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: '13px', color: '#059669' }}
        >
          <span>{t('openCaloriDetails', 'פתח קלורי · פרטי תזונה ואימונים מלאים')}</span>
          <span style={{ fontFamily: "'Inter', sans-serif", fontStyle: 'normal', fontWeight: 700, fontSize: '18px' }}>›</span>
        </button>
      </div>

      {/* ══════ QA PILLS — cream v3 ══════ */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => openAddSheet('task')}
          className="shrink-0 flex items-center gap-2 rounded-[14px] px-4 py-2.5 active:scale-95 transition-transform"
          style={{ background: '#059669', boxShadow: '0 4px 16px rgba(5,150,105,.28)' }}
        >
          <div className="w-[26px] h-[26px] rounded-lg flex items-center justify-center text-[13px]" style={{ background: 'rgba(255,255,255,.2)', color: '#fff' }}>＋</div>
          <span className="text-xs font-bold text-white">{t('addNewItem', 'הוסף פריט')}</span>
        </button>
        {[
          { label: t('myNotes', 'פתקים'), icon: '📒', bg: '#ECFDF5', cat: 'notes' },
          { label: t('myTasks', 'משימות'), icon: '✓', bg: '#EFF4FF', cat: 'tasks' },
          { label: t('navFocus', 'פומודורו'), icon: '⏱', bg: '#F3EFFB', cat: 'focus' },
        ].map((pill) => (
          <button
            key={pill.cat}
            onClick={() => setActiveCategory(pill.cat)}
            className="shrink-0 flex items-center gap-2 rounded-[14px] px-4 py-2.5 active:scale-95 transition-transform"
            style={{ background: '#fff', border: '1px solid rgba(180,140,80,.18)', boxShadow: '0 2px 8px rgba(40,20,0,.06)' }}
          >
            <div className="w-[26px] h-[26px] rounded-lg flex items-center justify-center text-[13px]" style={{ background: pill.bg }}>{pill.icon}</div>
            <span className="text-xs font-bold" style={{ color: '#2A1A0A' }}>{pill.label}</span>
          </button>
        ))}
      </div>

      {/* ══════ TIMELINE — cream v3 ══════ */}
      <div>
        <div className="flex justify-between items-center px-0.5 pb-2">
          <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: '18px', fontWeight: 400, color: '#2A1A0A', letterSpacing: '-.02em' }}>
            {t('today', 'היום')}
          </span>
          <button onClick={() => setActiveCategory('calendar')} className="text-[11px] font-bold cursor-pointer" style={{ color: '#059669' }}>
            {t('openCalendar', 'יומן')} ›
          </button>
        </div>

        {todayBlocks.length > 0 ? (
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 no-scrollbar">
            {todayBlocks.map((block) => {
              const dotColor = block.type === 'meal' ? '#059669' : block.type === 'workout' ? '#7C3AED' : block.type === 'exam' ? '#EF4444' : block.type === 'reminder' ? '#D97706' : block.type === 'task' ? '#059669' : '#D6C8B8';
              const cardStyle = block.type === 'meal'
                ? { background: '#059669', color: '#fff' }
                : block.type === 'exam'
                ? { background: '#FEF2F2', border: '1px solid rgba(239,68,68,.1)', color: '#991B1B' }
                : block.type === 'workout'
                ? { background: '#7C3AED', color: '#fff' }
                : { background: 'rgba(180,140,80,.05)', border: '1.5px dashed rgba(180,140,80,.2)', color: '#8A7A6A' };

              return (
                <div key={block.id} className="flex gap-2.5 items-stretch">
                  <div className="w-[34px] text-center shrink-0 pt-2.5 text-[10px] font-semibold" style={{ color: '#8A7A6A' }}>{block.time}</div>
                  <div className="flex flex-col items-center shrink-0 w-3.5">
                    <div className="w-[9px] h-[9px] rounded-full mt-2.5" style={{ background: dotColor, boxShadow: dotColor !== '#D6C8B8' ? `0 0 0 2px ${dotColor}33` : 'none' }} />
                    <div className="flex-1 w-[1.5px] mt-1" style={{ background: 'rgba(180,140,80,.15)' }} />
                  </div>
                  <div className="flex-1 rounded-[14px] px-3.5 py-2.5" style={cardStyle}>
                    <div className="text-[13px] font-bold">{block.title}</div>
                    {block.sub && <div className="text-[11px] mt-0.5" style={{ opacity: 0.65 }}>{block.sub}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <button
            onClick={() => setActiveCategory('commandCenter')}
            className="w-full rounded-[16px] px-4 py-5 flex flex-col items-center gap-2 active:scale-[0.98] transition-transform"
            style={{ background: 'rgba(5,150,105,.05)', border: '1.5px dashed rgba(5,150,105,.28)' }}
          >
            <Sparkles className="w-5 h-5" style={{ color: '#059669' }} />
            <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: '16px', color: '#2A1A0A' }}>
              {t('emptyDayTitle', 'היום עוד פנוי')}
            </span>
            <span className="text-[12px] font-semibold" style={{ color: '#059669' }}>
              {t('emptyDayCta', 'בנה לי את היום ›')}
            </span>
          </button>
        )}
      </div>

      {/* ══════ 3 MINI STATS — cream v3 ══════ */}
      <div className="flex gap-2">
        <div className="flex-1 rounded-2xl px-3 py-3" style={{ background: '#fff', border: '1px solid rgba(180,140,80,.12)', boxShadow: '0 2px 10px rgba(40,20,0,.05)' }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: '24px', fontWeight: 600, fontStyle: 'italic', color: '#059669', letterSpacing: '-.04em', lineHeight: 1 }}>
            {nearestExam ? formatExamDaysBadge(nearestExam.days, isRTL).number : '—'}
          </div>
          <div className="text-[10px] font-semibold mt-1" style={{ color: '#8A7A6A' }}>
            {nearestExam && nearestExam.days <= 2
              ? formatExamDaysBadge(nearestExam.days, isRTL).label
              : t('daysToExam', 'ימים לבחינה')
            }
          </div>
        </div>
        <div className="flex-1 rounded-2xl px-3 py-3" style={{ background: '#fff', border: '1px solid rgba(180,140,80,.12)', boxShadow: '0 2px 10px rgba(40,20,0,.05)' }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: '24px', fontWeight: 600, fontStyle: 'italic', color: '#7C3AED', letterSpacing: '-.04em', lineHeight: 1 }}>
            {data?.pomodoroSessions?.filter(s => { const d = safeParse(s.startedAt); return d && isSameDay(d, new Date()); }).length || 0}
          </div>
          <div className="text-[10px] font-semibold mt-1" style={{ color: '#8A7A6A' }}>{t('pomodoroSessions', 'פומודורו')}</div>
        </div>
        <div className="flex-1 rounded-2xl px-3 py-3" style={{ background: '#fff', border: '1px solid rgba(180,140,80,.12)', boxShadow: '0 2px 10px rgba(40,20,0,.05)' }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: '24px', fontWeight: 600, fontStyle: 'italic', color: '#2A1A0A', letterSpacing: '-.04em', lineHeight: 1 }}>
            {todayTasksCount}
          </div>
          <div className="text-[10px] font-semibold mt-1" style={{ color: '#8A7A6A' }}>{t('myTasks', 'משימות')}</div>
        </div>
      </div>

      {/* ══════ AI QUICK LINKS ══════ */}
      <AiQuickLinks data={data} t={t} />

      {/* ══════ UPCOMING 7 DAYS ══════ */}
      {upcomingItems.length > 0 && (
        <div>
          <div className="flex items-center justify-between px-0.5 mb-2">
            <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: '16px', fontWeight: 400, color: '#2A1A0A' }}>
              {t('comingUp', 'בקרוב')}
            </span>
            <button onClick={() => setActiveCategory('calendar')} className="text-[11px] font-bold cursor-pointer" style={{ color: '#059669' }}>
              {t('openCalendar', 'יומן')} ›
            </button>
          </div>
          <div className="space-y-1.5">
            {upcomingItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveCategory('calendar')}
                className="w-full flex items-center justify-between gap-3 rounded-[14px] px-3.5 py-2.5 active:scale-[0.99] transition-transform text-start"
                style={{ background: '#fff', border: '1px solid rgba(180,140,80,.12)' }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn("w-2 h-2 rounded-full shrink-0",
                    item.kind === 'exam' ? "bg-red-500" : item.kind === 'event' ? "bg-blue-500" : "bg-amber-500"
                  )} />
                  <span className="text-sm font-semibold truncate" style={{ color: '#2A1A0A' }}>{item.title}</span>
                </div>
                <span className="text-xs font-bold shrink-0" style={{ color: '#8A7A6A' }}>
                  {isValid(item.date) && format(item.date, 'EEE d/M', { locale })}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const AiQuickLinks = ({ data, t }) => {
  const courses = (data?.courses || []).filter((c) => !c.isArchived);
  const withLinks = courses
    .map((c) => {
      const links = data?.links?.[c.id] || {};
      const url = links.notebookLm || links.gemini || '';
      return url ? { id: c.id, name: c.name, url } : null;
    })
    .filter(Boolean);

  if (withLinks.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 px-0.5 mb-2">
        <Bot className="w-4 h-4 shrink-0" style={{ color: '#059669' }} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#8A7A6A' }}>{t('aiQuickLinks', 'AI קישורים')}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {withLinks.map((c) => (
          <a
            key={c.id}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-[14px] active:scale-95 transition-transform"
            style={{ background: '#fff', border: '1px solid rgba(180,140,80,.12)' }}
          >
            <Bot className="w-4 h-4 shrink-0" style={{ color: '#059669' }} />
            <span className="text-xs font-semibold whitespace-nowrap" style={{ color: '#2A1A0A' }}>{c.name}</span>
          </a>
        ))}
      </div>
    </div>
  );
};
