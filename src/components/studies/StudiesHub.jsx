import React, { useMemo } from 'react';
import { BookOpen, Clock } from 'lucide-react';
import { useStore, isTaskIncludedInProgress } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import { cn } from '../../lib/utils';
import { differenceInCalendarDays, startOfDay, parseISO, isValid } from 'date-fns';
import { StudiesStats } from './StudiesStats';
import { formatExamDaysBadge } from '../../lib/examDaysFormat';

const COURSE_COLORS = ['#059669', '#2563EB', '#D97706', '#7C3AED', '#DC2626'];

const creamCard = {
  background: '#fff',
  border: '1px solid rgba(180,140,80,.14)',
  borderRadius: 18,
  boxShadow: '0 2px 10px rgba(40,20,0,.05)',
};

const heroCard = {
  background: '#fff',
  border: '1px solid rgba(180,140,80,.14)',
  borderRadius: 22,
  boxShadow: '0 4px 24px rgba(40,20,0,.07)',
  position: 'relative',
  overflow: 'hidden',
};

export const StudiesHub = () => {
  const { data, setActiveCategory, setActiveCourse, setShowPomodoroModal } =
    useStore();
  const { t, language } = useTranslation();
  const isRTL = language === 'he';
  const courses = data?.courses?.filter((c) => !c.isArchived) || [];

  const openCourse = (course) => {
    setActiveCourse(course);
    setActiveCategory('course');
  };

  // Hebrew number words for editorial header
  const hebrewNumbers = ['אפס', 'קורס אחד', 'שני קורסים', 'שלושה קורסים', 'ארבעה קורסים', 'חמישה קורסים', 'שישה קורסים', 'שבעה קורסים', 'שמונה קורסים', 'תשעה קורסים', 'עשרה קורסים'];
  const courseCountText = isRTL
    ? (hebrewNumbers[courses.length] || `${courses.length} קורסים`)
    : `${courses.length} Courses`;

  // Aggregate stats
  const stats = useMemo(() => {
    let totalTasks = 0;
    let completedTasks = 0;
    (data?.courses || []).forEach((course) => {
      Object.values(data?.tasks?.[course.id] || {}).forEach((weekTasks) => {
        (weekTasks || []).forEach((task) => {
          if (isTaskIncludedInProgress(task, course)) {
            totalTasks++;
            if (task.checked) completedTasks++;
          }
        });
      });
    });
    const pct = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

    // Find nearest exam
    let nearestExamDays = null;
    const today = startOfDay(new Date());
    const safeParseDt = (raw) => {
      if (!raw) return null;
      const dt = typeof raw === 'string' ? parseISO(raw) : new Date(raw);
      return isValid(dt) ? dt : null;
    };
    (data?.courses || []).forEach((c) => {
      // 1. Standard Moeds
      ['moedA', 'moedB', 'moedC'].forEach((moedKey) => {
        const dt = safeParseDt(c[moedKey] || c.exams?.[moedKey]);
        if (!dt) return;
        const diff = differenceInCalendarDays(startOfDay(dt), today);
        if (diff >= 0 && (nearestExamDays === null || diff < nearestExamDays)) {
          nearestExamDays = diff;
        }
      });
      // 2. Custom Exams
      c.customExams?.forEach((exam) => {
        const dt = safeParseDt(exam.date);
        if (!dt) return;
        const diff = differenceInCalendarDays(startOfDay(dt), today);
        if (diff >= 0 && (nearestExamDays === null || diff < nearestExamDays)) {
          nearestExamDays = diff;
        }
      });
    });

    return { pct, totalTasks, nearestExamDays };
  }, [data]);

  return (
    <div
      className="max-w-2xl mx-auto w-full px-4 py-5 sm:px-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Editorial Hero Card */}
      <div style={heroCard} className="p-5 relative overflow-hidden">
        {/* Green gradient bar at top */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, #065F46, #059669, #047857)',
        }} />

        <div className="flex justify-between items-end mb-4">
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#8A7A6A', letterSpacing: '.14em', textTransform: 'uppercase' }}>
              {isRTL ? 'סמסטר ב׳ · 2026' : 'Semester B · 2026'}
            </div>
            <h1 style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: 34,
              fontWeight: 400,
              color: '#2A1A0A',
              letterSpacing: '-.03em',
              lineHeight: .95,
              marginTop: 2,
            }}>
              {courseCountText.split(' ')[0]}{' '}
              <em style={{ fontStyle: 'italic', color: '#059669' }}>
                {courseCountText.split(' ').slice(1).join(' ')}
              </em>
            </h1>
          </div>

          {stats.nearestExamDays !== null && (
            <div style={{
              background: '#F0FDF4',
              border: '1px solid rgba(5,150,105,.2)',
              borderRadius: 14,
              padding: '9px 12px',
              textAlign: 'center',
            }}>
              <div style={{
                fontFamily: "'Fraunces', serif",
                fontSize: 24,
                fontWeight: 600,
                fontStyle: 'italic',
                color: '#065F46',
                lineHeight: 1,
                letterSpacing: '-.04em',
              }}>
                {formatExamDaysBadge(stats.nearestExamDays, isRTL).number}
              </div>
              <div style={{ fontSize: 9, color: 'rgba(6,95,70,.55)', marginTop: 1 }}>
                {formatExamDaysBadge(stats.nearestExamDays, isRTL).label}
              </div>
            </div>
          )}
        </div>

        {/* 3 Stats Row */}
        <div className="flex gap-0" style={{ paddingTop: 14, borderTop: '1px solid rgba(180,140,80,.1)' }}>
          <div className="flex-1" style={{ paddingInlineEnd: 12 }}>
            <div style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 28,
              fontWeight: 600,
              fontStyle: 'italic',
              color: '#059669',
              letterSpacing: '-.03em',
              lineHeight: 1,
            }}>
              {stats.pct}%
            </div>
            <div style={{ fontSize: 10, color: '#8A7A6A', marginTop: 4, fontWeight: 500 }}>
              {isRTL ? 'התקדמות ממוצעת' : 'Avg progress'}
            </div>
          </div>
          <div className="flex-1" style={{ paddingInline: 12, borderInlineStart: '1px solid rgba(180,140,80,.1)' }}>
            <div style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 28,
              fontWeight: 600,
              fontStyle: 'italic',
              color: '#2A1A0A',
              letterSpacing: '-.03em',
              lineHeight: 1,
            }}>
              {stats.totalTasks}
            </div>
            <div style={{ fontSize: 10, color: '#8A7A6A', marginTop: 4, fontWeight: 500 }}>
              {isRTL ? 'משימות שבועיות' : 'Weekly tasks'}
            </div>
          </div>
          <div className="flex-1" style={{ paddingInlineStart: 12, borderInlineStart: '1px solid rgba(180,140,80,.1)' }}>
            <div style={{
              fontFamily: "'Fraunces', serif",
              fontSize: 28,
              fontWeight: 600,
              fontStyle: 'italic',
              color: '#2563EB',
              letterSpacing: '-.03em',
              lineHeight: 1,
            }}>
              {courses.length}
            </div>
            <div style={{ fontSize: 10, color: '#8A7A6A', marginTop: 4, fontWeight: 500 }}>
              {isRTL ? 'קורסים פעילים' : 'Active courses'}
            </div>
          </div>
        </div>
      </div>

      {/* Section Header */}
      <div className="flex items-center justify-between px-0.5">
        <h2 style={{
          fontFamily: "'Instrument Serif', serif",
          fontSize: 22,
          fontWeight: 400,
          color: '#2A1A0A',
          letterSpacing: '-.02em',
        }}>
          {isRTL ? 'הקורסים ' : 'My '}
          <em style={{ fontStyle: 'italic', color: '#059669' }}>
            {isRTL ? 'שלי' : 'Courses'}
          </em>
        </h2>
      </div>

      {/* 2-Column Course Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {courses.map((course, idx) => {
          const color = COURSE_COLORS[idx % COURSE_COLORS.length];
          const taskCount = Object.values(data.tasks[course.id] || {}).reduce(
            (sum, week) => sum + week.filter(t => isTaskIncludedInProgress(t, course)).length,
            0,
          );
          const doneCount = Object.values(data.tasks[course.id] || {}).reduce(
            (sum, week) => sum + week.filter((t) => isTaskIncludedInProgress(t, course) && t.checked).length,
            0,
          );
          const pct = taskCount > 0 ? Math.round((doneCount / taskCount) * 100) : 0;

          // Find current week (rough estimate). Use the course's real week count
          // (weeksCount); fall back to legacy `weeks`, then 14.
          const totalWeeks = course.weeksCount || course.weeks || 14;
          const currentWeek = Math.min(
            totalWeeks,
            Math.max(1, Math.ceil((doneCount / Math.max(taskCount, 1)) * totalWeeks))
          );

          return (
            <button
              key={course.id}
              onClick={() => openCourse(course)}
              style={{
                ...creamCard,
                position: 'relative',
                overflow: 'hidden',
                padding: 14,
                textAlign: 'start',
              }}
              className="block w-full transition-all hover:shadow-md active:scale-[0.98]"
            >
              {/* Colored side bar - RTL: right side, LTR: left side */}
              <div style={{
                position: 'absolute',
                top: 0,
                [isRTL ? 'right' : 'left']: 0,
                width: 3,
                height: '100%',
                background: color,
              }} />

              <div style={{
                fontFamily: "'Instrument Serif', serif",
                fontSize: 18,
                fontWeight: 400,
                color: '#2A1A0A',
                lineHeight: 1.15,
                letterSpacing: '-.02em',
                marginBottom: 6,
                minHeight: 42,
              }}>
                {course.name}
              </div>

              <div style={{ fontSize: 10, color: '#8A7A6A', fontWeight: 500, marginBottom: 8 }}>
                {isRTL ? 'שבוע ' : 'Week '}
                <em style={{
                  fontFamily: "'Instrument Serif', serif",
                  fontStyle: 'italic',
                  fontSize: 12,
                  color: '#2A1A0A',
                }}>
                  {currentWeek}
                </em>
                {isRTL ? ` מתוך ${totalWeeks}` : ` of ${totalWeeks}`}
              </div>

              {/* Progress bar */}
              <div style={{
                height: 5,
                background: 'rgba(180,140,80,.12)',
                borderRadius: 3,
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  borderRadius: 3,
                  background: color,
                  width: `${pct}%`,
                  transition: 'width 0.3s ease',
                }} />
              </div>

              <div className="flex justify-between" style={{ marginTop: 6, fontSize: 9, color: '#8A7A6A' }}>
                <span>{pct}% {isRTL ? 'הושלם' : 'done'}</span>
                {course.examDate && (() => {
                  try {
                    const days = differenceInCalendarDays(parseISO(course.examDate), new Date());
                    if (days >= 0) return (
                      <span style={{
                        fontFamily: "'Instrument Serif', serif",
                        fontStyle: 'italic',
                        fontSize: 11,
                        color: '#059669',
                      }}>
                        {days} {isRTL ? 'יום' : 'days'}
                      </span>
                    );
                  } catch { /* skip unparseable exam date */ }
                  return null;
                })()}
              </div>
            </button>
          );
        })}
      </div>

      {/* Academic stats (moved here from home in Phase 4) */}
      <StudiesStats />
    </div>
  );
};
