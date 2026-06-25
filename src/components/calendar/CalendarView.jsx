import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  startOfDay,
  eachDayOfInterval,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  addDays,
  getDay,
  differenceInDays,
  parseISO,
  isValid,
  getHours,
  getMinutes,
} from 'date-fns';
import { he, enUS } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2, MapPin, Clock, Sparkles, Check, GraduationCap } from 'lucide-react';
import { dateKey } from '../../lib/caloriRepo';
import { toast } from '../../store/useToast';
import styles from './CalendarView.module.css';

const dayKeyOf = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

function safeParse(d) {
  if (!d) return null;
  const dt = typeof d === 'string' ? parseISO(d) : new Date(d);
  return isValid(dt) ? dt : null;
}

export const CalendarView = () => {
  const { data, updateEvent, deleteEvent, updatePersonalTask, deletePersonalTask, togglePersonalTask, setActiveCategory, setScheduleDate } = useStore();
  const { language } = useTranslation();
  const isRTL = language === 'he';
  const locale = isRTL ? he : enUS;

  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState('week'); // 'day', '3days', 'week', 'month', 'list'
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedItem, setSelectedItem] = useState(null); // tapped block → edit sheet

  // Day view follows the manager's cl_schedule for the viewed date, so the
  // plan the manager built shows up inside the calendar. Restored on unmount.
  useEffect(() => {
    if (viewMode === 'day') setScheduleDate(dayKeyOf(selectedDate));
  }, [viewMode, selectedDate, setScheduleDate]);
  useEffect(() => () => { useStore.getState().setScheduleDate(dateKey()); }, []);

  // Tick every minute so the "now" line stays accurate while the view is open.
  const [nowTick, setNowTick] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNowTick(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll to the "now" line when a time-grid view opens, so the screen
  // doesn't open on the morning hours in the afternoon.
  const nowLineRef = useRef(null);
  useEffect(() => {
    if (!['day', '3days', 'week'].includes(viewMode)) return;
    const id = setTimeout(() => {
      nowLineRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 150);
    return () => clearTimeout(id);
  }, [viewMode, selectedDate]);

  const allItems = useMemo(() => {
    const items = [];

    const moedLabels = {
      moedA: 'מועד א׳',
      moedB: 'מועד ב׳',
      moedC: 'מועד ג׳'
    };

    data?.courses?.forEach((course) => {
      // 1. Standard Moeds
      ['moedA', 'moedB', 'moedC'].forEach((moed) => {
        const raw = course[moed] || course.exams?.[moed];
        const dt = safeParse(raw);
        if (!dt) return;
        const hasTime = typeof raw === 'string' && raw.includes('T');
        items.push({
          id: `exam-${course.id}-${moed}`,
          kind: 'exam',
          title: `${course.name} — ${moedLabels[moed] || moed}`,
          date: dt,
          allDay: !hasTime,
          endDate: hasTime ? new Date(dt.getTime() + 120 * 60 * 1000) : null,
        });
      });

      // 2. Custom Exams
      course.customExams?.forEach((exam) => {
        const dt = safeParse(exam.date);
        if (!dt) return;
        const hasTime = typeof exam.date === 'string' && exam.date.includes('T');
        items.push({
          id: `exam-${course.id}-${exam.id}`,
          kind: 'exam',
          title: `${course.name} — ${exam.name}`,
          date: dt,
          allDay: !hasTime,
          endDate: hasTime ? new Date(dt.getTime() + 120 * 60 * 1000) : null,
        });
      });
    });

    (data?.events || []).forEach((ev) => {
      const dt = safeParse(ev.start);
      if (!dt) return;
      items.push({
        id: ev.id,
        kind: ev.source === 'google' ? 'event' : 'event',
        title: ev.title,
        date: dt,
        endDate: safeParse(ev.end),
        allDay: !!ev.allDay,
        location: ev.location,
        isLocked: ev.isLocked,
      });
    });

    (data?.personalTasks || []).forEach((task) => {
      const dt = safeParse(task.dueDate);
      if (!dt) return;
      items.push({
        id: task.id,
        kind: 'task',
        title: task.title,
        date: dt,
        allDay: true,
        done: task.done,
      });
    });

    (data?.pomodoroSessions || []).forEach((s) => {
      const dt = safeParse(s.date);
      if (!dt) return;
      const course = data.courses?.find((c) => c.id === s.courseId);
      items.push({
        id: s.id,
        kind: 'workout',
        title: `${s.minutes} דק׳${course ? ` — ${course.name}` : ''}`,
        date: dt,
        allDay: true,
      });
    });

    items.sort((a, b) => a.date - b.date);
    return items;
  }, [data]);

  const getDateRange = () => {
    if (viewMode === 'day') return [selectedDate];
    if (viewMode === '3days')
      return eachDayOfInterval({
        start: selectedDate,
        end: addDays(selectedDate, 2),
      });
    if (viewMode === 'week') {
      const ws = startOfWeek(selectedDate, { weekStartsOn: 0 });
      return eachDayOfInterval({ start: ws, end: addDays(ws, 6) });
    }
    return [];
  };

  // Blocks the manager planned (cl_schedule) for the subscribed date, mapped
  // into calendar items. Events are skipped (they already appear from cl_events).
  const planItems = useMemo(() => {
    const doc = data?.schedule;
    if (!doc || !Array.isArray(doc.blocks) || !doc._docDate) return [];
    const [y, m, d] = doc._docDate.split('-').map(Number);
    if (!y || !m || !d) return [];
    const kindOf = (b) =>
      b.type === 'meal' ? 'meal'
      : b.type === 'workout' ? 'workout'
      : b.type === 'study' ? 'lec'
      : b.type === 'task' || b.source === 'task' ? 'task'
      : 'event';
    const out = [];
    for (const b of doc.blocks) {
      if (!b || b.source === 'event' || typeof b.startTime !== 'string') continue;
      const [sh, sm] = b.startTime.split(':').map(Number);
      if (Number.isNaN(sh)) continue;
      const start = new Date(y, m - 1, d, sh, sm || 0);
      let end = null;
      if (typeof b.endTime === 'string') {
        const [eh, em] = b.endTime.split(':').map(Number);
        if (!Number.isNaN(eh)) end = new Date(y, m - 1, d, eh, em || 0);
      }
      out.push({
        id: `plan-${b.id}`,
        kind: kindOf(b),
        title: b.title || '',
        date: start,
        endDate: end,
        allDay: false,
        plan: true,
        notes: b.notes || '',
      });
    }
    return out;
  }, [data?.schedule]);

  const planDate = useMemo(() => {
    const ds = data?.schedule?._docDate;
    if (!ds) return null;
    const [y, m, d] = ds.split('-').map(Number);
    return y && m && d ? new Date(y, m - 1, d) : null;
  }, [data?.schedule?._docDate]);

  const itemsForDay = (day) => {
    const base = allItems.filter((item) => isSameDay(item.date, day));
    if (planItems.length > 0 && planDate && isSameDay(day, planDate)) {
      // Avoid double-showing a timed item at the exact same start with same title.
      const seen = new Set(base.map((i) => `${i.title}|${i.allDay ? 'a' : format(i.date, 'HH:mm')}`));
      const extra = planItems.filter((p) => !seen.has(`${p.title}|${format(p.date, 'HH:mm')}`));
      return [...base, ...extra].sort((a, b) => a.date - b.date);
    }
    return base;
  };

  const nav = (dir) => {
    const d = dir === 'next' ? 1 : -1;
    if (viewMode === 'month') {
      setCurrentDate(d === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    } else if (viewMode === 'day') {
      setSelectedDate(addDays(selectedDate, d));
    } else if (viewMode === '3days') {
      setSelectedDate(addDays(selectedDate, 3 * d));
    } else if (viewMode === 'week') {
      setSelectedDate(addDays(selectedDate, 7 * d));
    }
  };

  const getEventClass = (kind) => {
    if (kind === 'exam') return styles.exam;
    if (kind === 'study' || kind === 'lec') return styles.lec;
    if (kind === 'workout' || kind === 'pomodoro') return styles.workout;
    if (kind === 'meal') return styles.meal;
    if (kind === 'task') return styles.task;
    return styles.event;
  };

  const getDotClass = (kind) => {
    if (kind === 'exam') return styles.r;
    if (kind === 'study' || kind === 'lec') return styles.b;
    if (kind === 'workout' || kind === 'pomodoro') return styles.p;
    if (kind === 'meal') return styles.g;
    return styles.a;
  };

  const getTagClass = (kind) => {
    if (kind === 'exam') return styles.r;
    if (kind === 'study' || kind === 'lec') return styles.b;
    if (kind === 'workout' || kind === 'pomodoro') return styles.p;
    if (kind === 'meal') return styles.g;
    return '';
  };

  const renderMonth = () => {
    const ms = startOfMonth(currentDate);
    const me = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start: ms, end: me });
    const startPad = getDay(ms);

    return (
      <div className={styles.monthGridWrapper}>
        <div className={styles.dowRow}>
          <div className={styles.dow}>א׳</div>
          <div className={styles.dow}>ב׳</div>
          <div className={styles.dow}>ג׳</div>
          <div className={styles.dow}>ד׳</div>
          <div className={styles.dow}>ה׳</div>
          <div className={styles.dow}>ו׳</div>
          <div className={styles.dow}>ש׳</div>
        </div>
        <div className={styles.monthGrid}>
          {Array.from({ length: startPad }).map((_, i) => (
            <div key={`pad-${i}`} className={`${styles.cell} ${styles.muted}`}>
              <div className={styles.cNum}></div>
            </div>
          ))}
          {days.map((day) => {
            const dayItems = itemsForDay(day);
            const isCurr = isToday(day);
            // Exams first — they matter most at month altitude.
            const sorted = [...dayItems].sort(
              (a, b) => (a.kind === 'exam' ? 0 : 1) - (b.kind === 'exam' ? 0 : 1)
            );
            const tags = sorted.slice(0, 2);
            const rest = sorted.slice(2, 6);

            return (
              <div
                key={day.toISOString()}
                className={`${styles.cell} ${isCurr ? styles.today : ''}`}
                onClick={() => {
                  setSelectedDate(day);
                  setViewMode('day');
                }}
              >
                <div className={styles.cNum}>{format(day, 'd')}</div>
                {tags.map((item) => (
                  <div key={item.id} className={`${styles.cTag} ${getTagClass(item.kind)}`}>
                    {item.title}
                  </div>
                ))}
                {rest.length > 0 && (
                  <div className={styles.cDots}>
                    {rest.map((item, i) => (
                      <div key={i} className={`${styles.cD} ${getDotClass(item.kind)}`}></div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className={styles.monthLegend}>
          <div className={styles.legendItem}>
            <div className={`${styles.legendDot} ${styles.lg}`}></div>
            <span>תזונה</span>
          </div>
          <div className={styles.legendItem}>
            <div className={`${styles.legendDot} ${styles.lp}`}></div>
            <span>אימונים</span>
          </div>
          <div className={styles.legendItem}>
            <div className={`${styles.legendDot} ${styles.lb}`}></div>
            <span>לימודים</span>
          </div>
          <div className={styles.legendItem}>
            <div className={`${styles.legendDot} ${styles.lr}`}></div>
            <span>מבחנים</span>
          </div>
          <div className={styles.legendItem}>
            <div className={`${styles.legendDot} ${styles.la}`}></div>
            <span>אירועים</span>
          </div>
        </div>
      </div>
    );
  };

  const renderList = () => {
    const upcoming = allItems.filter(
      (i) => differenceInDays(startOfDay(i.date), startOfDay(new Date())) >= -1,
    );
    if (upcoming.length === 0) {
      return <div className={styles.emptyState}>אין אירועים קרובים</div>;
    }

    let lastDateStr = '';
    return (
      <div className={`${styles.content} schedule-view-list`}>
        {upcoming.map((item) => {
          const dateStr = format(item.date, 'EEEE', { locale });
          const showHeader = dateStr !== lastDateStr;
          lastDateStr = dateStr;
          return (
            <React.Fragment key={item.id}>
              {showHeader && (
                <div className={styles.dayRow}>
                  <div className={styles.dDate}>
                    <div className={`${styles.num} ${isToday(item.date) ? styles.today : ''}`}>
                      {format(item.date, 'd')}
                    </div>
                    <div className={styles.nm}>{isToday(item.date) ? 'היום' : ''}</div>
                  </div>
                  <div className={styles.dDayName}>{dateStr}</div>
                  <div className={styles.dLine}></div>
                </div>
              )}
              <div role="listitem" onClick={() => setSelectedItem(item)} style={{ cursor: 'pointer' }} className={`${styles.item} ${getEventClass(item.kind)}`}>
                <div className={styles.itemTime}>{item.allDay ? 'כל היום' : format(item.date, 'HH:mm')}</div>
                <div className={styles.itemBody}>
                  <div className={styles.itemName}>{item.title}</div>
                  {(item.location || (!item.allDay && item.endDate)) && (
                    <div className={styles.itemMeta}>{item.location || `עד ${format(item.endDate, 'HH:mm')}`}</div>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  // ---- Time-grid engine (shared by day / 3-days / week) -------------------
  // Splits a day's items into all-day chips vs timed boxes, clusters timed
  // overlaps and assigns side-by-side columns so boxes never cover each other.
  const layoutTimedItems = (items, startHour, endHour) => {
    const dayStartMin = startHour * 60;
    const dayEndMin = endHour * 60;

    const timed = items
      .filter((i) => !i.allDay)
      .map((i) => {
        const startMin = getHours(i.date) * 60 + getMinutes(i.date);
        let endMin;
        if (i.endDate && isSameDay(i.date, i.endDate)) {
          endMin = getHours(i.endDate) * 60 + getMinutes(i.endDate);
        } else if (i.endDate) {
          endMin = dayEndMin; // spans past midnight — clamp to grid bottom
        } else {
          endMin = startMin + 60;
        }
        if (endMin <= startMin) endMin = startMin + 30;
        return { ...i, startMin, endMin: Math.min(endMin, dayEndMin) };
      })
      .filter((i) => i.endMin > dayStartMin && i.startMin < dayEndMin)
      .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

    // Greedy clustering: events that transitively overlap share the width.
    const positioned = [];
    let cluster = [];
    let clusterEnd = -1;
    const flush = () => {
      if (cluster.length === 0) return;
      const colEnds = [];
      for (const ev of cluster) {
        let col = colEnds.findIndex((end) => end <= ev.startMin);
        if (col === -1) {
          col = colEnds.length;
          colEnds.push(0);
        }
        colEnds[col] = ev.endMin;
        ev.col = col;
      }
      for (const ev of cluster) {
        ev.cols = colEnds.length;
        positioned.push(ev);
      }
      cluster = [];
      clusterEnd = -1;
    };
    for (const ev of timed) {
      if (cluster.length > 0 && ev.startMin >= clusterEnd) flush();
      cluster.push(ev);
      clusterEnd = Math.max(clusterEnd, ev.endMin);
    }
    flush();
    return positioned;
  };

  const renderGridCols = (days, view) => {
    const slotHeight = 60; // px per hour

    // Dynamic hour range: 06–23 by default, extended to fit early/late items.
    let startHour = 6;
    let endHour = 23;
    days.forEach((day) => {
      itemsForDay(day).forEach((i) => {
        if (i.allDay) return;
        startHour = Math.min(startHour, getHours(i.date));
        const end = i.endDate && isSameDay(i.date, i.endDate) ? i.endDate : i.date;
        endHour = Math.max(endHour, Math.min(24, getHours(end) + 1));
      });
    });
    const hours = Array.from({ length: endHour - startHour }, (_, i) => i + startHour);

    const gridClass = view === 'week' ? styles.gridWeek : view === '3days' ? styles.grid3 : styles.gridDay;
    const allDayByDay = days.map((day) => itemsForDay(day).filter((i) => i.allDay));
    const hasAllDay = allDayByDay.some((arr) => arr.length > 0);
    const maxChips = view === 'week' ? 2 : 3;

    return (
      <>
        {/* All-day strip — exams, tasks, full-day events live here, not on the time grid */}
        {hasAllDay && (
          <div className={`${gridClass} ${styles.allDayRow}`}>
            <div className={styles.adLabel}>{view === 'week' ? '∞' : 'כל היום'}</div>
            {days.map((day, di) => (
              <div key={day.toISOString()} className={styles.adCell}>
                {allDayByDay[di].slice(0, maxChips).map((item) => (
                  <div key={item.id} onClick={() => setSelectedItem(item)} role="button" style={{ cursor: 'pointer' }} className={`${styles.adChip} ${getEventClass(item.kind)} ${item.done ? styles.adDone : ''}`} title={item.title}>
                    {item.title}
                  </div>
                ))}
                {allDayByDay[di].length > maxChips && (
                  <div className={`${styles.adChip} ${styles.adMore}`}>+{allDayByDay[di].length - maxChips}</div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className={gridClass}>
          <div className={styles.tCol}>
            {hours.map((h) => (
              <div key={h} className={styles.tRow}>
                <div className={styles.tl}>{`${h.toString().padStart(2, '0')}:00`}</div>
              </div>
            ))}
          </div>
          {days.map((day) => {
            const positioned = layoutTimedItems(itemsForDay(day), startHour, endHour);
            const gridHeight = hours.length * slotHeight;
            return (
              <div key={day.toISOString()} className={styles.tCol} style={{ position: 'relative' }}>
                {hours.map((h) => (
                  <div key={h} className={`${styles.tRow} ${styles.dc}`}></div>
                ))}
                {positioned.map((item) => {
                  const top = Math.max(0, ((item.startMin - startHour * 60) / 60) * slotHeight);
                  let height = ((item.endMin - Math.max(item.startMin, startHour * 60)) / 60) * slotHeight;
                  if (top + height > gridHeight) height = gridHeight - top;
                  if (height < 22) height = 22;

                  const cols = item.cols || 1;
                  const col = item.col || 0;
                  const compact = height < 40 || (view === 'week' && cols > 1);
                  const clampLines = Math.max(1, Math.floor((height - (compact ? 6 : 22)) / 14));

                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      role="button"
                      className={`${styles.evt} ${getEventClass(item.kind)} ${item.plan ? styles.planEvt : ''}`}
                      style={{
                        top: `${top}px`,
                        height: `${height}px`,
                        width: cols > 1 ? `calc(${100 / cols}% - 3px)` : undefined,
                        insetInlineStart: cols > 1 ? `${(col * 100) / cols}%` : undefined,
                        insetInlineEnd: cols > 1 ? 'auto' : undefined,
                        cursor: 'pointer',
                      }}
                      title={item.title}
                    >
                      <div className={styles.evtName} style={{ WebkitLineClamp: clampLines }}>{item.title}</div>
                      {!compact && (
                        <div className={styles.evtTime} dir="ltr">
                          {format(item.date, 'HH:mm')}
                          {item.endDate && isSameDay(item.date, item.endDate) ? `–${format(item.endDate, 'HH:mm')}` : ''}
                        </div>
                      )}
                      {!compact && view !== 'week' && item.location && height >= 64 && (
                        <div className={styles.evtMeta}>{item.location}</div>
                      )}
                    </div>
                  );
                })}
                {isToday(day) && getHours(nowTick) >= startHour && getHours(nowTick) < endHour && (
                  <div
                    ref={nowLineRef}
                    className={styles.nowLine}
                    style={{
                      top: `${(getHours(nowTick) - startHour) * slotHeight + (getMinutes(nowTick) / 60) * slotHeight}px`
                    }}
                  >
                    {view !== 'week' && <span className={styles.nowTime}>{format(nowTick, 'HH:mm')} · עכשיו</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </>
    );
  };

  const renderDayView = () => (
    <>
      <div className={`${styles.dayStrip} day-view-container`}>
        {eachDayOfInterval({
          start: startOfWeek(selectedDate, { weekStartsOn: 0 }),
          end: addDays(startOfWeek(selectedDate, { weekStartsOn: 0 }), 6),
        }).map((d) => (
          <div
            key={d.toISOString()}
            className={`${styles.dayI} ${isSameDay(d, selectedDate) ? styles.today : ''}`}
            onClick={() => setSelectedDate(d)}
          >
            <div className={styles.dayN}>{format(d, 'E', { locale })}</div>
            <div className={styles.dayD}>{format(d, 'd')}</div>
          </div>
        ))}
      </div>
      {renderGridCols([selectedDate], 'day')}
    </>
  );

  const render3Days = () => {
    const days = getDateRange();
    return (
      <>
        <div className={styles.dayHdr3}>
          <div className={styles.dhSpc}></div>
          {days.map((d) => (
            <div
              key={d.toISOString()}
              className={`${styles.dhDay} ${isToday(d) ? styles.today : ''}`}
              onClick={() => { setSelectedDate(d); setViewMode('day'); }}
            >
              <div className={styles.dhName}>{format(d, 'E', { locale })}{isToday(d) ? ' · היום' : ''}</div>
              <div className={styles.dhNum}>{format(d, 'd')}</div>
            </div>
          ))}
        </div>
        {renderGridCols(days, '3days')}
      </>
    );
  };

  const renderWeek = () => {
    const days = getDateRange();
    return (
      <>
        <div className={`${styles.dayHdrWeek} week-view-container`}>
          <div></div>
          {days.map((d) => (
            <div
              key={d.toISOString()}
              role="columnheader"
              aria-label={format(d, 'EEEE', { locale: enUS })}
              className={`${styles.dhDay} ${isToday(d) ? styles.today : ''}`}
              onClick={() => { setSelectedDate(d); setViewMode('day'); }}
            >
              <div className={styles.dhName}>{format(d, 'E', { locale })}</div>
              <div className={styles.dhNum}>{format(d, 'd')}</div>
            </div>
          ))}
        </div>
        {renderGridCols(days, 'week')}
      </>
    );
  };

  // ── Item detail / edit sheet ───────────────────────────────────────────
  const KIND_META = {
    exam: { label: 'מבחן', color: '#DC2626', Icon: GraduationCap },
    lec: { label: 'לימודים', color: '#2563EB', Icon: Clock },
    task: { label: 'משימה', color: '#D97706', Icon: Check },
    meal: { label: 'ארוחה', color: '#059669', Icon: Clock },
    workout: { label: 'אימון', color: '#7C3AED', Icon: Clock },
    event: { label: 'אירוע', color: '#5A4A3A', Icon: Clock },
  };

  const renderItemSheet = () => {
    if (!selectedItem) return null;
    const it = selectedItem;
    const meta = KIND_META[it.kind] || KIND_META.event;
    const isEvent = it.kind === 'event' && !it.plan && !String(it.id).startsWith('exam-');
    const isTask = it.kind === 'task' && !it.plan;
    const close = () => setSelectedItem(null);

    return (
      <ItemSheet
        key={it.id}
        item={it}
        meta={meta}
        isEvent={isEvent}
        isTask={isTask}
        locale={locale}
        onClose={close}
        onSaveEvent={(patch) => { updateEvent(it.id, patch); toast.success('האירוע עודכן'); close(); }}
        onDeleteEvent={() => { if (window.confirm('למחוק את האירוע?')) { deleteEvent(it.id); toast.success('האירוע נמחק'); close(); } }}
        onSaveTask={(patch) => { updatePersonalTask(it.id, patch); toast.success('המשימה עודכנה'); close(); }}
        onToggleTask={() => { togglePersonalTask(it.id); close(); }}
        onDeleteTask={() => { if (window.confirm('למחוק את המשימה?')) { deletePersonalTask(it.id); toast.success('המשימה נמחקה'); close(); } }}
        onOpenManager={() => { close(); setActiveCategory('commandCenter'); }}
      />
    );
  };

  return (
    <div className={styles.wrapper} dir={isRTL ? 'rtl' : 'ltr'}>
      <div className={styles.monthHero}>
        <div className={styles.mhTop}>
          <div>
            <div className={styles.mhYear}>{format(viewMode === 'month' ? currentDate : selectedDate, 'yyyy', { locale })}</div>
            <div className={styles.mhMonth}><em>{format(viewMode === 'month' ? currentDate : selectedDate, 'MMMM', { locale })}</em></div>
          </div>
          <div className={styles.mhNav}>
            <div className={styles.navBtn} onClick={() => nav('prev')}>›</div>
            <div className={styles.navBtn} onClick={() => nav('next')}>‹</div>
          </div>
        </div>
        <div className={styles.seg}>
          {[
            { id: 'day', label: 'יום', ariaLabel: 'Day View' },
            { id: '3days', label: '3 ימים', ariaLabel: '3 Days View' },
            { id: 'week', label: 'שבוע', ariaLabel: 'Week View' },
            { id: 'month', label: 'חודש', ariaLabel: 'Month View' },
            { id: 'list', label: 'לוח זמנים', ariaLabel: 'Schedule View' },
          ].map((m) => (
            <div
              key={m.id}
              role="button"
              aria-label={m.ariaLabel}
              className={`${styles.segI} ${viewMode === m.id ? styles.active : ''}`}
              onClick={() => {
                // 3-days always anchors on TODAY (+2 next days).
                if (m.id === '3days' || m.id === 'day') setSelectedDate(new Date());
                setViewMode(m.id);
              }}
            >
              {m.label}
            </div>
          ))}
        </div>
        {viewMode === 'day' && renderDayView()}
        {viewMode === '3days' && render3Days()}
        {viewMode === 'week' && renderWeek()}
      </div>

      {viewMode === 'month' && renderMonth()}
      {viewMode === 'list' && renderList()}

      <AnimatePresence>{renderItemSheet()}</AnimatePresence>
    </div>
  );
};

/* ── Bottom sheet for viewing/editing a calendar block ──────────────────── */
const sheetInput = {
  width: '100%', padding: '11px 14px', borderRadius: 14, fontSize: 14,
  border: '1.5px solid rgba(180,140,80,.18)', background: 'rgba(250,247,242,.5)',
  color: '#2A1A0A', outline: 'none',
};

const ItemSheet = ({ item, meta, isEvent, isTask, locale, onClose, onSaveEvent, onDeleteEvent, onSaveTask, onToggleTask, onDeleteTask, onOpenManager }) => {
  const [title, setTitle] = useState(item.title || '');
  const [dateVal, setDateVal] = useState(dayKeyOf(item.date));
  const [startVal, setStartVal] = useState(item.allDay ? '' : format(item.date, 'HH:mm'));
  const [endVal, setEndVal] = useState(item.endDate && !item.allDay ? format(item.endDate, 'HH:mm') : '');
  const { Icon } = meta;
  const editable = isEvent || isTask;

  const save = () => {
    if (!title.trim()) return;
    if (isEvent) {
      const patch = { title: title.trim() };
      if (!item.allDay && startVal) {
        patch.start = `${dateVal}T${startVal}:00`;
        if (endVal) patch.end = `${dateVal}T${endVal}:00`;
      } else if (item.allDay) {
        patch.start = `${dateVal}T00:00:00`;
      }
      onSaveEvent(patch);
    } else if (isTask) {
      onSaveTask({ title: title.trim(), dueDate: dateVal });
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
      dir="rtl"
    >
      <motion.div
        initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md p-5 pb-[max(22px,env(safe-area-inset-bottom))] space-y-4"
        style={{ background: '#FAF7F2', borderRadius: '24px 24px 0 0', border: '1px solid rgba(180,140,80,.16)', boxShadow: '0 -10px 44px rgba(40,20,0,.22)' }}
      >
        <div className="w-10 h-1 rounded-full mx-auto" style={{ background: 'rgba(180,140,80,.25)' }} />

        {/* Kind tag + close */}
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: `${meta.color}14`, color: meta.color }}>
            <Icon className="w-3.5 h-3.5" />
            {item.plan ? 'מהלוז של המנהל' : meta.label}
          </span>
          <button onClick={onClose} aria-label="סגור" className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[rgba(180,140,80,.08)]">
            <X className="w-4 h-4" style={{ color: '#8A7A6A' }} />
          </button>
        </div>

        {/* Title */}
        {editable ? (
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...sheetInput, fontFamily: "'Instrument Serif', serif", fontSize: 18 }} />
        ) : (
          <h3 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22, color: '#2A1A0A', lineHeight: 1.2 }}>{item.title}</h3>
        )}

        {/* When */}
        <div className="flex items-center gap-2 text-[13px]" style={{ color: '#5A4A3A' }}>
          <Clock className="w-4 h-4 shrink-0" style={{ color: meta.color }} />
          <span>
            {format(item.date, 'EEEE, d MMMM', { locale })}
            {!item.allDay && ` · ${format(item.date, 'HH:mm')}`}
            {!item.allDay && item.endDate && `–${format(item.endDate, 'HH:mm')}`}
            {item.allDay && ' · כל היום'}
          </span>
        </div>
        {item.location && (
          <div className="flex items-center gap-2 text-[13px]" style={{ color: '#5A4A3A' }}>
            <MapPin className="w-4 h-4 shrink-0" style={{ color: meta.color }} />
            <span>{item.location}</span>
          </div>
        )}
        {item.notes && <p className="text-[12px] leading-relaxed" style={{ color: '#8A7A6A' }}>{item.notes}</p>}

        {/* Edit fields */}
        {editable && (
          <div className="grid grid-cols-3 gap-2">
            <input type="date" value={dateVal} onChange={(e) => setDateVal(e.target.value)} style={{ ...sheetInput, gridColumn: isEvent && !item.allDay ? 'span 1' : 'span 3', fontSize: 13 }} />
            {isEvent && !item.allDay && (
              <>
                <input type="time" value={startVal} onChange={(e) => setStartVal(e.target.value)} style={{ ...sheetInput, fontSize: 13 }} />
                <input type="time" value={endVal} onChange={(e) => setEndVal(e.target.value)} style={{ ...sheetInput, fontSize: 13 }} />
              </>
            )}
          </div>
        )}

        {/* Actions */}
        {item.plan ? (
          <button onClick={onOpenManager} className="w-full py-3 rounded-2xl text-white text-sm font-bold flex items-center justify-center gap-2 active:scale-[.98] transition-all" style={{ background: 'linear-gradient(135deg, #7C3AED, #5B21B6)', boxShadow: '0 5px 18px rgba(124,58,237,.3)' }}>
            <Sparkles className="w-4 h-4" />
            ערוך במנהל
          </button>
        ) : editable ? (
          <div className="flex items-center gap-2">
            <button onClick={isEvent ? onDeleteEvent : onDeleteTask} aria-label="מחק" className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 active:scale-95 transition-all" style={{ background: '#FEE2E2', color: '#DC2626' }}>
              <Trash2 className="w-5 h-5" />
            </button>
            {isTask && (
              <button onClick={onToggleTask} className="px-4 h-12 rounded-2xl text-sm font-bold shrink-0 active:scale-95 transition-all flex items-center gap-1.5" style={{ background: item.done ? 'rgba(180,140,80,.1)' : 'rgba(5,150,105,.1)', color: item.done ? '#8A7A6A' : '#059669' }}>
                <Check className="w-4 h-4" />
                {item.done ? 'בטל ביצוע' : 'בוצע'}
              </button>
            )}
            <button onClick={save} disabled={!title.trim()} className="flex-1 h-12 rounded-2xl text-white text-sm font-bold active:scale-[.98] transition-all disabled:opacity-40" style={{ background: 'linear-gradient(135deg, #059669, #065F46)', boxShadow: '0 5px 18px rgba(5,150,105,.3)' }}>
              שמור שינויים
            </button>
          </div>
        ) : (
          <p className="text-center text-[11px] py-1" style={{ color: '#8A7A6A' }}>
            {String(item.id).startsWith('exam-') ? 'מועדי מבחנים נערכים בהגדרות הקורס' : 'פריט לקריאה בלבד'}
          </p>
        )}
      </motion.div>
    </motion.div>
  );
};
