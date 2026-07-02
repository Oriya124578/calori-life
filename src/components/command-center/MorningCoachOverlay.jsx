import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Sparkles, Moon, GraduationCap, ChevronRight, ChevronLeft,
  CalendarCheck, Flame, Leaf, Loader2,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import { parseISO, isValid, differenceInCalendarDays } from 'date-fns';
import { formatExamDays, getNearestExam } from '../../lib/examDaysFormat';
import { clarifyDayRequest } from '../../lib/gemini';

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

/* Quick day-type hints — tapping one seeds the free-text box. Studying is the
   primary purpose, so these are light nudges, not the whole input. */
const QUICK_HINTS = [
  { key: 'exam',    icon: GraduationCap, he: 'יום מבחן' },
  { key: 'study',   icon: GraduationCap, he: 'יום לימודים' },
  { key: 'busy',    icon: Flame,         he: 'יום עמוס' },
  { key: 'light',   icon: Leaf,          he: 'יום קל' },
];

const TIME_OPTIONS = [
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
];

const STEPS = ['greeting', 'describe', 'clarify', 'confirm'];

const buildGreeting = (displayName) => {
  const hour = new Date().getHours();
  let greet = 'לילה טוב';
  if (hour >= 5 && hour < 12) greet = 'בוקר טוב';
  else if (hour >= 12 && hour < 17) greet = 'צהריים טובים';
  else if (hour >= 17 && hour < 21) greet = 'ערב טוב';
  return displayName ? `${greet}, ${displayName}` : greet;
};

export const MorningCoachOverlay = ({
  isOpen,
  onSubmit,
  onDismissSession,
  onDismissToday,
  isShabbat,
  dateStr,
  seedText = '',
}) => {
  const { data } = useStore();
  const { t, language } = useTranslation();
  const isRTL = language === 'he';

  const [stepIdx, setStepIdx] = useState(0);
  const [direction, setDirection] = useState(1);
  const [freeText, setFreeText] = useState('');
  const [clarifying, setClarifying] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [aiNote, setAiNote] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStepIdx(0);
      setDirection(1);
      setFreeText(seedText || ''); // prefilled from the week plan when present
      setClarifying(false);
      setQuestions([]);
      setAnswers({});
      setAiNote('');
    }
  }, [isOpen, seedText]);

  const displayName = data?.profile?.displayName || '';
  const greeting = useMemo(() => buildGreeting(displayName), [displayName]);

  // Today's context: fixed events + nearest exam (shown to the user and fed to
  // the AI clarifier so it never re-asks what we already know).
  const context = useMemo(() => {
    const eventsToday = (data?.events || []).filter(
      (ev) => ev.start && ev.start.startsWith(dateStr)
    ).length;
    // Shared with every other exam-countdown screen so the days-left number
    // never disagrees.
    const rawNearest = getNearestExam(data?.courses);
    const nearestExam = rawNearest
      ? { name: rawNearest.custom ? `${rawNearest.courseName} (${rawNearest.moed})` : rawNearest.courseName, days: rawNearest.days }
      : null;
    const hasWorkout = (data?.calori?.coachSessions || []).some(
      (cs) => cs.type !== 'rest' && cs.status !== 'completed' && cs.status !== 'skipped'
    );
    return { eventsToday, nearestExam, hasWorkout };
  }, [data?.events, data?.courses, data?.calori, dateStr]);

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
  const back = () => goTo(stepIdx - 1);

  // Leaving "describe": ask the AI which follow-ups (if any) are actually needed.
  const runClarifier = async () => {
    setClarifying(true);
    try {
      const isToday = dateStr === new Date().toISOString().slice(0, 10) ||
        dateStr === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
      const openTaskCount = (data?.personalTasks || []).filter((t) => !t.done && t.scheduledDate !== dateStr).length;
      const res = await clarifyDayRequest(freeText, {
        wakeTime: data?.profile?.wakeTime,
        sleepTime: data?.profile?.sleepTime,
        studyBlockDuration: data?.profile?.studyBlockDuration,
        eventsToday: context.eventsToday,
        hasWorkout: context.hasWorkout,
        courses: (data?.courses || []).map((c) => ({ name: c.name })),
        nearestExam: context.nearestExam,
        openTaskCount,
        isToday,
        nowTime: isToday ? new Date().toTimeString().slice(0, 5) : null,
      });
      const qs = res?.questions || [];
      // Guarantee the open-tasks question whenever there ARE open tasks — the AI
      // clarifier biases toward "fewer questions" and often skips it.
      if (openTaskCount > 0 && !qs.some((q) => q.id === 'include_tasks')) {
        qs.push({
          id: 'include_tasks',
          type: 'chips',
          label: `למלא גם משימות פתוחות מהמאגר? (${openTaskCount} פתוחות)`,
          options: ['כן, מלא משימות פתוחות', 'רק הדחופות', 'לא, רק מה שביקשתי'],
          optional: true,
        });
      }
      setQuestions(qs);
      setAiNote(res?.note || '');
      // No questions → straight to confirm.
      goTo(qs.length ? 2 : 3);
    } catch {
      setQuestions([]);
      goTo(3);
    } finally {
      setClarifying(false);
    }
  };

  const next = () => {
    if (STEPS[stepIdx] === 'describe') { runClarifier(); return; }
    goTo(stepIdx + 1);
  };

  // Build the Hebrew directive the schedule generator consumes.
  const composeDirective = () => {
    const parts = [];
    if (freeText.trim()) parts.push(freeText.trim());
    questions.forEach((q) => {
      const a = answers[q.id];
      if (!a) return;
      if (q.id === 'study_hours') {
        if (a === 'בלי לימודים') parts.push('היום בלי בלוקי לימוד.');
        else if (a === 'כל היום') parts.push('יום לימודים מלא — מלא את כל שעות הערות בבלוקי לימוד עד הערב.');
        else parts.push(`המשתמש רוצה ללמוד בערך ${a} היום — תכנן בלוקי לימוד שמסתכמים לכך.`);
      } else if (q.id === 'study_subject') {
        if (a.startsWith('כללי')) parts.push('בלוקי לימוד כלליים — בלי קורס מסוים ובלי refId.');
        else parts.push(`מקד את הלימוד בקורס "${a}".`);
      } else if (q.id === 'workout_time') {
        parts.push(`שבץ אימון ב${a}.`);
      } else if (q.id === 'include_tasks') {
        if (a.startsWith('כן')) parts.push('מלא את הזמן הפנוי גם במשימות פתוחות נוספות מהמאגר (לא רק הדחופות), לפי עדיפות.');
        else if (a.startsWith('רק הדחופות')) parts.push('שבץ רק משימות דחופות/באיחור; אל תוסיף משימות אחרות.');
        else if (a.startsWith('לא')) parts.push('אל תוסיף משימות מהמאגר — רק מה שביקשתי במפורש.');
      } else if (q.id === 'travel_origin' || q.id === 'travel_destination' || q.id === 'travel_time') {
        // Trip details are passed structurally via extras, not the free directive.
      } else {
        parts.push(`${q.label} ${a}`);
      }
    });
    return parts.join(' ');
  };

  const handleSubmit = () => {
    if (isShabbat) { onDismissSession?.(); return; }
    // Pass structured trip info so the planner can compute real drive times.
    const extras = {};
    if (answers.travel_destination) extras.destination = answers.travel_destination;
    if (answers.travel_origin) extras.origin = answers.travel_origin;
    if (answers.travel_time) extras.departTime = answers.travel_time;
    onSubmit?.(composeDirective() || null, extras);
  };

  const step = STEPS[stepIdx];
  const requiredUnanswered = questions.some((q) => !q.optional && !answers[q.id]);
  const canContinue =
    step === 'describe' ? !clarifying :
    step === 'clarify' ? !requiredUnanswered :
    true;

  if (!isOpen) return null;

  const slideVariants = {
    enter: (dir) => ({ x: dir * (isRTL ? -56 : 56), opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir) => ({ x: dir * (isRTL ? 36 : -36), opacity: 0 }),
  };

  const setHint = (key) => {
    const map = {
      exam: context.nearestExam ? `יום מבחן — מתמקד בקורס ${context.nearestExam.name}. ` : 'יום מבחן. ',
      study: 'יום לימודים. ',
      busy: 'יום עמוס, רוצה לנצל את הזמן היטב. ',
      light: 'יום קל, פחות עומס. ',
    };
    setFreeText((prev) => (prev.includes(map[key]) ? prev : `${map[key]}${prev}`));
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

          {/* Body */}
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
                        {t('morningCoachIntro', 'ספר לי על היום שלך ואבנה לוז מדויק — עם דגש על הלימודים.')}
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
                                : `המבחן הקרוב: ${context.nearestExam.name} — ${formatExamDays(context.nearestExam.days, true)}`}
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

                  {step === 'describe' && (
                    <>
                      <h3 style={{ fontFamily: serif, fontSize: 22, color: C.ink }}>
                        ספר לי על <em style={{ fontStyle: 'italic', color: C.green }}>היום</em> שלך
                      </h3>
                      <textarea
                        value={freeText}
                        onChange={(e) => setFreeText(e.target.value)}
                        rows={4}
                        autoFocus
                        placeholder='לדוגמה: "רוצה ללמוד 5 שעות אינפי, אימון בערב, יש לי תור לרופא ב-14:00"'
                        className="w-full rounded-2xl px-3.5 py-3 text-sm focus-visible:outline-none resize-none text-start leading-relaxed"
                        style={{ background: '#fff', border: `1.5px solid ${C.border}`, color: C.ink }}
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {QUICK_HINTS.map((h) => (
                          <button
                            key={h.key}
                            onClick={() => setHint(h.key)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold active:scale-95 transition-all"
                            style={{ background: '#fff', border: `1.5px solid ${C.border}`, color: C.sub }}
                          >
                            <h.icon className="w-3.5 h-3.5" />
                            {h.he}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px]" style={{ color: C.muted }}>
                        אפשר גם להשאיר ריק — אשאל כמה שאלות קצרות ואבנה יום ממוקד לימודים.
                      </p>
                    </>
                  )}

                  {step === 'clarify' && (
                    <>
                      <h3 style={{ fontFamily: serif, fontSize: 22, color: C.ink }}>
                        כמה <em style={{ fontStyle: 'italic', color: C.green }}>פרטים</em> ונצא לדרך
                      </h3>
                      <div className="space-y-4">
                        {questions.map((q) => (
                          <div key={q.id} className="space-y-2">
                            <span className="text-[14px] font-bold" style={{ color: C.ink }}>{q.label}</span>
                            {q.type === 'text' ? (
                              <input
                                type="text"
                                value={answers[q.id] || ''}
                                onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
                                placeholder="עיר או כתובת — לדוגמה: תל אביב, רחוב הרצל 5"
                                className="w-full rounded-xl px-3.5 py-2.5 text-sm focus-visible:outline-none text-start"
                                style={{ background: '#fff', border: `1.5px solid ${C.border}`, color: C.ink }}
                              />
                            ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {(q.type === 'time' ? TIME_OPTIONS : (q.options || [])).map((opt) => (
                                <button
                                  key={opt}
                                  onClick={() => setAnswers((p) => ({ ...p, [q.id]: opt }))}
                                  className="px-3 py-1.5 rounded-xl text-[13px] font-semibold active:scale-95 transition-all"
                                  style={{
                                    border: '1.5px solid',
                                    borderColor: answers[q.id] === opt ? C.green : C.border,
                                    background: answers[q.id] === opt ? 'rgba(5,150,105,.1)' : '#fff',
                                    color: answers[q.id] === opt ? C.green : C.ink,
                                    fontVariantNumeric: 'tabular-nums',
                                  }}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {step === 'confirm' && (
                    <>
                      <h3 style={{ fontFamily: serif, fontSize: 22, color: C.ink }}>
                        מוכן? <em style={{ fontStyle: 'italic', color: C.green }}>ככה הבנתי אותך</em>
                      </h3>
                      <div className="rounded-2xl px-3.5 py-3 text-[13px] leading-relaxed" style={{ background: '#fff', border: `1px solid ${C.border}`, color: C.ink }}>
                        {composeDirective() || 'יום מאוזן עם דגש על לימודים, לפי ההעדפות הרגילות שלך.'}
                      </div>
                      {aiNote && (
                        <p className="text-[12px]" style={{ color: C.muted }}>{aiNote}</p>
                      )}
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
                    {clarifying ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> {t('thinking', 'חושב...')}</>
                    ) : (
                      <>
                        {step === 'greeting' ? t('whatsToday', 'בוא נתחיל') : t('continue', 'המשך')}
                        {isRTL ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </>
                    )}
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
