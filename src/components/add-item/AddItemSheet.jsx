import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Clock, MapPin, Bell, BookOpen, Flag, Check, Star, Pin, Lock, Repeat, Tags } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import { toast } from '../../store/useToast';
import { cn } from '../../lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

// LOCAL yyyy-MM-dd (toISOString is UTC — wrong date between midnight and ~02:00 IL time).
const localDateStr = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/* ── cream v3 palette ─────────────────────────────────────── */
const CREAM = {
  bg: '#FAF7F2',
  ink: '#2A1A0A',
  muted: '#8A7A6A',
  border: 'rgba(180,140,80,.15)',
  borderLight: 'rgba(180,140,80,.12)',
  handle: 'rgba(180,140,80,.35)',
  tabBg: '#F5F0E8',
  green: '#059669',
  blue: '#2563EB',
  amber: '#D97706',
};

const TABS = ['event', 'task', 'note'];

/* accent color per tab */
const TAB_ACCENT = { event: CREAM.blue, task: CREAM.green, note: CREAM.amber };

/* ── Event color dots ─────────────────────────────────────── */
const EVENT_COLORS = [
  { id: 'blue', hex: '#2563EB' },
  { id: 'green', hex: '#059669' },
  { id: 'red', hex: '#DC2626' },
  { id: 'amber', hex: '#D97706' },
  { id: 'purple', hex: '#7C3AED' },
];

/* ── Note colors (preview bg + border + text tint) ───────── */
const NOTE_COLORS = [
  { id: 'yellow', bg: '#FEF3C7', border: 'rgba(217,119,6,.15)', text: '#92400E', dot: '#FEF3C7', dotBorder: '#FCD34D' },
  { id: 'green', bg: '#D1FAE5', border: 'rgba(5,150,105,.15)', text: '#065F46', dot: '#D1FAE5', dotBorder: '#6EE7B7' },
  { id: 'pink', bg: '#FEE2E2', border: 'rgba(220,38,38,.15)', text: '#991B1B', dot: '#FEE2E2', dotBorder: '#FCA5A5' },
  { id: 'purple', bg: '#F5F3FF', border: 'rgba(124,58,237,.15)', text: '#5B21B6', dot: '#F5F3FF', dotBorder: '#C4B5FD' },
  { id: 'blue', bg: '#DBEAFE', border: 'rgba(37,99,235,.15)', text: '#1E40AF', dot: '#DBEAFE', dotBorder: '#93C5FD' },
  { id: 'gray', bg: '#FFFFFF', border: 'rgba(180,140,80,.15)', text: '#2A1A0A', dot: '#FFFFFF', dotBorder: 'rgba(180,140,80,.3)' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'priorityLow', dotColor: '#9CA3AF', borderActive: '#9CA3AF', bgActive: '#F9FAFB' },
  { value: 'med', label: 'priorityMed', dotColor: '#D97706', borderActive: '#D97706', bgActive: '#FFFBEB' },
  { value: 'high', label: 'priorityHigh', dotColor: '#DC2626', borderActive: '#DC2626', bgActive: '#FEF2F2' },
];

/* font-family shorthand */
const serif = "'Instrument Serif', serif";

export const AddItemSheet = () => {
  const {
    showAddSheet,
    addSheetInitialTab,
    addSheetPrefill,
    closeAddSheet,
    addEvent,
    addPersonalTask,
    addQuickNote,
    data,
  } = useStore();
  const { t, language } = useTranslation();
  const isRTL = language === 'he';

  const [activeTab, setActiveTab] = useState('task');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [priority, setPriority] = useState('low');
  const [courseId, setCourseId] = useState('');
  const [location, setLocation] = useState('');
  const [reminder, setReminder] = useState('default');
  const [eventColor, setEventColor] = useState('blue');
  const [noteColorId, setNoteColorId] = useState('yellow');
  const [starred, setStarred] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [categoryIds, setCategoryIds] = useState([]);
  const [categoryId, setCategoryId] = useState('general');
  const [taskListId, setTaskListId] = useState('personal');
  const [duration, setDuration] = useState(null); // estimated minutes; null = quick (reminder)
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState('');
  const titleRef = useRef(null);

  useEffect(() => {
    if (showAddSheet) {
      setActiveTab(addSheetInitialTab || 'task');
      setTitle('');
      setContent('');
      setDueDate(addSheetPrefill?.date || '');
      setStartTime('');
      setEndTime('');
      setAllDay(false);
      setPriority('low');
      setCourseId(addSheetPrefill?.courseId || '');
      setLocation('');
      setReminder('default');
      setEventColor('blue');
      setNoteColorId('yellow');
      setStarred(!!addSheetPrefill?.starred);
      setPinned(!!addSheetPrefill?.pinned);
      setCategoryIds(addSheetPrefill?.categoryIds || []);
      setCategoryId(addSheetPrefill?.categoryId || 'general');
      setTaskListId(addSheetPrefill?.list || 'personal');
      setDuration(addSheetPrefill?.duration ?? null);
      setNotes('');
      setSubmitting(false);
      setTimeout(() => titleRef.current?.focus(), 350);
    }
  }, [showAddSheet, addSheetInitialTab, addSheetPrefill]);

  const accent = TAB_ACCENT[activeTab];

  const handleSubmit = async () => {
    if (activeTab !== 'note' && !title.trim()) {
      toast.error(t('titleRequired'));
      return;
    }
    if (activeTab === 'note' && !title.trim() && !content.trim()) {
      toast.error(t('titleRequired'));
      return;
    }
    const reminderMinutes =
      reminder === 'default' ? null : reminder === 'none' ? -1 : Number(reminder);

    setSubmitting(true);
    try {
      if (activeTab === 'event') {
        await addEvent({
          title: title.trim(),
          start: dueDate ? (allDay ? dueDate : `${dueDate}T${startTime || '09:00'}`) : null,
          end: dueDate ? (allDay ? dueDate : `${dueDate}T${endTime || startTime || '10:00'}`) : null,
          allDay,
          location: location.trim(),
          notes: notes.trim(),
          color: eventColor || null,
          courseId: courseId || null,
          reminderMinutes,
          categoryIds,
        });
      } else if (activeTab === 'task') {
        await addPersonalTask({
          title: title.trim(),
          dueDate: dueDate || null,
          priority,
          list: taskListId,
          duration,
          categoryIds,
          starred,
          courseId: courseId || null,
          reminderMinutes,
          notes: notes.trim(),
        });
      } else {
        await addQuickNote({
          title: title.trim(),
          content: content.trim(),
          color: noteColorId || null,
          categoryId,
          pinned,
          courseId: courseId || null,
        });
      }
      toast.success(t('addedSuccessfully'));
      closeAddSheet();
    } catch {
      toast.error('Error');
    } finally {
      setSubmitting(false);
    }
  };

  const tabLabels = {
    event: t('tabEvent'),
    task: t('tabTask'),
    note: t('tabNote'),
  };
  const tabIcons = { event: '\u{1F4C5}', task: '✓', note: '\u{1F4D2}' };

  const activeCourses = data?.courses?.filter((c) => !c.isArchived) || [];
  const noteColor = NOTE_COLORS.find((c) => c.id === noteColorId) || NOTE_COLORS[0];

  return (
    <AnimatePresence>
      {showAddSheet && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[60]"
            style={{ background: 'rgba(42,26,10,.55)', backdropFilter: 'blur(3px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeAddSheet}
          />

          {/* Sheet */}
          <motion.div
            className="fixed bottom-0 inset-x-0 z-[61] max-h-[92dvh] overflow-hidden flex flex-col"
            style={{
              background: CREAM.bg,
              borderRadius: '28px 28px 0 0',
              boxShadow: '0 -8px 30px rgba(40,20,0,.2)',
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            dir={isRTL ? 'rtl' : 'ltr'}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2.5 pb-1">
              <div style={{ width: 42, height: 5, borderRadius: 3, background: CREAM.handle }} />
            </div>

            {/* Header: Cancel — Title — Save */}
            <div
              className="flex items-center justify-between px-5 py-3"
              style={{ borderBottom: `1px solid ${CREAM.borderLight}` }}
            >
              <button
                onClick={closeAddSheet}
                className="text-[13px] font-semibold transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                style={{ color: CREAM.muted, fontFamily: serif }}
              >
                {t('cancel')}
              </button>

              <h2 style={{ fontFamily: serif, fontSize: 20, fontWeight: 400, color: CREAM.ink, letterSpacing: '-.02em' }}>
                {activeTab === 'event' && <>{t('tabEvent')} <em style={{ fontStyle: 'italic', color: accent }}>{t('new', 'new')}</em></>}
                {activeTab === 'task' && <>{t('tabTask')} <em style={{ fontStyle: 'italic', color: accent }}>{t('new', 'new')}</em></>}
                {activeTab === 'note' && <>{t('tabNote')} <em style={{ fontStyle: 'italic', color: accent }}>{t('new', 'new')}</em></>}
              </h2>

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="text-[13px] font-bold text-white transition-all hover:brightness-110 active:scale-95 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                style={{
                  background: accent,
                  padding: '7px 14px',
                  borderRadius: 10,
                  boxShadow: `0 4px 12px ${accent}40`,
                }}
              >
                {t('save', 'Save')}
              </button>
            </div>

            {/* Tab pills */}
            <div
              className="flex mx-5 mt-3.5 p-[3px]"
              style={{ background: CREAM.tabBg, borderRadius: 12 }}
              role="tablist"
            >
              {TABS.map((tab) => {
                const isActive = activeTab === tab;
                return (
                  <button
                    key={tab}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      'flex-1 py-2 text-center flex items-center justify-center gap-1.5 transition-all focus-visible:ring-2 focus-visible:outline-none',
                    )}
                    style={{
                      borderRadius: 9,
                      fontSize: isActive ? 14 : 12,
                      fontWeight: isActive ? 400 : 600,
                      fontFamily: isActive ? serif : 'inherit',
                      fontStyle: isActive ? 'italic' : 'normal',
                      color: isActive ? CREAM.ink : CREAM.muted,
                      background: isActive ? '#fff' : 'transparent',
                      boxShadow: isActive ? '0 1px 3px rgba(40,20,0,.1)' : 'none',
                    }}
                  >
                    <span>{tabIcons[tab]}</span>
                    <span>{tabLabels[tab]}</span>
                  </button>
                );
              })}
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 pt-4 pb-8 flex flex-col gap-2.5" style={{ scrollbarWidth: 'none' }}>

              {/* ════════ NOTE TAB ════════ */}
              {activeTab === 'note' && (
                <>
                  {/* Live color preview card */}
                  <div
                    className="p-4"
                    style={{
                      borderRadius: 14,
                      background: noteColor.bg,
                      border: `1px solid ${noteColor.border}`,
                      boxShadow: '0 2px 8px rgba(40,20,0,.05)',
                    }}
                  >
                    <input
                      ref={titleRef}
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t('noteTitlePlaceholder')}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        borderBottom: `1.5px solid ${noteColor.text}30`,
                        fontFamily: serif,
                        fontSize: 20,
                        fontStyle: 'italic',
                        color: noteColor.text,
                        width: '100%',
                        outline: 'none',
                        paddingBottom: 6,
                        marginBottom: 10,
                      }}
                    />
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder={t('noteContentPlaceholder')}
                      rows={4}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        fontFamily: "'Inter', sans-serif",
                        fontSize: 14,
                        color: noteColor.text,
                        width: '100%',
                        minHeight: 80,
                        outline: 'none',
                        lineHeight: 1.5,
                        resize: 'none',
                      }}
                    />
                  </div>

                  {/* Color picker */}
                  <CreamRow>
                    <span style={{ fontSize: 11, color: CREAM.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', marginInlineEnd: 'auto' }}>
                      {t('color', 'Color')}
                    </span>
                    <div className="flex gap-2">
                      {NOTE_COLORS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setNoteColorId(c.id)}
                          className="transition-all focus-visible:outline-none"
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: '50%',
                            background: c.dot,
                            border: `2px solid ${c.dotBorder}`,
                            boxShadow: noteColorId === c.id ? `0 0 0 3px ${CREAM.amber}` : 'none',
                            cursor: 'pointer',
                          }}
                          aria-label={c.id}
                        />
                      ))}
                    </div>
                  </CreamRow>

                  {/* Pin + Private flags */}
                  <div className="flex gap-2">
                    <FlagButton
                      active={pinned}
                      onClick={() => setPinned(!pinned)}
                      icon={<Pin className="w-[17px] h-[17px]" />}
                      label={t('pinned', 'Pinned')}
                      activeColor={CREAM.amber}
                      activeBg="#FFFBEB"
                    />
                    <FlagButton
                      active={false}
                      onClick={() => {}}
                      icon={<Lock className="w-[17px] h-[17px]" />}
                      label={t('private', 'Private')}
                      activeColor={CREAM.muted}
                      activeBg="#F9FAFB"
                    />
                  </div>

                  {/* Category */}
                  {data?.noteCategories?.length > 0 && (
                    <>
                      <SectionLabel>{t('categoryLabel')}</SectionLabel>
                      <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                        {data.noteCategories.map((c) => (
                          <CatChip
                            key={c.id}
                            active={categoryId === c.id}
                            onClick={() => setCategoryId(c.id)}
                            accentColor={CREAM.amber}
                          >
                            {c.name}
                          </CatChip>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ════════ EVENT TAB ════════ */}
              {activeTab === 'event' && (
                <>
                  {/* Title input - Google Calendar style bottom-border */}
                  <input
                    ref={titleRef}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('eventTitlePlaceholder')}
                    style={{
                      background: '#fff',
                      border: 'none',
                      borderBottom: `2px solid ${CREAM.blue}`,
                      borderRadius: 0,
                      padding: '8px 4px 10px',
                      fontFamily: serif,
                      fontSize: 22,
                      fontStyle: 'italic',
                      color: CREAM.ink,
                      width: '100%',
                      outline: 'none',
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                  />

                  {/* Date + Time grid */}
                  <div className="grid grid-cols-2 gap-2">
                    <DateTimeCell label={t('date', 'Date')}>
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="bg-transparent outline-none cursor-pointer w-full"
                        style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontStyle: 'italic', fontSize: 16, color: CREAM.ink, letterSpacing: '-.03em' }}
                      />
                    </DateTimeCell>
                    {!allDay && (
                      <DateTimeCell label={t('startTime')}>
                        <input
                          type="time"
                          value={startTime}
                          onChange={(e) => setStartTime(e.target.value)}
                          className="bg-transparent outline-none cursor-pointer w-full"
                          style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontStyle: 'italic', fontSize: 16, color: CREAM.ink }}
                        />
                      </DateTimeCell>
                    )}
                    <DateTimeCell label={t('endDate', 'End date')}>
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="bg-transparent outline-none cursor-pointer w-full"
                        style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontStyle: 'italic', fontSize: 16, color: CREAM.ink, letterSpacing: '-.03em' }}
                      />
                    </DateTimeCell>
                    {!allDay && (
                      <DateTimeCell label={t('endTime')}>
                        <input
                          type="time"
                          value={endTime}
                          onChange={(e) => setEndTime(e.target.value)}
                          className="bg-transparent outline-none cursor-pointer w-full"
                          style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontStyle: 'italic', fontSize: 16, color: CREAM.ink }}
                        />
                      </DateTimeCell>
                    )}
                  </div>

                  {/* All day toggle */}
                  <CreamRow>
                    <span style={{ fontSize: 15 }}>&#127774;</span>
                    <div className="flex-1">
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: CREAM.muted }}>{t('allDay')}</div>
                      <div style={{ fontSize: 12, color: CREAM.muted }}>{t('allDayDesc', 'All-day events')}</div>
                    </div>
                    <CreamToggle checked={allDay} onChange={() => setAllDay(!allDay)} isRTL={isRTL} />
                  </CreamRow>

                  {/* Location */}
                  <CreamRow>
                    <span style={{ fontSize: 15 }}>&#128205;</span>
                    <div className="flex-1">
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: CREAM.muted }}>{t('location')}</div>
                      <input
                        type="text"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="..."
                        style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 15, color: CREAM.ink, background: 'transparent', border: 'none', outline: 'none', width: '100%', marginTop: 1 }}
                      />
                    </div>
                    <span style={{ color: '#C7BCAA', fontSize: 16 }}>{isRTL ? '‹' : '›'}</span>
                  </CreamRow>

                  {/* Reminder */}
                  <CreamRow>
                    <span style={{ fontSize: 15 }}>&#128276;</span>
                    <div className="flex-1">
                      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: CREAM.muted }}>{t('reminderLabel')}</div>
                      <select
                        value={reminder}
                        onChange={(e) => setReminder(e.target.value)}
                        style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 15, color: CREAM.ink, background: 'transparent', border: 'none', outline: 'none', cursor: 'pointer', appearance: 'none', width: '100%', marginTop: 1 }}
                      >
                        <option value="default">{t('reminderDefault')}</option>
                        <option value="none">{t('reminderNone')}</option>
                        <option value="0">{t('reminderAtTime')}</option>
                        <option value="10">{`10 ${t('caloriMinutes')}`}</option>
                        <option value="30">{`30 ${t('caloriMinutes')}`}</option>
                        <option value="60">{`60 ${t('caloriMinutes')}`}</option>
                        <option value="1440">{t('reminderDayBefore')}</option>
                      </select>
                    </div>
                    <span style={{ color: '#C7BCAA', fontSize: 16 }}>{isRTL ? '‹' : '›'}</span>
                  </CreamRow>

                  {/* Event color */}
                  <CreamRow>
                    <span style={{ fontSize: 15 }}>&#127912;</span>
                    <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: CREAM.muted }}>{t('color', 'Color')}</span>
                    <div className="flex gap-[7px]" style={{ marginInlineStart: 'auto' }}>
                      {EVENT_COLORS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setEventColor(c.id)}
                          className="transition-all focus-visible:outline-none"
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            background: c.hex,
                            cursor: 'pointer',
                            boxShadow: eventColor === c.id ? `0 0 0 3px #fff, 0 0 0 5px ${c.hex}` : 'none',
                            border: 'none',
                          }}
                          aria-label={c.id}
                        />
                      ))}
                    </div>
                  </CreamRow>

                  {/* Category chips */}
                  {data?.categories?.length > 0 && (
                    <>
                      <SectionLabel>{t('categoryLabel')}</SectionLabel>
                      <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                        {data.categories.map((cat) => {
                          const isSelected = categoryIds.includes(cat.id);
                          return (
                            <CatChip
                              key={cat.id}
                              active={isSelected}
                              onClick={() => {
                                if (isSelected) setCategoryIds(categoryIds.filter((id) => id !== cat.id));
                                else setCategoryIds([...categoryIds, cat.id]);
                              }}
                              accentColor={CREAM.blue}
                            >
                              {cat.name}
                            </CatChip>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* Notes textarea */}
                  <SectionLabel>{t('notes', 'Notes')}</SectionLabel>
                  <div
                    style={{
                      background: '#fff',
                      border: `1px solid ${CREAM.border}`,
                      borderRadius: 14,
                      padding: '12px 14px',
                      minHeight: 60,
                    }}
                  >
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={t('addNotesPlaceholder', 'Add notes, links, or attachments...')}
                      rows={2}
                      style={{
                        fontFamily: serif,
                        fontStyle: 'italic',
                        fontSize: 14,
                        color: CREAM.ink,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        width: '100%',
                        resize: 'none',
                      }}
                    />
                  </div>
                </>
              )}

              {/* ════════ TASK TAB ════════ */}
              {activeTab === 'task' && (
                <>
                  {/* Title input */}
                  <input
                    ref={activeTab === 'task' ? titleRef : undefined}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t('taskTitlePlaceholder')}
                    style={{
                      background: '#fff',
                      border: 'none',
                      borderBottom: `2px solid ${CREAM.green}`,
                      borderRadius: 0,
                      padding: '8px 4px 10px',
                      fontFamily: serif,
                      fontSize: 22,
                      fontStyle: 'italic',
                      color: CREAM.ink,
                      width: '100%',
                      outline: 'none',
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
                  />

                  {/* Star + Recurring flags */}
                  <div className="flex gap-2">
                    <FlagButton
                      active={starred}
                      onClick={() => setStarred(!starred)}
                      icon={<Star className="w-[18px] h-[18px]" fill={starred ? '#F59E0B' : 'none'} />}
                      label={t('starred', 'Favorite')}
                      activeColor="#B45309"
                      activeBg="#FFFBEB"
                      activeBorder="#F59E0B"
                    />
                    <FlagButton
                      active={false}
                      onClick={() => {}}
                      icon={<Repeat className="w-[18px] h-[18px]" />}
                      label={t('recurrence', 'Recurring')}
                      activeColor="#6D28D9"
                      activeBg="#F5F3FF"
                      activeBorder="#7C3AED"
                    />
                  </div>

                  {/* Priority */}
                  <SectionLabel>{t('priority')}</SectionLabel>
                  <div className="flex gap-2">
                    {PRIORITY_OPTIONS.map((p) => {
                      const isActive = priority === p.value;
                      return (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setPriority(p.value)}
                          role="radio"
                          aria-checked={isActive}
                          className="flex-1 text-center py-3 transition-all focus-visible:ring-2 focus-visible:outline-none"
                          style={{
                            background: isActive ? p.bgActive : '#fff',
                            border: `1.5px solid ${isActive ? p.borderActive : CREAM.border}`,
                            borderRadius: 12,
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.dotColor, margin: '0 auto 5px' }} />
                          <div
                            style={{
                              fontSize: isActive ? 13 : 11,
                              fontWeight: isActive ? 400 : 600,
                              fontFamily: isActive ? serif : 'inherit',
                              fontStyle: isActive ? 'italic' : 'normal',
                              color: isActive ? CREAM.ink : CREAM.muted,
                            }}
                          >
                            {t(p.label)}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Due date */}
                  <SectionLabel>{t('dueDate')}</SectionLabel>
                  <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                    <DueChip
                      active={dueDate === localDateStr()}
                      onClick={() => setDueDate(localDateStr())}
                    >
                      {t('today', 'Today')}
                    </DueChip>
                    <DueChip
                      active={dueDate === localDateStr(1)}
                      onClick={() => setDueDate(localDateStr(1))}
                    >
                      {t('tomorrow', 'Tomorrow')}
                    </DueChip>
                    <DueChip active={false} onClick={() => {}}>
                      {t('thisWeek', 'This week')}
                    </DueChip>
                    <div className="flex-shrink-0 relative">
                      <DueChip active={!!dueDate && ![localDateStr(), localDateStr(1)].includes(dueDate)}>
                        {dueDate && ![localDateStr(), localDateStr(1)].includes(dueDate) ? dueDate : t('pickDate', 'Pick date')}
                      </DueChip>
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Estimated duration — drives how the AI schedules it:
                      "reminder" (no duration) = a point reminder; a number = a
                      time block of that length (e.g. mowing the lawn). */}
                  <SectionLabel>
                    {t('taskDuration', 'משך משוער')} <span style={{ fontFamily: 'inherit', fontStyle: 'normal', fontSize: 10, letterSpacing: '.16em' }}> &middot; {t('optional', 'optional')}</span>
                  </SectionLabel>
                  <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                    <DueChip active={duration == null} onClick={() => setDuration(null)}>
                      {t('asReminder', 'תזכורת')}
                    </DueChip>
                    {[15, 30, 45, 60, 90, 120].map((m) => (
                      <DueChip key={m} active={duration === m} onClick={() => setDuration(m)}>
                        {m} {t('minShort', 'דק׳')}
                      </DueChip>
                    ))}
                  </div>

                  {/* Optional course */}
                  {activeCourses.length > 0 && (
                    <>
                      <SectionLabel>
                        {t('course')} <span style={{ fontFamily: 'inherit', fontStyle: 'normal', fontSize: 10, letterSpacing: '.16em' }}> &middot; {t('optional', 'optional')}</span>
                      </SectionLabel>
                      {courseId ? (
                        <CreamRow>
                          <span style={{ fontSize: 14 }}>&#127891;</span>
                          <select
                            value={courseId}
                            onChange={(e) => setCourseId(e.target.value)}
                            style={{ flex: 1, fontFamily: serif, fontStyle: 'italic', fontSize: 14, color: CREAM.ink, background: 'transparent', border: 'none', outline: 'none', cursor: 'pointer', appearance: 'none' }}
                          >
                            {activeCourses.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setCourseId('')}
                            className="text-xs font-bold transition-opacity hover:opacity-70"
                            style={{ color: CREAM.muted }}
                          >
                            &times;
                          </button>
                        </CreamRow>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCourseId(activeCourses[0]?.id || '')}
                          className="flex items-center gap-2.5 w-full transition-colors hover:bg-white/60"
                          style={{
                            background: '#fff',
                            border: `1.5px dashed rgba(180,140,80,.3)`,
                            borderRadius: 14,
                            padding: '11px 14px',
                          }}
                        >
                          <span style={{ fontSize: 14, color: CREAM.muted }}>&#127891;</span>
                          <span style={{ flex: 1, fontFamily: serif, fontStyle: 'italic', fontSize: 14, color: CREAM.muted }}>
                            {t('attachCourseOptional', '+ Attach to course')}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: CREAM.green }}>+ {t('add', 'Add')}</span>
                        </button>
                      )}
                    </>
                  )}

                  {/* Category chips */}
                  {data?.categories?.length > 0 && (
                    <>
                      <SectionLabel>{t('categoryLabel')}</SectionLabel>
                      <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                        {data.categories.map((cat) => {
                          const isSelected = categoryIds.includes(cat.id);
                          return (
                            <CatChip
                              key={cat.id}
                              active={isSelected}
                              onClick={() => {
                                if (isSelected) setCategoryIds(categoryIds.filter((id) => id !== cat.id));
                                else setCategoryIds([...categoryIds, cat.id]);
                              }}
                              accentColor={CREAM.green}
                            >
                              {cat.name}
                            </CatChip>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* Reminder */}
                  <SectionLabel>{t('reminderLabel')}</SectionLabel>
                  <CreamRow>
                    <span style={{ fontSize: 15 }}>&#128276;</span>
                    <select
                      value={reminder}
                      onChange={(e) => setReminder(e.target.value)}
                      style={{ flex: 1, fontFamily: serif, fontStyle: 'italic', fontSize: 14, color: CREAM.ink, background: 'transparent', border: 'none', outline: 'none', cursor: 'pointer', appearance: 'none' }}
                    >
                      <option value="default">{t('reminderDefault')}</option>
                      <option value="none">{t('reminderNone')}</option>
                      <option value="0">{t('reminderAtTime')}</option>
                      <option value="10">{`10 ${t('caloriMinutes')}`}</option>
                      <option value="30">{`30 ${t('caloriMinutes')}`}</option>
                      <option value="60">{`60 ${t('caloriMinutes')}`}</option>
                      <option value="1440">{t('reminderDayBefore')}</option>
                    </select>
                  </CreamRow>

                  {/* Notes */}
                  <SectionLabel>{t('notes', 'Notes')}</SectionLabel>
                  <div
                    style={{
                      background: '#fff',
                      border: `1px solid ${CREAM.border}`,
                      borderRadius: 14,
                      padding: '12px 14px',
                      minHeight: 50,
                    }}
                  >
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={t('addNotesPlaceholder', 'Add notes or reminders...')}
                      rows={2}
                      style={{
                        fontFamily: serif,
                        fontStyle: 'italic',
                        fontSize: 14,
                        color: CREAM.ink,
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        width: '100%',
                        resize: 'none',
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

/* ── Sub-components (cream v3 atoms) ─────────────────────── */

/** Cream-styled row container */
const CreamRow = ({ children, className }) => (
  <div
    className={cn('flex items-center gap-[11px]', className)}
    style={{
      background: '#fff',
      border: `1px solid ${CREAM.border}`,
      borderRadius: 14,
      padding: '12px 14px',
    }}
  >
    {children}
  </div>
);

/** Section label with Instrument Serif italic */
const SectionLabel = ({ children }) => (
  <div
    style={{
      fontSize: 10,
      fontWeight: 700,
      color: CREAM.muted,
      letterSpacing: '.16em',
      textTransform: 'uppercase',
      padding: '8px 4px 4px',
    }}
  >
    <em style={{ fontFamily: serif, fontStyle: 'italic', fontSize: 13, color: CREAM.ink, textTransform: 'none', letterSpacing: 0 }}>
      {children}
    </em>
  </div>
);

/** Date/time cell used in event grid */
const DateTimeCell = ({ label, children }) => (
  <div
    style={{
      background: '#fff',
      border: `1px solid ${CREAM.border}`,
      borderRadius: 14,
      padding: '11px 14px',
    }}
  >
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em', color: CREAM.muted }}>
      {label}
    </div>
    <div style={{ marginTop: 3 }}>{children}</div>
  </div>
);

/** Toggle switch (cream style) */
const CreamToggle = ({ checked, onChange, isRTL }) => (
  <button
    type="button"
    onClick={onChange}
    role="switch"
    aria-checked={checked}
    className="flex-shrink-0 transition-colors focus-visible:ring-2 focus-visible:outline-none"
    style={{
      width: 44,
      height: 26,
      borderRadius: 13,
      background: checked ? CREAM.green : 'rgba(180,140,80,.2)',
      position: 'relative',
      border: 'none',
      cursor: 'pointer',
    }}
  >
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,.15)',
        position: 'absolute',
        top: 2,
        transition: 'transform .2s',
        ...(isRTL
          ? { right: checked ? 20 : 2, left: 'auto' }
          : { left: checked ? 20 : 2 }),
      }}
    />
  </button>
);

/** Flag button (star, recurring, pin, etc.) */
const FlagButton = ({ active, onClick, icon, label, activeColor, activeBg, activeBorder }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex-1 text-center py-[11px] transition-all focus-visible:ring-2 focus-visible:outline-none"
    style={{
      background: active ? activeBg : '#fff',
      border: `1.5px solid ${active ? (activeBorder || activeColor) : CREAM.border}`,
      borderRadius: 12,
      cursor: 'pointer',
    }}
  >
    <div className="flex justify-center" style={{ color: active ? activeColor : CREAM.muted }}>
      {icon}
    </div>
    <div
      style={{
        marginTop: 3,
        fontSize: active ? 13 : 11,
        fontWeight: active ? 400 : 600,
        fontFamily: active ? serif : 'inherit',
        fontStyle: active ? 'italic' : 'normal',
        color: active ? activeColor : CREAM.muted,
      }}
    >
      {label}
    </div>
  </button>
);

/** Category chip */
const CatChip = ({ active, onClick, accentColor, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex-shrink-0 transition-all focus-visible:ring-2 focus-visible:outline-none"
    style={{
      borderRadius: 999,
      padding: active ? '5px 14px' : '6px 13px',
      fontSize: active ? 14 : 12,
      fontWeight: active ? 400 : 600,
      fontFamily: active ? serif : 'inherit',
      fontStyle: active ? 'italic' : 'normal',
      background: active ? accentColor : '#fff',
      border: `1px solid ${active ? accentColor : CREAM.border}`,
      color: active ? '#fff' : CREAM.muted,
      cursor: 'pointer',
    }}
  >
    {children}
  </button>
);

/** Due-date quick chip */
const DueChip = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex-shrink-0 transition-all focus-visible:ring-2 focus-visible:outline-none"
    style={{
      borderRadius: 999,
      padding: active ? '6px 14px' : '7px 13px',
      fontSize: active ? 14 : 12,
      fontWeight: active ? 400 : 600,
      fontFamily: active ? serif : 'inherit',
      fontStyle: active ? 'italic' : 'normal',
      background: active ? CREAM.green : '#fff',
      border: `1.5px solid ${active ? CREAM.green : CREAM.border}`,
      color: active ? '#fff' : CREAM.muted,
      cursor: 'pointer',
    }}
  >
    {children}
  </button>
);
