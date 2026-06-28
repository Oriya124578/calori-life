import React from 'react';
import { Home, Calendar, BookOpen, Sparkles, ShoppingCart } from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';

const NAV_ITEMS = [
  { key: 'overview',      icon: Home,         labelKey: 'navHome' },
  { key: 'calendar',      icon: Calendar,     labelKey: 'navCalendar' },
  { key: 'courses',       icon: BookOpen,     labelKey: 'navStudies' },
  { key: 'commandCenter', icon: Sparkles,     labelKey: 'navManager' },
  { key: 'shopping',      icon: ShoppingCart, labelKey: 'navShopping' },
];

export const DesktopSidebar = () => {
  const { activeCategory, setActiveCategory, setActiveCourse } = useStore();
  const { t } = useTranslation();

  const handleNavClick = (key) => {
    setActiveCategory(key);
    if (key !== 'course') setActiveCourse(null);
  };

  return (
    <aside
      className="hidden min-[900px]:flex flex-col items-center shrink-0 sticky top-0 h-dvh z-30 border-e select-none"
      style={{
        width: 76,
        background: 'var(--header-bg)',
        borderColor: 'var(--header-border)',
      }}
    >
      {/* Wordmark */}
      <div
        className="flex flex-col items-center justify-center pt-5 pb-6 cursor-pointer"
        onClick={() => setActiveCategory('overview')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') setActiveCategory('overview'); }}
      >
        <span
          className="text-[15px] font-extrabold tracking-tight leading-none"
          style={{ color: 'var(--cream-text)', letterSpacing: '-.02em' }}
        >
          calori
        </span>
        <span
          className="text-[16px] leading-none -mt-0.5"
          style={{
            color: '#059669',
            fontFamily: "'Instrument Serif', serif",
            fontStyle: 'normal',
            fontWeight: 400,
          }}
        >
          life
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex flex-col items-center gap-1 flex-1 w-full px-1.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive =
            activeCategory === item.key ||
            (item.key === 'courses' && (activeCategory === 'courses' || activeCategory === 'course'));

          return (
            <button
              key={item.key}
              onClick={() => handleNavClick(item.key)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={t(item.labelKey)}
              className="relative flex flex-col items-center justify-center gap-[3px] rounded-2xl w-full py-2.5 transition-colors active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              style={{ color: isActive ? '#fff' : 'var(--cream-muted)' }}
            >
              {/* Green bubble that springs between items */}
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
                animate={{ scale: isActive ? 1.1 : 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                className="relative flex items-center justify-center"
              >
                <Icon className="w-[20px] h-[20px]" strokeWidth={isActive ? 2.4 : 2} />
              </motion.span>
              <span className="relative text-[9px] font-bold leading-none whitespace-nowrap">
                {t(item.labelKey)}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};
