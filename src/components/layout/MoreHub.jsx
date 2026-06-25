import React from 'react';
import { CheckSquare, StickyNote, UtensilsCrossed, ChevronLeft, ChevronRight } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import { cn } from '../../lib/utils';
import { Stagger } from '../../lib/motion';

const HUB_ITEMS = [
  {
    key: 'tasks',
    icon: CheckSquare,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    labelKey: 'tasksHubCard',
    descKey: 'tasksHubDesc',
  },
  {
    key: 'notes',
    icon: StickyNote,
    color: 'text-amber-500',
    bg: 'bg-amber-500/10',
    labelKey: 'notesHubCard',
    descKey: 'notesHubDesc',
  },
  {
    key: 'calori',
    icon: UtensilsCrossed,
    image: '/logo-calori.jpg',
    color: 'text-[#059669]',
    bg: 'bg-[#D1FAE5] dark:bg-[#059669]/20',
    labelKey: 'caloriHubCard',
    descKey: 'caloriHubDesc',
  },
];

export const MoreHub = () => {
  const { setActiveCategory, data } = useStore();
  const { t, language } = useTranslation();
  const isRTL = language === 'he';

  const pendingTasks = (data?.personalTasks || []).filter((t) => !t.done).length;
  const notesCount   = (data?.quickNotes   || []).length;

  const getBadge = (key) => {
    if (key === 'tasks' && pendingTasks > 0) return pendingTasks;
    if (key === 'notes' && notesCount   > 0) return notesCount;
    return null;
  };

  const handleClick = (key) => {
    setActiveCategory(key);
  };

  const Chevron = isRTL ? ChevronLeft : ChevronRight;

  return (
    <div
      className="max-w-2xl mx-auto w-full px-4 py-4"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <Stagger className="grid grid-cols-2 gap-3">
        {HUB_ITEMS.map((item) => {
          const Icon  = item.icon;
          const badge = getBadge(item.key);

          return (
            <Stagger.Item
              key={item.key}
              as="button"
              onClick={() => handleClick(item.key)}
              className="flex flex-col gap-3 p-4 rounded-2xl border border-border bg-card hover:border-primary/40 active:scale-[0.97] transition-all text-start focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              <div className="flex items-start justify-between w-full">
                {item.image ? (
                  <img src={item.image} alt="" className="w-11 h-11 rounded-xl object-contain" />
                ) : (
                  <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center', item.bg)}>
                    <Icon className={cn('w-5 h-5', item.color)} />
                  </div>
                )}
                <div className="flex items-center gap-1">
                  {badge != null && (
                    <span className="text-xs font-bold bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                  <Chevron className="w-4 h-4 text-muted-foreground/40" aria-hidden="true" />
                </div>
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{t(item.labelKey)}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{t(item.descKey)}</p>
              </div>
            </Stagger.Item>
          );
        })}
      </Stagger>
    </div>
  );
};
