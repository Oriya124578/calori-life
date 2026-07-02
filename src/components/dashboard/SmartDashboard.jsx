import React, { useMemo } from 'react';
import { 
  Sparkles, 
  Bot, 
  UtensilsCrossed, 
  Dumbbell, 
  CheckSquare, 
  GraduationCap, 
  Flame, 
  Scale, 
  Plus, 
  ChevronLeft,
  Clock
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import { cn } from '../../lib/utils';
import { dateKey } from '../../lib/caloriRepo';
import { buildTimeline } from '../../lib/scheduleBuilder';
import {
  format, parseISO, isValid, isSameDay, differenceInCalendarDays,
  startOfDay
} from 'date-fns';
import { he } from 'date-fns/locale';
import { formatExamDaysBadge, getNearestExam, collectUpcomingExams } from '../../lib/examDaysFormat';
import { Stagger } from '../../lib/motion';

const safeParse = (d) => {
  if (!d) return null;
  const dt = typeof d === 'string' ? parseISO(d) : new Date(d);
  return isValid(dt) ? dt : null;
};

export const SmartDashboard = () => {
  const { data, setActiveCategory, draftSchedule, openAddSheet, setCalendarDate } = useStore();
  const { t, language } = useTranslation();
  const isRTL = language === 'he';
  const locale = isRTL ? he : undefined;
  const displayName = data?.profile?.displayName || '';
  const todayStr = dateKey();

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return t('goodMorning');
    if (h >= 12 && h < 17) return t('goodAfternoon');
    if (h >= 17 && h < 21) return t('goodEvening');
    return t('goodNight');
  };

  // ── Nearest Exam ──
  // Deliberately NOT filtered by "active academic year/semester" — an exam is
  // real regardless of that course-record tag (older/migrated courses often
  // don't have it set), and every other screen (Studies, course details, exams
  // board) shows exams unfiltered too. Filtering here was the bug: it could
  // silently hide the true nearest exam and fall back to a farther one.
  const nearestExam = useMemo(() => {
    const nearest = getNearestExam(data?.courses);
    if (!nearest) return null;
    return { name: nearest.courseName, days: nearest.days, moed: nearest.moed, date: nearest.date };
  }, [data.courses]);

  // ── Today's tasks count (including overdue tasks) ──
  const todayTasksCount = useMemo(() => {
    return (data?.personalTasks || []).filter((task) => {
      if (task.done) return false;
      if (task.list === 'today') return true;
      const d = (task.dueDate || '').slice(0, 10);
      if (!d) return false;
      if (d === todayStr) return true;
      if (d < todayStr) return true; // overdue, not done
      return false;
    }).length;
  }, [data.personalTasks, todayStr]);

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

    // All-day exams on top of the timed blocks — not filtered by active
    // semester (an exam is real regardless of that course-record tag).
    collectUpcomingExams(data?.courses).forEach((exam) => {
      if (isSameDay(exam.date, new Date())) {
        blocks.push({ id: `exam-${exam.courseId}-${exam.type}`, type: 'exam', title: `⏰ ${exam.courseName}`, time: t('allDay'), sub: '' });
      }
    });

    return blocks.sort((a, b) => (a.time || '').localeCompare(b.time || '')).slice(0, 6);
  }, [data, todayStr, draftSchedule, t]);

  // ── Upcoming 7 days (including overdue tasks) ──
  const upcomingItems = useMemo(() => {
    const today = new Date();
    const items = [];

    // Same unfiltered exam set as `nearestExam` — no active-semester filter.
    collectUpcomingExams(data?.courses).forEach((exam) => {
      if (exam.days > 0 && exam.days <= 7) {
        items.push({
          id: `e-${exam.courseId}-${exam.type}`,
          kind: 'exam',
          title: `${exam.courseName} — ${exam.custom ? exam.moed : t(exam.type)}`,
          date: exam.date,
        });
      }
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
        if (d < 0 || (d > 0 && d <= 7)) {
          items.push({ 
            id: task.id, 
            kind: 'task', 
            title: task.title, 
            date: dt,
            isOverdue: d < 0
          });
        }
      }
    });
    return items.sort((a, b) => a.date - b.date).slice(0, 5);
  }, [data, t]);

  return (
    <div className="max-w-lg mx-auto w-full px-3.5 py-3 space-y-4 rise-in-stagger min-[900px]:max-w-none min-[900px]:space-y-0 min-[900px]:grid min-[900px]:grid-cols-2 min-[900px]:gap-6 min-[900px]:items-start" dir={isRTL ? 'rtl' : 'ltr'}>

      {/* ══════ HERO CARD — premium elevated design ══════ */}
      <div
        className="rounded-[24px] p-6 pb-5 relative overflow-hidden min-[900px]:col-span-2 transition-all duration-300"
        style={{
          background: 'var(--color-card)',
          border: '1px solid var(--cream-border)',
          boxShadow: '0 12px 36px -12px rgba(40,20,0,.09), 0 1px 0 rgba(255,255,255,.9) inset',
        }}
      >
        {/* Brand linear top accent */}
        <div className="absolute top-0 left-0 right-0 h-[4px]" style={{ background: 'linear-gradient(90deg, #10B981, #059669 50%, #7C3AED)' }} />
        {/* Glassmorphic warm glow */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(circle 260px at 100% 0%, rgba(255,245,220,.45) 0%, transparent 100%)' }} />

        {/* Top: greeting + exam badge */}
        <div className="flex justify-between items-start mb-5 relative">
          <div>
            <div className="text-[10px] font-bold tracking-widest uppercase text-cream-muted">
              {format(new Date(), 'EEEE · d MMMM yyyy', { locale })}
            </div>
            <div className="mt-2" style={{ fontFamily: "'Instrument Serif', serif", fontSize: '32px', fontWeight: 400, color: 'var(--cream-text)', letterSpacing: '-.03em', lineHeight: 1.05 }}>
              {getGreeting()},<br />
              <span className="font-bold font-serif" style={{ color: '#059669', fontStyle: 'italic' }}>{displayName || t('user')} 👋</span>
            </div>
            <div className="flex items-center gap-2 mt-3.5 bg-primary/5 rounded-full px-3 py-1 w-fit border border-primary/10">
              <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse shrink-0" />
              <span className="text-xs font-bold text-cream-text">{summaryText}</span>
            </div>
          </div>
          {nearestExam && (
            <div className="text-center shrink-0 rounded-[18px] px-4 py-3 bg-red-500/5 border border-red-500/15 shadow-sm">
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: '28px', fontWeight: 600, fontStyle: 'italic', color: '#B91C1C', lineHeight: 1, letterSpacing: '-.04em' }}>
                {formatExamDaysBadge(nearestExam.days, isRTL).number}
              </div>
              <div className="text-[9px] font-bold mt-1 text-red-700/70">
                {nearestExam.days <= 2
                  ? formatExamDaysBadge(nearestExam.days, isRTL).label
                  : `${t('daysTo', 'ימים ל')}${nearestExam.name.length > 8 ? nearestExam.name.slice(0, 8) + '…' : nearestExam.name}`
                }
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--cream-border)', marginBottom: '16px' }} />

        {/* Nutrition & Fitness stats row */}
        <div className="flex items-center gap-4 relative">
          <div className="flex-1">
            <div className="grid grid-cols-3 gap-1 mb-3.5">
              {/* Calories consumed */}
              <div className="pe-2">
                <div className="flex items-center gap-1">
                  <UtensilsCrossed className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: '28px', fontWeight: 600, fontStyle: 'italic', color: '#059669', letterSpacing: '-.03em', lineHeight: 1 }}>
                    {totalCalories}
                  </div>
                </div>
                <div className="text-[9px] font-semibold mt-1 text-cream-muted">{t('caloriesShort', 'קק"ל')} / {dailyGoal.toLocaleString()}</div>
              </div>
              
              {/* Workout burned */}
              <div className="px-3 border-r border-l" style={{ borderColor: 'var(--cream-border)' }}>
                {burned > 0 ? (
                  <>
                    <div className="flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                      <div style={{ fontFamily: "'Fraunces', serif", fontSize: '24px', fontWeight: 600, fontStyle: 'italic', color: '#7C3AED', letterSpacing: '-.03em', lineHeight: 1 }}>
                        +{burned}
                      </div>
                    </div>
                    <div className="text-[9px] font-semibold mt-1 text-cream-muted">{t('caloriesBurned', 'נשרפו')} · {workoutMin}{t('min', 'ד׳')}</div>
                  </>
                ) : (
                  <>
                    <div className="text-xs font-semibold leading-tight text-cream-muted">{t('noWorkoutToday', 'אין אימון')}</div>
                    <div className="text-[9px] mt-1 text-cream-muted">{t('trySoon', 'בקרוב')}</div>
                  </>
                )}
              </div>
              
              {/* Current Weight */}
              <div className="ps-3">
                <div className="flex items-center gap-1">
                  <Scale className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: '22px', fontWeight: 600, fontStyle: 'italic', color: 'var(--cream-text)', letterSpacing: '-.02em', lineHeight: 1 }}>
                    {weight || '—'}
                  </div>
                </div>
                <div className="text-[9px] font-semibold mt-1 text-cream-muted">{t('kg', 'ק"ג')} · {t('target', 'יעד')} {data?.calori?.targetWeight || 78}</div>
              </div>
            </div>
            
            {/* Macros pills row */}
            <div className="flex flex-wrap gap-1.5">
              <span className="rounded-lg px-2.5 py-1 text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-500/10">
                {t('caloriProtein')} {totalProtein}g
              </span>
              <span className="rounded-lg px-2.5 py-1 text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-500/10">
                {totalCarbs}g {t('caloriCarbs', 'פחמימות')}
              </span>
              <span className="rounded-lg px-2.5 py-1 text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-500/10">
                {totalFats}g {t('caloriFats', 'שומן')}
              </span>
            </div>
          </div>

          {/* Dual Progress rings */}
          <div className="relative shrink-0 select-none">
            <svg width="92" height="92" viewBox="0 0 92 92" fill="none" className="drop-shadow-sm">
              {/* Consumed calories ring */}
              <circle cx="46" cy="46" r="39" stroke="rgba(5,150,105,.08)" strokeWidth="8" />
              <circle cx="46" cy="46" r="39" stroke="#059669" strokeWidth="8" strokeLinecap="round"
                strokeDasharray="245" strokeDashoffset={245 - (245 * calsPercentage) / 100}
                transform="rotate(-90 46 46)" className="transition-all duration-700" />
              {/* Burned calories ring */}
              <circle cx="46" cy="46" r="28" stroke="rgba(124,58,237,.06)" strokeWidth="7" />
              <circle cx="46" cy="46" r="28" stroke="#7C3AED" strokeWidth="7" strokeLinecap="round"
                strokeDasharray="176" strokeDashoffset={176 - (176 * Math.min(100, burned > 0 ? Math.round((burned / 300) * 100) : 0)) / 100}
                transform="rotate(-90 46 46)" className="transition-all duration-700" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[14px] font-extrabold text-cream-text">{calsPercentage}%</span>
              <span className="text-[8px] font-bold text-cream-muted uppercase tracking-wider">{t('completed', 'מדד')}</span>
            </div>
          </div>
        </div>

        {/* CTA: open calori */}
        <button
          onClick={() => setActiveCategory('calori')}
          className="w-full mt-4 pt-3 flex items-center justify-between cursor-pointer group"
          style={{ borderTop: '1px solid var(--cream-border)' }}
        >
          <span className="text-xs font-semibold text-emerald-700 group-hover:text-emerald-800 transition-colors">
            {t('openCaloriDetails', 'פתח קלורי · פרטי תזונה ואימונים מלאים')}
          </span>
          <ChevronLeft className="w-4 h-4 text-emerald-600 transition-transform group-hover:-translate-x-1 shrink-0" />
        </button>
      </div>

      {/* ══════ QUICK ACTIONS PILLS — premium rounded chips ══════ */}
      <div className="flex gap-2.5 overflow-x-auto pb-1.5 no-scrollbar min-[900px]:col-span-2">
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => openAddSheet('task')}
          className="shrink-0 flex items-center gap-2 rounded-2xl px-4 py-3 active:scale-95 transition-transform cursor-pointer shadow-sm"
          style={{ background: 'linear-gradient(135deg, #059669, #047857)', boxShadow: '0 4px 14px rgba(5,150,105,.25)' }}
        >
          <Plus className="w-4 h-4 text-white" strokeWidth={3} />
          <span className="text-xs font-bold text-white">{t('addNewItem', 'הוסף פריט')}</span>
        </motion.button>
        {[
          { label: t('myNotes', 'פתקים'), icon: '📒', bg: '#FDF6E2', cat: 'notes' },
          { label: t('myTasks', 'משימות'), icon: '✓', bg: '#EFF4FF', cat: 'tasks' },
          { label: t('navShopping', 'קניות'), icon: '🛒', bg: '#ECFDF5', cat: 'shopping' },
        ].map((pill) => (
          <motion.button
            key={pill.cat}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setActiveCategory(pill.cat)}
            className="shrink-0 flex items-center gap-2 rounded-2xl px-4 py-3 active:scale-95 transition-all cursor-pointer border border-cream-border/60 bg-white hover:border-primary/30 shadow-sm"
          >
            <div className="w-[24px] h-[24px] rounded-lg flex items-center justify-center text-xs" style={{ background: pill.bg }}>{pill.icon}</div>
            <span className="text-xs font-bold text-cream-text">{pill.label}</span>
          </motion.button>
        ))}
      </div>

      {/* ══════ TIMELINE — clean planner timeline ══════ */}
      <div className="space-y-3">
        <div className="flex justify-between items-center px-0.5">
          <span className="text-[17px] font-bold text-cream-text" style={{ fontFamily: "'Instrument Serif', serif", letterSpacing: '-.01em' }}>
            {t('today', 'היום')}
          </span>
          <button onClick={() => { setCalendarDate(new Date()); setActiveCategory('calendar'); }} className="text-xs font-bold text-primary hover:underline cursor-pointer">
            {t('openCalendar', 'יומן')} ›
          </button>
        </div>

        {todayBlocks.length > 0 ? (
          <Stagger className="space-y-3 max-h-[300px] overflow-y-auto pr-1 pl-1 scrollbar-none">
            {todayBlocks.map((block) => {
              const isActiveMeal = block.type === 'meal';
              const isActiveWorkout = block.type === 'workout';
              const isActiveExam = block.type === 'exam';
              const isActiveTask = block.type === 'task';

              // Icons & Styles matching categories
              const Icon = isActiveMeal ? UtensilsCrossed : isActiveWorkout ? Dumbbell : isActiveExam ? GraduationCap : isActiveTask ? CheckSquare : Clock;
              const iconColor = isActiveMeal ? '#059669' : isActiveWorkout ? '#7C3AED' : isActiveExam ? '#DC2626' : isActiveTask ? '#059669' : '#8A7A6A';
              const iconBg = isActiveMeal ? '#ECFDF5' : isActiveWorkout ? '#F5F3FF' : isActiveExam ? '#FEF2F2' : isActiveTask ? '#ECFDF5' : '#FAF7F2';
              
              const cardStyle = isActiveMeal
                ? { background: '#059669', color: '#fff', border: '1px solid rgba(5,150,105,.2)', boxShadow: '0 4px 12px rgba(5,150,105,.15)' }
                : isActiveWorkout
                ? { background: '#7C3AED', color: '#fff', border: '1px solid rgba(124,58,237,.2)', boxShadow: '0 4px 12px rgba(124,58,237,.15)' }
                : isActiveExam
                ? { background: '#FEF2F2', border: '1px solid rgba(220,38,38,.15)', color: '#991B1B', boxShadow: '0 2px 8px rgba(220,38,38,.06)' }
                : { background: '#fff', border: '1px solid var(--cream-border)', color: 'var(--cream-text)', boxShadow: '0 2px 8px rgba(0,0,0,.02)' };

              return (
                <Stagger.Item key={block.id} className="flex gap-3 items-stretch group">
                  <div className="w-[38px] text-center shrink-0 pt-3 text-[11px] font-bold text-cream-muted">{block.time}</div>
                  
                  {/* Dynamic connector line */}
                  <div className="flex flex-col items-center shrink-0 w-8">
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center border transition-transform group-hover:scale-110 shadow-sm"
                      style={{ background: iconBg, borderColor: 'var(--cream-border)' }}
                    >
                      <Icon className="w-4 h-4" style={{ color: iconColor }} />
                    </div>
                    <div className="flex-1 w-[2px] mt-1.5" style={{ background: 'rgba(180,140,80,.16)' }} />
                  </div>

                  {/* Card Content */}
                  <div className="flex-1 rounded-2xl px-4 py-3 transition-all duration-200 group-hover:translate-x-0.5" style={cardStyle}>
                    <div className="text-[13px] font-extrabold leading-snug">{block.title}</div>
                    {block.sub && <div className="text-[11px] mt-0.5 font-medium leading-relaxed" style={{ opacity: isActiveMeal || isActiveWorkout ? 0.75 : 0.6 }}>{block.sub}</div>}
                  </div>
                </Stagger.Item>
              );
            })}
          </Stagger>
        ) : (
          <button
            onClick={() => setActiveCategory('commandCenter')}
            className="w-full rounded-2xl px-4 py-6 flex flex-col items-center gap-2 active:scale-[0.98] transition-transform bg-primary/5 border border-dashed border-primary/20 hover:bg-primary/10 cursor-pointer"
          >
            <Sparkles className="w-5 h-5 text-primary" />
            <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: '18px', color: 'var(--cream-text)' }}>
              {t('emptyDayTitle', 'היום עוד פנוי')}
            </span>
            <span className="text-xs font-bold text-primary">
              {t('emptyDayCta', 'בנה לי את היום ›')}
            </span>
          </button>
        )}
      </div>

      {/* ══════ RIGHT COLUMN (STATS & UPCOMING LIST) ══════ */}
      <div className="space-y-4">
        
        {/* ══════ 3 MINI STATS — premium styled cards ══════ */}
        <div className="grid grid-cols-3 gap-2">
          {/* Exam Days card */}
          <div 
            onClick={() => {
              if (nearestExam) {
                setCalendarDate(nearestExam.date);
                setActiveCategory('calendar');
              }
            }}
            className="rounded-2xl px-3 py-3.5 border bg-white border-cream-border/60 shadow-sm flex flex-col justify-between h-20 transition-all hover:border-red-500/20 active:scale-95 cursor-pointer"
          >
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: '24px', fontWeight: 600, fontStyle: 'italic', color: '#B91C1C', letterSpacing: '-.04em', lineHeight: 1 }}>
              {nearestExam ? formatExamDaysBadge(nearestExam.days, isRTL).number : '—'}
            </div>
            <div className="text-[9px] font-bold text-cream-muted mt-1 leading-tight">
              {nearestExam && nearestExam.days <= 2
                ? formatExamDaysBadge(nearestExam.days, isRTL).label
                : t('daysToExam', 'ימים לבחינה')
              }
            </div>
          </div>

          {/* Shopping items card */}
          <button 
            onClick={() => setActiveCategory('shopping')} 
            className="rounded-2xl px-3 py-3.5 text-start border bg-white border-cream-border/60 shadow-sm flex flex-col justify-between h-20 transition-all hover:border-emerald-500/20 active:scale-95 cursor-pointer"
          >
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: '24px', fontWeight: 600, fontStyle: 'italic', color: '#059669', letterSpacing: '-.04em', lineHeight: 1 }}>
              {(() => { const al = (data?.shoppingLists || []).find((l) => l.isActive); return al ? (al.items || []).filter((i) => !i.checked).length : 0; })()}
            </div>
            <div className="text-[9px] font-bold text-cream-muted mt-1 leading-tight">{t('itemsToBuy', 'לקנות')}</div>
          </button>

          {/* Total Tasks card */}
          <div 
            onClick={() => setActiveCategory('tasks')} 
            className="rounded-2xl px-3 py-3.5 border bg-white border-cream-border/60 shadow-sm flex flex-col justify-between h-20 transition-all hover:border-primary/20 active:scale-95 cursor-pointer"
          >
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: '24px', fontWeight: 600, fontStyle: 'italic', color: 'var(--cream-text)', letterSpacing: '-.04em', lineHeight: 1 }}>
              {todayTasksCount}
            </div>
            <div className="text-[9px] font-bold text-cream-muted mt-1 leading-tight">{t('myTasks', 'משימות')}</div>
          </div>
        </div>

        {/* ══════ AI QUICK LINKS ══════ */}
        <AiQuickLinks data={data} t={t} />

        {/* ══════ UPCOMING 7 DAYS ══════ */}
        {upcomingItems.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[17px] font-bold text-cream-text" style={{ fontFamily: "'Instrument Serif', serif", letterSpacing: '-.01em' }}>
                {t('comingUp', 'בקרוב')}
              </span>
              <button onClick={() => { setCalendarDate(new Date()); setActiveCategory('calendar'); }} className="text-xs font-bold text-primary hover:underline cursor-pointer">
                {t('openCalendar', 'יומן')} ›
              </button>
            </div>
            <div className="space-y-1.5">
              {upcomingItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.kind === 'task') {
                      setActiveCategory('tasks');
                    } else {
                      setCalendarDate(item.date);
                      setActiveCategory('calendar');
                    }
                  }}
                  className="w-full flex items-center justify-between gap-3 rounded-2xl px-4 py-3 active:scale-[0.99] transition-all hover:bg-primary/[0.02] border bg-white text-start shadow-sm"
                  style={{ borderColor: item.isOverdue ? 'rgba(220,38,38,.16)' : 'var(--cream-border)' }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={cn("w-2 h-2 rounded-full shrink-0",
                      item.isOverdue ? "bg-red-500 animate-pulse" : item.kind === 'exam' ? "bg-red-500" : item.kind === 'event' ? "bg-blue-500" : "bg-amber-500"
                    )} />
                    <span className="text-sm font-bold truncate text-cream-text">{item.title}</span>
                  </div>
                  <span 
                    className="text-xs font-extrabold shrink-0 px-2 py-0.5 rounded-md" 
                    style={{ 
                      color: item.isOverdue ? '#DC2626' : '#8A7A6A',
                      background: item.isOverdue ? '#FEF2F2' : '#FAF7F2',
                      border: item.isOverdue ? '1px solid rgba(220,38,38,.12)' : 'none'
                    }}
                  >
                    {item.isOverdue 
                      ? (isRTL ? 'פיגור' : 'Overdue') 
                      : (isValid(item.date) && format(item.date, 'EEE d/M', { locale }))
                    }
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
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
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-0.5">
        <Bot className="w-4 h-4 shrink-0 text-emerald-600" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-cream-muted">{t('aiQuickLinks', 'AI קישורים')}</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar scroll-smooth">
        {withLinks.map((c) => (
          <a
            key={c.id}
            href={c.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl active:scale-95 transition-all border border-cream-border bg-white hover:border-emerald-500/30 hover:bg-emerald-500/[0.01] shadow-sm"
          >
            <Bot className="w-4 h-4 shrink-0 text-emerald-600 animate-pulse" />
            <span className="text-xs font-bold text-cream-text">{c.name}</span>
          </a>
        ))}
      </div>
    </div>
  );
};
