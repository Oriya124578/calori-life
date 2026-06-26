import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Loader2, CalendarRange, ChevronLeft } from 'lucide-react';
import { format, addDays, parseISO, isValid, differenceInCalendarDays, startOfDay } from 'date-fns';
import { he } from 'date-fns/locale';
import { useStore } from '../../store/useStore';
import { generateWeeklyPlan } from '../../lib/gemini';
import { setWeeklyPlan, getWeeklyPlan } from '../../lib/firestoreRepo';
import { toast } from '../../store/useToast';

const C = {
  ink: '#2A1A0A', sub: '#5A4A3A', muted: '#8A7A6A',
  border: 'rgba(180,140,80,.16)', green: '#059669', greenDark: '#065F46',
  greenSoft: 'rgba(5,150,105,.08)', purple: '#7C3AED',
};
const serif = "'Instrument Serif', serif";

const HOURS = ['שעתיים', '4 שעות', '6 שעות', 'כל היום'];
const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']; // Sun..Sat

// Builds the next 7 calendar days starting today.
const nextWeek = () => {
  const start = startOfDay(new Date());
  return Array.from({ length: 7 }, (_, i) => {
    const d = addDays(start, i);
    return { date: format(d, 'yyyy-MM-dd'), weekday: format(d, 'EEEE', { locale: he }) };
  });
};

const hoursToNumber = (label) =>
  label === 'שעתיים' ? 2 : label === '4 שעות' ? 4 : label === '6 שעות' ? 6 : label === 'כל היום' ? 10 : null;

export const WeekPlanner = ({ isOpen, onClose, onPickDay }) => {
  const { uid, data } = useStore();

  const [studyHours, setStudyHours] = useState('4 שעות');
  const [studyDays, setStudyDays] = useState(() => new Set([0, 1, 2, 3, 4])); // Sun..Thu
  const [fillTasks, setFillTasks] = useState('כן'); // 'כן' | 'רק דחופות' | 'לא'
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null); // { weekStart, days:[...] }

  const weekDays = useMemo(() => nextWeek(), []);

  // Load an existing plan when opening — only show it if it's for the current week.
  useEffect(() => {
    if (!isOpen || !uid) return;
    getWeeklyPlan(uid).then((p) => {
      if (p?.weekStart === weekDays[0].date) setPlan(p);
      else setPlan(null);
    }).catch(() => {});
  }, [isOpen, uid, weekDays]);

  const exams = useMemo(() => {
    const out = [];
    (data?.courses || []).forEach((course) => {
      ['moedA', 'moedB', 'moedC'].forEach((moed) => {
        const raw = course[moed] || course.exams?.[moed];
        if (!raw) return;
        const dt = parseISO(raw);
        if (!isValid(dt)) return;
        const days = differenceInCalendarDays(startOfDay(dt), startOfDay(new Date()));
        if (days >= 0 && days <= 21) out.push({ course: course.name, date: raw.slice(0, 10), inDays: days });
      });
    });
    return out;
  }, [data?.courses]);

  const toggleDay = (i) =>
    setStudyDays((prev) => {
      const n = new Set(prev);
      if (n.has(i)) n.delete(i); else n.add(i);
      return n;
    });

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const res = await generateWeeklyPlan({
        weekDays,
        wakeTime: data?.profile?.wakeTime,
        sleepTime: data?.profile?.sleepTime,
        studyHoursPerDay: hoursToNumber(studyHours),
        studyWeekdays: Array.from(studyDays),
        courses: (data?.courses || []).map((c) => ({ name: c.name })),
        exams,
        note: note.trim(),
        fillTasks,
        openTaskCount: (data?.personalTasks || []).filter((t) => !t.done).length,
        workoutDays: [],
      });
      if (res?.error === 'MISSING_KEY') { toast.error('חסר מפתח Gemini — הגדר אותו בהגדרות'); return; }
      if (!res?.days?.length) { toast.error('בניית תוכנית השבוע נכשלה, נסה שוב'); return; }
      const saved = { weekStart: weekDays[0].date, generatedAt: new Date().toISOString(), days: res.days };
      setPlan(saved);
      await setWeeklyPlan(uid, saved).catch(() => {});
      toast.success('תוכנית השבוע נבנתה ✓');
    } catch {
      toast.error('בניית תוכנית השבוע נכשלה, נסה שוב');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const focusColor = (f) =>
    f === 'exam-prep' ? '#DC2626' : f === 'study' ? C.green : f === 'light' ? '#D97706' : C.muted;
  const focusLabel = (f) =>
    f === 'exam-prep' ? 'הכנה למבחן' : f === 'study' ? 'לימודים' : f === 'light' ? 'יום קל' : 'מנוחה';

  return (
    <AnimatePresence>
      <motion.div
        key="wp-backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="fixed inset-0 z-[120] bg-black/45 backdrop-blur-md flex items-end sm:items-center justify-center"
      >
        <motion.div
          key="wp-sheet"
          initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          dir="rtl"
          className="w-full sm:max-w-md overflow-hidden flex flex-col max-h-[92vh]"
          style={{ background: '#FAF7F2', borderRadius: '26px 26px 0 0', border: `1px solid ${C.border}`, boxShadow: '0 -12px 50px rgba(40,20,0,.25)' }}
        >
          <div style={{ height: 3, background: 'linear-gradient(90deg, #065F46, #7C3AED 50%, #2563EB)' }} />
          <div className="flex items-center justify-between px-5 pt-3 pb-1">
            <div className="flex items-center gap-2">
              <CalendarRange className="w-4 h-4" style={{ color: C.purple }} />
              <span style={{ fontSize: 10, fontWeight: 600, color: C.muted, letterSpacing: '.14em', textTransform: 'uppercase' }}>
                תכנון שבוע
              </span>
            </div>
            <button onClick={onClose} aria-label="סגור" className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[rgba(180,140,80,.08)] cursor-pointer">
              <X className="w-4 h-4" style={{ color: C.muted }} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-5" style={{ minHeight: 280 }}>
            {/* Inputs */}
            <div className="space-y-4 pt-1">
              <h2 style={{ fontFamily: serif, fontSize: 24, color: C.ink }}>
                תכנן את <em style={{ fontStyle: 'italic', color: C.green }}>השבוע</em> בלחיצה
              </h2>

              <div className="space-y-2">
                <span className="text-[13px] font-bold" style={{ color: C.ink }}>כמה שעות ללמוד ביום לימוד?</span>
                <div className="flex flex-wrap gap-1.5">
                  {HOURS.map((h) => (
                    <button key={h} onClick={() => setStudyHours(h)}
                      className="px-3 py-1.5 rounded-xl text-[13px] font-semibold active:scale-95 transition-all"
                      style={{ border: '1.5px solid', borderColor: studyHours === h ? C.green : C.border, background: studyHours === h ? 'rgba(5,150,105,.1)' : '#fff', color: studyHours === h ? C.green : C.ink }}>
                      {h}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[13px] font-bold" style={{ color: C.ink }}>ימי לימוד</span>
                <div className="flex gap-1.5">
                  {WEEKDAYS.map((d, i) => (
                    <button key={i} onClick={() => toggleDay(i)}
                      className="w-9 h-9 rounded-full text-[13px] font-bold active:scale-95 transition-all"
                      style={{ border: '1.5px solid', borderColor: studyDays.has(i) ? C.green : C.border, background: studyDays.has(i) ? C.green : '#fff', color: studyDays.has(i) ? '#fff' : C.sub }}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[13px] font-bold" style={{ color: C.ink }}>למלא משימות פתוחות לאורך השבוע?</span>
                <div className="flex flex-wrap gap-1.5">
                  {['כן', 'רק דחופות', 'לא'].map((opt) => (
                    <button key={opt} onClick={() => setFillTasks(opt)}
                      className="px-3 py-1.5 rounded-xl text-[13px] font-semibold active:scale-95 transition-all"
                      style={{ border: '1.5px solid', borderColor: fillTasks === opt ? C.green : C.border, background: fillTasks === opt ? 'rgba(5,150,105,.1)' : '#fff', color: fillTasks === opt ? C.green : C.ink }}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[13px] font-bold" style={{ color: C.ink }}>נסיעות / אירועים קבועים ודגשים (לא חובה)</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                  placeholder='לפי יום — לדוגמה: "ראשון נסיעה לאוניברסיטה ב-8:00, שלישי אימון בערב, חמישי מבחן באינפי, שישי יום מנוחה"'
                  className="w-full rounded-2xl px-3.5 py-2.5 text-sm focus-visible:outline-none resize-none text-start"
                  style={{ background: '#fff', border: `1.5px solid ${C.border}`, color: C.ink }} />
              </div>

              {exams.length > 0 && (
                <p className="text-[12px]" style={{ color: C.muted }}>
                  מתחשב במבחנים: {exams.map((e) => `${e.course} (בעוד ${e.inDays} ימים)`).join(' · ')}
                </p>
              )}
            </div>

            {/* Generated plan */}
            {plan?.days?.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" style={{ color: C.purple }} />
                  <span className="text-[13px] font-bold" style={{ color: C.ink }}>התוכנית שלך — לחץ על יום לדיוק ובנייה</span>
                </div>
                {plan.days.map((day) => (
                  <button
                    key={day.date}
                    onClick={() => { onPickDay?.(day.date, day.directive); onClose?.(); }}
                    className="w-full flex items-center gap-3 rounded-2xl px-3.5 py-3 text-start active:scale-[.99] transition-all"
                    style={{ background: '#fff', border: `1px solid ${C.border}` }}
                  >
                    <span className="flex flex-col items-center justify-center shrink-0" style={{ width: 44 }}>
                      <span className="text-[12px] font-bold" style={{ color: focusColor(day.focus) }}>{day.weekday}</span>
                      <span className="text-[10px]" style={{ color: C.muted }}>{day.date.slice(8)}/{day.date.slice(5, 7)}</span>
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-semibold truncate" style={{ color: C.ink }}>{day.summary}</span>
                      <span className="text-[11px]" style={{ color: focusColor(day.focus) }}>
                        {focusLabel(day.focus)}{day.studyHours ? ` · ${day.studyHours}ש׳ לימוד` : ''}
                      </span>
                    </span>
                    <ChevronLeft className="w-4 h-4 shrink-0" style={{ color: C.muted }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3" style={{ borderTop: `1px solid ${C.border}`, background: 'rgba(255,255,255,.6)' }}>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleGenerate}
              disabled={loading}
              className="w-full py-3.5 rounded-2xl font-bold text-[15px] text-white flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              style={{ background: `linear-gradient(135deg, ${C.green}, ${C.greenDark})`, boxShadow: '0 6px 20px rgba(5,150,105,.3)' }}
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> בונה תוכנית…</>
                : <><Sparkles className="w-4 h-4" /> {plan ? 'בנה תוכנית מחדש' : 'תכנן לי את השבוע'}</>}
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
