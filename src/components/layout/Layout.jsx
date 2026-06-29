import React, { Suspense, lazy, useState } from 'react';
import { BottomNav } from './BottomNav';
import { DesktopSidebar } from './DesktopSidebar';
import { useStore } from '../../store/useStore';
// SmartDashboard stays eager: it's the default landing view, so we don't want the
// home screen to flash a Suspense fallback on first paint.
import { SmartDashboard } from '../dashboard/SmartDashboard';
import { GlobalLoadingOverlay } from './GlobalLoadingOverlay';
import { ErrorBoundary } from './ErrorBoundary';
import { Toaster } from '../ui/Toaster';
import { AddItemSheet } from '../add-item/AddItemSheet';
import { useTranslation } from '../../hooks/useTranslation';
import { useNotificationScheduler } from '../../hooks/useNotificationScheduler';
import { dateKey } from '../../lib/caloriRepo';
import { Plus, CheckSquare, StickyNote, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

// Route-level views are lazy-loaded so heavy deps (recharts, etc.) only load when
// the user navigates to a view that needs them. These are NAMED exports, so each
// import is mapped onto a synthetic `default` for React.lazy.
const CourseView = lazy(() => import('../course/CourseView').then((m) => ({ default: m.CourseView })));
const CalendarView = lazy(() => import('../calendar/CalendarView').then((m) => ({ default: m.CalendarView })));
const SettingsView = lazy(() => import('../settings/SettingsView').then((m) => ({ default: m.SettingsView })));
const StudiesHub = lazy(() => import('../studies/StudiesHub').then((m) => ({ default: m.StudiesHub })));
const ExamsBoardView = lazy(() => import('../studies/ExamsBoardView').then((m) => ({ default: m.ExamsBoardView })));
const TasksView = lazy(() => import('../tasks/TasksView').then((m) => ({ default: m.TasksView })));
const NotesView = lazy(() => import('../notes/NotesView').then((m) => ({ default: m.NotesView })));

const CaloriView = lazy(() => import('../calori/CaloriView').then((m) => ({ default: m.CaloriView })));
const CommandCenterView = lazy(() => import('../command-center/CommandCenterView').then((m) => ({ default: m.CommandCenterView })));
const ShoppingListView = lazy(() => import('../shopping/ShoppingListView').then((m) => ({ default: m.ShoppingListView })));
// The personal-manager chat is reachable from every screen via the floating left
// FAB, so it lives here. Lazy so its Gemini SDK chunk only loads when first opened.
const CoachChatDrawer = lazy(() => import('../command-center/CoachChatDrawer').then((m) => ({ default: m.CoachChatDrawer })));

// Lightweight, on-brand fallback shown while a lazy view chunk loads.
const ViewFallback = () => (
  <div className="flex items-center justify-center w-full py-24" role="status" aria-live="polite">
    <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
  </div>
);

// Top-level bottom-nav tabs — everything else is a sub-page that gets a back button.
const NAV_TABS = ['overview', 'calendar', 'courses', 'commandCenter', 'shopping'];

export const Layout = () => {
  const { data, activeCategory, activeCourse, openAddSheet, setActiveCategory, goBack,
    coachChatOpen, openCoachChat, closeCoachChat, setPendingTuneCommand } = useStore();
  const displayName = data?.profile?.displayName || '';
  const { t, language } = useTranslation();
  const isRTL = language === 'he';
  const isSubPage = !NAV_TABS.includes(activeCategory);
  const [isFanMenuOpen, setIsFanMenuOpen] = useState(false);

  // Phase 5: drive local reminders while the app is open.
  useNotificationScheduler();

  const renderContent = () => {
    if (activeCategory.startsWith('settings')) {
      return <SettingsView />;
    }
    switch (activeCategory) {
      case 'overview':
        return <SmartDashboard />;
      case 'calendar':
        return <CalendarView />;
      case 'course':
        return <CourseView />;
      case 'courses':
        return <StudiesHub />;
      case 'exams':
        return <ExamsBoardView />;
      case 'tasks':
        return <TasksView />;
      case 'notes':
        return <NotesView />;
      case 'calori':
        return <CaloriView />;
      case 'commandCenter':
        return <CommandCenterView />;
      case 'shopping':
        return <ShoppingListView />;
      default:
        return <SmartDashboard />;
    }
  };

  const headerTitle =
    activeCategory === 'course' && activeCourse
      ? activeCourse.name
      : activeCategory === 'calendar'
      ? t('navCalendar')
      : activeCategory.startsWith('settings')
      ? t('navSettings')
      : activeCategory === 'courses'
      ? t('navStudies')
      : activeCategory === 'exams'
      ? (isRTL ? 'לוח מבחנים' : 'Exams Board')
      : activeCategory === 'tasks'
      ? t('myTasks')
      : activeCategory === 'notes'
      ? t('myNotes')
      : activeCategory === 'calori'
      ? t('caloriTitle')
      : activeCategory === 'commandCenter'
      ? t('navCommandCenter')
      : activeCategory === 'shopping'
      ? t('shoppingTitle')
      : t('navHome');

  return (
    <div className="flex flex-col min-[900px]:flex-row h-[100dvh] overflow-hidden w-full bg-background selection:bg-primary/20">
      <DesktopSidebar />
      {/* Content column — on desktop, takes remaining space and centers content.
          min-h-0 lets <main> own the scroll (app-shell): the body itself never
          scrolls, so the mobile browser chrome — and the fixed bottom nav — stay
          put instead of jumping as the URL bar shows/hides. */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
      {/* Top header — cream v3: warm blur, avatar→settings, serif title, wordmark */}
      <header
        className="flex items-center justify-between px-5 py-3 border-b z-20 shrink-0 sticky top-0 transition-all pt-[max(env(safe-area-inset-top),14px)] min-[900px]:max-w-[1120px] min-[900px]:mx-auto min-[900px]:w-full min-[900px]:px-8"
        style={{
          background: 'var(--header-bg)',
          backdropFilter: 'blur(22px)',
          WebkitBackdropFilter: 'blur(22px)',
          borderColor: 'var(--header-border)',
          transform: 'translateZ(0)',
        }}
        dir={language === 'he' ? 'rtl' : 'ltr'}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {isSubPage ? (
            <button
              onClick={goBack}
              className="w-9 h-9 -ms-1 rounded-full flex items-center justify-center transition-all hover:bg-[rgba(180,140,80,.08)] active:scale-95 shrink-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              title={t('back', 'חזרה')}
              aria-label={t('back', 'חזרה')}
            >
              {isRTL
                ? <ChevronRight className="w-6 h-6" style={{ color: 'var(--color-foreground)' }} />
                : <ChevronLeft className="w-6 h-6" style={{ color: 'var(--color-foreground)' }} />}
            </button>
          ) : (
            <button
              onClick={() => setActiveCategory('settings')}
              className={cn(
                "rounded-full transition-all hover:scale-105 active:scale-95 duration-200 cursor-pointer shrink-0 min-[900px]:hidden",
                activeCategory.startsWith('settings') && "ring-2 ring-primary ring-offset-2 ring-offset-background"
              )}
              title={t('navSettings', 'הגדרות')}
              aria-label={t('navSettings', 'הגדרות')}
            >
              <Avatar
                src={data?.profile?.photoURL}
                initial={displayName ? displayName.trim().charAt(0).toUpperCase() : 'א'}
                size={34}
                alt="User Profile"
              />
            </button>
          )}
          <h1
            className="text-[17px] tracking-tight truncate text-start select-none"
            style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400, color: 'var(--cream-text)' }}
          >
            {headerTitle}
          </h1>
        </div>
        <div className="flex items-center gap-3 shrink-0 min-[900px]:hidden" dir="ltr">
          <div
            className="flex flex-col items-end select-none cursor-pointer"
            onClick={() => setActiveCategory('overview')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') setActiveCategory('overview'); }}
          >
            <span className="text-[23px] font-extrabold tracking-tight leading-none" style={{ color: 'var(--cream-text)', letterSpacing: '-.02em' }}>
              calori<span style={{ color: '#059669', fontFamily: "'Instrument Serif', serif", fontStyle: 'normal', fontWeight: 400, fontSize: '25px' }}> life</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main content — keyed motion wrapper gives every tab/page switch a
          gentle rise+fade entrance (enter-only: no AnimatePresence around
          Suspense, which is glitch-prone with lazy chunks). */}
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain relative scroll-smooth min-w-0 pb-28 pt-2 min-[900px]:max-w-[1120px] min-[900px]:mx-auto min-[900px]:w-full min-[900px]:px-8">
        <ErrorBoundary resetKey={activeCategory}>
          <Suspense fallback={<ViewFallback />}>
            <motion.div
              key={activeCategory}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {renderContent()}
            </motion.div>
          </Suspense>
        </ErrorBoundary>
      </main>

      {/* FAB — cream v3: dark green (#065F46). Bottom tracks the safe-area inset
          so it always floats clearly above the nav and is never clipped by it.
          On desktop, relocated to end-4 and stacked above the purple AI Coach FAB. */}
      <button
        onClick={() => setIsFanMenuOpen(!isFanMenuOpen)}
        className="fixed start-4 min-[900px]:start-auto min-[900px]:end-4 bottom-[calc(92px+env(safe-area-inset-bottom))] min-[900px]:bottom-[84px] w-[52px] h-[52px] rounded-full text-white shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center z-50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
        style={{ background: '#065F46', boxShadow: '0 6px 20px rgba(6,95,70,.35)', transform: 'translateZ(0)', willChange: 'transform' }}
        aria-label={isFanMenuOpen ? t('close') : t('navMore')}
      >
        <motion.div
          animate={{ rotate: isFanMenuOpen ? 135 : 0 }}
          transition={{ type: 'spring', stiffness: 450, damping: 18 }}
          className="flex items-center justify-center"
        >
          <Plus className="w-6 h-6" strokeWidth={2.5} />
        </motion.div>
      </button>

      {/* Left FAB — "המנהל האישי" AI chat. Sparkles circle, opens the chat full-screen
          from any screen. Mirrors the right FAB's safe-area-aware bottom offset.
          On desktop, positioned at end-4 bottom-6 below the green FAB. */}
      <button
        onClick={openCoachChat}
        className="fixed end-4 bottom-[calc(92px+env(safe-area-inset-bottom))] min-[900px]:bottom-6 w-[52px] h-[52px] rounded-full text-white shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center z-50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none"
        style={{ background: 'linear-gradient(135deg,#7C3AED,#5B21B6)', boxShadow: '0 6px 20px rgba(124,58,237,.4)', transform: 'translateZ(0)', willChange: 'transform' }}
        aria-label={t('personalManager', 'המנהל האישי')}
      >
        <Sparkles className="w-6 h-6" strokeWidth={2.2} />
      </button>

      {/* Global personal-manager chat (lazy: chunk loads on first open) */}
      {coachChatOpen && (
        <Suspense fallback={null}>
          <CoachChatDrawer
            isOpen={coachChatOpen}
            onClose={closeCoachChat}
            dateStr={dateKey()}
            shabbatTimes={null}
            onReplan={(cmd) => {
              setPendingTuneCommand(cmd);
              setActiveCategory('commandCenter');
              closeCoachChat();
            }}
          />
        </Suspense>
      )}

      {/* Animated Fan-out Menu */}
      <AnimatePresence>
        {isFanMenuOpen && (
          <>
            {/* Backdrop Blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              onClick={() => setIsFanMenuOpen(false)}
              className="fixed inset-0 bg-background/30 backdrop-blur-md z-40"
            />

            {/* Speed Dial Menu Container — logical start/end fanning out correctly.
                On desktop, placed on end-6 bottom-[148px], aligning items-end to prevent label zig-zag. */}
            <div className="fixed start-6 bottom-40 sm:start-8 sm:bottom-44 min-[900px]:start-auto min-[900px]:end-6 min-[900px]:bottom-[148px] z-40 flex flex-col-reverse items-start min-[900px]:items-end gap-4 pointer-events-auto">
              
              {/* 1. Add Button */}
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 480, damping: 28 }}
                className="flex items-center gap-3 flex-row min-[900px]:flex-row-reverse"
              >
                <button
                  onClick={() => { setIsFanMenuOpen(false); openAddSheet('task'); }}
                  className="w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                  title={t('addNewItem')}
                >
                  <Plus className="w-5 h-5" strokeWidth={2.5} />
                </button>
                <span className="whitespace-nowrap bg-background border text-foreground text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                  {t('addNewItem')}
                </span>
              </motion.div>

              {/* 2. Tasks Button */}
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 480, damping: 28, delay: 0.04 }}
                className="flex items-center gap-3 flex-row min-[900px]:flex-row-reverse"
              >
                <button
                  onClick={() => { setIsFanMenuOpen(false); setActiveCategory('tasks'); }}
                  className="w-12 h-12 rounded-full bg-blue-500 text-white shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                  title={t('tasksHubCard', 'משימות')}
                >
                  <CheckSquare className="w-5 h-5" />
                </button>
                <span className="whitespace-nowrap bg-background border text-foreground text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                  {t('tasksHubCard', 'משימות')}
                </span>
              </motion.div>

              {/* 3. Notes Button */}
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 480, damping: 28, delay: 0.08 }}
                className="flex items-center gap-3 flex-row min-[900px]:flex-row-reverse"
              >
                <button
                  onClick={() => { setIsFanMenuOpen(false); setActiveCategory('notes'); }}
                  className="w-12 h-12 rounded-full bg-amber-500 text-white shadow-lg flex items-center justify-center hover:scale-110 active:scale-95 transition-transform cursor-pointer"
                  title={t('notesHubCard', 'פתקים')}
                >
                  <StickyNote className="w-5 h-5" />
                </button>
                <span className="whitespace-nowrap bg-background border text-foreground text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                  {t('notesHubCard', 'פתקים')}
                </span>
              </motion.div>

            </div>
          </>
        )}
      </AnimatePresence>

      </div>{/* end content column */}
      <BottomNav />
      <AddItemSheet />
      <GlobalLoadingOverlay />
      <Toaster />
    </div>
  );
};
