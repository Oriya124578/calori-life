import React, { useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { Play, Pause, RotateCcw, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { useTranslation } from '../../hooks/useTranslation';
import { toast } from '../../store/useToast';
import { cn } from '../../lib/utils';

export const PomodoroTimer = ({ inline = false }) => {
  const { 
    pomodoro, setPomodoro, 
    pomoSettings,
    addPomodoroSession, data, showPomodoroModal, setShowPomodoroModal
  } = useStore();
  const { t, language } = useTranslation();

  // Track the real wall-clock start so we can correct for tab-sleep drift.
  const startedAt = useRef(null);

  const toggleTimer = () => {
    if (!pomodoro.active && !pomodoro.courseId) {
      toast.error(t('selectCourseAlert'));
      return;
    }
    if (!pomodoro.active) {
      // Starting — remember real start time.
      startedAt.current = Date.now();
    }
    setPomodoro(prev => ({ ...prev, active: !prev.active }));
  };

  const resetTimer = () => {
    setPomodoro(prev => ({ 
      ...prev, 
      active: false, 
      timeLeft: pomoSettings[prev.mode] * 60 
    }));
  };

  const switchMode = (newMode) => {
    setPomodoro(prev => ({
      ...prev,
      mode: newMode,
      active: false,
      timeLeft: pomoSettings[newMode] * 60
    }));
  };

  // Drift-corrected timer: on each tick we compute elapsed wall-clock time
  // rather than blindly subtracting 1. This stays accurate even when the tab
  // is throttled or the laptop sleeps and resumes.
  useEffect(() => {
    let interval = null;

    if (pomodoro.active && pomodoro.timeLeft > 0) {
      // Checkpoint for this run segment.
      const segmentStart = Date.now();
      const segmentTimeLeft = pomodoro.timeLeft;

      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - segmentStart) / 1000);
        const remaining = Math.max(0, segmentTimeLeft - elapsed);
        setPomodoro(prev => ({ ...prev, timeLeft: remaining }));
      }, 1000);
    } else if (pomodoro.active && pomodoro.timeLeft === 0) {
      // Session finished
      new Audio('/notification.mp3').play().catch(() => {});
      if (pomodoro.mode === 'work') {
        // Record the actual elapsed time, not just the configured duration.
        const actualDuration = startedAt.current
          ? Math.round((Date.now() - startedAt.current) / 1000)
          : pomoSettings.work * 60;
        addPomodoroSession({
          courseId: pomodoro.courseId,
          duration: actualDuration,
          timestamp: new Date().toISOString()
        });
        startedAt.current = null;
        switchMode('break');
      } else {
        switchMode('work');
      }
    }

    return () => clearInterval(interval);
    // `pomodoro.timeLeft` and `switchMode` are intentionally excluded: the
    // interval captures the segment start once and derives remaining time from
    // Date.now(), so re-running on every tick would recreate the interval each
    // second and break the wall-clock accuracy this effect is built for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pomodoro.active, pomodoro.mode, pomodoro.courseId, pomoSettings, addPomodoroSession, setPomodoro]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const renderTimerContent = () => (
    <div className="flex flex-col items-center justify-center p-6 bg-background rounded-2xl border border-border">
      
      {/* Mode Switcher */}
      <div className="flex gap-2 mb-8 bg-muted p-1 rounded-full w-full max-w-[200px]">
        <button 
          onClick={() => switchMode('work')}
          className={`flex-1 py-1 text-sm font-medium rounded-full transition-all ${
            pomodoro.mode === 'work' ? 'bg-background shadow text-primary font-bold' : 'text-muted-foreground'
          }`}
        >
          {t('workMode')}
        </button>
        <button 
          onClick={() => switchMode('break')}
          className={`flex-1 py-1 text-sm font-medium rounded-full transition-all ${
            pomodoro.mode === 'break' ? 'bg-background shadow text-primary font-bold' : 'text-muted-foreground'
          }`}
        >
          {t('breakMode')}
        </button>
      </div>

      {/* Timer Display */}
      <div
        className="text-7xl font-bold text-foreground font-mono tracking-wider mb-8 drop-shadow-md select-none"
        role="timer"
        aria-live="polite"
        aria-label={formatTime(pomodoro.timeLeft)}
      >
        {formatTime(pomodoro.timeLeft)}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-6 mb-8">
        <button onClick={toggleTimer} className="w-16 h-16 bg-primary text-primary-foreground rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/30 cursor-pointer">
          {pomodoro.active ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
        </button>
        <button onClick={resetTimer} className="w-12 h-12 bg-secondary text-secondary-foreground rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md cursor-pointer">
          <RotateCcw className="w-5 h-5" />
        </button>
      </div>

      {/* Course Selector */}
      <div className="w-full">
        <label className="text-xs font-medium text-muted-foreground mb-2 block text-center">{t('assignSessionToCourse')}</label>
        <select 
          value={pomodoro.courseId || ''} 
          onChange={(e) => setPomodoro(prev => ({ ...prev, courseId: e.target.value }))}
          className="w-full bg-background border border-border rounded-xl p-2 text-sm text-foreground focus:ring-2 focus:ring-primary focus:outline-none text-center"
          dir={language === 'he' ? 'rtl' : 'ltr'}
        >
          <option value="" disabled>{t('selectCoursePlaceholder')}</option>
          {data.courses.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

    </div>
  );

  if (inline) {
    return (
      <div className="max-w-md mx-auto w-full space-y-4" dir={language === 'he' ? 'rtl' : 'ltr'}>
        <div className="flex flex-col gap-1 text-center sm:text-start">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2 justify-center sm:justify-start">
            <Clock className="w-5 h-5 text-primary" />
            {t('pomodoroTimerTitle')}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t('pomodoroDesc')}
          </p>
        </div>
        {renderTimerContent()}
      </div>
    );
  }

  return (
    <Dialog open={showPomodoroModal} onOpenChange={setShowPomodoroModal}>
      <DialogContent className="sm:max-w-md bg-card border-primary/20 shadow-2xl" dir={language === 'he' ? 'rtl' : 'ltr'}>
        <DialogHeader>
          <DialogTitle className={cn("flex items-center gap-2 text-primary", language === 'he' ? "" : "flex-row-reverse justify-end")}>
            <Clock className="w-5 h-5" />
            {t('pomodoroTimerTitle')}
          </DialogTitle>
          <DialogDescription className={language === 'he' ? 'text-right' : 'text-left'}>
            {t('pomodoroDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {renderTimerContent()}
        </div>
      </DialogContent>
    </Dialog>
  );
};
