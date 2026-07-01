import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useTranslation } from '../../hooks/useTranslation';
import { useStore } from '../../store/useStore';
import { DEFAULT_COURSES } from '../../data';
import confetti from 'canvas-confetti';
import {
  BookOpen, User, Calendar, CheckCircle2, ChevronRight, ChevronLeft,
  ArrowRight, Plus, X, Check,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { toast } from '../../store/useToast';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeCustomId = () =>
  `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

const WEEK_OPTIONS = [8, 10, 12, 13, 14, 15, 16];

const DEFAULT_TASK_KEYS = ['lecture', 'tutorial', 'homework'];

// ── Component ────────────────────────────────────────────────────────────────

export const OnboardingScreen = () => {
  const { t } = useTranslation();
  const { language, completeOnboarding } = useStore();
  const isRtl = language !== 'en';

  // ── Navigation state ──────────────────────────────────────────────────────
  const [step,      setStep]      = useState(1);
  const [direction, setDirection] = useState(1);

  // ── Step 1: profile ───────────────────────────────────────────────────────
  const [displayName,   setDisplayName]   = useState('');
  const [academicYear,  setAcademicYear]  = useState(language === 'en' ? 'Year 1'       : "שנה א'");
  const [semester,      setSemester]      = useState(language === 'en' ? 'Semester A'   : "סמסטר א'");

  // ── Step 3: course selection ──────────────────────────────────────────────
  const [selectedCourseIds, setSelectedCourseIds] = useState([]);
  const [customCourses,    setCustomCourses]    = useState([]);
  const [showCustomForm,   setShowCustomForm]   = useState(false);
  const [newCourseName,    setNewCourseName]    = useState('');
  const [newCourseWeeks,   setNewCourseWeeks]   = useState(12);

  // Sync selected courses when year/semester changes
  React.useEffect(() => {
    const matchingDefaults = DEFAULT_COURSES.filter(
      (c) => c.academicYear === academicYear && c.semester === semester
    );
    setSelectedCourseIds(matchingDefaults.map((c) => c.id));
  }, [academicYear, semester]);

  // ── Step 4: task template ─────────────────────────────────────────────────
  const [enabledTypes, setEnabledTypes] = useState({
    lecture: true, tutorial: true, homework: true,
  });
  const [progressTypes, setProgressTypes] = useState({
    lecture: true, tutorial: true, homework: false,
  });
  const [customTypes,        setCustomTypes]        = useState([]);
  const [newTypeLabel,       setNewTypeLabel]       = useState('');

  // ── Derived ───────────────────────────────────────────────────────────────
  const filteredDefaults = DEFAULT_COURSES.filter(
    (c) => c.academicYear === academicYear && c.semester === semester
  );
  const allCourses = [...filteredDefaults, ...customCourses];

  const toggleCourse = (id) =>
    setSelectedCourseIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );

  const addCustomCourse = () => {
    const name = newCourseName.trim();
    if (!name) return;
    const id = makeCustomId();
    setCustomCourses((prev) => [
      ...prev,
      {
        id,
        name,
        weeksCount: newCourseWeeks,
        defaultNotebookLmLink: '',
        defaultGeminiLink: '',
        defaultMoodleLink: '',
        defaultLocalFolder: name,
        exams: { moedA: null, moedB: null, moedC: null },
      },
    ]);
    setSelectedCourseIds((prev) => [...prev, id]);
    setNewCourseName('');
    setShowCustomForm(false);
  };

  const removeCustomCourse = (id) => {
    setCustomCourses((prev) => prev.filter((c) => c.id !== id));
    setSelectedCourseIds((prev) => prev.filter((c) => c !== id));
  };

  const addCustomType = () => {
    const label = newTypeLabel.trim();
    if (!label) return;
    const type = `custom_${Date.now()}`;
    setCustomTypes((prev) => [...prev, { type, label }]);
    setNewTypeLabel('');
  };

  const removeCustomType = (type) =>
    setCustomTypes((prev) => prev.filter((t) => t.type !== type));

  // ── Navigation ────────────────────────────────────────────────────────────
  const TOTAL_STEPS = 5;

  const nextStep = () => {
    if (step < TOTAL_STEPS) {
      setDirection(1);
      setStep((prev) => prev + 1);
    }
  };

  const prevStep = () => {
    if (step > 1) {
      setDirection(-1);
      setStep((prev) => prev - 1);
    }
  };

  // ── Finish ────────────────────────────────────────────────────────────────
  const handleFinish = () => {
    if (selectedCourseIds.length === 0) return;

    confetti({
      particleCount: 150, spread: 70,
      origin: { y: 0.6 },
      colors: ['#4ade80', '#3b82f6', '#f43f5e', '#fbbf24'],
    });

    const selectedCourses = allCourses.filter((c) => selectedCourseIds.includes(c.id));

    // Build seeds from selected task types
    const defaultLabels = {
      he: { lecture: 'הרצאה', tutorial: 'תרגול', homework: 'שיעורי בית' },
      en: { lecture: 'Lecture', tutorial: 'Tutorial', homework: 'Homework' },
    };
    const l = defaultLabels[language] || defaultLabels.he;
    const seeds = [
      ...(enabledTypes.lecture  ? [{ type: 'lecture',  label: l.lecture  }] : []),
      ...(enabledTypes.tutorial ? [{ type: 'tutorial', label: l.tutorial }] : []),
      ...(enabledTypes.homework ? [{ type: 'homework', label: l.homework }] : []),
      ...customTypes,
    ];

    setTimeout(() => {
      // completeOnboarding is async — use .catch so a failed Firestore write
      // surfaces a toast instead of silently stranding the user.
      Promise.resolve(
        completeOnboarding(
          { displayName: (displayName || '').trim(), academicYear, semester },
          selectedCourses,
          seeds.length > 0 ? seeds : null,
          {
            lecture: !!progressTypes.lecture,
            tutorial: !!progressTypes.tutorial,
            homework: !!progressTypes.homework,
            custom: true
          }
        ),
      ).catch((err) => {
        console.error('Onboarding failed', err);
        toast.error(t('saveError'));
      });
    }, 1000);
  };

  // ── Slide variants ────────────────────────────────────────────────────────
  const slideVariants = {
    enter:  (d) => ({ x: d > 0 ? (isRtl ? -1000 : 1000) : (isRtl ?  1000 : -1000), opacity: 0 }),
    center: { zIndex: 1, x: 0, opacity: 1 },
    exit:   (d) => ({ zIndex: 0, x: d < 0 ? (isRtl ? -1000 : 1000) : (isRtl ? 1000 : -1000), opacity: 0 }),
  };

  const stepMotion = {
    custom: direction,
    variants: slideVariants,
    initial: 'enter',
    animate: 'center',
    exit:    'exit',
    transition: { type: 'spring', stiffness: 300, damping: 30 },
    className: 'w-full flex flex-col items-center text-center space-y-6',
  };

  // ── Shared nav buttons ────────────────────────────────────────────────────
  const renderNavButtons = ({ nextDisabled, nextLabel, onNext } = {}) => (
    <div className="flex gap-4 w-full max-w-sm">
      <Button variant="outline" size="lg" className="flex-1 h-12 rounded-full" onClick={prevStep}>
        {isRtl ? <ChevronRight className="w-5 h-5 ml-2" /> : <ChevronLeft className="w-5 h-5 mr-2" />}
        {t('cancel', 'חזור')}
      </Button>
      <Button
        size="lg" className="flex-1 h-12 rounded-full"
        disabled={nextDisabled}
        onClick={onNext || nextStep}
      >
        {nextLabel || t('nextStep')}
      </Button>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen bg-background text-foreground overflow-hidden flex flex-col relative"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Background decor */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] rounded-full bg-primary/5 blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-[100px]" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10 w-full max-w-2xl mx-auto">
        {/* Step indicator */}
        <div className="flex justify-center gap-2 mb-10">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
            <div
              key={s}
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                s === step ? 'w-8 bg-primary' : (s < step ? 'w-4 bg-primary/50' : 'w-4 bg-primary/20'),
              )}
            />
          ))}
        </div>

        <div className="w-full relative min-h-[400px] flex items-center justify-center">
          <AnimatePresence initial={false} custom={direction} mode="wait">

            {/* ── STEP 1: Name ── */}
            {step === 1 && (
              <motion.div key="s1" {...stepMotion}>
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
                  <User className="w-10 h-10 text-primary" />
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold mb-2">
                    {t('welcomeTo')} <span className="text-primary">Calori Life</span>
                  </h1>
                  <p className="text-muted-foreground text-lg">{t('onboardingDesc')}</p>
                </div>
                <div className="w-full max-w-sm space-y-3 text-start">
                  <label className="text-sm font-semibold">{t('whatsYourName')}</label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t('namePlaceholder')}
                    className="h-14 text-lg px-4"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter' && displayName.trim()) nextStep(); }}
                  />
                  <p className="text-xs text-muted-foreground">{t('whatsYourNameDesc')}</p>
                </div>
                <Button
                  size="lg" className="w-full max-w-sm h-12 text-lg rounded-full"
                  disabled={!displayName.trim()} onClick={nextStep}
                >
                  {t('nextStep')}
                </Button>
              </motion.div>
            )}

            {/* ── STEP 2: Semester ── */}
            {step === 2 && (
              <motion.div key="s2" {...stepMotion}>
                <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center">
                  <Calendar className="w-10 h-10 text-blue-500" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold mb-2">{t('academicPeriod')}</h2>
                  <p className="text-muted-foreground text-lg">{t('academicPeriodDesc')}</p>
                </div>
                <div className="w-full max-w-sm space-y-5 text-start">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">{t('academicYear')}</label>
                    <select
                      value={academicYear}
                      onChange={(e) => setAcademicYear(e.target.value)}
                      className="flex h-14 w-full rounded-xl border border-input bg-background/50 px-4 text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {(language === 'en'
                        ? ['Year 1', 'Year 2', 'Year 3', 'Year 4']
                        : ["שנה א'", "שנה ב'", "שנה ג'", "שנה ד'"]
                      ).map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold">{t('semester')}</label>
                    <select
                      value={semester}
                      onChange={(e) => setSemester(e.target.value)}
                      className="flex h-14 w-full rounded-xl border border-input bg-background/50 px-4 text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {(language === 'en'
                        ? ['Semester A', 'Semester B', 'Summer']
                        : ["סמסטר א'", "סמסטר ב'", 'סמסטר קיץ']
                      ).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
                {renderNavButtons()}
              </motion.div>
            )}

            {/* ── STEP 3: Course selection ── */}
            {step === 3 && (
              <motion.div
                key="s3"
                custom={direction}
                variants={slideVariants}
                initial="enter" animate="center" exit="exit"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="w-full h-full flex flex-col space-y-4"
              >
                <div className="text-center">
                  <h2 className="text-3xl font-bold mb-1">{t('courseSelection')}</h2>
                  <p className="text-muted-foreground text-sm">{t('courseSelectionDesc')}</p>
                </div>

                {/* Course grid */}
                <div className="flex-1 overflow-y-auto pb-2" style={{ maxHeight: 280 }}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {allCourses.map((course) => {
                      const isSelected = selectedCourseIds.includes(course.id);
                      const isCustom   = !!course.id.startsWith('custom_');
                      return (
                        <div
                          key={course.id}
                          onClick={() => toggleCourse(course.id)}
                          className={cn(
                            'p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex items-center justify-between gap-2',
                            isSelected
                              ? 'border-primary bg-primary/5 shadow-sm scale-[1.02]'
                              : 'border-border bg-card hover:border-primary/50',
                          )}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <BookOpen className={cn('w-4 h-4 shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                            <span className="font-medium truncate">{course.name}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isCustom && (
                              <button
                                onClick={(e) => { e.stopPropagation(); removeCustomCourse(course.id); }}
                                className="p-0.5 text-muted-foreground hover:text-destructive"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <div className={cn(
                              'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors',
                              isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30',
                            )}>
                              {isSelected && <Check className="w-3 h-3 text-white" />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Add custom course */}
                {!showCustomForm ? (
                  <button
                    onClick={() => setShowCustomForm(true)}
                    className="flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80 transition-colors self-start px-1"
                  >
                    <Plus className="w-4 h-4" />
                    {t('addCustomCourse')}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 p-3 rounded-xl border border-primary/30 bg-primary/5">
                    <input
                      autoFocus
                      value={newCourseName}
                      onChange={(e) => setNewCourseName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addCustomCourse(); if (e.key === 'Escape') setShowCustomForm(false); }}
                      placeholder={t('customCourseName')}
                      className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
                    />
                    <select
                      value={newCourseWeeks}
                      onChange={(e) => setNewCourseWeeks(Number(e.target.value))}
                      className="text-sm bg-transparent outline-none text-foreground border border-border rounded-lg px-2 py-1"
                    >
                      {WEEK_OPTIONS.map((w) => (
                        <option key={w} value={w}>{w} {t('customCourseWeeks')}</option>
                      ))}
                    </select>
                    <button
                      onClick={addCustomCourse}
                      disabled={!newCourseName.trim()}
                      className="text-xs font-bold text-primary disabled:opacity-40"
                    >
                      {t('addCourseBtn')}
                    </button>
                    <button onClick={() => setShowCustomForm(false)}>
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                )}

                {renderNavButtons({ nextDisabled: selectedCourseIds.length === 0 })}
              </motion.div>
            )}

            {/* ── STEP 4: Task templates ── */}
            {step === 4 && (
              <motion.div
                key="s4"
                custom={direction}
                variants={slideVariants}
                initial="enter" animate="center" exit="exit"
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="w-full flex flex-col space-y-5"
              >
                <div className="text-center">
                  <h2 className="text-3xl font-bold mb-1">{t('taskTemplatesStep')}</h2>
                  <p className="text-muted-foreground text-sm">{t('taskTemplatesDesc')}</p>
                </div>

                {/* Default task type toggles */}
                <div className="w-full space-y-2.5 max-w-sm mx-auto">
                  {DEFAULT_TASK_KEYS.map((key) => {
                    const isGenerated = enabledTypes[key];
                    return (
                      <div 
                        key={key} 
                        className={cn(
                          'flex flex-col gap-2 p-3.5 rounded-2xl border-2 transition-all text-start',
                          isGenerated ? 'border-primary bg-primary/5' : 'border-border bg-card',
                        )}
                        style={{ direction: isRtl ? 'rtl' : 'ltr' }}
                      >
                        <label className="flex items-center gap-3 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            className="rounded border-input text-primary focus:ring-primary w-5 h-5"
                            checked={isGenerated}
                            onChange={() =>
                              setEnabledTypes((prev) => ({ ...prev, [key]: !prev[key] }))
                            }
                          />
                          <span className="font-bold text-sm">{t(`taskType_${key}`)}</span>
                        </label>
                        
                        {isGenerated && (
                          <label className="flex items-center gap-2.5 ps-8 text-xs text-muted-foreground cursor-pointer select-none animate-in fade-in duration-200">
                            <input
                              type="checkbox"
                              className="rounded border-input text-primary focus:ring-primary w-4 h-4"
                              checked={progressTypes[key]}
                              onChange={() =>
                                setProgressTypes((prev) => ({ ...prev, [key]: !prev[key] }))
                              }
                            />
                            {language === 'he' ? 'כלול בחישוב ההתקדמות של הקורס' : 'Include in course progress calculation'}
                          </label>
                        )}
                      </div>
                    );
                  })}

                  {/* Custom task types */}
                  {customTypes.map((ct) => (
                    <div
                      key={ct.type}
                      className="flex items-center gap-3 p-3.5 rounded-2xl border-2 border-primary/40 bg-primary/5"
                    >
                      <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                      <span className="font-medium text-sm flex-1">{ct.label}</span>
                      <button
                        onClick={() => removeCustomType(ct.type)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {/* Add custom type input */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      value={newTypeLabel}
                      onChange={(e) => setNewTypeLabel(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addCustomType(); }}
                      placeholder={t('customTaskTypePlaceholder')}
                      className="flex-1 text-sm h-10 px-3 rounded-xl border border-border bg-background/50 outline-none focus:border-primary placeholder:text-muted-foreground"
                    />
                    <Button
                      size="sm" variant="outline"
                      disabled={!newTypeLabel.trim()}
                      onClick={addCustomType}
                      className="h-10 shrink-0"
                    >
                      {t('addCustomTaskType')}
                    </Button>
                  </div>
                </div>

                <div className="flex justify-center w-full">
                  {renderNavButtons({
                    nextDisabled: !Object.values(enabledTypes).some(Boolean) && customTypes.length === 0
                  })}
                </div>
              </motion.div>
            )}

            {/* ── STEP 5: Finish ── */}
            {step === 5 && (
              <motion.div key="s5" {...stepMotion}>
                <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-12 h-12 text-green-500" />
                </div>
                <div>
                  <h2 className="text-4xl font-bold mb-3">{t('allReady')}</h2>
                  <p className="text-muted-foreground text-lg max-w-md mx-auto">
                    {t('allReadyDesc')}
                  </p>
                </div>
                <Button
                  size="lg"
                  className="w-full max-w-sm h-14 text-xl rounded-full mt-4 animate-bounce shadow-lg shadow-primary/25"
                  onClick={handleFinish}
                >
                  {t('letsGo')}
                  {isRtl
                    ? <ArrowRight className="w-5 h-5 mr-2 rotate-180" />
                    : <ArrowRight className="w-5 h-5 ml-2" />}
                </Button>
                <Button variant="ghost" className="mt-2 text-muted-foreground" onClick={prevStep}>
                  {t('cancel', 'חזור לתבנית משימות')}
                </Button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
