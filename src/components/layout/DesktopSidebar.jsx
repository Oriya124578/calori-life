import React, { useState } from 'react';
import { Home, Calendar, BookOpen, Sparkles, ShoppingCart, PanelLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import { cn } from '../../lib/utils';

const NAV_ITEMS = [
  { key: 'overview',      icon: Home,         labelKey: 'navHome' },
  { key: 'calendar',      icon: Calendar,     labelKey: 'navCalendar' },
  { key: 'courses',       icon: BookOpen,     labelKey: 'navStudies' },
  { key: 'commandCenter', icon: Sparkles,     labelKey: 'navManager' },
  { key: 'shopping',      icon: ShoppingCart, labelKey: 'navShopping' },
];

const STORAGE_KEY = 'caloriNavExpanded';
const COLLAPSED = 76;
const EXPANDED = 248;

export const DesktopSidebar = () => {
  const { activeCategory, setActiveCategory, setActiveCourse } = useStore();
  const { t } = useTranslation();

  // Pinned state persists; while collapsed, hovering peeks the rail open.
  const [pinned, setPinned] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'true'); }
    catch { return true; }
  });
  const [hovering, setHovering] = useState(false);
  const expanded = pinned || hovering;

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

  return (
    <motion.aside
      className="hidden min-[900px]:flex flex-col shrink-0 sticky top-0 h-dvh z-30 border-e select-none overflow-hidden"
      style={{ background: 'var(--header-bg)', borderColor: 'var(--header-border)' }}
      initial={false}
      animate={{ width: expanded ? EXPANDED : COLLAPSED, boxShadow: hovering && !pinned ? '8px 0 32px rgba(40,20,0,.10)' : '0 0 0 rgba(0,0,0,0)' }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {/* ── Header: wordmark + collapse toggle ── */}
      <div className="flex items-center h-16 px-3.5 shrink-0">
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.button
              key="wordmark"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
              onClick={() => handleNavClick('overview')}
              className="flex items-baseline gap-1 cursor-pointer whitespace-nowrap"
              aria-label={t('navHome')}
            >
              <span className="text-[19px] font-extrabold tracking-tight leading-none" style={{ color: 'var(--cream-text)', letterSpacing: '-.02em' }}>
                calori
              </span>
              <span className="text-[20px] leading-none" style={{ color: '#059669', fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}>
                life
              </span>
            </motion.button>
          )}
        </AnimatePresence>
        <button
          onClick={togglePinned}
          aria-label={expanded ? t('collapseSidebar', 'כווץ תפריט') : t('expandSidebar', 'הרחב תפריט')}
          aria-pressed={pinned}
          className="ms-auto w-9 h-9 flex items-center justify-center rounded-xl transition-colors hover:bg-primary/10 active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          style={{ color: 'var(--cream-muted)' }}
          title={expanded ? t('collapseSidebar', 'כווץ תפריט') : t('expandSidebar', 'הרחב תפריט')}
        >
          <PanelLeft className="w-[18px] h-[18px]" strokeWidth={2.2} />
        </button>
      </div>

      {/* ── Nav items ── */}
      <nav className="flex flex-col gap-1 flex-1 w-full px-2.5 pt-1">
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
                'group relative flex items-center h-12 rounded-2xl w-full transition-colors active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
                expanded ? 'justify-start px-3.5 gap-3' : 'justify-center',
                !isActive && 'hover:bg-primary/10',
              )}
              style={{ color: isActive ? '#fff' : 'var(--cream-muted)' }}
            >
              {/* Active pill that springs between items (and reshapes with width) */}
              {isActive && (
                <motion.span
                  layoutId="sideNavBubble"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  className="absolute inset-0 rounded-2xl"
                  style={{
                    background: 'linear-gradient(135deg, #059669, #047857)',
                    boxShadow: '0 4px 14px rgba(5,150,105,.4)',
                  }}
                />
              )}
              <motion.span
                animate={{ scale: isActive ? 1.08 : 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                className="relative flex items-center justify-center shrink-0"
              >
                <Icon className="w-[21px] h-[21px]" strokeWidth={isActive ? 2.4 : 2} />
              </motion.span>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.span
                    key="label"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    transition={{ duration: 0.16 }}
                    className="relative text-sm font-bold whitespace-nowrap"
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </nav>
    </motion.aside>
  );
};
