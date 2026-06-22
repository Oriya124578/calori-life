import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { X, Trash2, Calendar, Clock, Lock, Unlock, AlignLeft, Info } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useTranslation } from '../../hooks/useTranslation';

// Helper to convert time "HH:MM" to minutes from midnight
const timeToMin = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

// Helper to convert minutes from midnight to "HH:MM"
const minToTime = (min) => {
  const h = String(Math.floor(min / 60) % 24).padStart(2, '0');
  const m = String(min % 60).padStart(2, '0');
  return `${h}:${m}`;
};

export const BlockEditModal = ({ isOpen, block, onSave, onDelete, onClose }) => {
  const { t, language } = useTranslation();
  const isRTL = language === 'he';

  const [title, setTitle] = useState('');
  const [type, setType] = useState('study');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:30');
  const [isLocked, setIsLocked] = useState(true);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const isEdit = block && block.id && !block.id.startsWith('temp-new-');

  // Load initial values from block
  useEffect(() => {
    if (block) {
      setTitle(block.title || '');
      setType(block.type || 'study');
      setStartTime(block.startTime || '08:00');
      // If end time is not set, set it to start time + 60 minutes
      if (block.endTime) {
        setEndTime(block.endTime);
      } else {
        const startMin = timeToMin(block.startTime || '08:00');
        setEndTime(minToTime(startMin + 60));
      }
      setIsLocked(block.isLocked !== undefined ? block.isLocked : true);
      setNotes(block.notes || '');
      setError('');
    } else {
      setTitle('');
      setType('study');
      setStartTime('08:00');
      setEndTime('09:30');
      setIsLocked(true);
      setNotes('');
      setError('');
    }
  }, [block, isOpen]);

  // When type changes to reminder, startTime and endTime should match
  useEffect(() => {
    if (type === 'reminder') {
      setEndTime(startTime);
    }
  }, [type, startTime]);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    setError('');

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError(isRTL ? 'נא להזין שם לפעילות' : 'Please enter a title');
      return;
    }

    const startMin = timeToMin(startTime);
    const endMin = timeToMin(endTime);

    if (type !== 'reminder' && endMin <= startMin) {
      setError(isRTL ? 'שעת הסיום חייבת להיות אחרי שעת ההתחלה' : 'End time must be after start time');
      return;
    }

    const duration = type === 'reminder' ? 0 : (endMin - startMin);

    const savedBlock = {
      ...block,
      title: cleanTitle,
      type,
      startTime,
      endTime: type === 'reminder' ? startTime : endTime,
      duration,
      isLocked,
      notes: notes.trim(),
      isProposed: false, // User saved/manually edited it, so it's active
    };

    onSave(savedBlock);
  };

  const types = [
    { value: 'study', label: isRTL ? 'לימודים' : 'Study', color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
    { value: 'event', label: isRTL ? 'אירוע' : 'Event', color: 'bg-slate-500/10 text-slate-600 border-slate-500/20' },
    { value: 'meal', label: isRTL ? 'ארוחה' : 'Meal', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    { value: 'workout', label: isRTL ? 'אימונים' : 'Workout', color: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
    { value: 'travel', label: isRTL ? 'נסיעות' : 'Travel', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
    { value: 'task', label: isRTL ? 'משימה' : 'Task', color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20' },
    { value: 'reminder', label: isRTL ? 'תזכורת' : 'Reminder', color: 'bg-rose-500/10 text-rose-600 border-rose-500/20' }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="p-6 max-w-md" onClose={onClose}>
        <DialogHeader className="mb-4">
          <DialogTitle className="text-xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            {isEdit 
              ? (isRTL ? 'עריכת פעילות בלו"ז' : 'Edit Schedule Activity') 
              : (isRTL ? 'הוספת פעילות ללו"ז' : 'Add Activity to Schedule')
            }
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" dir={isRTL ? 'rtl' : 'ltr'}>
          {error && (
            <div className="text-xs p-3 rounded-xl bg-red-50 text-red-600 border border-red-100 flex items-start gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Title Input */}
          <div className="space-y-1.5 text-start">
            <label className="text-xs font-bold text-foreground/80">{isRTL ? 'שם הפעילות' : 'Activity Title'}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isRTL ? 'לדוגמה: למידה למבחן פיזיקה' : 'e.g., Study for physics exam'}
              className="w-full h-11 px-4 text-sm outline-none bg-background rounded-xl border border-border/80 focus:border-primary transition-colors"
              required
              autoFocus
            />
          </div>

          {/* Type Selection */}
          <div className="space-y-2 text-start">
            <label className="text-xs font-bold text-foreground/80">{isRTL ? 'סוג הפעילות' : 'Activity Type'}</label>
            <div className="flex flex-wrap gap-1.5">
              {types.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  className={cn(
                    "px-3 py-1.5 rounded-full border text-xs font-bold transition-all cursor-pointer active:scale-95",
                    type === t.value 
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "bg-background text-muted-foreground hover:bg-muted/30 border-border/60"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time Picker Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 text-start">
              <label className="text-xs font-bold text-foreground/80 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 opacity-70" />
                {isRTL ? 'שעת התחלה' : 'Start Time'}
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full h-11 px-4 text-sm outline-none bg-background rounded-xl border border-border/80 focus:border-primary transition-colors text-center"
                required
              />
            </div>
            {type !== 'reminder' && (
              <div className="space-y-1.5 text-start">
                <label className="text-xs font-bold text-foreground/80 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 opacity-70" />
                  {isRTL ? 'שעת סיום' : 'End Time'}
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full h-11 px-4 text-sm outline-none bg-background rounded-xl border border-border/80 focus:border-primary transition-colors text-center"
                  required
                />
              </div>
            )}
          </div>

          {/* Notes Input */}
          <div className="space-y-1.5 text-start">
            <label className="text-xs font-bold text-foreground/80 flex items-center gap-1">
              <AlignLeft className="w-3.5 h-3.5 opacity-70" />
              {isRTL ? 'הערות (אופציונלי)' : 'Notes (Optional)'}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isRTL ? 'פרטים נוספים, קישורים או מיקום...' : 'Add details, links, or location...'}
              rows={2}
              className="w-full p-3 text-sm outline-none bg-background rounded-xl border border-border/80 focus:border-primary transition-colors resize-none"
            />
          </div>

          {/* Lock State Toggle */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/30 border border-border/40 text-start">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-foreground flex items-center gap-1">
                {isLocked ? <Lock className="w-3.5 h-3.5 text-primary" /> : <Unlock className="w-3.5 h-3.5 text-muted-foreground" />}
                {isRTL ? 'נעל שינויי AI' : 'Lock Block'}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {isRTL 
                  ? 'מניעת שינויים בבלוק זה בעת ארגון מחדש של הלו"ז עם AI' 
                  : 'Prevent AI from moving or changing this block when rescheduling'
                }
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsLocked(!isLocked)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                isLocked ? "bg-primary" : "bg-muted-foreground/30"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  isLocked ? (isRTL ? "-translate-x-5" : "translate-x-5") : "translate-x-0"
                )}
              />
            </button>
          </div>

          {/* Footer buttons */}
          <DialogFooter className="flex items-center justify-between w-full mt-6 gap-2">
            {isEdit && onDelete ? (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(isRTL ? 'האם למחוק פעילות זו מהלו"ז?' : 'Are you sure you want to delete this activity?')) {
                    onDelete(block);
                  }
                }}
                className="px-4 h-11 flex items-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 rounded-xl transition-all cursor-pointer font-bold text-xs"
              >
                <Trash2 className="w-4 h-4" />
                {isRTL ? 'מחק' : 'Delete'}
              </button>
            ) : (
              <div />
            )}
            
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 h-11 bg-muted/65 hover:bg-muted text-muted-foreground rounded-xl transition-all cursor-pointer font-bold text-xs"
              >
                {isRTL ? 'ביטול' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-5 h-11 bg-primary text-white hover:bg-primary/95 rounded-xl transition-all cursor-pointer font-bold text-xs shadow-sm shadow-primary/20"
              >
                {isRTL ? 'שמור' : 'Save'}
              </button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
