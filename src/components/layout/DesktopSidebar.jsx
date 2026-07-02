import React, { useState, useEffect, useMemo } from 'react';
import {
  Home,
  Calendar,
  BookOpen,
  Sparkles,
  ShoppingCart,
  ChevronLeft,
  CheckSquare,
  StickyNote,
  Pin,
  Settings,
  Users,
  Moon,
  Sun,
  LogOut,
  Plus
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { auth } from '../../lib/firebase';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import { Avatar } from '../ui/Avatar';
import { cn } from '../../lib/utils';

const NAV_ITEMS = [
  { key: 'overview',      icon: Home,         labelKey: 'navHome' },
  { key: 'groups',        icon: Users,        labelKey: 'navGroups' },
  { key: 'calendar',      icon: Calendar,     labelKey: 'navCalendar' },
  { key: 'courses',       icon: BookOpen,     labelKey: 'navStudies' },
  { key: 'commandCenter', icon: Sparkles,     labelKey: 'navManager' },
  { key: 'shopping',      icon: ShoppingCart, labelKey: 'navShopping' },
  { key: 'tasks',         icon: CheckSquare,  labelKey: 'navTasks' },
  { key: 'notes',         icon: StickyNote,   labelKey: 'navNotes' },
];

const STORAGE_KEY = 'caloriNavExpanded';
const COLLAPSED = 76;
const EXPANDED = 270;

export const DesktopSidebar = () => {
  const { activeCategory, setActiveCategory, setActiveCourse, data, activeCourse, theme, setTheme, openAddSheet } = useStore();
  const { t } = useTranslation();

  const hasUnreadGroups = React.useMemo(() => {
    const groups = data?.groups || [];
    const readMap = data?.profile?.group_read_timestamps || {};
    return groups.some((g) => {
      if (!g.lastActivityTimestamp) return false;
      const readTime = readMap[g.id];
      if (!readTime) return true;
      const lastDate = g.lastActivityTimestamp.toDate ? g.lastActivityTimestamp.toDate() : new Date(g.lastActivityTimestamp);
      const readDate = readTime.toDate ? readTime.toDate() : new Date(readTime);
      return lastDate > readDate;
    });
  }, [data?.groups, data?.profile?.group_read_timestamps]);

  // Pinned state persists; while collapsed, hovering peeks the rail open.
  const [pinned, setPinned] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'true'); }
    catch { return true; }
  });
  const [hovering, setHovering] = useState(false);
  const expanded = pinned || hovering;

  // Local storage lists for recent and pinned courses
  const [recentIds, setRecentIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cl_recent_courses') ?? '[]'); }
    catch { return []; }
  });
  const [pinnedIds, setPinnedIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cl_pinned_courses') ?? '[]'); }
    catch { return []; }
  });

  // Listen to recent courses updates from the store
  useEffect(() => {
    const handleRecentChange = () => {
      try {
        setRecentIds(JSON.parse(localStorage.getItem('cl_recent_courses') ?? '[]'));
      } catch (e) {
        console.error(e);
      }
    };
    window.addEventListener('cl_recent_courses_changed', handleRecentChange);
    return () => window.removeEventListener('cl_recent_courses_changed', handleRecentChange);
  }, []);

  const togglePinned = () => {
    setPinned((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const handleNavClick = (key) => {
    setActiveCategory(key);
    if (key !== 'course') setActiveCourse(null);
  };

  const togglePinCourse = (e, courseId) => {
    e.stopPropagation();
    setPinnedIds((prev) => {
      let next;
      if (prev.includes(courseId)) {
        next = prev.filter(id => id !== courseId);
      } else {
        next = [...prev, courseId];
      }
      try { localStorage.setItem('cl_pinned_courses', JSON.stringify(next)); } catch (err) { console.error(err); }
      return next;
    });
  };

  const activeCourses = useMemo(() => {
    return (data?.courses || []).filter(c => !c.isArchived);
  }, [data?.courses]);

  const displayCourses = useMemo(() => {
    const courseMap = new Map(activeCourses.map(c => [c.id, c]));
    
    // 1. Pinned courses
    const pinned = pinnedIds
      .map(id => courseMap.get(id))
      .filter(Boolean);
      
    // 2. Recent (unpinned) courses
    const recent = recentIds
      .filter(id => !pinnedIds.includes(id))
      .map(id => courseMap.get(id))
      .filter(Boolean);
      
    // 3. Other active courses
    const other = activeCourses
      .filter(c => !pinnedIds.includes(c.id) && !recentIds.includes(c.id));
      
    const combined = [...pinned, ...recent, ...other];
    return combined.slice(0, 6);
  }, [activeCourses, pinnedIds, recentIds]);

  return (
    <motion.aside
      className="hidden min-[900px]:flex flex-col shrink-0 sticky top-0 h-dvh z-30 border-e select-none overflow-hidden"
      style={{ background: 'var(--header-bg)', borderColor: 'var(--header-border)' }}
      initial={false}
      animate={{ 
        width: expanded ? EXPANDED : COLLAPSED, 
        boxShadow: hovering && !pinned ? '8px 0 32px rgba(40,20,0,.08)' : '0 0 0 rgba(0,0,0,0)' 
      }}
      transition={{ ease: [0.22, 1, 0.36, 1], duration: 0.22 }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* ── Header: centered wordmark + rotating chevron toggle, matching the
             Flutter apps' CollapsibleNavRail header 1:1 ── */}
      <div className={cn('flex items-center shrink-0 px-3', expanded ? 'h-[72px]' : 'h-16 justify-center')}>
        {expanded && <span className="w-9 shrink-0" /> /* balances the toggle for perfect centering */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.button
              key="wordmark"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => handleNavClick('overview')}
              dir="ltr"
              className="flex-1 flex items-baseline justify-center gap-1 cursor-pointer whitespace-nowrap overflow-hidden"
              aria-label={t('navHome')}
            >
              <span className="text-[24px] font-extrabold tracking-tight leading-none" style={{ color: 'var(--cream-text)', letterSpacing: '-.02em' }}>
                calori
              </span>
              <span className="text-[25px] leading-none" style={{ color: '#059669', fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>
                life
              </span>
            </motion.button>
          )}
        </AnimatePresence>
        <button
          onClick={togglePinned}
          aria-label={expanded ? t('collapseSidebar', 'כווץ תפריט') : t('expandSidebar', 'הרחב תפריט')}
          aria-pressed={pinned}
          className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors hover:bg-primary/10 active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none shrink-0"
          style={{ color: 'var(--cream-muted)' }}
          title={expanded ? t('collapseSidebar', 'כווץ תפריט') : t('expandSidebar', 'הרחב תפריט')}
        >
          <motion.span
            animate={{ rotate: expanded ? 0 : 180 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-center justify-center"
          >
            <ChevronLeft className="w-5 h-5" strokeWidth={2.2} />
          </motion.span>
        </button>
      </div>

      {/* Nav items (fixed/pinned) */}
      <nav className="flex flex-col gap-1 w-full px-2.5 shrink-0 py-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const label = t(item.labelKey);
          const isActive =
            activeCategory === item.key ||
            (item.key === 'courses' && (activeCategory === 'courses' || activeCategory === 'course'));

          return (
            <button
              key={item.key}
              onClick={() => handleNavClick(item.key)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={label}
              title={expanded ? undefined : label}
              className={cn(
                'group relative flex items-center h-12 rounded-[14px] w-full transition-colors active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
                expanded ? 'justify-start px-3.5 gap-3.5' : 'justify-center',
                !isActive && 'hover:bg-primary/[0.08]',
              )}
              style={{ color: isActive ? '#059669' : 'var(--cream-muted)' }}
            >
              {/* Active state matching the Flutter rail: soft accent fill +
                  hairline accent border, springing between items */}
              {isActive && (
                <motion.span
                  layoutId="sideNavBubble"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  className="absolute inset-0 rounded-[14px]"
                  style={{
                    background: 'rgba(5,150,105,.08)',
                    border: '1px solid rgba(5,150,105,.20)',
                  }}
                />
              )}
              <motion.span
                animate={{ scale: isActive ? 1.06 : 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                className="relative flex items-center justify-center shrink-0"
              >
                <Icon className="w-[19px] h-[19px]" strokeWidth={isActive ? 2.4 : 2} />
                {item.key === 'groups' && hasUnreadGroups && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border border-[var(--header-bg)] shadow-[0_0_8px_rgba(239,68,68,0.7)]" />
                )}
              </motion.span>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.span
                    key="label"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    transition={{ duration: 0.16 }}
                    className="relative text-[14px] font-bold whitespace-nowrap"
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </nav>

      {/* Divider between Nav and Recent */}
      {expanded && displayCourses.length > 0 && (
        <hr className="border-[rgba(180,140,80,.08)] mx-5 my-1 shrink-0" />
      )}

      {/* ── Scrollable Recent courses section ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col py-2 scrollbar-none min-h-0">
        {expanded && displayCourses.length > 0 && (
          <div className="flex flex-col min-h-0">
            <h3 className="px-5 text-[11px] font-bold text-cream-muted uppercase tracking-wider mb-2 select-none">
              {t('recentCoursesHeader', 'מהזמן האחרון')}
            </h3>
            <div className="px-2.5 space-y-1">
              {displayCourses.map((course) => {
                const isPinned = pinnedIds.includes(course.id);
                const isActive = activeCategory === 'course' && activeCourse?.id === course.id;

                return (
                  <div
                    key={course.id}
                    onClick={() => {
                      setActiveCategory('course');
                      setActiveCourse(course);
                    }}
                    className={cn(
                      'group relative flex items-center justify-between h-9 px-3 rounded-xl cursor-pointer select-none transition-colors active:scale-[0.99]',
                      isActive
                        ? 'bg-primary/10 text-primary font-bold'
                        : 'text-cream-sub hover:bg-primary/5 hover:text-cream-text'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <BookOpen className="w-[14px] h-[14px] shrink-0 text-cream-muted" />
                      <span className="text-[13px] truncate">
                        {course.name}
                      </span>
                    </div>

                    {/* Pin button overlay */}
                    <button
                      onClick={(e) => togglePinCourse(e, course.id)}
                      className={cn(
                        'p-1 rounded-md transition-all shrink-0',
                        isPinned
                          ? 'opacity-100 text-amber-500 hover:bg-amber-500/10'
                          : 'opacity-0 group-hover:opacity-100 text-cream-muted hover:text-cream-text hover:bg-muted'
                      )}
                      title={isPinned ? t('unpinCourse', 'בטל נעיצה') : t('pinCourse', 'נעץ קורס')}
                    >
                      <Pin
                        className={cn('w-3.5 h-3.5', isPinned && 'fill-current rotate-45')}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Profile section at the bottom — mirrors the Flutter rail's
          _ProfileSection: name+subtitle row, then a row of 4 utility squares
          (quick add · theme · settings · logout). */}
      <div className="mt-auto border-t shrink-0 px-4 py-3" style={{ borderColor: 'var(--header-border)' }}>
        {expanded ? (
          <div className="flex flex-col gap-3">
            <div
              onClick={() => setActiveCategory('settings')}
              className="flex items-center gap-3 min-w-0 cursor-pointer hover:bg-primary/5 p-1 rounded-xl transition-colors"
            >
              <Avatar
                src={data?.profile?.photoURL}
                initial={data?.profile?.displayName ? data?.profile?.displayName.trim().charAt(0).toUpperCase() : 'א'}
                size={36}
                alt="User Profile"
              />
              <div className="flex flex-col min-w-0 text-start">
                <span className="text-[13.5px] font-bold truncate text-cream-text">
                  {data?.profile?.displayName || t('student', 'סטודנט')}
                </span>
                <span className="text-[10.5px] text-cream-muted truncate font-medium">
                  {[data?.profile?.academicYear, data?.profile?.semester].filter(Boolean).join(' • ')}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => openAddSheet('task')}
                className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center text-white active:scale-95 transition-transform cursor-pointer"
                style={{ background: '#059669', border: '1px solid rgba(5,150,105,.5)' }}
                title={t('addNewItem', 'הוספת פריט חדש')}
                aria-label={t('addNewItem', 'הוספת פריט חדש')}
              >
                <Plus className="w-[18px] h-[18px]" />
              </button>
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center bg-white text-cream-muted hover:text-cream-text active:scale-95 transition-transform cursor-pointer"
                style={{ border: '1px solid var(--header-border)' }}
                title={theme === 'dark' ? t('lightMode', 'מצב בהיר') : t('darkMode', 'מצב כהה')}
                aria-label={theme === 'dark' ? t('lightMode', 'מצב בהיר') : t('darkMode', 'מצב כהה')}
              >
                {theme === 'dark'
                  ? <Sun className="w-[18px] h-[18px]" />
                  : <Moon className="w-[18px] h-[18px]" />}
              </button>
              <button
                onClick={() => setActiveCategory('settings')}
                className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center bg-white text-cream-muted hover:text-cream-text active:scale-95 transition-transform cursor-pointer"
                style={{ border: '1px solid var(--header-border)' }}
                title={t('navSettings', 'הגדרות')}
                aria-label={t('navSettings', 'הגדרות')}
              >
                <Settings className="w-[18px] h-[18px]" />
              </button>
              <button
                onClick={() => signOut(auth)}
                className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center bg-white text-cream-muted hover:text-red-500 active:scale-95 transition-transform cursor-pointer"
                style={{ border: '1px solid var(--header-border)' }}
                title={t('logout', 'התנתקות')}
                aria-label={t('logout', 'התנתקות')}
              >
                <LogOut className="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setActiveCategory('settings')}
            className="w-full flex items-center justify-center p-1 rounded-xl hover:bg-primary/5 transition-colors active:scale-95 cursor-pointer"
            title={data?.profile?.displayName || t('navSettings', 'הגדרות')}
          >
            <Avatar
              src={data?.profile?.photoURL}
              initial={data?.profile?.displayName ? data?.profile?.displayName.trim().charAt(0).toUpperCase() : 'א'}
              size={36}
              alt="User Profile"
            />
          </button>
        )}
      </div>
    </motion.aside>
  );
};
