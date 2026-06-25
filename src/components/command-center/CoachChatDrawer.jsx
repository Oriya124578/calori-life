import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Bot, Check, ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { useStore, getCourseProgressSummary } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import { chatWithCoach } from '../../lib/coachAiService';
import { cn } from '../../lib/utils';
import { toast } from '../../store/useToast';

export const CoachChatDrawer = ({ isOpen, onClose, dateStr, shabbatTimes, onReplan }) => {
  const {
    data,
    addPersonalTask,
    deletePersonalTask,
    togglePersonalTask,
    toggleStarPersonalTask,
    addSubtask,
    addQuickNote,
    updateQuickNote,
    deleteQuickNote,
    scheduleTask,
    unscheduleTask,
    updatePersonalTask,
    addEvent,
    updateEvent,
    deleteEvent,
    addShoppingItem,
    createShoppingList,
    clearDaySchedule,
    addCourse,
    updateCourse,
    setActiveCategory,
    draftSchedule,
    setDraftSchedule,
  } = useStore();

  const { t, language } = useTranslation();
  const isRTL = language === 'he';

  // Available destinations for add_task / add_note actions.
  const taskLists = [
    { id: 'personal', name: t('defaultListName') },
    ...(data?.taskLists || []).filter((l) => l.id !== 'personal'),
  ];
  const noteCategories = [
    { id: 'general', name: 'כללי' },
    ...(data?.noteCategories || []).filter((c) => c.id !== 'general'),
  ];

  // Per-message picker selection for add_task/add_note action cards.
  const [actionTargets, setActionTargets] = useState({});

  const [messages, setMessages] = useState([
    {
      isUser: false,
      text: 'שלום! אני מאמן ה-AI האישי שלך. איך אוכל לעזור לך לתכנן ולארגן את היום שלך?',
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Scroll chat to bottom on updates
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend) => {
    const query = textToSend || inputText.trim();
    if (!query) return;

    if (!textToSend) setInputText('');

    // Append user message
    const userMsg = { isUser: true, text: query, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      // Gather context
      const currentBlocks = (draftSchedule?.blocks?.length > 0)
        ? draftSchedule.blocks
        : getTimelineBlocks();

      const contextHistory = messages.map((m) => ({
        isUser: m.isUser,
        text: m.text,
        action: m.action || null,
      }));

      // Gather Calori metrics and totals
      const meals = data?.calori?.meals || [];
      const workouts = data?.calori?.workouts || [];
      const dayHistory = data?.calori?.dayHistory;

      const totalCalories = meals.length > 0 ? meals.reduce((s, m) => s + (m.calories || 0), 0) : (dayHistory?.calories ?? 0);
      const totalProtein  = meals.length > 0 ? meals.reduce((s, m) => s + (m.protein  || 0), 0) : (dayHistory?.protein  ?? 0);
      const totalCarbs    = meals.length > 0 ? meals.reduce((s, m) => s + (m.carbs    || 0), 0) : (dayHistory?.carbs    ?? 0);
      const totalFats     = meals.length > 0 ? meals.reduce((s, m) => s + (m.fats     || 0), 0) : (dayHistory?.fats     ?? 0);
      const totalBurned   = workouts.length > 0 ? workouts.reduce((s, w) => s + (w.caloriesBurned || 0), 0) : (dayHistory?.workout_calories ?? 0);

      const caloriContext = {
        goals: {
          calories: data?.calori?.dailyGoal || 1300,
          protein: data?.calori?.proteinGoal || 0,
          carbs: data?.calori?.carbsGoal || 0,
          fats: data?.calori?.fatsGoal || 0,
        },
        totalsToday: {
          caloriesConsumed: totalCalories,
          proteinConsumed: totalProtein,
          carbsConsumed: totalCarbs,
          fatsConsumed: totalFats,
          caloriesBurned: totalBurned,
        },
        mealsToday: meals.map(m => ({
          name: m.name,
          calories: m.calories,
          protein: m.protein,
          time: m.timestamp ? m.timestamp.substring(11, 16) : ''
        })),
        workoutsToday: workouts.map(w => ({
          name: w.name,
          caloriesBurned: w.caloriesBurned,
          duration: w.durationMinutes,
          time: w.timestamp ? w.timestamp.substring(11, 16) : ''
        }))
      };

      // Active courses
      const coursesContext = (data?.courses || []).filter(c => !c.isArchived).map(c => ({
        id: c.id,
        name: c.name,
        progressSettings: c.progressSettings || { lecture: true, tutorial: true, homework: false, custom: true }
      }));

      // Upcoming exams sorted by date
      const upcomingExams = [];
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      (data?.courses || []).filter(c => !c.isArchived).forEach((course) => {
        // 1. Standard Moeds
        ['moedA', 'moedB', 'moedC'].forEach((moed) => {
          const examDate = course[moed] || course.exams?.[moed];
          if (examDate) {
            const dt = new Date(examDate);
            if (dt >= todayStart) {
              upcomingExams.push({
                courseName: course.name,
                moed: moed.replace('moed', ''),
                date: examDate.substring(0, 10),
              });
            }
          }
        });

        // 2. Custom Exams
        course.customExams?.forEach((exam) => {
          if (exam.date) {
            const dt = new Date(exam.date);
            if (dt >= todayStart) {
              upcomingExams.push({
                courseName: course.name,
                moed: exam.name,
                date: exam.date.substring(0, 10),
              });
            }
          }
        });
      });
      upcomingExams.sort((a, b) => a.date.localeCompare(b.date));

      const courseProgress = getCourseProgressSummary(data?.courses || [], data?.tasks || {});

      const res = await chatWithCoach({
        history: contextHistory,
        message: query,
        currentSchedule: currentBlocks,
        tasks: data?.personalTasks || [],
        notes: data?.quickNotes || [],
        settings: {
          wakeTime: data?.profile?.wakeTime || '07:00',
          sleepTime: data?.profile?.sleepTime || '23:00',
          shabbatMode: !!data?.profile?.shabbatMode,
        },
        shabbatTimes,
        courses: coursesContext,
        upcomingExams,
        caloriData: caloriContext,
        taskLists,
        noteCategories,
        events: data?.events || [],
        shoppingLists: data?.shoppingLists || [],
        courseProgress,
      });

      // Append bot response
      setMessages((prev) => [
        ...prev,
        {
          isUser: false,
          text: res.response,
          action: res.action || null,
          actionStatus: res.action ? 'pending' : null,
          timestamp: new Date(),
        },
      ]);
    } catch {
      toast.error('החיבור לשרת ה-AI נכשל');
      setMessages((prev) => [
        ...prev,
        {
          isUser: false,
          text: 'מצטער, חלה שגיאה בחיבור למאמן ה-AI. אנא ודא שמפתח ה-API תקין.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getTimelineBlocks = () => {
    // Generate static list of scheduled blocks for context
    const blocks = [];
    (data?.events || []).forEach((ev) => {
      if (ev.start && ev.start.startsWith(dateStr)) {
        blocks.push({
          id: ev.id,
          type: ev.type || 'event',
          title: ev.title,
          startTime: ev.start.substring(11, 16) || '09:00',
          endTime: ev.end ? ev.end.substring(11, 16) : '23:59',
          isLocked: true,
        });
      }
    });

    (data?.personalTasks || []).forEach((t) => {
      if (t.scheduledDate === dateStr && t.scheduledTime) {
        const duration = t.scheduledDuration || 60;
        const [h, m] = t.scheduledTime.split(':').map(Number);
        const endMin = h * 60 + m + duration;
        const endH = String(Math.floor(endMin / 60) % 24).padStart(2, '0');
        const endM = String(endMin % 60).padStart(2, '0');
        blocks.push({
          id: `task-${t.id}`,
          type: 'study',
          title: t.title,
          startTime: t.scheduledTime,
          endTime: `${endH}:${endM}`,
          duration,
          refId: t.id,
          isLocked: !!t.isLocked,
        });
      }
    });

    return blocks.sort((a, b) => a.startTime.localeCompare(b.startTime));
  };

  // Build an "HH:MM" string `mins` minutes after a start "HH:MM".
  const addMinutesToTime = (hhmm, mins) => {
    const [h, m] = (hhmm || '00:00').split(':').map(Number);
    const total = Math.min(23 * 60 + 59, h * 60 + m + mins);
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  };

  // Action Executor — the manager can drive the whole app from here.
  const handleExecuteAction = async (msgIndex, action) => {
    try {
      const { type, payload } = action;
      const today = dateStr;

      // ── Tasks ──────────────────────────────────────────────────────────
      if (type === 'add_task') {
        const listId = actionTargets[msgIndex] || payload.list || 'personal';
        const id = await addPersonalTask({
          title: payload.title,
          priority: payload.priority || 'med',
          dueDate: payload.dueDate || null,
          list: listId,
        });
        if (payload.time && id) {
          scheduleTask(id, payload.dueDate || today, payload.time, data?.profile?.studyBlockDuration || 90);
        }
        const listName = taskLists.find((l) => l.id === listId)?.name || '';
        toast.success(`המשימה "${payload.title}" נוספה ל${listName}`);
      } else if (type === 'complete_task') {
        togglePersonalTask(payload.taskId);
        toast.success('המשימה סומנה כבוצעה ✓');
      } else if (type === 'update_task') {
        const patch = {};
        if (payload.title) patch.title = payload.title;
        if (payload.priority) patch.priority = payload.priority;
        if (payload.dueDate !== undefined) patch.dueDate = payload.dueDate;
        updatePersonalTask(payload.taskId, patch);
        toast.success('המשימה עודכנה');
      } else if (type === 'delete_task') {
        await deletePersonalTask(payload.taskId);
        toast.success('המשימה נמחקה');
      } else if (type === 'star_task') {
        toggleStarPersonalTask(payload.taskId);
        toast.success('המשימה סומנה במועדפים ⭐');
      } else if (type === 'add_subtask') {
        addSubtask(payload.taskId, payload.title);
        toast.success('תת-משימה נוספה');
      } else if (type === 'schedule_task') {
        const duration = data?.profile?.studyBlockDuration || 90;
        scheduleTask(payload.taskId, payload.date || today, payload.time, duration);
        toast.success(`המשימה שובצה לשעה ${payload.time}`);
      } else if (type === 'unschedule_task') {
        unscheduleTask(payload.taskId);
        toast.success('המשימה הוסרה מהלו"ז');

      // ── Notes ──────────────────────────────────────────────────────────
      } else if (type === 'add_note') {
        const catId = actionTargets[msgIndex] || payload.categoryId || 'general';
        await addQuickNote({
          title: payload.title || 'פתק חדש',
          content: payload.content || '',
          categoryId: catId,
        });
        const catName = noteCategories.find((c) => c.id === catId)?.name || '';
        toast.success(`הפתק נוצר ב${catName}`);
      } else if (type === 'update_note') {
        const patch = {};
        if (payload.title !== undefined) patch.title = payload.title;
        if (payload.content !== undefined) patch.content = payload.content;
        if (payload.pinned !== undefined) patch.pinned = !!payload.pinned;
        updateQuickNote(payload.noteId, patch);
        toast.success('הפתק עודכן');
      } else if (type === 'delete_note') {
        await deleteQuickNote(payload.noteId);
        toast.success('הפתק נמחק');

      // ── Shopping ───────────────────────────────────────────────────────
      } else if (type === 'add_shopping_item') {
        const lists = data?.shoppingLists || [];
        let listId = payload.listId || (lists.find((l) => l.isActive) || lists[0])?.id;
        if (!listId) listId = await createShoppingList('רשימת קניות', '', []);
        addShoppingItem(listId, { name: payload.name, qty: payload.qty || null, unit: payload.unit || null });
        toast.success(`"${payload.name}" נוסף לרשימת הקניות`);
      } else if (type === 'create_shopping_list') {
        const id = await createShoppingList(payload.name || 'רשימת קניות', '', []);
        (payload.items || []).forEach((name) => {
          if (name && id) addShoppingItem(id, { name });
        });
        toast.success(`רשימת הקניות "${payload.name}" נוצרה`);

      // ── Events & workouts ──────────────────────────────────────────────
      } else if (type === 'add_event') {
        const start = `${payload.date || today}T${payload.time || '09:00'}:00`;
        const end = payload.endTime ? `${payload.date || today}T${payload.endTime}:00` : null;
        await addEvent({ title: payload.title, start, end, location: payload.location || '' });
        toast.success(`האירוע "${payload.title}" נוסף ללו"ז`);
      } else if (type === 'delete_event') {
        deleteEvent(payload.eventId);
        toast.success('האירוע נמחק');
      } else if (type === 'add_workout') {
        const time = payload.time || '18:00';
        const date = payload.date || today;
        const start = `${date}T${time}:00`;
        const end = `${date}T${addMinutesToTime(time, payload.durationMinutes || 60)}:00`;
        await addEvent({ title: payload.title || 'אימון', type: 'workout', start, end });
        toast.success(`אימון "${payload.title || 'אימון'}" נקבע ללו"ז`);

      // ── Daily schedule ─────────────────────────────────────────────────
      } else if (type === 'clear_schedule') {
        await clearDaySchedule(payload.date || today);
        toast.success('הלו"ז נמחק');
      } else if (type === 'lock_block') {
        if (payload.blockId.startsWith('draft-')) {
          const updatedBlocks = draftSchedule.blocks.map(b =>
            b.id === payload.blockId ? { ...b, isLocked: payload.locked } : b
          );
          setDraftSchedule({ ...draftSchedule, blocks: updatedBlocks });
        } else if (payload.blockId.startsWith('task-')) {
          updatePersonalTask(payload.blockId.replace('task-', ''), { isLocked: payload.locked });
        } else {
          updateEvent(payload.blockId, { isLocked: payload.locked });
        }
        toast.success(payload.locked ? 'הבלוק ננעל' : 'הבלוק שוחרר מנעילה');
      } else if (type === 'replan') {
        toast.info('מסדר את הלו"ז בעזרת ה-AI...');
        onReplan?.(payload.tuneCommand);
        onClose(); // Close chat to let user see AI planning in background
        return;

      // ── Courses ────────────────────────────────────────────────────────
      } else if (type === 'add_course') {
        await addCourse({
          name: payload.name,
          weeksCount: payload.weeksCount || 14,
          moedA: payload.moedA || '',
        });
        toast.success(`הקורס "${payload.name}" נוסף`);
      } else if (type === 'update_course') {
        const patch = {};
        if (payload.name) patch.name = payload.name;
        if (payload.moedA) patch.moedA = payload.moedA;
        if (payload.moedB) patch.moedB = payload.moedB;
        updateCourse(payload.courseId, patch);
        toast.success('הקורס עודכן');
      }

      // Mark action as executed in UI
      setMessages((prev) =>
        prev.map((m, idx) => (idx === msgIndex ? { ...m, actionStatus: 'success' } : m))
      );
    } catch {
      toast.error('ביצוע הפעולה נכשל');
    }
  };

  const handleCancelAction = (msgIndex) => {
    setMessages((prev) =>
      prev.map((m, idx) => (idx === msgIndex ? { ...m, actionStatus: 'cancelled' } : m))
    );
    toast.info('הפעולה בוטלה');
  };

  // Action chips list (Calori 1300 style)
  const SUGGESTION_CHIPS = [
    { label: 'סדר לי את היום', action: 'סדר לי את הלו"ז להיום בצורה חכמה' },
    { label: 'הוסף משימה', action: 'אני רוצה להוסיף משימה חדשה' },
    { label: 'הוסף לרשימת קניות', action: 'תוסיף חלב וביצים לרשימת הקניות' },
    { label: 'קבע לי אימון בערב', action: 'קבע לי אימון בשעה 18:00' },
    { label: 'כתוב לי פתק', action: 'תכתוב לי פתק חדש' },
    { label: 'מה יש לי היום?', action: 'מה המשימות והאירועים שלי להיום?' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop Blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/40 backdrop-blur-sm z-[90]"
          />

          {/* Slide-over chat container */}
          <motion.div
            initial={isRTL ? { x: '100%' } : { x: '-100%' }}
            animate={{ x: 0 }}
            exit={isRTL ? { x: '100%' } : { x: '-100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className={cn(
              "fixed inset-y-0 w-full sm:max-w-lg bg-card/95 backdrop-blur-xl border-t border-border z-[95] flex flex-col shadow-2xl overflow-hidden",
              isRTL ? "right-0 border-l" : "left-0 border-r"
            )}
            dir={isRTL ? 'rtl' : 'ltr'}
          >
            {/* Drawer Header */}
            <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between bg-card shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                  <Bot className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-extrabold text-foreground text-sm flex items-center gap-1">
                    המנהל האישי
                    <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
                  </h3>
                  <p className="text-[10px] text-muted-foreground font-medium">מנהל AI אישי לתזונה, כושר ולימודים</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 hover:bg-muted rounded-full transition-colors active:scale-95 cursor-pointer text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/10">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "flex gap-3 max-w-[85%] items-end",
                    msg.isUser ? "ms-auto flex-row-reverse" : "me-auto"
                  )}
                >
                  {/* Bot Avatar */}
                  {!msg.isUser && (
                    <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0 shadow-sm select-none">
                      <Bot className="w-3.5 h-3.5 text-primary" />
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div className="space-y-2">
                    <div
                      className={cn(
                        "p-3.5 rounded-2xl shadow-sm text-sm font-semibold leading-relaxed text-start",
                        msg.isUser
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-card border border-border/50 text-foreground rounded-bl-sm"
                      )}
                    >
                      {msg.text}
                    </div>

                    {/* Inline Action Card */}
                    {msg.action && (
                      <div className="rounded-2xl border border-border bg-card p-3 shadow-md space-y-3 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                          <span className="text-[11px] font-black text-muted-foreground tracking-wider uppercase">אישור פעולת מאמן</span>
                        </div>
                        <h4 className="font-extrabold text-xs text-foreground">{msg.action.title}</h4>

                        {/* List / category picker for add_task & add_note */}
                        {msg.actionStatus === 'pending' && (msg.action.type === 'add_task' || msg.action.type === 'add_note') && (() => {
                          const isNote = msg.action.type === 'add_note';
                          const options = isNote ? noteCategories : taskLists;
                          const fallback = msg.action.payload?.list || msg.action.payload?.categoryId || (isNote ? 'general' : 'personal');
                          const value = actionTargets[idx] ?? fallback;
                          return (
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-bold text-muted-foreground shrink-0">
                                {isNote ? 'קטגוריה:' : 'רשימה:'}
                              </span>
                              <select
                                value={value}
                                onChange={(e) => setActionTargets((prev) => ({ ...prev, [idx]: e.target.value }))}
                                className="flex-1 text-xs font-bold bg-secondary/60 border border-border rounded-lg px-2 py-1.5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
                              >
                                {options.map((o) => (
                                  <option key={o.id} value={o.id}>{o.name}</option>
                                ))}
                              </select>
                            </div>
                          );
                        })()}

                        {/* Interactive Buttons depending on Status */}
                        {msg.actionStatus === 'pending' ? (
                          <div className="flex gap-2">
                            {msg.action.type === 'navigate' ? (
                              <button
                                onClick={() => {
                                  setActiveCategory(msg.action.payload.targetPage);
                                  toast.success(`עבר לדף ${msg.action.payload.targetPage}`);
                                  setMessages((prev) =>
                                    prev.map((m, i) => (i === idx ? { ...m, actionStatus: 'success' } : m))
                                  );
                                  onClose();
                                }}
                                className="flex-1 py-1.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer"
                              >
                                {isRTL ? <ArrowLeft className="w-3.5 h-3.5" /> : <ArrowRight className="w-3.5 h-3.5" />}
                                {msg.action.title || 'עבור עכשיו'}
                              </button>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleExecuteAction(idx, msg.action)}
                                  className="flex-1 py-1.5 rounded-xl bg-[#059669] text-white font-bold text-xs hover:bg-[#059669]/90 active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  אשר ביצוע
                                </button>
                                <button
                                  onClick={() => handleCancelAction(idx)}
                                  className="py-1.5 px-3 rounded-xl border border-border bg-secondary text-foreground hover:bg-muted font-bold text-xs active:scale-95 transition-all cursor-pointer"
                                >
                                  בטל
                                </button>
                              </>
                            )}
                          </div>
                        ) : msg.actionStatus === 'success' ? (
                          <div className="flex items-center gap-1 text-[11px] font-black text-[#059669] bg-[#D1FAE5]/40 px-2 py-0.5 rounded-full w-max border border-[#059669]/20">
                            <Check className="w-3 h-3" />
                            בוצע בהצלחה ✅
                          </div>
                        ) : (
                          <div className="text-[11px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full w-max">
                            הפעולה בוטלה
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Bot Typing Wave (Calori 1300 style) */}
              {loading && (
                <div className="flex gap-3 max-w-[80%] items-end me-auto animate-in fade-in duration-300">
                  <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 shadow-sm">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="bg-card border border-border/50 p-3 rounded-2xl rounded-bl-sm flex items-center gap-1.5 shadow-sm">
                    <div className="flex items-center gap-1.5 py-1 px-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-primary/50 typing-dot" />
                      <div className="w-2.5 h-2.5 rounded-full bg-primary/70 typing-dot" />
                      <div className="w-2.5 h-2.5 rounded-full bg-primary typing-dot" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Calori 1300 Style Action Chips scroll view */}
            <div className="relative border-t border-border/20 bg-card py-2 shrink-0 select-none">
              {/* Fade Overlays */}
              <div className="absolute top-0 bottom-0 left-0 w-8 pointer-events-none z-10 bg-gradient-to-r from-card to-transparent" />
              <div className="absolute top-0 bottom-0 right-0 w-8 pointer-events-none z-10 bg-gradient-to-l from-card to-transparent" />

              <div className="flex gap-2 overflow-x-auto no-scrollbar scroll-smooth px-4">
                {SUGGESTION_CHIPS.map((chip, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(chip.action)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors text-[11px] font-bold text-primary whitespace-nowrap cursor-pointer active:scale-95"
                  >
                    <Sparkles className="w-3 h-3 shrink-0" />
                    <span>{chip.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-border/40 bg-card shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="הקלד הודעה למאמן..."
                  className="flex-1 rounded-2xl border border-border bg-secondary/50 px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent text-start"
                  disabled={loading}
                />
                <button
                  onClick={() => handleSend()}
                  disabled={loading || !inputText.trim()}
                  className="w-10 h-10 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 transition-all flex items-center justify-center shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
