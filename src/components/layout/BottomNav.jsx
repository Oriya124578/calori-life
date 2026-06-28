import React from 'react';
import { Home, Calendar, BookOpen, Sparkles, ShoppingCart } from 'lucide-react';
import { motion } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';

// v3 cream redesign — floating pill nav (Instagram-style), 5 tabs. RTL right→left:
// ✨ Manager · 🛒 Shopping · 🏠 Home · 📅 Calendar · 📚 Studies
// Focus moved to FAB. Calori opens from Home Hero card tap. Tasks/Notes from FAB.
const NAV_ITEMS = [
  { key: 'commandCenter', icon: Sparkles,     labelKey: 'navManager' },
  { key: 'shopping',      icon: ShoppingCart, labelKey: 'navShopping' },
  { key: 'overview',      icon: Home,         labelKey: 'navHome' },
  { key: 'calendar',      icon: Calendar,     labelKey: 'navCalendar' },
  { key: 'courses',       icon: BookOpen,     labelKey: 'navStudies' },
];

export const BottomNav = () => {
  const { activeCategory, setActiveCategory, setActiveCourse } = useStore();
  const { t } = useTranslation();

  const handleNavClick = (key) => {
    setActiveCategory(key);
    if (key !== 'course') setActiveCourse(null);
  };

  return (
    <nav
      className="fixed z-50 left-1/2 bottom-[calc(14px+env(safe-area-inset-bottom))] flex items-center gap-0.5 px-1.5 py-1.5 min-[900px]:hidden"
      style={{
        background: 'var(--bottom-nav-bg)',
        backdropFilter: 'blur(22px)',
        WebkitBackdropFilter: 'blur(22px)',
        border: '1px solid var(--header-border)',
        borderRadius: 999,
        boxShadow: '0 10px 36px rgba(40,20,0,.16), 0 2px 8px rgba(40,20,0,.08)',
        // translateZ keeps iOS WebKit from detaching the fixed bar mid-scroll
        // (backdrop-filter compositing bug); translateX centers the pill.
        transform: 'translateX(-50%) translateZ(0)',
        willChange: 'transform',
        maxWidth: 'calc(100vw - 24px)',
      }}
    >
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
            className="relative flex flex-col items-center justify-center gap-[3px] rounded-full px-3.5 py-2 min-w-[58px] transition-colors active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            style={{ color: isActive ? '#fff' : 'var(--cream-muted)' }}
          >
            {/* Floating bubble that springs between tabs */}
            {isActive && (
              <motion.span
                layoutId="bottomNavBubble"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, #059669, #047857)',
                  boxShadow: '0 4px 14px rgba(5,150,105,.4)',
                }}
              />
            )}
            <motion.span
              animate={{ scale: isActive ? 1.1 : 1, y: isActive ? -0.5 : 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 24 }}
              className="relative flex items-center justify-center"
            >
              <Icon className="w-[19px] h-[19px]" strokeWidth={isActive ? 2.4 : 2} />
            </motion.span>
            <span className="relative text-[9px] font-bold leading-none">
              {t(item.labelKey)}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
