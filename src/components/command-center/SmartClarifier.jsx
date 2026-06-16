import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Clock, BookOpen, Dumbbell, Car, Calendar, ChevronLeft, ChevronRight,
  Sparkles, Check, MapPin,
} from 'lucide-react';

const C = {
  ink: '#2A1A0A',
  sub: '#5A4A3A',
  muted: '#8A7A6A',
  border: 'rgba(180,140,80,.16)',
  green: '#059669',
  purple: '#7C3AED',
};
const serif = "'Instrument Serif', serif";

const INTENT_PATTERNS = [
  { key: 'study',   patterns: ['למד', 'לימוד', 'ללמוד', 'אלמד', 'שאלמד', 'מבחן', 'בחינה', 'סיכומים', 'תרגול', 'הרצאה', 'study'], icon: BookOpen, label: 'לימודים', color: '#2563EB' },
  { key: 'workout', patterns: ['אימון', 'להתאמן', 'אתאמן', 'ספורט', 'workout', 'gym', 'ריצה', 'חדר כושר'], icon: Dumbbell, label: 'אימון', color: '#7C3AED' },
  { key: 'travel',  patterns: ['נסיעה', 'לנסוע', 'נוסע', 'דרך', 'travel', 'trip', 'טיול'], icon: Car, label: 'נסיעה', color: '#D97706' },
  { key: 'event',   patterns: ['תור', 'פגישה', 'אירוע', 'meeting', 'event', 'רופא', 'appointment'], icon: Calendar, label: 'אירוע', color: '#059669' },
];

const detectIntents = (text) => {
  const lower = text.toLowerCase();
  return INTENT_PATTERNS.filter(ip => ip.patterns.some(p => lower.includes(p)));
};

const hasTimeInfo = (text) => /\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s*(בבוקר|בצהריים|בערב|בלילה|am|pm)\b/i.test(text);
const hasSubjectInfo = (text) => /אינפי|אלגברה|תכנות|מבני|לוגיקה|C\b/i.test(text);
// "Whole day" intent — when present we must NOT force a start/end hour, otherwise
// the composed directive caps the day (e.g. "עד 17:00") and the schedule stops early.
const isAllDayStudy = (text) => /כל\s*היום|כל\s*הזמן|יום\s*(לימודים\s*)?מלא|כל\s*שעות\s*היום|intensive|all[\s-]*day|whole[\s-]*day/i.test(text);

const TIME_OPTIONS = [
  { value: '06:00', label: '06:00' }, { value: '07:00', label: '07:00' },
  { value: '08:00', label: '08:00' }, { value: '09:00', label: '09:00' },
  { value: '10:00', label: '10:00' }, { value: '11:00', label: '11:00' },
  { value: '12:00', label: '12:00' }, { value: '13:00', label: '13:00' },
  { value: '14:00', label: '14:00' }, { value: '15:00', label: '15:00' },
  { value: '16:00', label: '16:00' }, { value: '17:00', label: '17:00' },
  { value: '18:00', label: '18:00' }, { value: '19:00', label: '19:00' },
  { value: '20:00', label: '20:00' }, { value: '21:00', label: '21:00' },
  { value: '22:00', label: '22:00' }, { value: '23:00', label: '23:00' },
];

const TimePicker = ({ value, onChange, label }) => (
  <div className="flex flex-col gap-1.5">
    <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{label}</span>
    <div className="flex flex-wrap gap-1.5">
      {TIME_OPTIONS.map(t => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className="transition-all active:scale-95"
          style={{
            padding: '6px 12px', borderRadius: 10, fontSize: 13, fontWeight: 600,
            fontVariantNumeric: 'tabular-nums', border: '1.5px solid',
            borderColor: value === t.value ? C.green : C.border,
            background: value === t.value ? 'rgba(5,150,105,.1)' : '#fff',
            color: value === t.value ? C.green : C.ink,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  </div>
);

const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? 120 : -120, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -120 : 120, opacity: 0 }),
};

export const SmartClarifier = ({ userText, onSubmit, onCancel, courses = [] }) => {
  const intents = useMemo(() => detectIntents(userText), [userText]);
  const needsTimes = !hasTimeInfo(userText);
  const allDayStudy = useMemo(() => isAllDayStudy(userText), [userText]);

  const questions = useMemo(() => {
    const qs = [];

    intents.forEach(intent => {
      if (intent.key === 'study') {
        // For an all-day study request the hours are implied (wake→bedtime); asking
        // start/end would only let the user accidentally cap the day. Skip them.
        if (needsTimes && !allDayStudy) {
          qs.push({ id: `study_start`, type: 'time', intent: 'study', label: 'מאיזה שעה ללמוד?', icon: Clock, color: intent.color });
          qs.push({ id: `study_end`, type: 'time', intent: 'study', label: 'עד איזה שעה?', icon: Clock, color: intent.color });
        }
        if (!hasSubjectInfo(userText) && courses.length > 0) {
          qs.push({ id: 'study_subject', type: 'chips', intent: 'study', label: 'מה ללמוד?', icon: BookOpen, color: intent.color, options: [...courses.map(c => c.name), 'הכל — תחליט אתה'] });
        }
      }
      if (intent.key === 'workout') {
        if (needsTimes) {
          qs.push({ id: 'workout_time', type: 'time', intent: 'workout', label: 'מתי האימון?', icon: Dumbbell, color: intent.color });
        }
        qs.push({ id: 'workout_duration', type: 'chips', intent: 'workout', label: 'כמה זמן?', icon: Clock, color: intent.color, options: ['30 דק׳', '45 דק׳', '60 דק׳', '90 דק׳'] });
      }
      if (intent.key === 'travel') {
        if (needsTimes) {
          qs.push({ id: 'travel_depart', type: 'time', intent: 'travel', label: 'מתי יוצאים?', icon: Car, color: intent.color });
          qs.push({ id: 'travel_return', type: 'time', intent: 'travel', label: 'מתי חוזרים? (אם רלוונטי)', icon: Car, color: intent.color, optional: true });
        }
      }
      if (intent.key === 'event') {
        if (needsTimes) {
          qs.push({ id: 'event_time', type: 'time', intent: 'event', label: 'מתי האירוע?', icon: Calendar, color: intent.color });
          qs.push({ id: 'event_duration', type: 'chips', intent: 'event', label: 'כמה זמן?', icon: Clock, color: intent.color, options: ['30 דק׳', '60 דק׳', '90 דק׳', '2 שעות', '3 שעות'] });
        }
      }
    });

    if (qs.length === 0 && intents.length > 0) {
      return [];
    }
    return qs;
  }, [intents, needsTimes, allDayStudy, courses, userText]);

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [direction, setDirection] = useState(1);

  const shouldPassthrough = questions.length === 0;

  useEffect(() => {
    if (shouldPassthrough) onSubmit(userText);
  }, [shouldPassthrough, userText, onSubmit]);

  if (shouldPassthrough) return null;

  const current = questions[step];
  const isLast = step === questions.length - 1;
  const canProceed = current?.optional || !!answers[current?.id];

  const goNext = () => {
    if (isLast) {
      const directive = composeDirective(userText, answers, intents);
      onSubmit(directive);
    } else {
      setDirection(1);
      setStep(s => s + 1);
    }
  };

  const goBack = () => {
    if (step === 0) { onCancel(); return; }
    setDirection(-1);
    setStep(s => s - 1);
  };

  const skipAndNext = () => {
    setDirection(1);
    if (isLast) {
      const directive = composeDirective(userText, answers, intents);
      onSubmit(directive);
    } else {
      setStep(s => s + 1);
    }
  };

  const IntentIcon = current ? (INTENT_PATTERNS.find(i => i.key === current.intent)?.icon || Sparkles) : Sparkles;

  return (
    <motion.div
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 60 }}
      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
      className="fixed inset-0 z-[130] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,.35)' }}
      dir="rtl"
    >
      <motion.div
        className="w-full max-w-lg rounded-t-3xl overflow-hidden"
        style={{ background: '#FAF7F2', borderTop: `3px solid ${current?.color || C.green}`, maxHeight: '75vh' }}
        layoutId="clarifier-sheet"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: `${current?.color || C.green}15` }}>
              <Sparkles className="w-4 h-4" style={{ color: current?.color || C.green }} />
            </div>
            <span style={{ fontFamily: serif, fontSize: 18, color: C.ink }}>עוד רגע מסדר לך</span>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-black/5 transition-colors">
            <X className="w-5 h-5" style={{ color: C.muted }} />
          </button>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5 py-2">
          {questions.map((_, i) => (
            <motion.div
              key={i}
              animate={{ width: i === step ? 20 : 6, background: i === step ? (current?.color || C.green) : 'rgba(180,140,80,.25)' }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              style={{ height: 6, borderRadius: 999 }}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="px-5 pb-3 overflow-hidden" style={{ minHeight: 260 }}>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
            >
              {/* Intent badge */}
              <div className="flex items-center gap-2 mb-3">
                <IntentIcon className="w-4 h-4" style={{ color: current.color }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: current.color, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  {INTENT_PATTERNS.find(i => i.key === current.intent)?.label}
                </span>
              </div>

              {/* Question */}
              <h3 style={{ fontFamily: serif, fontSize: 22, color: C.ink, marginBottom: 16 }}>{current.label}</h3>

              {/* Answer area */}
              {current.type === 'time' && (
                <TimePicker
                  value={answers[current.id] || ''}
                  onChange={(v) => setAnswers(a => ({ ...a, [current.id]: v }))}
                  label="בחר שעה"
                />
              )}

              {current.type === 'chips' && (
                <div className="flex flex-wrap gap-2">
                  {current.options.map(opt => (
                    <button
                      key={opt}
                      onClick={() => setAnswers(a => ({ ...a, [current.id]: opt }))}
                      className="transition-all active:scale-95"
                      style={{
                        padding: '8px 16px', borderRadius: 12, fontSize: 14, fontWeight: 600,
                        border: '1.5px solid',
                        borderColor: answers[current.id] === opt ? current.color : C.border,
                        background: answers[current.id] === opt ? `${current.color}15` : '#fff',
                        color: answers[current.id] === opt ? current.color : C.ink,
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 pb-6 pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
          <button onClick={goBack} className="flex items-center gap-1 px-3 py-2 rounded-xl hover:bg-black/5 transition-colors">
            <ChevronRight className="w-4 h-4" style={{ color: C.muted }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>{step === 0 ? 'ביטול' : 'חזור'}</span>
          </button>

          <div className="flex items-center gap-2">
            {current?.optional && (
              <button onClick={skipAndNext} className="px-3 py-2 rounded-xl hover:bg-black/5 transition-colors" style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>
                דלג
              </button>
            )}
            <button
              onClick={canProceed ? goNext : undefined}
              disabled={!canProceed}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl transition-all active:scale-95"
              style={{
                background: canProceed ? (current?.color || C.green) : '#E5E0D8',
                color: canProceed ? '#fff' : C.muted,
                fontWeight: 700, fontSize: 14,
              }}
            >
              {isLast ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>בנה לי לוז</span>
                </>
              ) : (
                <>
                  <span>הבא</span>
                  <ChevronLeft className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

function composeDirective(originalText, answers, intents) {
  const parts = [originalText];

  if (answers.study_start || answers.study_end) {
    const from = answers.study_start || '';
    const to = answers.study_end || '';
    if (from && to) parts.push(`שעות לימוד: ${from} עד ${to}.`);
    else if (from) parts.push(`התחל ללמוד מ-${from}.`);
    else if (to) parts.push(`סיים ללמוד עד ${to}.`);
  }
  if (answers.study_subject && answers.study_subject !== 'הכל — תחליט אתה') {
    parts.push(`התמקד בקורס: ${answers.study_subject}.`);
  }
  if (answers.workout_time) {
    parts.push(`אימון ב-${answers.workout_time}.`);
  }
  if (answers.workout_duration) {
    parts.push(`משך אימון: ${answers.workout_duration}.`);
  }
  if (answers.travel_depart) {
    parts.push(`יציאה לנסיעה ב-${answers.travel_depart}.`);
  }
  if (answers.travel_return) {
    parts.push(`חזרה מנסיעה ב-${answers.travel_return}.`);
  }
  if (answers.event_time) {
    parts.push(`האירוע ב-${answers.event_time}.`);
  }
  if (answers.event_duration) {
    parts.push(`משך האירוע: ${answers.event_duration}.`);
  }

  return parts.join(' ');
}
