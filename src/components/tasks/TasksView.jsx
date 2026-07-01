import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, ChevronDown, Trash2, X, Star, Edit3,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import { cn } from '../../lib/utils';
import { format, isToday, isTomorrow, isPast, parseISO } from 'date-fns';

// ── Cream v3 constants ──────────────────────────────────────────────────────
const creamCard = { background: '#fff', borderRadius: 12, border: '1px solid rgba(180,140,80,.12)', boxShadow: '0 1px 3px rgba(40,20,0,.04)' };
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
  const { toggleSubtask, updateSubtask, deleteSubtask } = useStore();
  const { t } = useTranslation();
  const [draft, setDraft] = useState(sub.title || '');

  const commit = () => {
    const v = draft.trim();
    if (v && v !== sub.title) updateSubtask(taskId, sub.id, v);
    else setDraft(sub.title || '');
  };

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
      {/* Click directly on the text to edit it — no separate edit button */}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
          if (e.key === 'Escape') { setDraft(sub.title || ''); e.currentTarget.blur(); }
        }}
        aria-label={t('editSubtask', 'ערוך תת-משימה')}
        className="flex-1 min-w-0 text-sm bg-transparent outline-none border-none p-0 rounded-sm focus-visible:ring-2 focus-visible:ring-primary"
        style={{ color: sub.done ? '#8A7A6A' : '#2A1A0A', textDecoration: sub.done ? 'line-through' : 'none' }}
      />
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
  const [titleDraft, setTitleDraft] = useState(task.title || '');
  const subInputRef = useRef(null);

  const saveTitle = () => {
    const v = titleDraft.trim();
    if (v && v !== task.title) updatePersonalTask(task.id, { title: v });
    else setTitleDraft(task.title || ''); // reject an empty title, revert to saved value
  };

  const dueDateInfo = useDueDate(task.dueDate, t);
  const subtasks    = task.subtasks || [];
  const doneSubs    = subtasks.filter((s) => s.done).length;

  // Targets the task can be moved between — "Today" + the default bucket + the
  // user's custom categories. A clean dropdown (no full category list shown).
  const customLists = (data?.taskLists || []).filter((l) => l.id !== 'personal');
  const moveTargets = [
    { id: 'today', name: t('todayTasksFilter', 'להיום') },
    { id: 'personal', name: t('defaultListName') },
    ...customLists,
  ];
  const currentTarget = task.list === 'today' ? 'today' : (task.list || 'personal');

  // Local today (yyyy-MM-dd) — toISOString is UTC and can roll to yesterday.
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const moveTo = (value) => {
    if (value === 'today') updatePersonalTask(task.id, { list: 'today', dueDate: todayStr });
    else updatePersonalTask(task.id, { list: value });
  };

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

        {/* Title + meta — tap anywhere here (but not the title text) to expand;
            the title itself is directly editable, click it to change it. */}
        <div
          onClick={() => !task.done && setExpanded((v) => !v)}
          role="button"
          tabIndex={task.done ? -1 : 0}
          onKeyDown={(e) => {
            if (task.done) return;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v); }
          }}
          className="flex-1 flex items-center gap-2 text-start min-w-0 rounded-lg cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          aria-expanded={!task.done ? expanded : undefined}
          aria-controls={!task.done ? `task-subtasks-${task.id}` : undefined}
          aria-label={t('expandTaskDetails', 'הצג פרטי משימה')}
        >
          <div className="flex flex-col items-start flex-1 min-w-0">
            <div className="flex items-center gap-[6px] w-full">
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
                  if (e.key === 'Escape') { setTitleDraft(task.title || ''); e.currentTarget.blur(); }
                }}
                aria-label={t('editTask', 'ערוך משימה')}
                className="truncate text-start bg-transparent outline-none border-none p-0 m-0 w-full rounded-sm focus-visible:ring-2 focus-visible:ring-primary"
                style={{
                  fontSize: 14, fontWeight: 600, color: task.done ? '#8A7A6A' : '#2A1A0A',
                  textDecoration: task.done ? 'line-through' : 'none', lineHeight: 1.2, flex: 1,
                }}
              />
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
        </div>

        {/* Star icon */}
        <StarButton
          isStarred={!!task.starred}
          onToggle={() => toggleStarPersonalTask(task.id)}
          t={t}
        />
      </div>

      {/* ── Expanded: subtasks + move ── */}
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

              {/* Move between categories — compact dropdown, includes "Today" */}
              <div className="flex items-center gap-2 mt-2 pt-2 flex-wrap" style={{ borderTop: '1px solid rgba(180,140,80,.1)' }}>
                <span className="font-semibold me-1 text-xs" style={{ color: '#8A7A6A' }}>{t('moveToCategory', 'העבר ל')}:</span>
                <select
                  value={currentTarget}
                  onChange={(e) => moveTo(e.target.value)}
                  className="text-xs font-bold outline-none cursor-pointer"
                  style={{ borderRadius: 10, padding: '5px 10px', background: '#F5F0E8', color: '#2A1A0A', border: '1px solid rgba(180,140,80,.15)' }}
                >
                  {moveTargets.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

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

                <div className="flex items-center gap-3">
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
  const [activeTab, setActiveTab] = useState('all');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const inputRef = useRef(null);

  // Local today (yyyy-MM-dd) — toISOString is UTC and can roll to yesterday.
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const allTasks = data?.personalTasks || [];

  // A task belongs to "Today" if it was explicitly placed in the today list,
  // is due today, or is overdue and still open.
  const isTodayTask = (task) => {
    if (task.list === 'today') return true;
    const d = (task.dueDate || '').slice(0, 10);
    if (!d) return false;
    if (d === todayStr) return true;
    if (d < todayStr && !task.done) return true; // overdue, not done
    return false;
  };

  const matchesTab = (task, tab) => {
    if (tab === 'all') return true;
    if (tab === 'favorites') return !!task.starred;
    if (tab === 'today') return isTodayTask(task);
    return task.list === tab;
  };

  // Order: All · Today · Favorites · everything else (default bucket + custom).
  // The store seeds a `personal` doc into cl_taskLists, filtered out here to
  // avoid a duplicate "המשימות שלי". Each pill carries a pending-count badge.
  const lists = [
    { id: 'all', name: t('allTasksFilter', 'הכל') },
    { id: 'today', name: t('todayTasksFilter', 'להיום') },
    { id: 'favorites', name: t('favorites') },
    { id: 'personal', name: t('defaultListName') },
    ...(data?.taskLists || []).filter((l) => l.id !== 'personal'),
  ].map((l) => ({
    ...l,
    count: allTasks.filter((task) => !task.done && matchesTab(task, l.id)).length,
  }));

  const filteredTasks = allTasks.filter((task) => matchesTab(task, activeTab));
  const pendingTasks  = filteredTasks.filter((t) => !t.done);
  const completedTasks = filteredTasks.filter((t) => t.done);

  const handleAddTask = async () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    const isFav = activeTab === 'favorites';
    const isToday = activeTab === 'today';
    const isAll = activeTab === 'all';
    await addPersonalTask({
      title,
      priority: 'low',
      // favorites/all have no list of their own → land in personal; today gets
      // a real 'today' membership AND a due date so it sticks; custom → its id.
      list: (isFav || isAll) ? 'personal' : activeTab,
      starred: isFav,
      dueDate: isToday ? todayStr : null,
    });
    setNewTaskTitle('');
    inputRef.current?.focus();
  };

  const currentList = lists.find(l => l.id === activeTab);
  const isCustomList = !['all', 'today', 'favorites', 'personal'].includes(activeTab);

  const handleDeleteList = () => {
    if (window.confirm(t('confirmDeleteList'))) {
      deleteTaskList(activeTab);
      setActiveTab('all');
    }
  };

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
              className="shrink-0 select-none inline-flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none transition-all"
              style={{
                borderRadius: 999,
                padding: isActive ? '5px 12px' : '6px 11px',
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
              {list.count > 0 && (
                <span
                  style={{
                    fontFamily: numbersFont, fontStyle: 'normal', fontSize: 11, fontWeight: 700,
                    minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: isActive ? 'rgba(255,255,255,.25)' : 'rgba(5,150,105,.1)',
                    color: isActive ? '#fff' : '#059669',
                  }}
                >
                  {list.count}
                </span>
              )}
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
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsEditOpen(true)}
              className="p-2 rounded-full transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              style={{ color: '#8A7A6A' }}
              aria-label={t('editListName')}
            >
              <Edit3 className="w-4 h-4" />
            </button>
            <button
              onClick={handleDeleteList}
              className="p-2 rounded-full transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              style={{ color: '#DC2626' }}
              aria-label={t('confirmDeleteList', 'מחק קטגוריה')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ── Quick-add bar — cream green border ── */}
      <div
        className="flex items-center gap-[10px]"
        style={{ background: '#fff', border: '1.5px solid rgba(5,150,105,.18)', borderRadius: 14, padding: '11px 14px' }}
      >
        <button
          onClick={() => openAddSheet('task', {
            list: (activeTab === 'favorites' || activeTab === 'all') ? 'personal' : activeTab,
            starred: activeTab === 'favorites',
            date: activeTab === 'today' ? todayStr : undefined,
          })}
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

      {/* ── Section header ── */}
      {(pendingTasks.length > 0 || completedTasks.length > 0) && (
        <div className="flex justify-between items-baseline" style={{ padding: '6px 2px 4px', marginTop: 4 }}>
          <div style={{ fontFamily: serifFont, fontSize: 18, fontWeight: 400, color: '#2A1A0A', letterSpacing: '-.02em' }}>
            <em style={{ color: '#059669' }}>{currentList ? currentList.name : t('todayLabel')}</em>
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
          onDelete={handleDeleteList}
          t={t}
          isRTL={isRTL}
        />
      )}
    </div>
  );
};
