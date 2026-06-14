import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, ChevronDown, Trash2, X, Star, Edit3, Repeat,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { generateFutureInstances } from '../../lib/recurrence';
import { useTranslation } from '../../hooks/useTranslation';
import { cn } from '../../lib/utils';
import { format, isToday, isTomorrow, isPast, parseISO } from 'date-fns';

// ── Cream v3 constants ──────────────────────────────────────────────────────
const creamCard = { background: '#fff', borderRadius: 12, border: '1px solid rgba(180,140,80,.12)', boxShadow: '0 1px 3px rgba(40,20,0,.04)' };
const creamSectionCard = { background: '#fff', borderRadius: 14, border: '1px solid rgba(180,140,80,.14)', boxShadow: '0 2px 10px rgba(40,20,0,.05)', overflow: 'hidden' };
const serifFont = "'Instrument Serif', serif";
const numbersFont = "'Fraunces', serif";

// ── Helpers ──────────────────────────────────────────────────────────────────

const useDueDate = (dateStr, t) => {
  if (!dateStr) return null;
  try {
    const date = parseISO(dateStr);
    if (isToday(date))    return { label: t('todayLabel'),    color: '#059669' };
    if (isTomorrow(date)) return { label: t('tomorrowLabel'), color: '#2563EB' };
    if (isPast(date))     return { label: format(date, 'd/M'), color: '#DC2626' };
    return { label: format(date, 'd MMM'), color: '#8A7A6A' };
  } catch { return null; }
};

// ── Star Toggle Button with Juicy Physics ──
const StarButton = ({ isStarred, onToggle, t }) => {
  return (
    <motion.button
      whileTap={{ scale: 0.8 }}
      whileHover={{ scale: 1.15 }}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className="p-1.5 rounded-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none transition-colors shrink-0"
      aria-label={isStarred ? t('unstarTask') : t('starTask')}
    >
      <motion.div
        animate={{
          scale: isStarred ? [1, 1.35, 1] : 1,
          rotate: isStarred ? [0, 15, -15, 0] : 0,
        }}
        transition={{ duration: 0.4, type: "spring", stiffness: 300, damping: 15 }}
      >
        <Star
          className="w-4 h-4 transition-colors duration-200"
          style={{ color: isStarred ? '#F59E0B' : 'rgba(180,140,80,.3)', fill: isStarred ? '#F59E0B' : 'none' }}
        />
      </motion.div>
    </motion.button>
  );
};

// ── Edit/Add List Modal ──
const EditListModal = ({ onClose, onSave, onDelete, initialValue, isEdit = false, t, isRTL }) => {
  const [value, setValue] = useState(initialValue || '');

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />
        {/* Card */}
        <motion.div
          className="relative w-full max-w-sm overflow-hidden p-5 z-10 space-y-4"
          style={{ background: '#fff', borderRadius: 22, border: '1px solid rgba(180,140,80,.14)', boxShadow: '0 4px 24px rgba(40,20,0,.07)' }}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          dir={isRTL ? 'rtl' : 'ltr'}
        >
          <h3 style={{ fontFamily: serifFont, fontSize: 18, fontWeight: 400, color: '#2A1A0A' }}>
            {isEdit ? t('editListName') : t('addNewList')}
          </h3>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t('listNamePlaceholder')}
            className="w-full px-3 py-2 text-sm outline-none"
            style={{ background: '#fff', border: '1px solid rgba(180,140,80,.18)', borderRadius: 12, color: '#2A1A0A' }}
            autoFocus
            onFocus={(e) => e.target.style.borderColor = '#059669'}
            onBlur={(e) => e.target.style.borderColor = 'rgba(180,140,80,.18)'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSave(value.trim());
                onClose();
              }
            }}
          />
          <div className="flex justify-end gap-2 text-xs font-bold pt-2">
            {isEdit && onDelete && (
              <button
                onClick={() => { onDelete(); onClose(); }}
                className="px-3 py-2 rounded-lg transition-colors me-auto"
                style={{ color: '#DC2626' }}
              >
                {t('delete')}
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-2 rounded-lg transition-colors"
              style={{ color: '#8A7A6A' }}
            >
              {t('cancel')}
            </button>
            <button
              onClick={() => { onSave(value.trim()); onClose(); }}
              disabled={!value.trim()}
              className="px-3 py-2 rounded-lg transition-all disabled:opacity-50"
              style={{ background: '#059669', color: '#fff', borderRadius: 10 }}
            >
              {t('save')}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// ── Sub-task row ─────────────────────────────────────────────────────────────

const SubtaskRow = ({ taskId, sub }) => {
  const { toggleSubtask, deleteSubtask } = useStore();
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 py-1.5 group/sub">
      <button
        onClick={() => toggleSubtask(taskId, sub.id)}
        className="shrink-0 transition-transform active:scale-90 rounded-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        role="checkbox"
        aria-checked={!!sub.done}
        aria-label={sub.title}
      >
        <div
          className="flex items-center justify-center"
          style={{
            width: 18, height: 18, borderRadius: '50%',
            border: sub.done ? 'none' : '1.5px solid rgba(5,150,105,.4)',
            background: sub.done ? '#059669' : '#fff',
            color: '#fff', fontSize: 10,
          }}
        >
          {sub.done && '✓'}
        </div>
      </button>
      <span className="flex-1 text-sm" style={{ color: sub.done ? '#8A7A6A' : '#2A1A0A', textDecoration: sub.done ? 'line-through' : 'none' }}>
        {sub.title}
      </span>
      <button
        onClick={() => deleteSubtask(taskId, sub.id)}
        className="opacity-0 group-hover/sub:opacity-100 transition-opacity p-1.5 rounded-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:opacity-100"
        aria-label={t('delete')}
      >
        <X className="w-3.5 h-3.5" style={{ color: '#8A7A6A' }} />
      </button>
    </div>
  );
};

// ── Task row ─────────────────────────────────────────────────────────────────

const TaskRow = ({ task }) => {
  const { togglePersonalTask, deletePersonalTask, addSubtask, toggleStarPersonalTask, updatePersonalTask, data } = useStore();
  const { t, language } = useTranslation();
  const isRTL = language === 'he';
  const [expanded, setExpanded] = useState(false);
  const [newSub, setNewSub]     = useState('');
  const subInputRef = useRef(null);

  const dueDateInfo = useDueDate(task.dueDate, t);
  const subtasks    = task.subtasks || [];
  const doneSubs    = subtasks.filter((s) => s.done).length;

  // Lists the task can be moved to (default + custom, deduped against seed).
  const taskLists = [
    { id: 'personal', name: t('defaultListName') },
    ...(data?.taskLists || []).filter((l) => l.id !== 'personal'),
  ];
  const currentListId = task.list || 'personal';

  const handleAddSub = () => {
    const label = newSub.trim();
    if (!label) return;
    addSubtask(task.id, label);
    setNewSub('');
  };

  return (
    <div style={{ marginBottom: 5, opacity: task.done ? 0.55 : 1 }}>
      {/* ── Main row — cream task card ── */}
      <div
        className="flex items-center gap-[10px]"
        style={{ ...creamCard, padding: '11px 13px' }}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Checkbox — cream green circle */}
        <button
          onClick={(e) => { e.stopPropagation(); togglePersonalTask(task.id); }}
          className="shrink-0 transition-transform active:scale-90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          role="checkbox"
          aria-checked={!!task.done}
          aria-label={task.title}
          style={{ borderRadius: '50%' }}
        >
          <div
            className="flex items-center justify-center"
            style={{
              width: 22, height: 22, borderRadius: '50%',
              border: task.done ? 'none' : '1.5px solid rgba(5,150,105,.4)',
              background: task.done ? '#059669' : '#fff',
              color: '#fff', fontSize: 12,
            }}
          >
            {task.done && '✓'}
          </div>
        </button>

        {/* Title + meta — tap to expand */}
        <button
          onClick={() => !task.done && setExpanded((v) => !v)}
          className="flex-1 flex items-center gap-2 text-start min-w-0 rounded-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          aria-expanded={!task.done ? expanded : undefined}
          aria-controls={!task.done ? `task-subtasks-${task.id}` : undefined}
        >
          <div className="flex flex-col items-start flex-1 min-w-0">
            <div className="flex items-center gap-[6px] w-full">
              <span
                className="truncate text-start"
                style={{
                  fontSize: 14, fontWeight: 600, color: task.done ? '#8A7A6A' : '#2A1A0A',
                  textDecoration: task.done ? 'line-through' : 'none', lineHeight: 1.2, flex: 1,
                }}
              >
                {task.title}
              </span>
            </div>
            <div className="flex gap-[6px] mt-1 items-center flex-wrap">
              {task.priority === 'high' && (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#DC2626', flexShrink: 0 }} />
              )}
              {task.priority === 'med' && (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#D97706', flexShrink: 0 }} />
              )}
              {task.priority === 'low' && (
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#9CA3AF', flexShrink: 0 }} />
              )}
              {dueDateInfo && (
                <span style={{ fontFamily: serifFont, fontStyle: 'italic', fontSize: 12, color: dueDateInfo.color }}>
                  {dueDateInfo.label}
                </span>
              )}
              {task.categoryIds && task.categoryIds.length > 0 && task.categoryIds.map(catId => {
                const cat = data?.categories?.find(c => c.id === catId);
                if (!cat) return null;
                return (
                  <span
                    key={catId}
                    style={{ borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 600, background: `${cat.color}15`, color: cat.color }}
                  >
                    {cat.name}
                  </span>
                );
              })}
              {task.recurrence && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 10, color: '#7C3AED', fontWeight: 700 }}>
                  🔁 {task.recurrence.type === 'daily' ? t('freqDaily') : task.recurrence.type === 'weekly' ? t('freqWeekly') : t('freqMonthly')}
                </span>
              )}
              {subtasks.length > 0 && (
                <span style={{ fontFamily: numbersFont, fontSize: 11, color: '#8A7A6A' }}>{doneSubs}/{subtasks.length}</span>
              )}
            </div>
          </div>

          {!task.done && (
            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.18 }}
              className="shrink-0"
            >
              <ChevronDown className="w-4 h-4" style={{ color: 'rgba(180,140,80,.4)' }} />
            </motion.div>
          )}
        </button>

        {/* Star icon */}
        <StarButton
          isStarred={!!task.starred}
          onToggle={() => toggleStarPersonalTask(task.id)}
          t={t}
        />
      </div>

      {/* ── Expanded: subtasks ── */}
      <AnimatePresence initial={false}>
        {expanded && !task.done && (
          <motion.div
            key="subtasks"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              id={`task-subtasks-${task.id}`}
              className={cn('pb-3', isRTL ? 'pr-12 pl-4' : 'pl-12 pr-4')}
              dir={isRTL ? 'rtl' : 'ltr'}
            >
              {/* Subtask list */}
              {subtasks.map((sub) => (
                <SubtaskRow key={sub.id} taskId={task.id} sub={sub} />
              ))}

              {/* Add subtask input */}
              <div className="flex items-center gap-2 mt-1 py-1">
                <Plus className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                <input
                  ref={subInputRef}
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddSub(); }}
                  placeholder={t('subtaskPlaceholder')}
                  className="flex-1 text-sm text-foreground bg-transparent outline-none placeholder:text-muted-foreground/40"
                />
                {newSub.trim() && (
                  <button
                    onClick={handleAddSub}
                    className="text-xs font-bold text-primary"
                  >
                    {t('add')}
                  </button>
                )}
              </div>

              {/* Move to list */}
              {taskLists.length > 1 && (
                <div className="flex items-center gap-1.5 mt-2 pt-2 flex-wrap" style={{ borderTop: '1px solid rgba(180,140,80,.1)' }}>
                  <span className="font-semibold me-1 text-xs" style={{ color: '#8A7A6A' }}>{t('moveToList', 'רשימה')}:</span>
                  {taskLists.map((l) => {
                    const isActive = currentListId === l.id;
                    return (
                      <button
                        key={l.id}
                        onClick={() => updatePersonalTask(task.id, { list: l.id })}
                        className="px-2.5 py-1 font-bold text-[10px] transition-all active:scale-95"
                        style={{
                          borderRadius: 20,
                          background: isActive ? '#059669' : '#F5F0E8',
                          color: isActive ? '#fff' : '#8A7A6A',
                          border: isActive ? 'none' : '1px solid rgba(180,140,80,.12)',
                        }}
                      >
                        {l.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Priority & Delete task */}
              <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid rgba(180,140,80,.1)' }}>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-semibold me-1" style={{ color: '#8A7A6A' }}>{t('priority')}:</span>
                  {[
                    { value: 'high', label: t('priorityHigh'), bg: '#DC2626' },
                    { value: 'med', label: t('priorityMed'), bg: '#D97706' },
                    { value: 'low', label: t('priorityLow', 'רגילה'), bg: '#059669' },
                  ].map((p) => {
                    const isActive = task.priority === p.value || (p.value === 'low' && !task.priority);
                    return (
                      <button
                        key={p.value}
                        onClick={() => updatePersonalTask(task.id, { priority: p.value })}
                        className="px-2.5 py-1 font-bold text-[10px] transition-all active:scale-95"
                        style={{
                          borderRadius: 20,
                          background: isActive ? p.bg : '#F5F0E8',
                          color: isActive ? '#fff' : '#8A7A6A',
                          border: isActive ? 'none' : '1px solid rgba(180,140,80,.12)',
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => deletePersonalTask(task.id)}
                  className="flex items-center gap-1 text-xs transition-colors"
                  style={{ color: '#8A7A6A' }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('deleteTask')}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Recurring Tasks Section (Phase 6d) ───────────────────────────────────────

const WEEKDAY_LABELS_HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const WEEKDAY_LABELS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const freqSummary = (rule, t, lang) => {
  const labels = lang === 'he' ? WEEKDAY_LABELS_HE : WEEKDAY_LABELS_EN;
  if (rule.freq === 'daily') {
    const n = rule.interval || 1;
    if (n === 1) return t('freqDaily');
    return t('everyXDays').replace('{n}', n);
  }
  if (rule.freq === 'weekly') {
    if (Array.isArray(rule.byWeekday) && rule.byWeekday.length > 0) {
      const days = rule.byWeekday.slice().sort().map((d) => labels[d]).join(', ');
      return `${t('freqWeekly')} · ${days}`;
    }
    return t('freqWeekly');
  }
  if (rule.freq === 'monthly') return t('freqMonthly');
  return rule.freq || '';
};

const RecurringForm = ({ initial, onSave, onCancel, t, lang }) => {
  // LOCAL date — toISOString is UTC and gives yesterday between 00:00–02:00 IL.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [title, setTitle] = useState(initial?.title || '');
  const [freq, setFreq] = useState(initial?.freq || 'daily');
  // Interval is fixed to the initial value for now (UI keeps it minimal).
  const interval = initial?.interval || 1;
  const [byWeekday, setByWeekday] = useState(initial?.byWeekday || []);
  const [time, setTime] = useState(initial?.time || '');
  const [durationMinutes, setDuration] = useState(initial?.durationMinutes || 30);
  const labels = lang === 'he' ? WEEKDAY_LABELS_HE : WEEKDAY_LABELS_EN;

  const handleSave = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onSave({
      title: trimmed,
      freq,
      interval: Math.max(1, Number(interval) || 1),
      byWeekday: freq === 'weekly' ? byWeekday : null,
      byMonthday: null,
      time: time || null,
      durationMinutes: Math.max(1, Number(durationMinutes) || 30),
      startDate: initial?.startDate || today,
      active: true,
    });
  };

  const toggleWeekday = (d) => {
    setByWeekday((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  };

  return (
    <div className="p-4 space-y-3" style={{ ...creamSectionCard }}>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('addTaskPlaceholder')}
        className="w-full px-3 py-2 text-sm outline-none"
        style={{ background: '#fff', border: '1px solid rgba(180,140,80,.18)', borderRadius: 12, color: '#2A1A0A' }}
        autoFocus
        onFocus={(e) => e.target.style.borderColor = '#059669'}
        onBlur={(e) => e.target.style.borderColor = 'rgba(180,140,80,.18)'}
      />
      <div className="flex items-center gap-2 text-xs">
        <span className="font-semibold" style={{ color: '#8A7A6A' }}>{t('recurring')}:</span>
        {[
          { v: 'daily',   l: t('freqDaily') },
          { v: 'weekly',  l: t('freqWeekly') },
          { v: 'monthly', l: t('freqMonthly') },
        ].map((opt) => (
          <button
            key={opt.v}
            onClick={() => setFreq(opt.v)}
            className="px-2.5 py-1 font-bold text-[11px] transition"
            style={{
              borderRadius: 20,
              background: freq === opt.v ? '#059669' : '#F5F0E8',
              color: freq === opt.v ? '#fff' : '#8A7A6A',
              border: freq === opt.v ? 'none' : '1px solid rgba(180,140,80,.12)',
            }}
          >
            {opt.l}
          </button>
        ))}
      </div>

      {freq === 'weekly' && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {labels.map((lab, d) => (
            <button
              key={d}
              onClick={() => toggleWeekday(d)}
              className="text-xs font-bold transition"
              style={{
                width: 32, height: 32, borderRadius: '50%',
                background: byWeekday.includes(d) ? '#059669' : '#F5F0E8',
                color: byWeekday.includes(d) ? '#fff' : '#8A7A6A',
                border: byWeekday.includes(d) ? 'none' : '1px solid rgba(180,140,80,.12)',
              }}
              aria-pressed={byWeekday.includes(d)}
              aria-label={lab}
            >
              {lab}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 text-xs">
        <label className="flex items-center gap-2 flex-1">
          <span style={{ color: '#8A7A6A' }}>⏰</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="flex-1 px-2 py-1 outline-none"
            style={{ border: '1px solid rgba(180,140,80,.15)', borderRadius: 8, background: '#fff', color: '#2A1A0A' }}
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="number"
            min="5"
            step="5"
            value={durationMinutes}
            onChange={(e) => setDuration(e.target.value)}
            className="w-16 px-2 py-1 outline-none"
            style={{ border: '1px solid rgba(180,140,80,.15)', borderRadius: 8, background: '#fff', color: '#2A1A0A' }}
          />
          <span style={{ color: '#8A7A6A' }}>min</span>
        </label>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-bold rounded-lg"
          style={{ color: '#8A7A6A' }}
        >
          {t('cancel')}
        </button>
        <button
          onClick={handleSave}
          className="px-3 py-1.5 text-xs font-bold rounded-lg active:scale-95"
          style={{ background: '#059669', color: '#fff' }}
        >
          {t('save')}
        </button>
      </div>
    </div>
  );
};

const UpcomingInstancesList = ({ rule, t }) => {
  const skipRecurringInstance = useStore((s) => s.skipRecurringInstance);
  const editRecurringInstance = useStore((s) => s.editRecurringInstance);
  const [editingDate, setEditingDate] = useState(null);
  const [time, setTime] = useState('');
  const [duration, setDuration] = useState('');
  
  const upcomingDates = generateFutureInstances(rule, 3); // next 3 instances
  
  if (upcomingDates.length === 0) return null;
  const rec = rule.recurrence;
  
  return (
    <div className="mt-2 space-y-1.5 border-t border-border/40 pt-2">
      <div className="text-[10px] font-semibold text-muted-foreground px-1 uppercase tracking-wider">
        Upcoming
      </div>
      {upcomingDates.map(dateStr => {
        const exception = rec.exceptions?.[dateStr] || {};
        const instTime = exception.time !== undefined ? exception.time : rec.time;
        const instDur = exception.durationMinutes !== undefined ? exception.durationMinutes : rec.durationMinutes;
        
        if (editingDate === dateStr) {
          return (
            <div key={dateStr} className="flex items-center gap-2 text-xs bg-card p-2 rounded-lg border border-border">
              <span className="font-medium flex-1">{dateStr}</span>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className="w-20 px-1 py-1 border border-border rounded bg-muted/30 outline-none focus:border-primary" />
              <input type="number" min="5" step="5" value={duration} onChange={e => setDuration(e.target.value)} className="w-12 px-1 py-1 border border-border rounded bg-muted/30 outline-none focus:border-primary" />
              <button onClick={() => {
                editRecurringInstance(rule.id, dateStr, { time, durationMinutes: Number(duration) });
                setEditingDate(null);
              }} className="text-primary font-bold px-1 active:scale-95">{t('save')}</button>
              <button onClick={() => setEditingDate(null)} className="text-muted-foreground hover:text-foreground px-1">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        }
        
        return (
          <div key={dateStr} className="flex items-center gap-2 text-xs bg-card p-1.5 rounded-lg border border-border/60">
            <span className="font-medium text-muted-foreground w-24">{dateStr}</span>
            <span className="text-muted-foreground font-medium flex-1">
              {instTime ? `⏰ ${instTime}` : ''} <span className="opacity-70">{instDur ? `(${instDur}m)` : ''}</span>
            </span>
            <button
              onClick={() => {
                setTime(instTime || '');
                setDuration(instDur || 30);
                setEditingDate(dateStr);
              }}
              className="px-2 py-1 text-[10px] rounded hover:bg-muted font-medium text-foreground transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => {
                if (window.confirm('Skip this instance?')) skipRecurringInstance(rule.id, dateStr);
              }}
              className="px-2 py-1 text-[10px] rounded hover:bg-red-500/10 font-medium text-red-500 transition-colors"
            >
              Skip
            </button>
          </div>
        );
      })}
    </div>
  );
};

const RecurringTasksSection = ({ t, lang, isRTL }) => {
  const data = useStore((s) => s.data);
  const addPersonalTask = useStore((s) => s.addPersonalTask);
  const updatePersonalTask = useStore((s) => s.updatePersonalTask);
  const deletePersonalTask = useStore((s) => s.deletePersonalTask);
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const rules = (data?.personalTasks || []).filter(t => t.recurrence);

  const handleSave = async (payload) => {
    // payload gives { title, freq, interval, byWeekday, time, durationMinutes, startDate }
    const rec = {
      type: payload.freq,
      interval: payload.interval,
      byWeekday: payload.byWeekday,
      byMonthday: payload.byMonthday,
      startDate: payload.startDate,
      time: payload.time,
      durationMinutes: payload.durationMinutes,
      active: true,
    };
    
    if (editing) {
      await updatePersonalTask(editing.id, { title: payload.title, recurrence: { ...editing.recurrence, ...rec } });
    } else {
      await addPersonalTask({ title: payload.title, list: 'personal', recurrence: rec, priority: 'low' });
    }
    setShowForm(false);
    setEditing(null);
  };

  return (
    <div style={creamSectionCard}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-inset"
        dir={isRTL ? 'rtl' : 'ltr'}
        aria-expanded={open}
      >
        <motion.div animate={{ rotate: open ? 0 : (isRTL ? 90 : -90) }} transition={{ duration: 0.18 }}>
          <ChevronDown className="w-4 h-4" style={{ color: '#8A7A6A' }} />
        </motion.div>
        <Repeat className="w-4 h-4" style={{ color: '#7C3AED' }} />
        <span className="flex-1 text-start" style={{ fontFamily: serifFont, fontSize: 16, color: '#2A1A0A' }}>
          {t('recurringTasks')} <span style={{ fontFamily: numbersFont, fontStyle: 'italic', fontSize: 13, color: '#8A7A6A' }}>({rules.length})</span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-3 space-y-2" style={{ borderTop: '1px solid rgba(180,140,80,.1)' }}>
              {rules.length === 0 && !showForm && (
                <div className="text-center text-xs py-4" style={{ color: '#8A7A6A' }}>
                  {t('noRecurring')}
                </div>
              )}

              {rules.map((rule) => {
                const rec = rule.recurrence;
                return (
                <div key={rule.id} className="flex flex-col gap-2 p-3" style={{ ...creamCard, borderRadius: 14 }}>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate" style={{ fontWeight: 600, color: '#2A1A0A' }}>{rule.title}</div>
                    <div className="text-xs" style={{ color: '#8A7A6A' }}>
                      {freqSummary({ freq: rec.type, interval: rec.interval, byWeekday: rec.byWeekday }, t, lang)}
                      {rec.time ? ` · ⏰ ${rec.time}` : ''}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setEditing({ id: rule.id, title: rule.title, freq: rec.type, interval: rec.interval, byWeekday: rec.byWeekday, time: rec.time, durationMinutes: rec.durationMinutes, startDate: rec.startDate });
                      setShowForm(true);
                    }}
                    className="p-1.5 rounded-lg self-start mt-1"
                    style={{ color: '#8A7A6A' }}
                    aria-label={t('edit')}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(t('delete') + '?')) deletePersonalTask(rule.id);
                    }}
                    className="p-1.5 rounded-lg self-start mt-1"
                    style={{ color: '#8A7A6A' }}
                    aria-label={t('delete')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="px-1">
                  <UpcomingInstancesList rule={rule} t={t} />
                </div>
              </div>
              )})}

              {showForm ? (
                <RecurringForm
                  initial={editing}
                  onSave={handleSave}
                  onCancel={() => { setShowForm(false); setEditing(null); }}
                  t={t}
                  lang={lang}
                />
              ) : (
                <button
                  onClick={() => { setEditing(null); setShowForm(true); }}
                  className="w-full px-3 py-2 text-xs font-bold transition"
                  style={{ color: '#059669', border: '1px dashed rgba(5,150,105,.4)', borderRadius: 12 }}
                >
                  {t('addRecurring')}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Main view ────────────────────────────────────────────────────────────────

export const TasksView = () => {
  const { data, addPersonalTask, openAddSheet, addTaskList, updateTaskList, deleteTaskList } = useStore();
  const { t, language } = useTranslation();
  const isRTL = language === 'he';
  const [activeTab, setActiveTab] = useState('personal');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const inputRef = useRef(null);

  // Construct lists. The store seeds a `personal` doc into cl_taskLists, so we
  // filter it out here to avoid showing "המשימות שלי" twice.
  const lists = [
    { id: 'favorites', name: t('favorites') },
    { id: 'personal', name: t('defaultListName') },
    ...(data?.taskLists || []).filter((l) => l.id !== 'personal')
  ];

  // Filter tasks based on activeTab
  const allTasks = data?.personalTasks || [];
  const filteredTasks = allTasks.filter((task) => {
    if (activeTab === 'favorites') return !!task.starred;
    return task.list === activeTab;
  });

  const pendingTasks  = filteredTasks.filter((t) => !t.done);
  const completedTasks = filteredTasks.filter((t) => t.done);

  const handleAddTask = async () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    const isFav = activeTab === 'favorites';
    await addPersonalTask({
      title,
      priority: 'low',
      list: isFav ? 'personal' : activeTab,
      starred: isFav
    });
    setNewTaskTitle('');
    inputRef.current?.focus();
  };

  const currentList = lists.find(l => l.id === activeTab);
  const isCustomList = activeTab !== 'favorites' && activeTab !== 'personal';

  return (
    <div
      className="max-w-2xl mx-auto w-full px-4 py-5 sm:px-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-400"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* ── Categories row — cream pills ── */}
      <div className="flex items-center gap-[6px] pb-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {lists.map((list) => {
          const isActive = activeTab === list.id;
          return (
            <button
              key={list.id}
              onClick={() => setActiveTab(list.id)}
              className="shrink-0 select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none transition-all"
              style={{
                borderRadius: 999,
                padding: isActive ? '5px 14px' : '6px 13px',
                fontSize: isActive ? 14 : 12,
                fontWeight: isActive ? 400 : 600,
                fontFamily: isActive ? serifFont : 'inherit',
                fontStyle: isActive ? 'italic' : 'normal',
                background: isActive ? '#059669' : '#fff',
                color: isActive ? '#fff' : '#8A7A6A',
                border: isActive ? '1px solid #059669' : '1px solid rgba(180,140,80,.15)',
              }}
            >
              {list.name}
            </button>
          );
        })}
        <button
          onClick={() => setIsAddOpen(true)}
          className="shrink-0 active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          style={{
            borderRadius: 999, padding: '6px 13px', fontSize: 12, fontWeight: 600,
            background: 'transparent', border: '1px dashed rgba(180,140,80,.3)', color: '#8A7A6A',
          }}
          aria-label={t('addNewList')}
        >
          + {t('addNewList')}
        </button>
      </div>

      {/* ── List Title + Options ── */}
      <div className="flex items-center justify-between px-1">
        <h2 style={{ fontFamily: serifFont, fontSize: 20, fontWeight: 400, color: '#2A1A0A' }}>
          {currentList ? currentList.name : ''}
        </h2>
        {isCustomList && (
          <button
            onClick={() => setIsEditOpen(true)}
            className="p-2 rounded-full transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            style={{ color: '#8A7A6A' }}
            aria-label={t('editListName')}
          >
            <Edit3 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Quick-add bar — cream green border ── */}
      <div
        className="flex items-center gap-[10px]"
        style={{ background: '#fff', border: '1.5px solid rgba(5,150,105,.18)', borderRadius: 14, padding: '11px 14px' }}
      >
        <button
          onClick={() => openAddSheet('task', { list: activeTab === 'favorites' ? 'personal' : activeTab, starred: activeTab === 'favorites' })}
          className="shrink-0 flex items-center justify-center focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          style={{ width: 22, height: 22, borderRadius: 6, background: '#059669', color: '#fff', fontSize: 16, fontWeight: 300 }}
          aria-label={t('addNewItem')}
        >
          +
        </button>
        <input
          ref={inputRef}
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAddTask(); }}
          placeholder={t('addTaskPlaceholder')}
          className="flex-1 bg-transparent outline-none"
          style={{ fontFamily: serifFont, fontStyle: 'italic', fontSize: 15, color: '#2A1A0A' }}
        />
        {newTaskTitle.trim() && (
          <button
            onClick={handleAddTask}
            className="shrink-0 px-3 py-1.5 text-xs font-bold active:scale-95 transition-transform"
            style={{ background: '#059669', color: '#fff', borderRadius: 10 }}
          >
            {t('add')}
          </button>
        )}
      </div>

      {/* ── Recurring tasks (Phase 6d) ── */}
      <RecurringTasksSection t={t} lang={language} isRTL={isRTL} />

      {/* ── Section header ── */}
      {(pendingTasks.length > 0 || completedTasks.length > 0) && (
        <div className="flex justify-between items-baseline" style={{ padding: '6px 2px 4px', marginTop: 4 }}>
          <div style={{ fontFamily: serifFont, fontSize: 18, fontWeight: 400, color: '#2A1A0A', letterSpacing: '-.02em' }}>
            <em style={{ color: '#059669' }}>{t('todayLabel')}</em>
          </div>
          <div style={{ fontFamily: serifFont, fontStyle: 'italic', fontSize: 13, color: '#8A7A6A' }}>
            {pendingTasks.length} {t('items', 'פריטים')}
          </div>
        </div>
      )}

      {/* ── Pending tasks ── */}
      {pendingTasks.length === 0 && completedTasks.length === 0 ? (
        <div className="py-20 text-center text-sm" style={{ color: '#8A7A6A' }}>
          {t('noPersonalTasks')}
        </div>
      ) : (
        <div className="flex flex-col gap-[5px]">
          {pendingTasks.length === 0 ? (
            <div className="py-10 text-center text-sm" style={{ color: '#8A7A6A' }}>
              🎉 {t('completedSection')}!
            </div>
          ) : (
            <motion.div layout className="flex flex-col gap-[5px]">
              <AnimatePresence mode="popLayout">
                {pendingTasks.map((task) => (
                  <motion.div
                    key={task.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                  >
                    <TaskRow task={task} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      )}

      {/* ── Completed section — cream toggle ── */}
      {completedTasks.length > 0 && (
        <div>
          <button
            onClick={() => setShowCompleted((v) => !v)}
            className="w-full flex items-center justify-between transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            style={{ padding: '10px 6px 4px', color: '#8A7A6A', fontSize: 12, fontWeight: 600, marginTop: 6 }}
            dir={isRTL ? 'rtl' : 'ltr'}
            aria-expanded={showCompleted}
            aria-controls="completed-tasks-section"
          >
            <span>
              <em style={{ fontFamily: serifFont, fontStyle: 'italic', fontSize: 14 }}>{t('completedSection')}</em>
              {' · '}
              <span style={{ fontFamily: numbersFont, fontStyle: 'italic' }}>{completedTasks.length}</span>
              {' '}{t('items', 'פריטים')}
            </span>
            <motion.div
              animate={{ rotate: showCompleted ? 0 : (isRTL ? 90 : -90) }}
              transition={{ duration: 0.18 }}
            >
              <ChevronDown className="w-4 h-4" />
            </motion.div>
          </button>

          <AnimatePresence initial={false}>
            {showCompleted && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
                id="completed-tasks-section"
              >
                <div className="flex flex-col gap-[5px] pt-2">
                  <AnimatePresence mode="popLayout">
                    {completedTasks.map((task) => (
                      <motion.div
                        key={task.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                      >
                        <TaskRow task={task} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Add List Modal ── */}
      {isAddOpen && (
        <EditListModal
          onClose={() => setIsAddOpen(false)}
          onSave={async (name) => {
            const newId = await addTaskList(name);
            if (newId) setActiveTab(newId);
          }}
          t={t}
          isRTL={isRTL}
        />
      )}

      {/* ── Edit/Delete List Modal ── */}
      {isEditOpen && (
        <EditListModal
          onClose={() => setIsEditOpen(false)}
          isEdit={true}
          initialValue={currentList?.name}
          onSave={(name) => updateTaskList(activeTab, name)}
          onDelete={() => {
            if (window.confirm(t('confirmDeleteList'))) {
              deleteTaskList(activeTab);
              setActiveTab('personal');
            }
          }}
          t={t}
          isRTL={isRTL}
        />
      )}
    </div>
  );
};
