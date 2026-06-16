import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Sparkles, Sun, Moon, Car, Flame, Leaf, GraduationCap, PenLine,
  BatteryFull, BatteryMedium, BatteryLow, Dumbbell, Sunrise, Sunset,
  CalendarCheck, ChevronRight, ChevronLeft, Check,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import { parseISO, isValid, differenceInCalendarDays } from 'date-fns';

/* ── cream v3 tokens ─────────────────────────────────────────── */
const C = {
  ink: '#2A1A0A',
  sub: '#5A4A3A',
  muted: '#8A7A6A',
  border: 'rgba(180,140,80,.16)',
  green: '#059669',
  greenDark: '#065F46',
  greenSoft: 'rgba(5,150,105,.08)',
  purple: '#7C3AED',
  purpleSoft: 'rgba(124,58,237,.08)',
};
const serif = "'Instrument Serif', serif";

/* Answer options — each contributes a sentence to the day directive. */
const DAY_TYPES = [
  { key: 'regular', icon: Sun,           he: 'יום רגיל',     directive: 'יום סטנדרטי — אזן בין לימודים, אימון וארוחות לפי ההעדפות הרגילות.' },
  { key: 'exam',    icon: GraduationCap, he: 'יום מבחן',     directive: null /* computed with nearest exam */ },
  { key: 'busy',    icon: Flame,         he: 'יום עמוס',     directive: 'יום עמוס — מקסם ניצול זמן, צפף בלוקים פרודוקטיביים.' },
  { key: 'light',   icon: Leaf,          he: 'יום קל',       directive: 'הקל על היום — פחות בלוקי לימוד, בלוקים קצרים יותר.' },
  { key: 'travel',  icon: Car,           he: 'יום נסיעות',   directive: 'היום כולל נסיעות מרובות — השאר חלונות מעבר בין פעילויות.' },
  { key: 'custom',  icon: PenLine,       he: 'משהו אחר',     directive: null /* free text */ },
];

const ENERGY_LEVELS = [
  { key: 'high', icon: BatteryFull,   he: 'מלא אנרגיה', color: '#059669', directive: 'רמת אנרגיה גבוהה — אפשר בלוקי לימוד ארוכים ומאתגרים.' },
  { key: 'mid',  icon: BatteryMedium, he: 'בסדר גמור',  color: '#D97706', directive: 'רמת אנרגיה בינונית — בלוקים סטנדרטיים עם רווחים נדיבים.' },
  { key: 'low',  icon: BatteryLow,    he: 'עייף היום',  color: '#DC2626', directive: 'עייף היום — בלוקים קצרים (עד 45 דק׳), הרבה מרווח, בלי עומס.' },
];

const WORKOUT_TIMES = [
  { key: 'morning', icon: Sunrise,  he: 'בוקר',   directive: 'שבץ אימון בשעות הבוקר (07:00-10:00).' },
  { key: 'noon',    icon: Sun,      he: 'צהריים', directive: 'שבץ אימון בשעות הצהריים (12:00-15:00).' },
  { key: 'evening', icon: Sunset,   he: 'ערב',    directive: 'שבץ אימון בשעות הערב (18:00-21:00).' },
  { key: 'auto',    icon: Sparkles, he: 'תחליט אתה', directive: 'שבץ את האימון בזמן האופטימלי לדעתך.' },
  { key: 'skip',    icon: X,        he: 'בלי אימון', directive: 'אין צורך באימון היום.' },
];

const STEPS = ['greeting', 'dayType', 'energy', 'workout', 'confirm'];

const buildGreeting = (displayName) => {
  const hour = new Date().getHours();
  let greet = 'לילה טוב';
  if (hour >= 5 && hour < 12) greet = 'בוקר טוב';
  else if (hour >= 12 && hour < 17) greet = 'צהריים טובים';
  else if (hour >= 17 && hour < 21) greet = 'ערב טוב';
  return displayName ? `${greet}, ${displayName}` : greet;
};

/* Selectable option card with spring feedback */
const OptionCard = ({ icon: Icon, label, selected, onClick, accent = C.green, sub = null }) => (
  <motion.button
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    aria-pressed={selected}
    className="flex flex-col items-center justify-center gap-2 px-2 py-4 rounded-2xl transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
    style={{
      border: `1.5px solid ${selected ? accent : C.border}`,
      background: selected ? `${accent}14` : '#fff',
      boxShadow: selected ? `0 4px 16px ${accent}2e` : 'none',
    }}
  >
    <motion.span
      animate={selected ? { scale: [1, 1.25, 1.1] } : { scale: 1 }}
      transition={{ duration: 0.3 }}
      className="flex items-center justify-center"
      style={{ width: 38, height: 38, borderRadius: 13, background: selected ? accent : 'rgba(180,140,80,.08)', color: selected ? '#fff' : C.muted }}
    >
      <Icon className="w-5 h-5" strokeWidth={2.2} />
    </motion.span>
    <span className="text-[12px] font-bold leading-tight text-center" style={{ color: selected ? accent : C.sub }}>{label}</span>
    {sub && <span className="text-[10px] leading-tight text-center" style={{ color: C.muted }}>{sub}</span>}
  </motion.button>
);

export const MorningCoachOverlay = ({
  isOpen,
  onSubmit,
  onDismissSession,
  onDismissToday,
  isShabbat,
  dateStr,
}) => {
  const { data } = useStore();
  const { t, language } = useTranslation();
  const isRTL = language === 'he';

  const [stepIdx, setStepIdx] = useState(0);
  const [direction, setDirection] = useState(1); // 1 forward, -1 back
  const [dayType, setDayType] = useState(null);
  const [customText, setCustomText] = useState('');
  const [energy, setEnergy] = useState(null);
  const [workout, setWorkout] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setStepIdx(0);
      setDirection(1);
      setDayType(null);
      setCustomText('');
      setEnergy(null);
      setWorkout(null);
    }
  }, [isOpen]);

  const displayName = data?.profile?.displayName || '';
  const greeting = useMemo(() => buildGreeting(displayName), [displayName]);

  // Today's context: fixed events count + nearest exam (used in greeting AND
  // in the exam directive).
  const context = useMemo(() => {
    const eventsToday = (data?.events || []).filter(
      (ev) => ev.start && ev.start.startsWith(dateStr)
    ).length;
    let nearestExam = null;
    let nearestDays = Infinity;
    const now = new Date();
    (data?.courses || []).forEach((course) => {
      // 1. Standard Moeds
      ['moedA', 'moedB', 'moedC'].forEach((moed) => {
        const examDate = course[moed] || course.exams?.[moed];
        if (!examDate) return;
        const dt = parseISO(examDate);
        if (!isValid(dt) || dt < now) return;
        const days = differenceInCalendarDays(dt, now);
        if (days < nearestDays) {
          nearestDays = days;
          nearestExam = { name: course.name, days };
        }
      });

      // 2. Custom Exams
      course.customExams?.forEach((exam) => {
        if (!exam.date) return;
        const dt = parseISO(exam.date);
        if (!isValid(dt) || dt < now) return;
        const days = differenceInCalendarDays(dt, now);
        if (days < nearestDays) {
          nearestDays = days;
          nearestExam = { name: `${course.name} (${exam.name})`, days };
        }
      });
    });
    return { eventsToday, nearestExam };
  }, [data?.events, data?.courses, dateStr]);

  // Which day is being planned — so the user knows when planning a future day
  // (e.g. navigated to tomorrow before opening the questionnaire).
  const plannedLabel = useMemo(() => {
    const dt = parseISO(dateStr);
    if (!isValid(dt)) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = differenceInCalendarDays(dt, today);
    const dayName = dt.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
    if (diff === 0) return `היום · ${dayName}`;
    if (diff === 1) return `מחר · ${dayName}`;
    return dayName;
  }, [dateStr]);

  const goTo = (idx) => {
    setDirection(idx > stepIdx ? 1 : -1);
    setStepIdx(Math.max(0, Math.min(STEPS.length - 1, idx)));
  };
  const next = () => goTo(stepIdx + 1);
  const back = () => goTo(stepIdx - 1);

  const examDirective = context.nearestExam
    ? `יום מבחן — מקד את כל בלוקי הלמידה בקורס "${context.nearestExam.name}" (המבחן ${context.nearestExam.days === 0 ? 'היום' : context.nearestExam.days === 1 ? 'מחר' : `בעוד ${context.nearestExam.days} ימים`}). מותר עד 5 בלוקים עם הפסקות אמיתיות ביניהם.`
    : 'יום מבחן — מקד את כל בלוקי הלמידה בקורס עם המבחן הקרוב ביותר.';

  const composeDirective = () => {
    const parts = [];
    const dt = DAY_TYPES.find((d) => d.key === dayType);
    if (dt) {
      if (dt.key === 'custom') {
        if (customText.trim()) parts.push(customText.trim());
      } else if (dt.key === 'exam') {
        parts.push(examDirective);
      } else if (dt.directive) {
        parts.push(dt.directive);
      }
    }
    const en = ENERGY_LEVELS.find((e) => e.key === energy);
    if (en) parts.push(en.directive);
    const w = WORKOUT_TIMES.find((o) => o.key === workout);
    if (w) parts.push(w.directive);
    return parts.join(' ');
  };

  const handleSubmit = () => {
    if (isShabbat) {
      onDismissSession?.();
      return;
    }
    onSubmit?.(composeDirective() || null);
  };

  const step = STEPS[stepIdx];
  const canContinue =
    step === 'dayType' ? (dayType && (dayType !== 'custom' || customText.trim())) :
    step === 'energy' ? !!energy :
    step === 'workout' ? !!workout :
    true;

  // Selected summaries for the confirm screen
  const summary = [
    dayType && { icon: (DAY_TYPES.find((d) => d.key === dayType) || {}).icon, label: dayType === 'custom' ? customText.trim() : (DAY_TYPES.find((d) => d.key === dayType) || {}).he, accent: C.green },
    energy && { icon: (ENERGY_LEVELS.find((e) => e.key === energy) || {}).icon, label: (ENERGY_LEVELS.find((e) => e.key === energy) || {}).he, accent: (ENERGY_LEVELS.find((e) => e.key === energy) || {}).color },
    workout && { icon: (WORKOUT_TIMES.find((o) => o.key === workout) || {}).icon, label: `אימון: ${(WORKOUT_TIMES.find((o) => o.key === workout) || {}).he}`, accent: C.purple },
  ].filter(Boolean);

  if (!isOpen) return null;

  const slideVariants = {
    enter: (dir) => ({ x: dir * (isRTL ? -56 : 56), opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir) => ({ x: dir * (isRTL ? 36 : -36), opacity: 0 }),
  };

  return (
    <AnimatePresence>
      <motion.div
        key="mc-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onDismissSession}
        className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-md flex items-end sm:items-center justify-center"
      >
        <motion.div
          key="mc-sheet"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          dir={isRTL ? 'rtl' : 'ltr'}
          className="w-full sm:max-w-md overflow-hidden flex flex-col max-h-[92vh]"
          style={{ background: '#FAF7F2', borderRadius: '26px 26px 0 0', border: `1px solid ${C.border}`, boxShadow: '0 -12px 50px rgba(40,20,0,.25)' }}
        >
          {/* Top accent + handle */}
          <div style={{ height: 3, background: 'linear-gradient(90deg, #065F46, #7C3AED 50%, #2563EB)' }} />
          <div className="w-10 h-1 rounded-full mx-auto mt-3" style={{ background: 'rgba(180,140,80,.25)' }} />

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-2 pb-1">
            <div className="flex items-center gap-2">
              {isShabbat
                ? <Moon className="w-4 h-4" style={{ color: C.purple }} />
                : <Sparkles className="w-4 h-4" style={{ color: C.purple }} />}
              <span style={{ fontSize: 10, fontWeight: 600, color: C.muted, letterSpacing: '.14em', textTransform: 'uppercase' }}>
                {isShabbat ? t('shabbatShalom', 'שבת שלום') : t('morningCoachTag', 'המאמן האישי')}
              </span>
            </div>
            <button onClick={onDismissSession} aria-label={t('close', 'סגור')} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[rgba(180,140,80,.08)] cursor-pointer">
              <X className="w-4 h-4" style={{ color: C.muted }} />
            </button>
          </div>

          {/* Progress dots */}
          {!isShabbat && (
            <div className="flex items-center justify-center gap-1.5 pb-2">
              {STEPS.map((s, i) => (
                <motion.span
                  key={s}
                  animate={{ width: i === stepIdx ? 18 : 6, background: i <= stepIdx ? C.green : 'rgba(180,140,80,.2)' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  style={{ height: 6, borderRadius: 999, display: 'inline-block' }}
                />
              ))}
            </div>
          )}

          {/* Body — animated steps */}
          <div className="flex-1 overflow-y-auto px-5 pb-4" style={{ minHeight: 280 }}>
            {isShabbat ? (
              <div className="py-8 text-center space-y-3">
                <Moon className="w-10 h-10 mx-auto" style={{ color: C.purple }} />
                <h2 style={{ fontFamily: serif, fontSize: 26, color: C.ink }}>{t('shabbatShalom', 'שבת שלום')}</h2>
                <p className="text-sm" style={{ color: C.sub }}>{t('restToday', 'היום נחים — הלוז יחכה לצאת השבת.')}</p>
              </div>
            ) : (
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={step}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className="space-y-4 pt-1"
                >
                  {step === 'greeting' && (
                    <>
                      <h2 style={{ fontFamily: serif, fontSize: 30, lineHeight: 1.1, color: C.ink, letterSpacing: '-.03em' }}>
                        {greeting} <em style={{ fontStyle: 'italic', color: C.green }}>☀️</em>
                      </h2>
                      <p className="text-sm leading-relaxed" style={{ color: C.sub }}>
                        {t('morningCoachIntro', 'כמה שאלות קצרות ואבנה לך לוז מדויק ליום הזה.')}
                      </p>
                      {plannedLabel && (
                        <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1" style={{ background: C.greenSoft, border: `1px solid ${C.border}` }}>
                          <CalendarCheck className="w-3.5 h-3.5" style={{ color: C.green }} />
                          <span className="text-[12px] font-bold" style={{ color: C.greenDark }}>{plannedLabel}</span>
                        </div>
                      )}
                      <div className="rounded-2xl p-3.5 space-y-2" style={{ background: '#fff', border: `1px solid ${C.border}` }}>
                        <div className="flex items-center gap-2.5">
                          <CalendarCheck className="w-4 h-4 shrink-0" style={{ color: C.green }} />
                          <span className="text-[13px] font-semibold" style={{ color: C.ink }}>
                            {context.eventsToday > 0 ? `${context.eventsToday} אירועים קבועים היום` : 'אין אירועים קבועים היום'}
                          </span>
                        </div>
                        {context.nearestExam && (
                          <div className="flex items-center gap-2.5">
                            <GraduationCap className="w-4 h-4 shrink-0" style={{ color: '#DC2626' }} />
                            <span className="text-[13px] font-semibold" style={{ color: C.ink }}>
                              {context.nearestExam.days === 0
                                ? `מבחן ב${context.nearestExam.name} היום!`
                                : `המבחן הקרוב: ${context.nearestExam.name} בעוד ${context.nearestExam.days} ימים`}
                            </span>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={onDismissToday}
                        className="w-full text-center text-[11px] py-1 cursor-pointer hover:underline"
                        style={{ color: C.muted }}
                      >
                        {t('dontAskAgain', 'אל תשאל אותי שוב היום')}
                      </button>
                    </>
                  )}

                  {step === 'dayType' && (
                    <>
                      <h3 style={{ fontFamily: serif, fontSize: 22, color: C.ink }}>
                        איזה <em style={{ fontStyle: 'italic', color: C.green }}>יום</em> מחכה לך?
                      </h3>
                      <div className="grid grid-cols-3 gap-2">
                        {DAY_TYPES.map((d) => (
                          <OptionCard
                            key={d.key}
                            icon={d.icon}
                            label={d.he}
                            selected={dayType === d.key}
                            onClick={() => setDayType(d.key)}
                            sub={d.key === 'exam' && context.nearestExam ? context.nearestExam.name : null}
                          />
                        ))}
                      </div>
                      <AnimatePresence>
                        {dayType === 'custom' && (
                          <motion.textarea
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 72 }}
                            exit={{ opacity: 0, height: 0 }}
                            value={customText}
                            onChange={(e) => setCustomText(e.target.value)}
                            placeholder='ספר על היום — "נסיעה לתל אביב ב-14:00, רוצה לסיים תרגיל באינפי"'
                            className="w-full rounded-2xl px-3.5 py-2.5 text-sm focus-visible:outline-none resize-none text-start"
                            style={{ background: '#fff', border: `1.5px solid ${C.border}`, color: C.ink }}
                          />
                        )}
                      </AnimatePresence>
                    </>
                  )}

                  {step === 'energy' && (
                    <>
                      <h3 style={{ fontFamily: serif, fontSize: 22, color: C.ink }}>
                        כמה <em style={{ fontStyle: 'italic', color: C.green }}>אנרגיה</em> יש לך?
                      </h3>
                      <div className="grid grid-cols-3 gap-2">
                        {ENERGY_LEVELS.map((e) => (
                          <OptionCard
                            key={e.key}
                            icon={e.icon}
                            label={e.he}
                            accent={e.color}
                            selected={energy === e.key}
                            onClick={() => setEnergy(e.key)}
                          />
                        ))}
                      </div>
                      <p className="text-[11px]" style={{ color: C.muted }}>
                        זה קובע את אורך בלוקי הלמידה והמרווחים ביניהם.
                      </p>
                    </>
                  )}

                  {step === 'workout' && (
                    <>
                      <h3 className="flex items-center gap-2" style={{ fontFamily: serif, fontSize: 22, color: C.ink }}>
                        <Dumbbell className="w-5 h-5" style={{ color: C.purple }} />
                        מתי <em style={{ fontStyle: 'italic', color: C.purple }}>אימון</em>?
                      </h3>
                      <div className="grid grid-cols-3 gap-2">
                        {WORKOUT_TIMES.map((o) => (
                          <OptionCard
                            key={o.key}
                            icon={o.icon}
                            label={o.he}
                            accent={C.purple}
                            selected={workout === o.key}
                            onClick={() => setWorkout(o.key)}
                          />
                        ))}
                      </div>
                    </>
                  )}

                  {step === 'confirm' && (
                    <>
                      <h3 style={{ fontFamily: serif, fontSize: 22, color: C.ink }}>
                        מוכן? <em style={{ fontStyle: 'italic', color: C.green }}>ככה הבנתי אותך</em>
                      </h3>
                      <div className="space-y-2">
                        {summary.length > 0 ? summary.map((s, i) => {
                          const Icon = s.icon || Check;
                          return (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, x: isRTL ? 16 : -16 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.08, type: 'spring', stiffness: 360, damping: 26 }}
                              className="flex items-center gap-3 rounded-2xl px-3.5 py-3"
                              style={{ background: '#fff', border: `1px solid ${C.border}` }}
                            >
                              <span className="flex items-center justify-center shrink-0" style={{ width: 30, height: 30, borderRadius: 10, background: `${s.accent}14`, color: s.accent }}>
                                <Icon className="w-4 h-4" />
                              </span>
                              <span className="text-[13px] font-semibold flex-1 min-w-0" style={{ color: C.ink }}>{s.label}</span>
                              <Check className="w-4 h-4 shrink-0" style={{ color: C.green }} />
                            </motion.div>
                          );
                        }) : (
                          <p className="text-sm" style={{ color: C.muted }}>בלי העדפות מיוחדות — אבנה יום מאוזן.</p>
                        )}
                      </div>
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          {/* Footer CTA */}
          <div className="px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3" style={{ borderTop: `1px solid ${C.border}`, background: 'rgba(255,255,255,.6)' }}>
            {isShabbat ? (
              <button
                onClick={onDismissSession}
                className="w-full py-3.5 rounded-2xl font-bold text-[15px] text-white active:scale-[0.98] transition-all cursor-pointer"
                style={{ background: C.purple }}
              >
                {t('shabbatShalom', 'שבת שלום')}
              </button>
            ) : (
              <div className="flex items-center gap-2.5">
                {stepIdx > 0 && (
                  <button
                    onClick={back}
                    aria-label={t('back', 'חזרה')}
                    className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 active:scale-95 transition-all cursor-pointer"
                    style={{ background: '#fff', border: `1.5px solid ${C.border}`, color: C.sub }}
                  >
                    {isRTL ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
                  </button>
                )}
                {step === 'confirm' ? (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleSubmit}
                    className="flex-1 py-3.5 rounded-2xl font-bold text-[15px] text-white flex items-center justify-center gap-2 cursor-pointer"
                    style={{ background: `linear-gradient(135deg, ${C.green}, ${C.greenDark})`, boxShadow: '0 6px 20px rgba(5,150,105,.35)' }}
                  >
                    <Sparkles className="w-4 h-4" />
                    {t('buildMyDay', 'בנה לי את היום')}
                  </motion.button>
                ) : (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={next}
                    disabled={!canContinue}
                    className="flex-1 py-3.5 rounded-2xl font-bold text-[15px] text-white flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer transition-opacity"
                    style={{ background: `linear-gradient(135deg, ${C.green}, ${C.greenDark})`, boxShadow: '0 6px 20px rgba(5,150,105,.3)' }}
                  >
                    {step === 'greeting' ? t('whatsToday', 'בוא נתחיל') : t('continue', 'המשך')}
                    {isRTL ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </motion.button>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
