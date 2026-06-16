// Zustand store wired to Firestore.
//
// Architecture:
//   * The `data` shape is preserved (same keys components already read) so that
//     existing UI code doesn't need to change.
//   * `data` is REBUILT from real-time Firestore listeners (cl_profile,
//     cl_courses, cl_courseTasks, cl_pomodoroSessions). Subscribe on login,
//     unsubscribe on logout.
//   * Every mutating action does two things:
//       1) Optimistic local update (so the UI feels instant)
//       2) Write to Firestore (the listener will reconcile if the write differs)
//   * Theme/language/pomodoro UI state stays purely local (localStorage).

import { create } from 'zustand';
import { generateInitialState, OWNER_UID } from '../data';
import {
  subscribeProfile,
  setProfile as fsSetProfile,
  subscribeCourses,
  setCourse as fsSetCourse,
  deleteCourse as fsDeleteCourse,
  subscribeCourseTasks,
  setCourseTask as fsSetCourseTask,
  deleteCourseTask as fsDeleteCourseTask,
  batchSetCourseTasks,
  subscribePomodoroSessions,
  addPomodoroSession as fsAddPomodoroSession,
  subscribeEvents,
  setEvent as fsSetEvent,
  deleteEvent as fsDeleteEvent,
  subscribePersonalTasks,
  setPersonalTask as fsSetPersonalTask,
  deletePersonalTask as fsDeletePersonalTask,
  subscribeNotes,
  setNote as fsSetNote,
  deleteNote as fsDeleteNote,
  subscribeTaskLists,
  setTaskList as fsSetTaskList,
  deleteTaskListAndMigrateTasks as fsDeleteTaskListAndMigrateTasks,
  subscribeNoteCategories,
  setNoteCategory as fsSetNoteCategory,
  deleteNoteCategoryAndMigrateNotes as fsDeleteNoteCategoryAndMigrateNotes,
  subscribeCategories,
  setCategory as fsSetCategory,
  deleteCategory as fsDeleteCategory,
  subscribeSchedule as fsSubscribeSchedule,
  setSchedule as fsSetSchedule,
  deleteSchedule as fsDeleteSchedule,
  mergeDailyAnalytics,
  increment,
  subscribeRecentDailyAnalytics,
  subscribeRecurringTasks as fsSubscribeRecurringTasks,
  setRecurringTask as fsSetRecurringTask,
  deleteRecurringTask as fsDeleteRecurringTask,
  newId,
  subscribeAiSuggestions,
  updateAiSuggestion,
  subscribeShoppingLists,
  setShoppingList as fsSetShoppingList,
  deleteShoppingList as fsDeleteShoppingList,
  subscribeGroceryDict,
  mergeGroceryDict,
} from '../lib/firestoreRepo';
import { applyExternalDict, genItemId } from '../lib/groceryCategories';
import { recurringInstancesForDate } from '../lib/recurrence';
import {
  dateKey,
  subscribeMealsForDay,
  subscribeWorkoutsForDay,
  subscribeDailyHistory,
  subscribeRecentDailyHistory,
  subscribeCaloriProfile,
  subscribeCoachSessionsForDay,
} from '../lib/caloriRepo';
import { generateDailySchedule } from '../lib/gemini';
import { chooseEngine, timeToMin, validateAndRepair } from '../lib/scheduleEngine';
import { format, parseISO, isValid } from 'date-fns';
import { toast } from './useToast';

// ---------- Notification settings (Phase 5) --------------------------------

// Default notification preferences. `enabled` stays false until the user opts
// in (which also triggers the browser permission prompt).
// Shabbat window for a given local date. The hadlaka/havdala timestamps span
// Friday→Saturday; only the boundary that actually falls on dateStr applies
// (setting both at once would forbid most of the day). Includes the ±1h buffer.
const shabbatBoundsForDate = (shabbatTimes, dateStr) => {
  if (!shabbatTimes?.start || !shabbatTimes?.end) return null;
  try {
    const sh = {};
    if (shabbatTimes.start.substring(0, 10) === dateStr) {
      sh.blockStartMin = Math.max(0, timeToMin(shabbatTimes.start.substring(11, 16)) - 60);
    }
    if (shabbatTimes.end.substring(0, 10) === dateStr) {
      sh.blockEndMin = Math.min(1439, timeToMin(shabbatTimes.end.substring(11, 16)) + 60);
    }
    return Object.keys(sh).length > 0 ? sh : null;
  } catch {
    return null;
  }
};

export const DEFAULT_NOTIFICATION_SETTINGS = {
  enabled: false,
  dailyDigest: true,
  dailyDigestTime: '08:00', // HH:mm — morning summary of today's schedule
  exams: true,
  examLeadDays: [7, 1], // remind N days before each exam (+ morning of)
  tasks: true, // personal task due reminders
  events: true, // event start reminders
  eventLeadMinutes: 30, // default minutes-before for events without an override
  weeklyTasks: false, // include weekly course tasks in the daily digest
};

const loadNotificationSettings = () => {
  try {
    const raw = localStorage.getItem('notificationSettings');
    if (!raw) return { ...DEFAULT_NOTIFICATION_SETTINGS };
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_NOTIFICATION_SETTINGS };
  }
};

// ---------- Helpers --------------------------------------------------------

// Build a stable id for a weekly seeded task (lecture/tutorial/homework).
const weeklyTaskId = (courseId, week, type, idx = 0) =>
  `${courseId}-w${week}-${type}-${idx}`;

// Build a global task id. Random suffix so two adds in the same ms don't clash.
const globalTaskId = (courseId, category) =>
  `${courseId}-${category}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Strip the firestore-only fields from a course doc to get the shape that
// `data.courses` expects (no embedded notes/links — those live in their own
// slices of `data`).
const stripCourseFields = (course) => {
  const { notes, links, ...rest } = course;
  return rest;
};

// Re-derive data.tasks and data.globalTasks from the flat cl_courseTasks list.
const rebuildTaskBuckets = (courseTaskDocs) => {
  const tasks = {};
  const globalTasks = {};

  for (const t of courseTaskDocs) {
    const { scope, week, category, courseId } = t;
    if (!courseId) continue;
    // The data we keep on each task item (drop scope/week/category/courseId
    // since they live in the parent map keys).
    const item = {
      id: t.id,
      type: t.type,
      label: t.label,
      checked: !!t.checked,
      files: Array.isArray(t.files) ? t.files : [],
      ...(t.order != null ? { order: t.order } : {}),
    };
    if (scope === 'weekly') {
      if (week == null) continue;
      tasks[courseId] ??= {};
      tasks[courseId][week] ??= [];
      tasks[courseId][week].push(item);
    } else if (scope === 'global') {
      if (!category) continue;
      globalTasks[courseId] ??= {};
      globalTasks[courseId][category] ??= [];
      globalTasks[courseId][category].push(item);
    }
  }

  // Sort each bucket by `order` if present, falling back to id for stability.
  const sortBucket = (arr) =>
    arr.sort((a, b) => {
      const ao = a.order ?? Infinity;
      const bo = b.order ?? Infinity;
      if (ao !== bo) return ao - bo;
      return String(a.id).localeCompare(String(b.id));
    });
  for (const cid of Object.keys(tasks))
    for (const w of Object.keys(tasks[cid])) sortBucket(tasks[cid][w]);
  for (const cid of Object.keys(globalTasks))
    for (const c of Object.keys(globalTasks[cid]))
      sortBucket(globalTasks[cid][c]);

  return { tasks, globalTasks };
};

// Seed the initial weekly tasks for a new course.
// `customSeeds` is an optional array of { type, label } — if provided, replaces defaults.
const buildInitialWeeklyTasksMap = (course, lang, customSeeds = null) => {
  const labels = {
    he: { lecture: 'הרצאה', tutorial: 'תרגול', homework: 'שיעורי בית' },
    en: { lecture: 'Lecture', tutorial: 'Tutorial', homework: 'Homework' },
  };
  const l = labels[lang] || labels.he;
  const seeds = customSeeds || [
    { type: 'lecture', label: l.lecture },
    { type: 'tutorial', label: l.tutorial },
    { type: 'homework', label: l.homework },
  ];
  const out = {};
  for (let week = 1; week <= course.weeksCount; week++) {
    seeds.forEach((s, idx) => {
      const id = weeklyTaskId(course.id, week, s.type, idx);
      out[id] = {
        courseId: course.id,
        scope: 'weekly',
        week,
        type: s.type,
        label: s.label,
        checked: false,
        files: [],
        order: idx,
      };
    });
  }
  return out;
};

// ---------- Store ----------------------------------------------------------

export const useStore = create((set, get) => ({
  // --- Data (mirror of Firestore) -----------------------------------------
  data: generateInitialState(),
  uid: null,
  hasCompletedOnboarding: undefined, // undefined = not yet determined
  dataLoaded: false, // true once the first Firestore snapshot has arrived
  _unsubs: [], // active onSnapshot cleanup fns

  // --- UI-only state ------------------------------------------------------
  activeCourse: null,
  activeCategory: 'overview',
  categoryHistory: [],
  theme: localStorage.getItem('theme') || 'light',
  language: localStorage.getItem('language') || 'he',
  pomodoro: { active: false, timeLeft: 25 * 60, mode: 'work', courseId: null },
  pomoSettings: { work: 25, break: 5 },
  sidebarOpen: false,
  showPomoSettings: false,
  showPomodoroModal: false,
  isUploading: false,
  // Phase 2 UI state
  showAddSheet: false,
  addSheetInitialTab: 'task', // 'event' | 'task' | 'note'
  addSheetPrefill: null, // optional { date, courseId, ... }
  // Phase 3: calori bridge UI state
  caloriDate: dateKey(), // currently-viewed day for calori data ('yyyy-MM-dd')
  _caloriDayUnsubs: [], // per-day calori listeners (re-subscribed on date change)
  // Phase 6a: schedule doc subscription (per-day, re-subscribed on date change)
  scheduleDate: dateKey(), // date currently subscribed for cl_schedule
  _scheduleUnsub: null,
  // Phase 5: notification settings (persisted to localStorage; FCM-ready)
  notificationSettings: loadNotificationSettings(),
  // AI Command Center draft state
  draftSchedule: { date: null, blocks: [], coachNote: '' },

  // Global "המנהל האישי" coach chat (opened from the floating left FAB on any screen).
  coachChatOpen: false,
  // Set by the chat's "replan" action when fired globally; CommandCenterView
  // consumes it on mount/visit to run the tune, then clears it.
  pendingTuneCommand: null,

  // Focus Tracking state
  focusTracking: {
    activeBlockId: null,
    isTracking: false,
    startTime: null,
    elapsed: 0,
    wasInterrupted: false,
  },

  // Google Calendar Integration
  googleCalendarToken: null,

  // ---------- Subscriptions lifecycle -----------------------------------

  initFromAuth: (uid) => {
    if (!uid) return;
    // Tear down any previous listeners before starting fresh (covers auth
    // state flapping where initFromAuth fires twice without a cleanup()).
    get()._unsubs.forEach((u) => { try { u(); } catch { /* ignore */ } });
    get()._caloriDayUnsubs.forEach((u) => { try { u(); } catch { /* ignore */ } });

    const unsubProfile = subscribeProfile(uid, (profile) => {
      set((state) => ({
        data: {
          ...state.data,
          profile: profile || state.data.profile || {
            displayName: '',
            academicYear: "שנה א'",
            semester: "סמסטר א'",
          },
        },
      }));
    });

    const unsubCourses = subscribeCourses(uid, (courseDocs) => {
      const courses = courseDocs.map(stripCourseFields);
      const notes = {};
      const links = {};
      for (const c of courseDocs) {
        notes[c.id] = c.notes || {};
        links[c.id] = c.links || {
          notebookLm: c.defaultNotebookLmLink || '',
          gemini: c.defaultGeminiLink || '',
          localFolder: c.defaultLocalFolder || '',
        };
      }
      set((state) => ({
        data: { ...state.data, courses, notes, links },
        // First time the courses listener fires we've seen Firestore's view of
        // the world — even if it's empty. That's our "data loaded" signal and
        // also the only honest way to decide whether onboarding should be shown.
        dataLoaded: true,
        hasCompletedOnboarding:
          state.hasCompletedOnboarding === true
            ? true
            : courses.length > 0,
      }));
    });

    const unsubCourseTasks = subscribeCourseTasks(uid, (taskDocs) => {
      const { tasks, globalTasks } = rebuildTaskBuckets(taskDocs);
      set((state) => ({ data: { ...state.data, tasks, globalTasks } }));
    });

    const unsubPomodoro = subscribePomodoroSessions(uid, (sessions) => {
      set((state) => ({
        data: { ...state.data, pomodoroSessions: sessions },
      }));
    });

    const unsubEvents = subscribeEvents(uid, (events) => {
      set((state) => ({ data: { ...state.data, events } }));
    });
    const unsubPersonalTasks = subscribePersonalTasks(uid, (personalTasks) => {
      set((state) => ({ data: { ...state.data, personalTasks } }));
    });
    const unsubNotes = subscribeNotes(uid, (quickNotes) => {
      set((state) => ({ data: { ...state.data, quickNotes } }));
    });

    const unsubTaskLists = subscribeTaskLists(uid, (taskListsDocs) => {
      if (taskListsDocs.length === 0) {
        fsSetTaskList(uid, 'personal', { name: 'המשימות שלי', createdAt: new Date().toISOString() }).catch(console.error);
      }
      set((state) => ({ data: { ...state.data, taskLists: taskListsDocs } }));
    });

    const unsubNoteCategories = subscribeNoteCategories(uid, (noteCategoriesDocs) => {
      if (noteCategoriesDocs.length === 0) {
        fsSetNoteCategory(uid, 'general', { name: 'כללי', createdAt: new Date().toISOString() }).catch(console.error);
      }
      set((state) => ({ data: { ...state.data, noteCategories: noteCategoriesDocs } }));
    });

    const unsubCategories = subscribeCategories(uid, (categoriesDocs) => {
      if (categoriesDocs.length === 0) {
        const defaults = [
          { id: 'studies', name: 'לימודים', color: 'var(--blue)', icon: 'Book', scope: 'global' },
          { id: 'work', name: 'עבודה', color: 'var(--orange)', icon: 'Briefcase', scope: 'global' },
          { id: 'personal', name: 'אישי', color: 'var(--green)', icon: 'User', scope: 'global' }
        ];
        defaults.forEach(cat => fsSetCategory(uid, cat.id, cat).catch(console.error));
      }
      set((state) => ({ data: { ...state.data, categories: categoriesDocs } }));
    });

    // Phase 6d: recurring task rules.
    const unsubRecurringTasks = fsSubscribeRecurringTasks(uid, (recurringTasks) => {
      set((state) => ({ data: { ...state.data, recurringTasks } }));
    });

    const unsubRecentDailyAnalytics = subscribeRecentDailyAnalytics(uid, (recentDailyAnalytics) => {
      set((state) => ({ data: { ...state.data, recentDailyAnalytics } }));
    }, 3); // Only need last 3 days for AI

    const unsubAiSuggestions = subscribeAiSuggestions(uid, (aiSuggestions) => {
      set((state) => ({ data: { ...state.data, aiSuggestions } }));
    });

    const unsubShoppingLists = subscribeShoppingLists(uid, (shoppingLists) => {
      set((state) => ({ data: { ...state.data, shoppingLists } }));
    });

    // Seed the local grocery dict cache from Firestore so AI learnings flow
    // between devices.
    const unsubGroceryDict = subscribeGroceryDict(uid, (dict) => {
      applyExternalDict(dict);
    });

    // ── Calori bridge (READ-ONLY) ──
    // Recent history is date-range independent; subscribe once here.
    const unsubRecentCalori = subscribeRecentDailyHistory(uid, (recentHistory) => {
      set((state) => ({
        data: { ...state.data, calori: { ...state.data.calori, recentHistory } },
      }));
    });

    const unsubCaloriProfile = subscribeCaloriProfile(uid, (caloriProfile) => {
      if (caloriProfile) {
        set((state) => {
          const photoURL = caloriProfile.profile?.photoURL || state.data.profile?.photoURL;
          return {
            data: {
              ...state.data,
              profile: {
                ...state.data.profile,
                ...(photoURL ? { photoURL } : {}),
              },
              calori: {
                ...state.data.calori,
                dailyGoal: Number(caloriProfile.daily_goal) || 1300,
                proteinGoal: Number(caloriProfile.protein_goal) || 0,
                carbsGoal: Number(caloriProfile.carbs_goal) || 0,
                fatsGoal: Number(caloriProfile.fats_goal) || 0,
                stepsGoal: Number(caloriProfile.steps_goal) || 10000,
                weight: caloriProfile.weight != null ? Number(caloriProfile.weight) : null,
                targetWeight: caloriProfile.target_weight != null ? Number(caloriProfile.target_weight) : null,
              },
            },
          };
        });
      }
    });

    set({
      uid,
      _unsubs: [
        unsubProfile,
        unsubCourses,
        unsubCourseTasks,
        unsubPomodoro,
        unsubEvents,
        unsubPersonalTasks,
        unsubNotes,
        unsubRecentCalori,
        unsubCaloriProfile,
        unsubTaskLists,
        unsubNoteCategories,
        unsubCategories,
        unsubRecurringTasks,
        unsubRecentDailyAnalytics,
        unsubAiSuggestions,
        unsubShoppingLists,
        unsubGroceryDict,
      ],
    });

    // Subscribe to the currently-selected calori day (today by default).
    get().subscribeCaloriDay(get().caloriDate);
    // Phase 6a: subscribe to the schedule doc for today.
    get().subscribeScheduleDay(get().scheduleDate);
  },

  cleanup: () => {
    get()._unsubs.forEach((u) => { try { u(); } catch { /* ignore */ } });
    get()._caloriDayUnsubs.forEach((u) => { try { u(); } catch { /* ignore */ } });
    try { get()._scheduleUnsub && get()._scheduleUnsub(); } catch { /* ignore */ }
    set({
      uid: null,
      _unsubs: [],
      _caloriDayUnsubs: [],
      _scheduleUnsub: null,
      data: generateInitialState(),
      hasCompletedOnboarding: undefined,
      dataLoaded: false,
      activeCourse: null,
      activeCategory: 'overview',
      categoryHistory: [],
      caloriDate: dateKey(),
      scheduleDate: dateKey(),
    });
  },

  // ---------- Calori bridge (READ-ONLY) ---------------------------------

  // (Re)subscribe the per-day calori listeners for a given 'yyyy-MM-dd' date.
  subscribeCaloriDay: (date) => {
    const { uid } = get();
    if (!uid) return;
    // Tear down previous day listeners.
    get()._caloriDayUnsubs.forEach((u) => { try { u(); } catch { /* ignore */ } });

    const unsubMeals = subscribeMealsForDay(uid, date, (meals) => {
      set((state) => ({
        data: { ...state.data, calori: { ...state.data.calori, meals } },
      }));
    });
    const unsubWorkouts = subscribeWorkoutsForDay(uid, date, (workouts) => {
      set((state) => ({
        data: { ...state.data, calori: { ...state.data.calori, workouts } },
      }));
    });
    const unsubDayHistory = subscribeDailyHistory(uid, date, (dayHistory) => {
      set((state) => ({
        data: { ...state.data, calori: { ...state.data.calori, dayHistory } },
      }));
    });
    const unsubCoachSessions = subscribeCoachSessionsForDay(uid, date, (coachSessions) => {
      set((state) => ({
        data: { ...state.data, calori: { ...state.data.calori, coachSessions } },
      }));
    });

    set({ _caloriDayUnsubs: [unsubMeals, unsubWorkouts, unsubDayHistory, unsubCoachSessions] });
  },

  // Change the viewed calori day and re-subscribe.
  setCaloriDate: (date) => {
    set({ caloriDate: date });
    get().subscribeCaloriDay(date);
  },

  // ---------- Phase 6a: Schedule subscription + mutations ---------------

  subscribeScheduleDay: (date) => {
    const { uid } = get();
    if (!uid) return;
    try { get()._scheduleUnsub && get()._scheduleUnsub(); } catch { /* ignore */ }
    const unsub = fsSubscribeSchedule(uid, date, (doc) => {
      // Tag the doc with its date so views can ignore a stale doc while
      // navigating between days (snapshot is async).
      set((state) => ({ data: { ...state.data, schedule: doc ? { ...doc, _docDate: date } : null } }));
    });
    set({ _scheduleUnsub: unsub });
  },

  setScheduleDate: (date) => {
    set({ scheduleDate: date });
    get().subscribeScheduleDay(date);
  },

  // Write the full block list (and optional coachNote) to cl_schedule/{date}.
  // This is the "save 100% directly" path — no decomposition into events/tasks.
  // For source==='task' blocks, also mirror placement back to the task doc so
  // legacy task-list views keep working.
  saveSchedule: async (dateStr, blocks, coachNote = '') => {
    const { uid } = get();
    if (!uid) return;
    const now = new Date().toISOString();
    await fsSetSchedule(uid, dateStr, {
      blocks,
      coachNote: coachNote || '',
      generatedAt: now,
      source: 'mixed',
    });
    // Mirror task placement (one-way: schedule -> task).
    for (const b of blocks) {
      if (b.source === 'task' && b.refId) {
        await fsSetPersonalTask(uid, b.refId, {
          scheduledDate: dateStr,
          scheduledTime: b.startTime,
          scheduledDuration: b.duration || 60,
          updatedAt: now,
        }).catch(console.error);
      }
    }
    // Phase 6e: capture planned study minutes (authoritative — re-plans
    // overwrite, since a fresh save represents the latest plan).
    const planned = (blocks || []).reduce((sum, b) => {
      if (b.type !== 'study') return sum;
      const dur = b.duration ||
        (b.startTime && b.endTime ? timeToMin(b.endTime) - timeToMin(b.startTime) : 0);
      return sum + (dur > 0 ? dur : 0);
    }, 0);
    mergeDailyAnalytics(uid, dateStr, {
      plannedStudyMinutes: planned,
    }).catch(console.error);
  },

  // Patch a single block in the schedule doc (used by lock toggle, drag, accordion).
  updateScheduleBlock: async (dateStr, blockId, patch) => {
    const { uid, data } = get();
    if (!uid) return;
    const current = data?.schedule?.blocks || [];
    const next = current.map((b) => (b.id === blockId ? { ...b, ...patch } : b));
    await fsSetSchedule(uid, dateStr, { blocks: next });
    // Mirror time changes back to task doc if applicable.
    const updated = next.find((b) => b.id === blockId);
    if (updated && updated.source === 'task' && updated.refId &&
        (patch.startTime || patch.endTime || patch.duration)) {
      await fsSetPersonalTask(uid, updated.refId, {
        scheduledDate: dateStr,
        scheduledTime: updated.startTime,
        scheduledDuration: updated.duration || 60,
        updatedAt: new Date().toISOString(),
      }).catch(console.error);
    }
  },

  // Delete the schedule doc for a date.
  deleteSchedule: async (dateStr) => {
    const { uid } = get();
    if (!uid) return;
    await fsDeleteSchedule(uid, dateStr);
  },

  // ---------- Plain setters ---------------------------------------------

  setData: (newData) => set({ data: newData }),
  setHasCompletedOnboarding: (val) => set({ hasCompletedOnboarding: val }),
  setActiveCourse: (course) => set({ activeCourse: course }),
  setActiveCategory: (category) =>
    set((state) => ({
      activeCategory: category,
      // Track navigation so sub-pages (settings/calori/tasks/…) get a real back
      // button. Skip no-op repeats; cap depth.
      categoryHistory:
        category === state.activeCategory
          ? state.categoryHistory
          : [...state.categoryHistory, state.activeCategory].slice(-25),
    })),

  // Pop the last screen; default to the home overview when history is empty.
  goBack: () =>
    set((state) => {
      if (state.categoryHistory.length === 0) return { activeCategory: 'overview' };
      const prev = state.categoryHistory[state.categoryHistory.length - 1];
      return { activeCategory: prev, categoryHistory: state.categoryHistory.slice(0, -1) };
    }),
  openCoachChat: () => set({ coachChatOpen: true }),
  closeCoachChat: () => set({ coachChatOpen: false }),
  setPendingTuneCommand: (cmd) => set({ pendingTuneCommand: cmd }),
  setSidebarOpen: (isOpen) => set({ sidebarOpen: isOpen }),
  setShowPomodoroModal: (isOpen) => set({ showPomodoroModal: isOpen }),
  setIsUploading: (status) => set({ isUploading: status }),
  setGoogleCalendarToken: (token) => set({ googleCalendarToken: token }),
  setTheme: (theme) => {
    try {
      localStorage.setItem('theme', theme);
    } catch (e) {
      console.warn('localStorage theme failed');
    }
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    set({ theme });
  },
  setLanguage: (language) => {
    try {
      localStorage.setItem('language', language);
    } catch (e) {
      console.warn('localStorage language failed');
    }
    set({ language });
  },
  setPomodoro: (pomoUpdater) =>
    set((state) => ({
      pomodoro:
        typeof pomoUpdater === 'function' ? pomoUpdater(state.pomodoro) : pomoUpdater,
    })),
  setPomoSettings: (settings) => set({ pomoSettings: settings }),
  setShowPomoSettings: (show) => set({ showPomoSettings: show }),

  // Phase 5: merge-update notification settings + persist to localStorage.
  setNotificationSettings: (partial) =>
    set((state) => {
      const next = { ...state.notificationSettings, ...partial };
      try { localStorage.setItem('notificationSettings', JSON.stringify(next)); } catch { /* ignore */ }
      return { notificationSettings: next };
    }),

  // Open/close the unified Add-Item bottom sheet.
  openAddSheet: (tab = 'task', prefill = null) =>
    set({ showAddSheet: true, addSheetInitialTab: tab, addSheetPrefill: prefill }),
  closeAddSheet: () =>
    set({ showAddSheet: false, addSheetPrefill: null }),

  // ---------- Profile -----------------------------------------------------

  setProfile: (profileData) => {
    set((state) => {
      const currentProfile = state.data.profile || {};
      // Deep merge coachNotes to prevent wiping other days when updating locally
      const mergedCoachNotes = profileData.coachNotes
        ? { ...(currentProfile.coachNotes || {}), ...profileData.coachNotes }
        : currentProfile.coachNotes;

      const mergedProfile = { ...currentProfile, ...profileData };
      if (profileData.coachNotes) {
        mergedProfile.coachNotes = mergedCoachNotes;
      }

      return { data: { ...state.data, profile: mergedProfile } };
    });
    const { uid } = get();
    if (uid) fsSetProfile(uid, profileData).catch(console.error);
  },

  // ---------- Pomodoro sessions ------------------------------------------

  addPomodoroSession: (session) => {
    const { uid } = get();
    if (!session.courseId) return;
    if (!uid) return;
    fsAddPomodoroSession(uid, session).catch(console.error);
    // No optimistic update needed — listener will pick it up shortly.
  },

  // ---------- Onboarding -------------------------------------------------

  // seeds = optional [{ type, label }] array — applies to every selected course.
  completeOnboarding: async (profileData, selectedCourses, seeds = null) => {
    const { uid, language } = get();
    if (!uid) return;
    const lang = language || 'he';
    const isOwner = uid === OWNER_UID;

    for (const course of selectedCourses) {
      const notebookLmLink = isOwner ? (course.defaultNotebookLmLink || '') : '';
      const geminiLink = isOwner ? (course.defaultGeminiLink || '') : '';
      const courseDoc = {
        name: course.name,
        defaultNotebookLmLink: notebookLmLink,
        defaultGeminiLink: geminiLink,
        defaultLocalFolder: course.defaultLocalFolder || '',
        weeksCount: course.weeksCount,
        exams: course.exams || { moedA: null, moedB: null, moedC: null },
        isArchived: false,
        links: {
          notebookLm: notebookLmLink,
          gemini: geminiLink,
          localFolder: course.defaultLocalFolder || '',
        },
        notes: {},
      };
      await fsSetCourse(uid, course.id, courseDoc);
      const tasksMap = buildInitialWeeklyTasksMap(course, lang, seeds);
      await batchSetCourseTasks(uid, tasksMap);
    }

    await fsSetProfile(uid, { ...profileData, hasCompletedOnboarding: true });
    set({ hasCompletedOnboarding: true });
  },

  // ---------- AI Suggestions ----------------------------------------------

  setAiSuggestionStatus: async (suggestionId, status) => {
    const { uid } = get();
    if (!uid) return;
    set((state) => {
      // Optimistic remove if no longer pending
      const suggestions = (state.data.aiSuggestions || []).filter(s => s.id !== suggestionId);
      return { data: { ...state.data, aiSuggestions: suggestions } };
    });
    await updateAiSuggestion(uid, suggestionId, { status }).catch(console.error);
  },

  // ---------- Shopping lists (cl_shoppingLists) -------------------------
  // Items live as an array inside each list doc. Every mutation rewrites the
  // items array (lists stay small — typically 20-40 items).

  createShoppingList: async (name, rawText, items) => {
    const { uid, data } = get();
    if (!uid) return null;
    const id = newId(uid, 'shoppingList');
    const now = new Date().toISOString();
    const list = {
      name: name || 'רשימת קניות',
      createdAt: now,
      updatedAt: now,
      isActive: true,
      items: items || [],
      rawText: rawText || '',
    };
    // Optimistic: deactivate previous active lists, prepend the new one.
    set((state) => ({
      data: {
        ...state.data,
        shoppingLists: [
          { id, ...list },
          ...state.data.shoppingLists.map((l) =>
            l.isActive ? { ...l, isActive: false } : l
          ),
        ],
      },
    }));
    // Persist: deactivate old actives, then create.
    for (const l of data.shoppingLists) {
      if (l.isActive) {
        fsSetShoppingList(uid, l.id, { isActive: false, updatedAt: now }).catch(console.error);
      }
    }
    await fsSetShoppingList(uid, id, list).catch(console.error);
    return id;
  },

  // Compute the next items array INSIDE the set updater so rapid sequential
  // mutations chain off each other's result instead of all reading the same
  // pre-mutation snapshot (which would clobber earlier writes).
  _patchShoppingItems: (listId, mutate) => {
    const { uid } = get();
    if (!uid) return;
    const now = new Date().toISOString();
    let nextItems = null;
    set((state) => ({
      data: {
        ...state.data,
        shoppingLists: state.data.shoppingLists.map((l) => {
          if (l.id !== listId) return l;
          nextItems = mutate(l.items || []);
          return { ...l, items: nextItems, updatedAt: now };
        }),
      },
    }));
    if (nextItems) fsSetShoppingList(uid, listId, { items: nextItems, updatedAt: now }).catch(console.error);
  },

  toggleShoppingItem: (listId, itemId) =>
    get()._patchShoppingItems(listId, (items) =>
      items.map((it) => (it.id === itemId ? { ...it, checked: !it.checked } : it))
    ),

  addShoppingItem: (listId, item) =>
    get()._patchShoppingItems(listId, (items) => [
      ...items,
      {
        id: genItemId(),
        name: item.name || '',
        category: item.category || 'other',
        checked: false,
        qty: item.qty || null,
        unit: item.unit || null,
        addedAt: new Date().toISOString(),
      },
    ]),

  updateShoppingItem: (listId, itemId, patch) =>
    get()._patchShoppingItems(listId, (items) =>
      items.map((it) => (it.id === itemId ? { ...it, ...patch } : it))
    ),

  removeShoppingItem: (listId, itemId) =>
    get()._patchShoppingItems(listId, (items) =>
      items.filter((it) => it.id !== itemId)
    ),

  clearShoppingList: (listId) => {
    const { uid } = get();
    if (!uid) return;
    const now = new Date().toISOString();
    set((state) => ({
      data: {
        ...state.data,
        shoppingLists: state.data.shoppingLists.map((l) =>
          l.id === listId ? { ...l, isActive: false, updatedAt: now } : l
        ),
      },
    }));
    fsSetShoppingList(uid, listId, { isActive: false, updatedAt: now }).catch(console.error);
  },

  reopenShoppingList: (listId) => {
    const { uid, data } = get();
    if (!uid) return;
    const now = new Date().toISOString();
    set((state) => ({
      data: {
        ...state.data,
        shoppingLists: state.data.shoppingLists.map((l) =>
          l.id === listId
            ? { ...l, isActive: true, updatedAt: now }
            : l.isActive
            ? { ...l, isActive: false }
            : l
        ),
      },
    }));
    for (const l of data.shoppingLists) {
      if (l.isActive && l.id !== listId) {
        fsSetShoppingList(uid, l.id, { isActive: false, updatedAt: now }).catch(console.error);
      }
    }
    fsSetShoppingList(uid, listId, { isActive: true, updatedAt: now }).catch(console.error);
  },

  deleteShoppingList: (listId) => {
    const { uid } = get();
    if (!uid) return;
    set((state) => ({
      data: {
        ...state.data,
        shoppingLists: state.data.shoppingLists.filter((l) => l.id !== listId),
      },
    }));
    fsDeleteShoppingList(uid, listId).catch(console.error);
  },

  renameShoppingList: (listId, name) => {
    const { uid } = get();
    if (!uid) return;
    const now = new Date().toISOString();
    set((state) => ({
      data: {
        ...state.data,
        shoppingLists: state.data.shoppingLists.map((l) =>
          l.id === listId ? { ...l, name, updatedAt: now } : l
        ),
      },
    }));
    fsSetShoppingList(uid, listId, { name, updatedAt: now }).catch(console.error);
  },

  // "Active" is now just a single optional pin (decoupled from which list is
  // being viewed/edited). Setting one active clears the flag on the previous.
  setActiveShoppingList: (listId) => {
    const { uid, data } = get();
    if (!uid) return;
    const now = new Date().toISOString();
    set((state) => ({
      data: {
        ...state.data,
        shoppingLists: state.data.shoppingLists.map((l) =>
          l.id === listId
            ? { ...l, isActive: true, updatedAt: now }
            : l.isActive
            ? { ...l, isActive: false }
            : l
        ),
      },
    }));
    for (const l of data.shoppingLists) {
      if (l.isActive && l.id !== listId) {
        fsSetShoppingList(uid, l.id, { isActive: false, updatedAt: now }).catch(console.error);
      }
    }
    fsSetShoppingList(uid, listId, { isActive: true, updatedAt: now }).catch(console.error);
  },

  unsetActiveShoppingList: (listId) => {
    const { uid } = get();
    if (!uid) return;
    const now = new Date().toISOString();
    set((state) => ({
      data: {
        ...state.data,
        shoppingLists: state.data.shoppingLists.map((l) =>
          l.id === listId ? { ...l, isActive: false, updatedAt: now } : l
        ),
      },
    }));
    fsSetShoppingList(uid, listId, { isActive: false, updatedAt: now }).catch(console.error);
  },

  // Move an item to `toCategory` at position `toIndex` within that category
  // (also handles same-category reordering). Group order is derived from the
  // category enum; within-group order is the array order, so we just splice the
  // item into the right spot among its destination-category siblings.
  moveShoppingItem: (listId, itemId, toCategory, toIndex) =>
    get()._patchShoppingItems(listId, (items) => {
      const moved = items.find((i) => i.id === itemId);
      if (!moved) return items;
      const without = items.filter((i) => i.id !== itemId);
      const updated = { ...moved, category: toCategory };
      const destItems = without.filter((i) => i.category === toCategory);
      const target = destItems[toIndex] || null; // the item `updated` should precede
      const out = [];
      let inserted = false;
      for (const it of without) {
        if (target && it.id === target.id) { out.push(updated); inserted = true; }
        out.push(it);
      }
      if (!inserted) out.push(updated);
      return out;
    }),

  resetShoppingChecks: (listId) =>
    get()._patchShoppingItems(listId, (items) =>
      items.map((it) => (it.checked ? { ...it, checked: false } : it))
    ),

  // Clone a list (all items reset to unchecked) so a weekly shopper rebuilds a
  // past list in one tap. Returns the new id.
  duplicateShoppingList: async (listId) => {
    const { uid, data } = get();
    if (!uid) return null;
    const src = data.shoppingLists.find((l) => l.id === listId);
    if (!src) return null;
    const id = newId(uid, 'shoppingList');
    const now = new Date().toISOString();
    const copy = {
      name: `${src.name} (עותק)`,
      createdAt: now,
      updatedAt: now,
      isActive: false,
      items: (src.items || []).map((it) => ({ ...it, id: genItemId(), checked: false })),
      rawText: src.rawText || '',
    };
    set((state) => ({
      data: { ...state.data, shoppingLists: [{ id, ...copy }, ...state.data.shoppingLists] },
    }));
    await fsSetShoppingList(uid, id, copy).catch(console.error);
    return id;
  },

  // Persist a learned item→category mapping to Firestore (cross-device sync).
  learnGroceryItems: (learnedMap) => {
    const { uid } = get();
    if (!uid || !learnedMap || Object.keys(learnedMap).length === 0) return;
    mergeGroceryDict(uid, learnedMap).catch(console.error);
  },

  // ---------- Courses ----------------------------------------------------

  addCourse: async (course, seeds = null) => {
    const { uid, language } = get();
    if (!uid) return;
    const lang = language || 'he';
    const courseId = course.id || `course-${Date.now()}`;

    const courseDoc = {
      name: course.name,
      defaultNotebookLmLink: course.defaultNotebookLmLink || '',
      defaultGeminiLink: course.defaultGeminiLink || '',
      defaultLocalFolder: course.defaultLocalFolder || '',
      weeksCount: course.weeksCount,
      exams: course.exams || {
        moedA: course.moedA || null,
        moedB: course.moedB || null,
        moedC: course.moedC || null,
      },
      isArchived: false,
      links: {
        notebookLm: course.defaultNotebookLmLink || '',
        gemini: course.defaultGeminiLink || '',
        localFolder: course.defaultLocalFolder || '',
      },
      notes: {},
    };
    await fsSetCourse(uid, courseId, courseDoc).catch(console.error);

    const tasksMap = buildInitialWeeklyTasksMap({ ...course, id: courseId }, lang, seeds);
    await batchSetCourseTasks(uid, tasksMap).catch(console.error);
  },

  updateCourse: (courseId, updates) => {
    const { uid } = get();
    set((state) => {
      const courses = state.data.courses.map((c) =>
        c.id === courseId ? { ...c, ...updates } : c,
      );
      return { data: { ...state.data, courses } };
    });
    if (uid) fsSetCourse(uid, courseId, updates).catch(console.error);
  },

  archiveCourse: (courseId, isArchived) => {
    const { uid } = get();
    set((state) => {
      const courses = state.data.courses.map((c) =>
        c.id === courseId ? { ...c, isArchived } : c,
      );
      return { data: { ...state.data, courses } };
    });
    if (uid) fsSetCourse(uid, courseId, { isArchived }).catch(console.error);
  },

  // ---------- Weekly tasks ------------------------------------------------

  toggleTask: (courseId, week, taskId) => {
    const { uid } = get();
    let newChecked = null;
    set((state) => {
      const newData = { ...state.data };
      const courseTasks = { ...(newData.tasks[courseId] || {}) };
      const weekTasks = [...(courseTasks[week] || [])];
      const i = weekTasks.findIndex((t) => t.id === taskId);
      if (i !== -1) {
        newChecked = !weekTasks[i].checked;
        weekTasks[i] = { ...weekTasks[i], checked: newChecked };
      }
      courseTasks[week] = weekTasks;
      newData.tasks = { ...newData.tasks, [courseId]: courseTasks };
      return { data: newData };
    });
    if (uid && newChecked != null)
      fsSetCourseTask(uid, taskId, { checked: newChecked }).catch(console.error);
  },

  attachFileToTask: (courseId, week, taskId, file) => {
    const { uid } = get();
    let newFiles = null;
    set((state) => {
      const newData = { ...state.data };
      const courseTasks = { ...(newData.tasks[courseId] || {}) };
      const weekTasks = [...(courseTasks[week] || [])];
      const i = weekTasks.findIndex((t) => t.id === taskId);
      if (i !== -1) {
        newFiles = [...(weekTasks[i].files || []), file];
        weekTasks[i] = { ...weekTasks[i], files: newFiles };
      }
      courseTasks[week] = weekTasks;
      newData.tasks = { ...newData.tasks, [courseId]: courseTasks };
      return { data: newData };
    });
    if (uid && newFiles)
      fsSetCourseTask(uid, taskId, { files: newFiles }).catch(console.error);
  },

  removeFileFromTask: (courseId, week, taskId, filePath) => {
    const { uid } = get();
    let newFiles = null;
    set((state) => {
      const newData = { ...state.data };
      const courseTasks = { ...(newData.tasks[courseId] || {}) };
      const weekTasks = [...(courseTasks[week] || [])];
      const i = weekTasks.findIndex((t) => t.id === taskId);
      if (i !== -1 && weekTasks[i].files) {
        newFiles = weekTasks[i].files.filter((f) => f.path !== filePath);
        weekTasks[i] = { ...weekTasks[i], files: newFiles };
      }
      courseTasks[week] = weekTasks;
      newData.tasks = { ...newData.tasks, [courseId]: courseTasks };
      return { data: newData };
    });
    if (uid && newFiles)
      fsSetCourseTask(uid, taskId, { files: newFiles }).catch(console.error);
  },

  reorderTasks: (courseId, week, newTasksOrder) => {
    const { uid } = get();
    set((state) => {
      const newData = { ...state.data };
      const courseTasks = { ...(newData.tasks[courseId] || {}) };
      courseTasks[week] = newTasksOrder;
      newData.tasks = { ...newData.tasks, [courseId]: courseTasks };
      return { data: newData };
    });
    if (uid) {
      const updates = {};
      newTasksOrder.forEach((t, idx) => {
        updates[t.id] = { order: idx };
      });
      batchSetCourseTasks(uid, updates).catch(console.error);
    }
  },

  moveTaskBetweenWeeks: (courseId, sourceWeek, destWeek, taskId, sourceIndex, destIndex) => {
    const { uid } = get();
    let updatedTaskId = null;
    let updatedFields = null;
    let sourceListAfter = null;
    let destListAfter = null;

    set((state) => {
      const newData = { ...state.data };
      const courseTasks = { ...(newData.tasks[courseId] || {}) };
      const sourceList = [...(courseTasks[sourceWeek] || [])];
      const destList =
        sourceWeek === destWeek ? sourceList : [...(courseTasks[destWeek] || [])];
      const [moved] = sourceList.splice(sourceIndex, 1);
      destList.splice(destIndex, 0, moved);
      courseTasks[sourceWeek] = sourceList;
      courseTasks[destWeek] = destList;
      newData.tasks = { ...newData.tasks, [courseId]: courseTasks };

      updatedTaskId = moved.id;
      updatedFields = { week: destWeek };
      sourceListAfter = sourceList;
      destListAfter = destList;
      return { data: newData };
    });

    if (uid && updatedTaskId) {
      const updates = { [updatedTaskId]: updatedFields };
      // Re-index the impacted weeks' orders.
      sourceListAfter.forEach((t, idx) => {
        updates[t.id] = { ...(updates[t.id] || {}), order: idx };
      });
      destListAfter.forEach((t, idx) => {
        updates[t.id] = { ...(updates[t.id] || {}), order: idx };
      });
      batchSetCourseTasks(uid, updates).catch(console.error);
    }
  },

  // ---------- Global tasks ------------------------------------------------

  addGlobalTask: (courseId, category, taskLabel, files = []) => {
    const { uid } = get();
    const id = globalTaskId(courseId, category);
    const newTask = { id, label: taskLabel, checked: false, files };

    set((state) => {
      const newData = { ...state.data };
      const courseGlobal = { ...(newData.globalTasks[courseId] || {}) };
      const cat = [...(courseGlobal[category] || []), newTask];
      courseGlobal[category] = cat;
      newData.globalTasks = { ...newData.globalTasks, [courseId]: courseGlobal };
      return { data: newData };
    });

    if (uid) {
      fsSetCourseTask(uid, id, {
        courseId,
        scope: 'global',
        category,
        label: taskLabel,
        checked: false,
        files,
        order: Date.now(),
      }).catch(console.error);
    }
  },

  deleteGlobalTask: (courseId, category, taskId) => {
    const { uid } = get();
    set((state) => {
      const newData = { ...state.data };
      const courseGlobal = { ...(newData.globalTasks[courseId] || {}) };
      courseGlobal[category] = (courseGlobal[category] || []).filter(
        (t) => t.id !== taskId,
      );
      newData.globalTasks = { ...newData.globalTasks, [courseId]: courseGlobal };
      return { data: newData };
    });
    if (uid) fsDeleteCourseTask(uid, taskId).catch(console.error);
  },

  toggleGlobalTask: (courseId, category, taskId) => {
    const { uid } = get();
    let newChecked = null;
    set((state) => {
      const newData = { ...state.data };
      const courseGlobal = { ...(newData.globalTasks[courseId] || {}) };
      courseGlobal[category] = (courseGlobal[category] || []).map((t) => {
        if (t.id === taskId) {
          newChecked = !t.checked;
          return { ...t, checked: newChecked };
        }
        return t;
      });
      newData.globalTasks = { ...newData.globalTasks, [courseId]: courseGlobal };
      return { data: newData };
    });
    if (uid && newChecked != null)
      fsSetCourseTask(uid, taskId, { checked: newChecked }).catch(console.error);
  },

  attachFileToGlobalTask: (courseId, category, taskId, file) => {
    const { uid } = get();
    let newFiles = null;
    set((state) => {
      const newData = { ...state.data };
      const courseGlobal = { ...(newData.globalTasks[courseId] || {}) };
      courseGlobal[category] = (courseGlobal[category] || []).map((t) => {
        if (t.id === taskId) {
          newFiles = [...(t.files || []), file];
          return { ...t, files: newFiles };
        }
        return t;
      });
      newData.globalTasks = { ...newData.globalTasks, [courseId]: courseGlobal };
      return { data: newData };
    });
    if (uid && newFiles)
      fsSetCourseTask(uid, taskId, { files: newFiles }).catch(console.error);
  },

  removeFileFromGlobalTask: (courseId, category, taskId, filePath) => {
    const { uid } = get();
    let newFiles = null;
    set((state) => {
      const newData = { ...state.data };
      const courseGlobal = { ...(newData.globalTasks[courseId] || {}) };
      courseGlobal[category] = (courseGlobal[category] || []).map((t) => {
        if (t.id === taskId && t.files) {
          newFiles = t.files.filter((f) => f.path !== filePath);
          return { ...t, files: newFiles };
        }
        return t;
      });
      newData.globalTasks = { ...newData.globalTasks, [courseId]: courseGlobal };
      return { data: newData };
    });
    if (uid && newFiles)
      fsSetCourseTask(uid, taskId, { files: newFiles }).catch(console.error);
  },

  // ---------- Notes & links (embedded in course doc) ---------------------

  saveNote: (courseId, week, note) => {
    const { uid } = get();
    set((state) => {
      const newData = { ...state.data };
      const courseNotes = { ...(newData.notes[courseId] || {}) };
      courseNotes[week] = note;
      newData.notes = { ...newData.notes, [courseId]: courseNotes };
      return { data: newData };
    });
    if (uid)
      fsSetCourse(uid, courseId, { [`notes.${week}`]: note }).catch(console.error);
  },

  saveLinks: (courseId, links) => {
    const { uid } = get();
    set((state) => {
      const newData = { ...state.data };
      newData.links = { ...newData.links, [courseId]: links };
      return { data: newData };
    });
    if (uid) fsSetCourse(uid, courseId, { links }).catch(console.error);
  },

  // ---------- Semester reset ---------------------------------------------

  resetSemester: async () => {
    const { uid, data, language } = get();
    if (!uid) return;
    const lang = language || 'he';

    const currentTasks = [];
    Object.entries(data.tasks).forEach(([cid, weeks]) => {
      Object.values(weeks).forEach((weekTasks) => {
        weekTasks.forEach((t) => currentTasks.push(t.id));
      });
    });
    Object.entries(data.globalTasks).forEach(([cid, cats]) => {
      Object.values(cats).forEach((catTasks) => {
        catTasks.forEach((t) => currentTasks.push(t.id));
      });
    });

    try {
      for (const course of data.courses) {
        await fsSetCourse(uid, course.id, { notes: {} });
      }
      for (const tid of currentTasks) {
        await fsDeleteCourseTask(uid, tid);
      }
      for (const course of data.courses) {
        const tasksMap = buildInitialWeeklyTasksMap(course, lang);
        await batchSetCourseTasks(uid, tasksMap);
      }
    } catch (err) {
      console.error('Failed to reset semester', err);
      throw err;
    }
  },

  // ---------- Hard delete a course (used by future settings) ------------

  deleteCourseFully: async (courseId) => {
    const { uid } = get();
    if (!uid) return;
    await fsDeleteCourse(uid, courseId).catch(console.error);
  },

  // ---------- Personal events (cl_events) -------------------------------

  addEvent: async (input) => {
    const { uid } = get();
    if (!uid) return null;
    const id = newId(uid, 'event');
    const now = new Date().toISOString();
    const event = {
      title: input.title || '',
      type: input.type || 'event',
      start: input.start || null,
      end: input.end || null,
      allDay: !!input.allDay,
      location: input.location || '',
      notes: input.notes || '',
      color: input.color || null,
      source: input.source || 'manual',
      courseId: input.courseId || null,
      categoryIds: input.categoryIds || [],
      // Phase 5: per-item reminder override. null = use smart default,
      // -1 = no reminder, >=0 = minutes-before-start.
      reminderMinutes: input.reminderMinutes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    await fsSetEvent(uid, id, event).catch(console.error);
    return id;
  },

  updateEvent: (id, updates) => {
    const { uid } = get();
    if (uid)
      fsSetEvent(uid, id, { ...updates, updatedAt: new Date().toISOString() }).catch(
        console.error,
      );
  },

  deleteEvent: (id) => {
    const { uid } = get();
    if (uid) fsDeleteEvent(uid, id).catch(console.error);
  },

  // ---------- Personal tasks (cl_personalTasks) -------------------------

  addPersonalTask: async (input) => {
    const { uid } = get();
    if (!uid) return null;
    const id = newId(uid, 'personalTask');
    const now = new Date().toISOString();
    const task = {
      title: input.title || '',
      type: 'task',
      dueDate: input.dueDate || null,
      dueTime: input.dueTime || null,
      done: false,
      doneAt: null,
      priority: input.priority || 'med',
      list: input.list || 'personal',
      starred: !!input.starred,
      notes: input.notes || '',
      courseId: input.courseId || null,
      categoryIds: input.categoryIds || [],
      // Phase 5: per-item reminder override (minutes before due; null=default, -1=off).
      reminderMinutes: input.reminderMinutes ?? null,
      subtasks: [],
      createdAt: now,
      updatedAt: now,
    };
    await fsSetPersonalTask(uid, id, task).catch(console.error);
    return id;
  },

  updatePersonalTask: (id, updates) => {
    const { uid } = get();
    if (uid)
      fsSetPersonalTask(uid, id, {
        ...updates,
        updatedAt: new Date().toISOString(),
      }).catch(console.error);
  },

  togglePersonalTask: (id) => {
    const { uid, data } = get();
    if (!uid) return;
    const t = data.personalTasks.find((t) => t.id === id);
    if (!t) return;
    const next = {
      done: !t.done,
      doneAt: !t.done ? new Date().toISOString() : null,
    };
    fsSetPersonalTask(uid, id, next).catch(console.error);
  },

  deletePersonalTask: (id) => {
    const { uid } = get();
    if (uid) fsDeletePersonalTask(uid, id).catch(console.error);
  },

  // ---------- Quick notes (cl_notes) ------------------------------------

  addQuickNote: async (input) => {
    const { uid } = get();
    if (!uid) return null;
    const id = newId(uid, 'note');
    const now = new Date().toISOString();
    const note = {
      title: input.title || '',
      content: input.content || '',
      type: 'note',
      pinned: !!input.pinned,
      color: input.color || null,
      categoryId: input.categoryId || null,
      courseId: input.courseId || null,
      createdAt: now,
      updatedAt: now,
    };
    await fsSetNote(uid, id, note).catch(console.error);
    return id;
  },

  updateQuickNote: (id, updates) => {
    const { uid } = get();
    if (uid)
      fsSetNote(uid, id, { ...updates, updatedAt: new Date().toISOString() }).catch(
        console.error,
      );
  },

  deleteQuickNote: (id) => {
    const { uid } = get();
    if (uid) fsDeleteNote(uid, id).catch(console.error);
  },

  // ---------- Subtasks (inline array on personalTask doc) ---------------

  addSubtask: (taskId, title) => {
    const { uid, data } = get();
    if (!uid) return;
    const t = data.personalTasks.find((t) => t.id === taskId);
    if (!t) return;
    const subtaskId = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const newSubtasks = [...(t.subtasks || []), { id: subtaskId, title, done: false }];
    fsSetPersonalTask(uid, taskId, { subtasks: newSubtasks }).catch(console.error);
  },

  toggleSubtask: (taskId, subtaskId) => {
    const { uid, data } = get();
    if (!uid) return;
    const t = data.personalTasks.find((t) => t.id === taskId);
    if (!t) return;
    const newSubtasks = (t.subtasks || []).map((s) =>
      s.id === subtaskId ? { ...s, done: !s.done } : s,
    );
    fsSetPersonalTask(uid, taskId, { subtasks: newSubtasks }).catch(console.error);
  },

  deleteSubtask: (taskId, subtaskId) => {
    const { uid, data } = get();
    if (!uid) return;
    const t = data.personalTasks.find((t) => t.id === taskId);
    if (!t) return;
    const newSubtasks = (t.subtasks || []).filter((s) => s.id !== subtaskId);
    fsSetPersonalTask(uid, taskId, { subtasks: newSubtasks }).catch(console.error);
  },

  // ---------- Task lists & Note categories actions ----------------------

  addTaskList: async (name) => {
    const { uid } = get();
    if (!uid) return null;
    const id = newId(uid, 'taskList');
    const now = new Date().toISOString();
    const list = { name, createdAt: now };
    try {
      await fsSetTaskList(uid, id, list);
      return id;
    } catch (e) {
      console.error(e);
      toast.error('יצירת הרשימה נכשלה — בדוק הרשאות');
      return null;
    }
  },

  updateTaskList: async (id, name) => {
    const { uid } = get();
    if (!uid) return;
    await fsSetTaskList(uid, id, { name }).catch((e) => { console.error(e); toast.error('עדכון הרשימה נכשל'); });
  },

  deleteTaskList: async (id) => {
    const { uid, data } = get();
    if (!uid) return;
    const taskIds = data.personalTasks
      .filter((t) => t.list === id)
      .map((t) => t.id);

    await fsDeleteTaskListAndMigrateTasks(uid, id, taskIds, 'personal');
  },

  addNoteCategory: async (name) => {
    const { uid } = get();
    if (!uid) return null;
    const id = newId(uid, 'noteCategory');
    const now = new Date().toISOString();
    const cat = { name, createdAt: now };
    try {
      await fsSetNoteCategory(uid, id, cat);
      return id;
    } catch (e) {
      console.error(e);
      toast.error('יצירת הקטגוריה נכשלה — בדוק הרשאות');
      return null;
    }
  },

  updateNoteCategory: async (id, name) => {
    const { uid } = get();
    if (!uid) return;
    await fsSetNoteCategory(uid, id, { name }).catch((e) => { console.error(e); toast.error('עדכון הקטגוריה נכשל'); });
  },

  deleteNoteCategory: async (id) => {
    const { uid, data } = get();
    if (!uid) return;
    const noteIds = data.quickNotes
      .filter((n) => n.categoryId === id)
      .map((n) => n.id);

    await fsDeleteNoteCategoryAndMigrateNotes(uid, id, noteIds);
  },

  setCategory: async (id, catData) => {
    const { uid } = get();
    if (!uid) return;
    await fsSetCategory(uid, id, catData).catch(console.error);
  },

  deleteCategory: async (id) => {
    const { uid } = get();
    if (!uid) return;
    await fsDeleteCategory(uid, id).catch(console.error);
  },

  toggleStarPersonalTask: (id) => {
    const { uid, data } = get();
    if (!uid) return;
    const t = data.personalTasks.find((t) => t.id === id);
    if (!t) return;
    const next = { starred: !t.starred };
    fsSetPersonalTask(uid, id, next).catch(console.error);
  },

  // --- AI Command Center schedule actions ---
  setDraftSchedule: (draft) => set({ draftSchedule: draft }),

  scheduleTask: (taskId, scheduledDate, scheduledTime, durationMinutes) => {
    const { uid } = get();
    if (uid) {
      fsSetPersonalTask(uid, taskId, {
        scheduledDate,
        scheduledTime,
        scheduledDuration: durationMinutes,
        updatedAt: new Date().toISOString(),
      }).catch(console.error);
    }
  },

  unscheduleTask: (taskId) => {
    const { uid } = get();
    if (uid) {
      fsSetPersonalTask(uid, taskId, {
        scheduledDate: null,
        scheduledTime: null,
        scheduledDuration: null,
        updatedAt: new Date().toISOString(),
      }).catch(console.error);
    }
  },

  // Persist the draft to cl_schedule/{date} (single source of truth) so the
  // saved plan survives reloads and re-entries instead of being regenerated.
  saveDraftSchedule: async (dateStr, draftBlocks, coachNote) => {
    const { uid, data } = get();
    if (!uid) return;

    const taskIds = new Set((data.personalTasks || []).map((t) => t.id));
    const blocks = (draftBlocks || [])
      .filter((b) => b.type !== 'sleep' && b.type !== 'leisure')
      .map((b) => {
        let duration = b.duration;
        if (!duration && b.startTime && b.endTime) {
          try { duration = timeToMin(b.endTime) - timeToMin(b.startTime); } catch { duration = 60; }
        }
        const source = b.source || (b.refId && taskIds.has(b.refId) ? 'task' : 'schedule');
        return { ...b, duration: duration || 60, source };
      });

    await get().saveSchedule(dateStr, blocks, coachNote || '');

    if (coachNote) {
      get().setProfile({
        coachNotes: { [dateStr]: coachNote },
      });
    }

    set({ draftSchedule: { date: null, blocks: [], coachNote: '' } });
  },

  clearDaySchedule: async (dateStr) => {
    const { uid, data } = get();
    if (!uid) return;

    try {
      // Delete the saved schedule doc so it doesn't resurrect on re-entry.
      await fsDeleteSchedule(uid, dateStr);

      const tasksToUnschedule = data.personalTasks.filter((t) => t.scheduledDate === dateStr);
      for (const t of tasksToUnschedule) {
        await fsSetPersonalTask(uid, t.id, {
          scheduledDate: null,
          scheduledTime: null,
          scheduledDuration: null,
          updatedAt: new Date().toISOString(),
        });
      }

      const eventsToDelete = data.events.filter(
        (e) => e.start && e.start.startsWith(dateStr) && e.isProposed === true
      );
      for (const ev of eventsToDelete) {
        await fsDeleteEvent(uid, ev.id);
      }

      get().setProfile({
        coachNotes: { [dateStr]: null },
      });
    } catch (err) {
      console.error('Failed to clear day schedule', err);
      throw err;
    }
  },

  // ---------- Focus Tracking Actions --------------------------------------
  startFocusTracking: (blockId) => {
    set((state) => ({
      focusTracking: {
        ...state.focusTracking,
        activeBlockId: blockId,
        isTracking: true,
        startTime: new Date().toISOString(),
        elapsed: 0,
        wasInterrupted: false,
      }
    }));
  },

  setFocusElapsed: (elapsed) => {
    set((state) => ({
      focusTracking: {
        ...state.focusTracking,
        elapsed,
      }
    }));
  },

  resetFocusTracking: () => {
    set({
      focusTracking: {
        activeBlockId: null,
        isTracking: false,
        startTime: null,
        elapsed: 0,
        wasInterrupted: false,
      }
    });
  },

  finishFocusTracking: async (status) => {
    const { uid, focusTracking, data } = get();
    if (!uid || !focusTracking.activeBlockId) return;

    // Resolve the tracked block to a task id. Prefer the schedule doc
    // (source==='task' + refId), fall back to the legacy 'task-{id}' prefix.
    const blockId = focusTracking.activeBlockId;
    const docBlock = (data?.schedule?.blocks || []).find((b) => b.id === blockId);
    const taskId = docBlock?.source === 'task' && docBlock.refId
      ? docBlock.refId
      : (blockId.startsWith('task-') ? blockId.replace('task-', '') : null);

    if (taskId) {
      const isCompleted = status === 'completed';
      const elapsedMinutes = Math.round(focusTracking.elapsed / 60);
      const task = data.personalTasks.find((t) => t.id === taskId);
      const nextDuration = (task?.actualDuration || 0) + elapsedMinutes;

      await fsSetPersonalTask(uid, taskId, {
        done: isCompleted,
        doneAt: isCompleted ? new Date().toISOString() : null,
        status: status,
        actualDuration: nextDuration,
        updatedAt: new Date().toISOString(),
      }).catch(console.error);
    }

    // Phase 6e: accumulate actual study minutes + completed-block counter.
    mergeDailyAnalytics(uid, dateKey(), {
      actualStudyMinutes: increment(Math.round(focusTracking.elapsed / 60)),
      completedBlocks: status === 'completed' ? increment(1) : increment(0),
    }).catch(console.error);

    get().resetFocusTracking();
  },

  interruptFocusTracking: async (dateStr, shabbatTimes, gpsLocation) => {
    const { uid, focusTracking, data } = get();
    if (!uid || !focusTracking.activeBlockId) return;

    // Phase 6e: capture the interruption event (count + elapsed minutes).
    mergeDailyAnalytics(uid, dateStr, {
      interruptions: increment(1),
      interruptedMinutes: increment(Math.round(focusTracking.elapsed / 60)),
    }).catch(console.error);

    const blockId = focusTracking.activeBlockId;

    set((state) => ({
      focusTracking: {
        ...state.focusTracking,
        isTracking: false,
        wasInterrupted: true,
      }
    }));

    // Resolve to task id via schedule doc or legacy prefix.
    const docBlock = (data?.schedule?.blocks || []).find((b) => b.id === blockId);
    const taskId = docBlock?.source === 'task' && docBlock.refId
      ? docBlock.refId
      : (blockId.startsWith('task-') ? blockId.replace('task-', '') : null);

    if (taskId) {

      await fsSetPersonalTask(uid, taskId, {
        scheduledDate: null,
        scheduledTime: null,
        scheduledDuration: null,
        status: 'didnt_start',
        updatedAt: new Date().toISOString(),
      }).catch(console.error);

      // Phase 6a: try the deterministic accordion first. Only escalate to a
      // full AI re-plan if blocks overflow into the tray (no room left today).
      const scheduleDoc = data?.schedule;
      if (scheduleDoc && Array.isArray(scheduleDoc.blocks) && scheduleDoc.blocks.length > 0) {
        try {
          const bounds = {
            wakeMin: timeToMin(data?.profile?.wakeTime || '07:00'),
            sleepMin: timeToMin(data?.profile?.sleepTime || '23:00'),
            shabbat: shabbatBoundsForDate(shabbatTimes, dateStr),
          };
          const decision = chooseEngine(
            { kind: 'REMOVE', blockId },
            scheduleDoc.blocks,
            bounds
          );
          if (decision.engine === 'DETERMINISTIC') {
            await get().saveSchedule(dateStr, decision.result.blocks, scheduleDoc.coachNote || '');
            return; // accordion handled it — no AI needed
          }
          // ESCALATE_AI: fall through to the AI regeneration below.
        } catch (err) {
          console.error('[Focus Tracker] Accordion failed, falling back to AI:', err);
        }
      }

      // Run automatic AI rescheduling in background
      try {
        const fixedEvents = [];
        (data?.events || []).forEach((ev) => {
          if (ev.start && ev.start.startsWith(dateStr)) {
            fixedEvents.push({
              id: ev.id,
              title: ev.title,
              start: ev.start.substring(11, 16),
              end: ev.end ? ev.end.substring(11, 16) : '23:59',
              location: ev.location || '',
            });
          }
        });
        // Phase 6d: include today's recurring task instances as locked blocks
        // (only those with a fixed time and not already completed today).
        recurringInstancesForDate(data?.personalTasks || [], dateStr).forEach((inst) => {
          fixedEvents.push({
            id: inst.id,
            title: inst.title,
            start: inst.startTime,
            end: inst.endTime,
            location: '',
          });
        });

        const meals = [];
        if (dateStr === dateKey()) {
          (data?.calori?.meals || []).forEach((m) => {
            meals.push({ name: m.name, time: m.timestamp ? m.timestamp.substring(11, 16) : '12:00', calories: m.calories });
          });
        }

        const upcomingExams = [];
        (data?.courses || []).forEach((course) => {
          ['moedA', 'moedB', 'moedC'].forEach((moed) => {
            const examDate = course[moed] || course.exams?.[moed];
            if (examDate) {
              const dt = parseISO(examDate);
              if (isValid(dt) && dt >= new Date()) {
                upcomingExams.push({
                  course: course.name,
                  moed: moed.replace('moed', ''),
                  date: examDate.substring(0, 10),
                });
              }
            }
          });
        });

        // Filter and construct unscheduled tasks tray
        const unscheduledTasks = data.personalTasks
          .filter((t) => {
            if (t.done) return false;
            // The interrupted task (taskId) is now unscheduled in state, so we want to include it.
            if (t.id === taskId) return true;
            return !t.scheduledDate;
          })
          .map((t) => ({
            id: t.id,
            title: t.title,
            priority: t.priority || 'medium',
          }));

        const plannedWorkouts = data?.calori?.coachSessions || [];

        const context = {
          todayDate: dateStr,
          dayOfWeek: format(new Date(), 'EEEE'),
          settings: {
            wakeTime: data?.profile?.wakeTime || '07:00',
            sleepTime: data?.profile?.sleepTime || '23:00',
            studyBlockDuration: data?.profile?.studyBlockDuration || 90,
            shabbatMode: !!data?.profile?.shabbatMode,
            studyPreferences: data?.profile?.studyPreferences || {},
          },
          shabbatTimes: shabbatTimes ? {
            start: shabbatTimes.start.substring(11, 16),
            end: shabbatTimes.end.substring(11, 16)
          } : null,
          fixedEvents,
          upcomingExams,
          tasks: unscheduledTasks,
          workouts: plannedWorkouts,
          meals,
        };

        const result = await generateDailySchedule(context);
        if (result && result.blocks) {
          // Phase 6a fix: route AI fallback into cl_schedule (single source of
          // truth), not the legacy draft pipeline. Normalize AI blocks to the
          // canonical shape and run validateAndRepair before save.
          const normalized = result.blocks.map((b) => ({
            id: b.id || `ai-${Math.random().toString(36).substring(2, 9)}`,
            source: b.refId
              ? (b.type === 'study' || b.type === 'personal' ? 'task' : 'event')
              : 'schedule',
            refId: b.refId || null,
            type: b.type,
            title: b.title || '',
            startTime: b.startTime,
            endTime: b.endTime,
            isLocked: !!b.isLocked,
            isProposed: true,
            isCompleted: false,
            notes: b.notes || '',
          }));
          const aiBounds = {
            wakeMin: timeToMin(data?.profile?.wakeTime || '07:00'),
            sleepMin: timeToMin(data?.profile?.sleepTime || '23:00'),
            shabbat: shabbatBoundsForDate(shabbatTimes, dateStr),
          };
          const repaired = validateAndRepair(normalized, aiBounds);
          await get().saveSchedule(dateStr, repaired.blocks, result.coachNote || '');
        }
      } catch (err) {
        console.error('[Focus Tracker] Interruption rescheduling failed:', err);
      }
    }
  },

  // ---------- Phase 6d: Recurring tasks ---------------------------------

  addRecurringTask: async (input) => {
    const { uid } = get();
    if (!uid) return null;
    const id = newId(uid, 'recurringTask');
    const now = new Date().toISOString();
    const rule = {
      title: input.title || '',
      notes: input.notes || '',
      priority: input.priority || 'med',
      color: input.color || null,
      freq: input.freq || 'daily',
      interval: Math.max(1, Number(input.interval) || 1),
      byWeekday: Array.isArray(input.byWeekday) ? input.byWeekday : null,
      byMonthday: Array.isArray(input.byMonthday) ? input.byMonthday : null,
      startDate: input.startDate || dateKey(),
      endDate: input.endDate || null,
      time: input.time || null,
      durationMinutes: Math.max(1, Number(input.durationMinutes) || 30),
      completions: {},
      skips: {},
      active: input.active !== false,
      createdAt: now,
      updatedAt: now,
    };
    await fsSetRecurringTask(uid, id, rule).catch(console.error);
    return id;
  },

  updateRecurringTask: async (id, patch) => {
    const { uid } = get();
    if (!uid) return;
    await fsSetRecurringTask(uid, id, {
      ...patch,
      updatedAt: new Date().toISOString(),
    }).catch(console.error);
  },

  deleteRecurringTask: async (id) => {
    const { uid } = get();
    if (!uid) return;
    await fsDeleteRecurringTask(uid, id).catch(console.error);
  },

  // NOTE: these write NESTED objects, not dotted field paths — fsSetPersonalTask
  // uses setDoc(..., {merge:true}), which treats dotted keys as literal field
  // names (only updateDoc expands them). setDoc-merge deep-merges nested maps,
  // so this lands in recurrence.completions/skips/exceptions correctly.

  // Mark a specific date as completed for a recurring rule
  completeRecurringInstance: async (id, dateStr) => {
    const { uid } = get();
    if (!uid || !id || !dateStr) return;
    await fsSetPersonalTask(uid, id, {
      recurrence: { completions: { [dateStr]: { done: true, doneAt: new Date().toISOString() } } },
      updatedAt: new Date().toISOString(),
    }).catch(console.error);
  },

  // Mark a specific date as skipped (won't fire that day).
  skipRecurringInstance: async (id, dateStr) => {
    const { uid } = get();
    if (!uid || !id || !dateStr) return;
    await fsSetPersonalTask(uid, id, {
      recurrence: { skips: { [dateStr]: true } },
      updatedAt: new Date().toISOString(),
    }).catch(console.error);
  },

  // Edit a specific date instance (e.g. change its time or duration).
  editRecurringInstance: async (id, dateStr, overrides) => {
    const { uid } = get();
    if (!uid || !id || !dateStr) return;
    await fsSetPersonalTask(uid, id, {
      recurrence: { exceptions: { [dateStr]: overrides } },
      updatedAt: new Date().toISOString(),
    }).catch(console.error);
  },
}));
