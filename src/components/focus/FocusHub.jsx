import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import { 
  Play, Check, X, Clock, Sparkles, AlertTriangle, 
  Calendar as CalendarIcon, Coffee, Dumbbell, Utensils, 
  MapPin, RefreshCw, Target
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { fetchShabbatTimes } from '../../lib/shabbatService';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import { buildTimeline } from '../../lib/scheduleBuilder';
import { dateKey } from '../../lib/caloriRepo';

const blockIcons = {
  sleep: Clock,
  study: Target,
  event: CalendarIcon,
  meal: Utensils,
  workout: Dumbbell,
  travel: MapPin,
  leisure: Coffee,
};

// Cream v3 warm card styles
const creamCard = { background: '#fff', borderRadius: 18, border: '1px solid rgba(180,140,80,.14)', boxShadow: '0 2px 10px rgba(40,20,0,.05)' };
const creamTimerCard = { background: '#fff', borderRadius: 32, border: '1px solid rgba(180,140,80,.14)', boxShadow: '0 8px 32px rgba(40,20,0,.08)', position: 'relative', overflow: 'hidden' };
const creamStatCard = { background: '#fff', borderRadius: 16, border: '1px solid rgba(180,140,80,.12)', boxShadow: '0 1px 6px rgba(40,20,0,.04)' };

export const FocusHub = () => {
  const { t, language } = useTranslation();
  const isRTL = language === 'he';

  const {
    data,
    focusTracking,
    startFocusTracking,
    setFocusElapsed,
    resetFocusTracking,
    finishFocusTracking,
    interruptFocusTracking,
  } = useStore();

  const [showStatusModal, setShowStatusModal] = useState(false);
  const [shabbatTimes, setShabbatTimes] = useState(null);
  const [gpsLocation, setGpsLocation] = useState(null);
  const [rescheduling, setRescheduling] = useState(false);

  // Get current date string (YYYY-MM-DD)
  const dateStr = useMemo(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, []);

  // Fetch Shabbat times for today to pass to background rescheduling if interrupted
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

      if (data?.profile?.useGPS && navigator.geolocation) {
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
          () => {
            if (!mounted) return;
            fetchShabbatTimes(locationParam, dateStr, onDataCb);
          }
        );
        return;
      }
      fetchShabbatTimes(locationParam, dateStr, onDataCb);
    };
    loadShabbat();
    return () => { mounted = false; };
  }, [data?.profile?.shabbatMode, data?.profile?.useGPS, data?.profile?.selectedCity, dateStr]);

  // Aggregate blocks for today's timeline (Phase 6a: unified builder).
  const todayBlocks = useMemo(
    () =>
      buildTimeline({
        // Ignore a schedule doc subscribed for a different date (e.g. the user
        // browsed another day in the Command Center right before switching here).
        scheduleDoc:
          data?.schedule && (!data.schedule._docDate || data.schedule._docDate === dateStr)
            ? data.schedule
            : null,
        events: data?.events,
        personalTasks: data?.personalTasks,
        calori: data?.calori,
        dateStr,
        todayStr: dateKey(),
        // Focus Hub shows breaks too so the user sees their full timeline.
        options: { filterLeisure: false, includeCalori: 'todayOnly' },
      }),
    [data, dateStr]
  );

  // A block is "trackable" if it represents a personal task — either a
  // doc-driven block (source==='task') or a legacy block (id starts with 'task-').
  const isTrackableBlock = (b) => b && (b.source === 'task' || (typeof b.id === 'string' && b.id.startsWith('task-')));

  // Find currently active block and the next scheduled trackable task
  const { currentBlock, nextTrackableTask } = useMemo(() => {
    const now = new Date();
    const nowTimeStr = format(now, 'HH:mm');

    const active = todayBlocks.find(
      (b) => b.startTime <= nowTimeStr && nowTimeStr < b.endTime && !b.isCompleted
    );

    const activeIsTask = isTrackableBlock(active);

    let nextTask = null;
    if (activeIsTask) {
      nextTask = active;
    } else {
      nextTask = todayBlocks.find(
        (b) => isTrackableBlock(b) && b.startTime > nowTimeStr && !b.isCompleted
      );
    }

    return {
      currentBlock: active || null,
      nextTrackableTask: nextTask || null,
    };
  }, [todayBlocks]);

  // If tracking, override current block selection with the tracked block.
  // A quick-focus on an arbitrary task carries a syntheticBlock that isn't on
  // today's timeline — fall back to it so the live timer still renders.
  const activeBlockToDisplay = useMemo(() => {
    if (focusTracking.isTracking && focusTracking.activeBlockId) {
      const trackedBlock = todayBlocks.find((b) => b.id === focusTracking.activeBlockId);
      if (trackedBlock) return trackedBlock;
      if (focusTracking.syntheticBlock) return focusTracking.syntheticBlock;
    }
    return currentBlock;
  }, [focusTracking.isTracking, focusTracking.activeBlockId, focusTracking.syntheticBlock, todayBlocks, currentBlock]);

  // Clock format for greeting
  const greetingText = useMemo(() => {
    const hour = new Date().getHours();
    const displayName = data?.profile?.displayName || '';
    
    let greet = '';
    if (isRTL) {
      if (hour < 12) greet = 'בוקר טוב';
      else if (hour < 17) greet = 'צהריים טובים';
      else if (hour < 21) greet = 'ערב טוב';
      else greet = 'לילה טוב';
      return displayName ? `${greet}, ${displayName}` : greet;
    } else {
      if (hour < 12) greet = 'Good morning';
      else if (hour < 17) greet = 'Good afternoon';
      else if (hour < 21) greet = 'Good evening';
      else greet = 'Good night';
      return displayName ? `${greet}, ${displayName}` : greet;
    }
  }, [data?.profile?.displayName, isRTL]);

  // AI Feed Status Message
  const aiFeedMessage = useMemo(() => {
    if (rescheduling) {
      return isRTL 
        ? 'מחשב מסלול מחדש... מעדכן את לוח הזמנים עם מנוע הבינה המלאכותית.'
        : 'Recalculating... Re-optimizing today\'s timeline in background.';
    }
    if (focusTracking.isTracking) {
      return isRTL 
        ? 'עבודה עצימה התחילה. התראות הושתקו כדי לשמור על פוקוס.'
        : 'Deep focus session active. Notifications are silenced.';
    }
    if (focusTracking.wasInterrupted) {
      return isRTL 
        ? 'זיהיתי בלת"ם. המשימה הוחזרה למאגר והלו"ז יאורגן מחדש.'
        : 'Interruption detected. Task returned to pool and schedule will be re-optimized.';
    }
    return isRTL 
      ? 'לוח הזמנים להיום מאורגן ומסונכרן. בהצלחה!'
      : 'Today\'s schedule is synced and optimized. Good luck!';
  }, [focusTracking.isTracking, focusTracking.wasInterrupted, rescheduling, isRTL]);

  // Stopwatch ticking logic
  useEffect(() => {
    let interval = null;
    if (focusTracking.isTracking && focusTracking.startTime) {
      const startMs = new Date(focusTracking.startTime).getTime();
      
      const tick = () => {
        const elapsed = Math.floor((Date.now() - startMs) / 1000);
        setFocusElapsed(elapsed >= 0 ? elapsed : 0);
      };
      
      tick(); // Immediate invocation
      interval = setInterval(tick, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [focusTracking.isTracking, focusTracking.startTime, setFocusElapsed]);

  // Format stopwatch seconds into MM:SS (or HH:MM:SS if > 1 hour)
  const formatStopwatch = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const pad = (val) => String(val).padStart(2, '0');
    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  };

  const handleStart = (blockId) => {
    startFocusTracking(blockId);
  };

  const handleFinishClick = () => {
    setShowStatusModal(true);
  };

  const handleStatusSelect = (status) => {
    setShowStatusModal(false);
    finishFocusTracking(status);
  };

  const handleInterrupt = async () => {
    setRescheduling(true);
    await interruptFocusTracking(dateStr, shabbatTimes, gpsLocation);
    setRescheduling(false);
  };

  const activeIsTrackable = isTrackableBlock(activeBlockToDisplay);

  // Render block content — cream v3 timer stage
  const renderBlockDetails = (block, label, isLive) => {
    const Icon = blockIcons[block.type] || Target;

    return (
      <div
        className="transition-all select-none"
        style={{
          ...creamTimerCard,
          padding: '32px 20px 30px',
        }}
      >
        {/* Purple accent bar at top */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #7C3AED, #A78BFA, #7C3AED)' }} />

        <div className="flex justify-between items-center mb-4 relative z-10">
          <span
            className="select-none"
            style={{
              padding: isLive ? '5px 14px' : '6px 12px',
              borderRadius: 999,
              fontSize: isLive ? 13 : 11,
              fontWeight: isLive ? 400 : 600,
              fontFamily: isLive ? "'Instrument Serif', serif" : "'Inter', sans-serif",
              fontStyle: isLive ? 'italic' : 'normal',
              background: isLive ? '#059669' : '#F5F0E8',
              color: isLive ? '#fff' : '#8A7A6A',
            }}
          >
            {label}
          </span>
          <div className="flex items-center gap-1" style={{ fontSize: 11, fontWeight: 600, color: '#8A7A6A' }}>
            <Clock className="w-3.5 h-3.5 opacity-60" />
            <span>{block.startTime} – {block.endTime}</span>
          </div>
        </div>

        <div className="flex items-start gap-4 mb-6 relative z-10">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: '#F5F0E8', border: '1px solid rgba(180,140,80,.12)' }}>
            <Icon className="w-5 h-5" style={{ color: '#2A1A0A' }} />
          </div>
          <div className="min-w-0 text-start">
            <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 20, fontWeight: 400, color: '#2A1A0A', letterSpacing: '-.02em', lineHeight: 1.15 }} className="truncate">
              {block.title}
            </h2>
            {block.notes && (
              <p className="mt-1.5 line-clamp-2 leading-relaxed" style={{ fontSize: 12, color: '#8A7A6A', fontFamily: "'Instrument Serif', serif", fontStyle: 'italic' }}>
                {block.notes}
              </p>
            )}
          </div>
        </div>

        {/* Stopwatch & Action Area — cream v3 giant timer */}
        {isLive && isTrackableBlock(block) && (
          <div className="relative z-10 flex flex-col items-center pt-6" style={{ borderTop: '1px solid rgba(180,140,80,.12)' }}>
            {focusTracking.isTracking ? (
              <div className="w-full text-center space-y-5 animate-in fade-in duration-300">
                {/* Giant timer — Fraunces 78px with purple accent */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#8A7A6A', letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 6 }}>
                    {isRTL ? 'סשן פוקוס' : 'Focus Session'}
                  </div>
                  <div className="select-none" style={{ fontFamily: "'Fraunces', serif", fontSize: 78, fontWeight: 600, color: '#2A1A0A', letterSpacing: '-.05em', lineHeight: 0.9, fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0' }}>
                    {formatStopwatch(focusTracking.elapsed).split(':')[0]}
                    <em style={{ fontStyle: 'italic', color: '#7C3AED' }}>:{formatStopwatch(focusTracking.elapsed).split(':').slice(1).join(':')}</em>
                  </div>
                </div>
                {/* Controls */}
                <div className="flex gap-[14px] justify-center">
                  <button
                    onClick={handleFinishClick}
                    className="flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                    style={{ width: 54, height: 54, borderRadius: '50%', background: '#059669', color: '#fff', border: 'none', boxShadow: '0 4px 16px rgba(5,150,105,.3)', fontSize: 18 }}
                  >
                    <Check className="w-5 h-5 stroke-[3]" />
                  </button>
                  <button
                    onClick={handleInterrupt}
                    className="flex items-center justify-center active:scale-95 transition-all cursor-pointer"
                    style={{ width: 54, height: 54, borderRadius: '50%', background: '#fff', color: '#2A1A0A', border: '1px solid rgba(180,140,80,.18)', boxShadow: '0 2px 8px rgba(40,20,0,.06)', fontSize: 18 }}
                  >
                    <AlertTriangle className="w-5 h-5" style={{ color: '#DC2626' }} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => handleStart(block.id)}
                className="flex items-center justify-center active:scale-95 transition-all cursor-pointer animate-in fade-in duration-300"
                style={{ width: 68, height: 68, borderRadius: '50%', background: '#7C3AED', color: '#fff', border: 'none', boxShadow: '0 8px 24px rgba(124,58,237,.4)', fontSize: 24 }}
              >
                <Play className="w-7 h-7 fill-white stroke-none" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className="max-w-4xl mx-auto px-4 py-6 sm:px-6 space-y-[14px] animate-in fade-in slide-in-from-bottom-4 duration-500 pb-28"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Context card — cream v3 */}
      <div className="flex items-center justify-between" style={creamCard}>
        <div style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#8A7A6A', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 2 }}>
            {isRTL ? 'עובד כעת על' : 'Currently working on'}
          </div>
          <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 20, fontWeight: 400, color: '#2A1A0A', letterSpacing: '-.02em' }}>
            {activeBlockToDisplay ? (
              <><em style={{ fontStyle: 'italic', color: '#059669' }}>{activeBlockToDisplay.title}</em></>
            ) : (
              <span>{greetingText}</span>
            )}
          </div>
        </div>
      </div>

      {/* AI Smart Feed Banner — cream v3 */}
      <div
        className="flex gap-3 items-start select-none"
        style={{
          ...creamCard,
          padding: '12px 16px',
          borderColor: focusTracking.isTracking ? 'rgba(5,150,105,.2)' : focusTracking.wasInterrupted ? 'rgba(217,119,6,.2)' : 'rgba(180,140,80,.14)',
          background: focusTracking.isTracking ? '#F0FDF4' : focusTracking.wasInterrupted ? '#FFFBEB' : '#fff',
        }}
      >
        {rescheduling ? (
          <RefreshCw className="w-4 h-4 shrink-0 mt-0.5 animate-spin" style={{ color: '#7C3AED' }} />
        ) : (
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#7C3AED' }} />
        )}
        <p className="text-start leading-relaxed" style={{ fontSize: 12, fontWeight: 600, color: '#5A4A3A' }}>{aiFeedMessage}</p>
      </div>

      {/* Active block displaying area */}
      {activeBlockToDisplay ? (
        <div className="space-y-6">
          {renderBlockDetails(activeBlockToDisplay, isRTL ? 'עכשיו' : 'Now', true)}

          {/* Secondary helper */}
          {!activeIsTrackable && nextTrackableTask && (
            <div className="space-y-3">
              <h3 className="text-start" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 16, fontWeight: 400, color: '#2A1A0A' }}>
                {isRTL ? 'המשימה הבאה לביצוע' : 'Next Task to Focus'}
              </h3>
              {renderBlockDetails(nextTrackableTask, isRTL ? 'הבא' : 'Next', false)}
              
              {!focusTracking.isTracking && (
                <button
                  onClick={() => handleStart(nextTrackableTask.id)}
                  className="w-full py-2.5 flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition-all"
                  style={{ borderRadius: 11, background: '#F0FDF4', border: '1px solid rgba(5,150,105,.2)', fontSize: 11, fontWeight: 700, color: '#065F46' }}
                >
                  <Play className="w-3.5 h-3.5" />
                  {isRTL ? `התחל את "${nextTrackableTask.title}" כעת` : `Start "${nextTrackableTask.title}" now`}
                </button>
              )}
            </div>
          )}
        </div>
      ) : nextTrackableTask ? (
        <div className="space-y-3">
          <div className="text-start mb-2">
            <h3 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 16, fontWeight: 400, color: '#8A7A6A' }}>
              {isRTL ? 'אין משימה פעילה כרגע' : 'No active block'}
            </h3>
          </div>
          {renderBlockDetails(nextTrackableTask, isRTL ? 'הבא' : 'Next', true)}
        </div>
      ) : (
        <div className="p-12 text-center select-none space-y-4" style={{ ...creamTimerCard, padding: '48px 20px' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #7C3AED, #A78BFA, #7C3AED)' }} />
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: '#F5F0E8', border: '1px solid rgba(180,140,80,.12)' }}>
            <Target className="w-6 h-6" style={{ color: '#7C3AED' }} />
          </div>
          <div className="space-y-1">
            <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 18, fontWeight: 400, color: '#2A1A0A' }}>
              {isRTL ? 'אין משימות מתוכננות להיום' : 'No scheduled tasks today'}
            </h2>
            <p className="max-w-sm mx-auto" style={{ fontSize: 12, color: '#8A7A6A', lineHeight: 1.5 }}>
              {isRTL
                ? 'הלו"ז שלך פנוי לחלוטין. מצא משימות בקומנד סנטר ושבץ אותן בלו"ז השעתי כדי להתחיל למידה.'
                : 'Your schedule is clear. Add and schedule tasks from the Command Center to start focusing.'}
            </p>
          </div>
        </div>
      )}

      {/* Completion Status Selector Dialog */}
      <Dialog open={showStatusModal} onOpenChange={setShowStatusModal}>
        <DialogContent className="sm:max-w-md" style={{ background: '#fff', border: '1px solid rgba(180,140,80,.14)', borderRadius: 22, boxShadow: '0 4px 24px rgba(40,20,0,.07)' }} dir={isRTL ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle className="text-start text-foreground font-black text-lg">
              {isRTL ? 'איך עבר עליך זמן הלמידה?' : 'How did the focus session go?'}
            </DialogTitle>
            <DialogDescription className="text-start text-muted-foreground text-xs mt-1">
              {isRTL 
                ? 'בחר סטטוס מתאים כדי שנוכל לחשב את ההתקדמות שלך וללמוד את קצב העבודה האמיתי.'
                : 'Select the appropriate status so we can update your progress metrics.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2.5 mt-4">
            <button
              onClick={() => handleStatusSelect('completed')}
              className="w-full py-3 px-4 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/95 text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-primary/5 cursor-pointer active:scale-98 transition-all"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              {isRTL ? 'הושלם בהצלחה' : 'Completed Successfully'}
            </button>
            
            <button
              onClick={() => handleStatusSelect('still_learning')}
              className="w-full py-3 px-4 rounded-2xl bg-secondary text-secondary-foreground hover:bg-muted border border-border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-98 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              {isRTL ? 'עבדתי על זה, אך עדיין לומד' : 'Worked on it, but still learning'}
            </button>

            <button
              onClick={() => {
                setShowStatusModal(false);
                resetFocusTracking();
              }}
              className="w-full py-3 px-4 rounded-2xl bg-transparent hover:bg-secondary/40 text-muted-foreground text-xs font-bold flex items-center justify-center gap-1 cursor-pointer active:scale-98 transition-all"
            >
              <X className="w-4 h-4" />
              {isRTL ? 'בטל ומחק מעקב נוכחי' : 'Cancel without saving'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
