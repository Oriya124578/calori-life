import React from 'react';
import { X, RefreshCcw, ArrowRightLeft, CalendarClock, Trash2 } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';
import { cn } from '../../lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

export const BlockActionSheet = ({ isOpen, block, onClose, onAction }) => {
  const { t, language } = useTranslation();
  const isRTL = language === 'he';

  if (!block) return null;

  const isTask = block.id?.startsWith('task-') || block.type === 'study' || block.source === 'task';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-black/40 z-[60]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed bottom-0 inset-x-0 z-[61] bg-background rounded-t-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.15)] pb-8 pt-2"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            dir={isRTL ? 'rtl' : 'ltr'}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1.5 rounded-full bg-muted-foreground/30" />
            </div>

            <div className="px-5 mt-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-extrabold text-foreground">
                    {block.title}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {block.startTime} - {block.endTime}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-muted transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                >
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              {/* Actions Grid */}
              <div className="grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto pb-4">
                <button
                  onClick={() => {
                    onAction('edit');
                    onClose();
                  }}
                  className="flex items-center gap-3 p-4 rounded-2xl bg-primary/10 hover:bg-primary/20 text-primary transition-colors text-start"
                >
                  <CalendarClock className="w-5 h-5" />
                  <div>
                    <div className="font-bold text-sm">{isRTL ? 'ערוך פעילות' : 'Edit Activity'}</div>
                    <div className="text-xs opacity-80 mt-0.5">{isRTL ? 'ערוך שם, סוג, זמנים והערות' : 'Edit title, type, times, and notes'}</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    onAction('delete');
                    onClose();
                  }}
                  className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-600 transition-colors text-start"
                >
                  <Trash2 className="w-5 h-5" />
                  <div>
                    <div className="font-bold text-sm">{isRTL ? 'מחק פעילות' : 'Delete Activity'}</div>
                    <div className="text-xs opacity-80 mt-0.5">{isRTL ? 'הסר פעילות זו לחלוטין מהלו״ז' : 'Remove this activity completely from schedule'}</div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    onAction('interrupted');
                    onClose();
                  }}
                  className="flex items-center gap-3 p-4 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 transition-colors text-start"
                >
                  <RefreshCcw className="w-5 h-5" />
                  <div>
                    <div className="font-bold text-sm">הייתה הפרעה</div>
                    <div className="text-xs opacity-80 mt-0.5">תכנן מחדש את שאר היום</div>
                  </div>
                </button>

                {isTask && (
                  <button
                    onClick={() => {
                      onAction('swap');
                      onClose();
                    }}
                    className="flex items-center gap-3 p-4 rounded-2xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 transition-colors text-start"
                  >
                    <ArrowRightLeft className="w-5 h-5" />
                    <div>
                      <div className="font-bold text-sm">החלף משימה</div>
                      <div className="text-xs opacity-80 mt-0.5">בחר משימה אחרת במקום</div>
                    </div>
                  </button>
                )}

                {isTask && (
                  <button
                    onClick={() => {
                      onAction('postpone');
                      onClose();
                    }}
                    className="flex items-center gap-3 p-4 rounded-2xl bg-slate-500/10 hover:bg-slate-500/20 text-slate-600 dark:text-slate-400 transition-colors text-start"
                  >
                    <CalendarClock className="w-5 h-5" />
                    <div>
                      <div className="font-bold text-sm">דחה למחר</div>
                      <div className="text-xs opacity-80 mt-0.5">הסר מהלו״ז והעבר למחר</div>
                    </div>
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
