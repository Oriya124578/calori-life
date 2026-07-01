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
  setRootProfilePhoto,
  syncUserProfile,
  subscribeCourses,
  setCourse as fsSetCourse,
  deleteCourse as fsDeleteCourse,
  subscribeCourseTasks,
  setCourseTask as fsSetCourseTask,
  deleteCourseTask as fsDeleteCourseTask,
  batchSetCourseTasks,
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
  subscribeGroups,
  subscribeGroupUpdates,
  subscribeGroupShoppingLists,
  subscribeGroupNotes,
  subscribeGroupExpenses,
  postGroupMessage,
  reactToGroupUpdate,
  createGroup as fsCreateGroup,
  joinGroupByCode as fsJoinGroupByCode,
  leaveGroup as fsLeaveGroup,
  fetchGroupMembers as fsFetchGroupMembers,
  setGroupShoppingList as fsSetGroupShoppingList,
  setGroupExpense as fsSetGroupExpense,
  uploadGroupFile,
  deleteGroupShoppingList as fsDeleteGroupShoppingList,
  deleteGroupExpense as fsDeleteGroupExpense,
  setSharedCourse as fsSetSharedCourse,
  getSharedCourse as fsGetSharedCourse,
  markGroupAsRead as fsMarkGroupAsRead,
  toggleGroupMute as fsToggleGroupMute,
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
import { auth } from '../lib/firebase';

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
  staples: true, // shopping staples reminder (scheduled cloud function)
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

export const isTaskIncludedInProgress = (task, course) => {
  if (!task) return false;
  if (task.includeInProgress !== undefined) {
    return !!task.includeInProgress;
  }
  const type = task.type || 'custom';
  let progressSettings = course?.progressSettings;
  if (!progressSettings) {
    progressSettings = {
      lecture: true,
      tutorial: true,
      homework: false,
      custom: true
    };
  }
  if (type === 'lecture') return !!progressSettings.lecture;
  if (type === 'tutorial') return !!progressSettings.tutorial;
  if (type === 'homework') return !!progressSettings.homework;
  return !!progressSettings.custom;
};

export const getCourseProgressSummary = (courses, tasks, activeYear, activeSemester) => {
  if (!courses || !tasks) return [];
  return courses.filter(c => {
    if (c.isArchived) return false;
    if (activeYear && (c.academicYear || "שנה א'") !== activeYear) return false;
    if (activeSemester && (c.semester || "סמסטר ב'") !== activeSemester) return false;
    return true;
  }).map(course => {
    const courseWeeks = tasks[course.id] || {};
    let totalIncluded = 0;
    let completedIncluded = 0;
    const pendingIncluded = [];

    Object.entries(courseWeeks).forEach(([weekNum, weekTasks]) => {
      (weekTasks || []).forEach(t => {
        if (isTaskIncludedInProgress(t, course)) {
          totalIncluded++;
          if (t.checked) {
            completedIncluded++;
          } else {
            pendingIncluded.push({
              week: Number(weekNum),
              label: t.label,
              type: t.type
            });
          }
        }
      });
    });

    return {
      courseName: course.name,
      progress: `${completedIncluded}/${totalIncluded} (${totalIncluded > 0 ? Math.round((completedIncluded / totalIncluded) * 100) : 0}%)`,
      pendingTasks: pendingIncluded
    };
  });
};

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
      ...(t.includeInProgress !== undefined ? { includeInProgress: t.includeInProgress } : {}),
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

const touchRecentCourse = (courseId) => {
  if (!courseId || typeof window === 'undefined') return;
  try {
    const key = 'cl_recent_courses';
    const recent = JSON.parse(localStorage.getItem(key) ?? '[]');
    const filtered = recent.filter(id => id !== courseId);
    const updated = [courseId, ...filtered].slice(0, 10);
    localStorage.setItem(key, JSON.stringify(updated));
    window.dispatchEvent(new Event('cl_recent_courses_changed'));
  } catch (e) {
    console.warn('Failed to touch recent course', e);
  }
};

// ---------- Store ----------------------------------------------------------

export const useStore = create((set, get) => ({
  // --- Data (mirror of Firestore) -----------------------------------------
  data: generateInitialState(),
  uid: null,
  hasCompletedOnboarding: undefined, // undefined = not yet determined
  dataLoaded: false, // true once the first Firestore snapshot has arrived
  _unsubs: [], // active onSnapshot cleanup fns
  _groupUnsubs: {}, // groupId -> array of unsubscribe functions

  // --- UI-only state ------------------------------------------------------
  activeCourse: null,
  activeCategory: 'overview',
  categoryHistory: [],
  theme: localStorage.getItem('theme') || 'light',
  language: localStorage.getItem('language') || 'he',
  desktopModeForced: localStorage.getItem('desktopModeForced') === '1',
  sidebarOpen: false,
  // True while a group chat is open on mobile — Layout hides BottomNav/FAB
  // then, since a full-height chat composer needs that screen space and a
  // fixed nav bar floating over it just gets in the way.
  groupChatMobileOpen: false,
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
  scheduleLoadedDate: null, // date whose cl_schedule snapshot has arrived (vs null=loading)
  _scheduleUnsub: null,
  // Phase 5: notification settings (persisted to localStorage; FCM-ready)
  notificationSettings: loadNotificationSettings(),
  // AI Command Center draft state
  draftSchedule: { date: null, blocks: [], coachNote: '' },
  calendarDate: new Date(),

  // Global "המנהל האישי" coach chat (opened from the floating left FAB on any screen).
  coachChatOpen: false,
  // Set by the chat's "replan" action when fired globally; CommandCenterView
  // consumes it on mount/visit to run the tune, then clears it.
  pendingTuneCommand: null,

  // Focus Tracking state
  focusTracking: {
    activeBlockId: null,
    syntheticBlock: null,
    isTracking: false,
    startTime: null,
    elapsed: 0,
    wasInterrupted: false,
  },

  // Google Calendar Integration
  googleCalendarToken: null,
  // When true, local cl_events are mirrored to the user's Google Calendar.
  googleSyncEnabled:
    typeof localStorage !== 'undefined' &&
    localStorage.getItem('cl_googleSyncEnabled') === '1',

  // ---------- Subscriptions lifecycle -----------------------------------

  initFromAuth: (uid) => {
    if (!uid) return;
    // Tear down any previous listeners before starting fresh (covers auth
    // state flapping where initFromAuth fires twice without a cleanup()).
    get()._unsubs.forEach((u) => { try { u(); } catch { /* ignore */ } });
    get()._caloriDayUnsubs.forEach((u) => { try { u(); } catch { /* ignore */ } });

    // Auth profile photoURL sync
    const currentUser = auth.currentUser;
    if (currentUser && currentUser.photoURL) {
      const localPhoto = get().data?.profile?.photoURL;
      if (!localPhoto) {
        fsSetProfile(uid, { photoURL: currentUser.photoURL }).catch(console.error);
        setRootProfilePhoto(uid, currentUser.photoURL).catch(console.error);
      }
    }

    const unsubProfile = subscribeProfile(uid, (profile) => {
      set((state) => {
        const patch = {
          data: {
            ...state.data,
            profile: profile || state.data.profile || {
              displayName: '',
              academicYear: "שנה א'",
              semester: "סמסטר א'",
              academicInstitution: '',
              degree: '',
            },
          },
        };
        // Hydrate notification settings from Firestore on a fresh device so
        // push preferences follow the user (localStorage may be empty here).
        if (profile?.notificationSettings && !localStorage.getItem('notificationSettings')) {
          const next = { ...DEFAULT_NOTIFICATION_SETTINGS, ...profile.notificationSettings };
          try { localStorage.setItem('notificationSettings', JSON.stringify(next)); } catch { /* ignore */ }
          patch.notificationSettings = next;
        }
        return patch;
      });
    });

    const unsubCourses = subscribeCourses(uid, (courseDocs) => {
      const courses = courseDocs.map(stripCourseFields);
      const notes = {};
      const links = {};
      for (const c of courseDocs) {
        notes[c.id] = c.notes || {};
        
        const currentLinks = c.links || {};
        let moodleLink = currentLinks.moodle || c.defaultMoodleLink || '';
        
        // Auto-heal owner courses to include correct Moodle links if missing (only for Year 1 Semester B)
        const courseYear = c.academicYear || "שנה א'";
        const courseSemester = c.semester || "סמסטר ב'";
        const isCurrentSemester = courseYear === "שנה א'" && courseSemester === "סמסטר ב'";

        if (uid === OWNER_UID && !moodleLink && isCurrentSemester) {
          const defaultMoodleMap = {
            'infi2': 'https://moodle.runi.ac.il/2026/course/view.php?id=2602191',
            'linear2': 'https://moodle.runi.ac.il/2026/course/view.php?id=2601713',
            'c_sys': 'https://moodle.runi.ac.il/2026/course/view.php?id=2601709',
            'data_structures': 'https://moodle.runi.ac.il/2026/course/view.php?id=2602402',
            'logic': 'https://moodle.runi.ac.il/2026/course/view.php?id=2602426',
          };
          
          let matchedMoodle = defaultMoodleMap[c.id];
          if (!matchedMoodle) {
            const normalizedName = (c.name || '').trim();
            if (normalizedName.includes('אינפי')) {
              matchedMoodle = 'https://moodle.runi.ac.il/2026/course/view.php?id=2602191';
            } else if (normalizedName.includes('לינארית')) {
              matchedMoodle = 'https://moodle.runi.ac.il/2026/course/view.php?id=2601713';
            } else if (normalizedName.includes('שפת C') || normalizedName === 'C' || normalizedName.includes('תכנות בשפת C') || normalizedName.includes('שפת סי')) {
              matchedMoodle = 'https://moodle.runi.ac.il/2026/course/view.php?id=2601709';
            } else if (normalizedName.includes('מבני נתונים')) {
              matchedMoodle = 'https://moodle.runi.ac.il/2026/course/view.php?id=2602402';
            } else if (normalizedName.includes('לוגיקה')) {
              matchedMoodle = 'https://moodle.runi.ac.il/2026/course/view.php?id=2602426';
            } else if (normalizedName.includes('בעיות המאה')) {
              matchedMoodle = 'https://moodle.runi.ac.il/2026/course/view.php?id=2602763';
            }
          }
          
          if (matchedMoodle) {
            moodleLink = matchedMoodle;
            const updatedLinks = {
              notebookLm: currentLinks.notebookLm || c.defaultNotebookLmLink || '',
              gemini: currentLinks.gemini || c.defaultGeminiLink || '',
              localFolder: currentLinks.localFolder || c.defaultLocalFolder || '',
              moodle: moodleLink,
            };
            fsSetCourse(uid, c.id, { links: updatedLinks }).catch(console.error);
          }
        }
        
        links[c.id] = {
          notebookLm: currentLinks.notebookLm || c.defaultNotebookLmLink || '',
          gemini: currentLinks.gemini || c.defaultGeminiLink || '',
          localFolder: currentLinks.localFolder || c.defaultLocalFolder || '',
          moodle: moodleLink,
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

    const unsubGroups = subscribeGroups(uid, (groups) => {
      set((state) => ({ data: { ...state.data, groups } }));
      get()._syncGroupSubscriptions(groups);
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
        const caloriPhotoURL = 
          caloriProfile.photoUrl || 
          caloriProfile.photo_url || 
          caloriProfile.profile?.photoURL || 
          caloriProfile.profile?.photoUrl;
        
        const localPhotoURL = get().data?.profile?.photoURL;

        // Bi-directional profile photo URL synchronization
        if (caloriPhotoURL && caloriPhotoURL !== localPhotoURL) {
          fsSetProfile(uid, { photoURL: caloriPhotoURL }).catch(console.error);
        } else if (localPhotoURL && localPhotoURL !== caloriPhotoURL) {
          setRootProfilePhoto(uid, localPhotoURL).catch(console.error);
        }

        set((state) => {
          const finalPhotoURL = caloriPhotoURL || state.data.profile?.photoURL;
          return {
            data: {
              ...state.data,
              profile: {
                ...state.data.profile,
                ...(finalPhotoURL ? { photoURL: finalPhotoURL } : {}),
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
        unsubGroups,
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
    
    // Clean up group-level listeners
    Object.values(get()._groupUnsubs).forEach((unsubList) => {
      unsubList.forEach((u) => { try { u(); } catch { /* ignore */ } });
    });

    set({
      uid: null,
      _unsubs: [],
      _caloriDayUnsubs: [],
      _groupUnsubs: {},
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

  // ---------- Shared Groups (groups) -------------------------------------

  _syncGroupSubscriptions: (groups) => {
    const { uid, _groupUnsubs } = get();
    if (!uid) return;

    const activeGids = groups.map((g) => g.id);
    const nextGroupUnsubs = { ..._groupUnsubs };

    // 1. Clean up stale subscriptions
    Object.keys(_groupUnsubs).forEach((gid) => {
      if (!activeGids.includes(gid)) {
        _groupUnsubs[gid].forEach((u) => { try { u(); } catch (err) { console.error(err); } });
        delete nextGroupUnsubs[gid];
      }
    });

    // 2. Set up new subscriptions
    groups.forEach((g) => {
      if (!nextGroupUnsubs[g.id]) {
        const unsubUpdates = subscribeGroupUpdates(g.id, (updates) => {
          const prev = get().data.groupUpdates?.[g.id] || [];
          if (prev.length > 0 && updates.length > 0) {
            const latest = updates[0];
            const prevLatest = prev[0];
            if (latest.id !== prevLatest.id) {
              const isFromMe = latest.author_uid === uid || latest.user_uid === uid;
              if (!isFromMe) {
                const title = latest.author_name || 'חבר קבוצה';
                const body = latest.summary || latest.message || 'הודעה חדשה 💬';
                try {
                  const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-84.wav');
                  audio.volume = 0.5;
                  audio.play().catch(() => {});
                } catch { /* ignore audio play failures */ }
                
                toast.info(`${g.name} - ${title}: ${body}`);
              }
            }
          }

          set((state) => ({
            data: {
              ...state.data,
              groupUpdates: { ...state.data.groupUpdates, [g.id]: updates },
            },
          }));
        });

        const unsubShoppingLists = subscribeGroupShoppingLists(g.id, (lists) => {
          set((state) => ({
            data: {
              ...state.data,
              groupShoppingLists: { ...state.data.groupShoppingLists, [g.id]: lists },
            },
          }));
        });

        const unsubNotes = subscribeGroupNotes(g.id, (notes) => {
          set((state) => ({
            data: {
              ...state.data,
              groupNotes: { ...state.data.groupNotes, [g.id]: notes },
            },
          }));
        });

        const unsubExpenses = subscribeGroupExpenses(g.id, (expenses) => {
          set((state) => ({
            data: {
              ...state.data,
              groupExpenses: { ...state.data.groupExpenses, [g.id]: expenses },
            },
          }));
        });

        nextGroupUnsubs[g.id] = [unsubUpdates, unsubShoppingLists, unsubNotes, unsubExpenses];
      }
    });

    set({ _groupUnsubs: nextGroupUnsubs });
  },

  createGroup: async (name) => {
    const { uid } = get();
    if (!uid) return;
    return await fsCreateGroup(uid, name);
  },

  joinGroupByCode: async (code) => {
    const { uid } = get();
    if (!uid) return;
    return await fsJoinGroupByCode(uid, code);
  },

  leaveGroup: async (groupId) => {
    const { uid } = get();
    if (!uid) return;
    await fsLeaveGroup(uid, groupId);
  },

  postGroupMessage: async (groupId, text) => {
    const { uid, data } = get();
    if (!uid) return;
    const authorName = data.profile?.displayName || 'סטודנט/ית';
    await postGroupMessage(groupId, {
      kind: 'chat',
      app_origin: 'life',
      author_uid: uid,
      author_name: authorName,
      summary: text,
      type: 'message', // legacy
      user_uid: uid,    // legacy
      user_name: authorName, // legacy
      message: text,   // legacy
    });
  },

  reactToGroupUpdate: async (groupId, updateId, emoji) => {
    const { uid } = get();
    if (!uid) return;
    await reactToGroupUpdate(groupId, updateId, uid, emoji);
  },

  toggleGroupMute: async (groupId, isMuted) => {
    try {
      await fsToggleGroupMute(groupId, isMuted);
    } catch (e) {
      console.error('Failed to toggle group mute', e);
    }
  },

  loadGroupMembers: async (groupId) => {
    try {
      const members = await fsFetchGroupMembers(groupId);
      set((state) => ({
        data: {
          ...state.data,
          groupMembers: { ...state.data.groupMembers, [groupId]: members },
        },
      }));
    } catch (e) {
      console.error('Failed to load group members', e);
    }
  },

  shareShoppingListToGroup: async (listId, groupId) => {
    const { uid, data } = get();
    if (!uid) return;
    const list = data.shoppingLists.find((l) => l.id === listId);
    if (!list) return;

    const sharedList = {
      ...list,
      groupId,
      updatedAt: new Date().toISOString(),
    };

    // 1. Save to group shared path
    await fsSetGroupShoppingList(groupId, listId, sharedList);

    // 2. Delete from personal path
    await fsDeleteShoppingList(uid, listId);

    // 3. Post notification update to chat
    const authorName = data.profile?.displayName || 'סטודנט/ית';
    await postGroupMessage(groupId, {
      kind: 'chat',
      app_origin: 'life',
      author_uid: uid,
      author_name: authorName,
      summary: `שיתפתי את רשימת הקניות "${list.name}" 🛒`,
      payload: { sharedListId: listId, sharedListName: list.name, kind: 'shoppingList' },
      type: 'message', // legacy
      user_uid: uid,    // legacy
      user_name: authorName, // legacy
      message: `שיתפתי את רשימת הקניות "${list.name}" 🛒`, // legacy
    });
  },

  updateGroupShoppingItem: async (groupId, listId, itemId, patch) => {
    const { data } = get();
    const lists = data.groupShoppingLists[groupId] || [];
    const list = lists.find(l => l.id === listId);
    if (!list) return;
    const nextItems = list.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it));
    await fsSetGroupShoppingList(groupId, listId, { items: nextItems, updatedAt: new Date().toISOString() });
  },

  addGroupShoppingItem: async (groupId, listId, item) => {
    const { data } = get();
    const lists = data.groupShoppingLists[groupId] || [];
    const list = lists.find(l => l.id === listId);
    if (!list) return;
    const nextItems = [...list.items, item];
    await fsSetGroupShoppingList(groupId, listId, { items: nextItems, updatedAt: new Date().toISOString() });
  },

  removeGroupShoppingItem: async (groupId, listId, itemId) => {
    const { data } = get();
    const lists = data.groupShoppingLists[groupId] || [];
    const list = lists.find(l => l.id === listId);
    if (!list) return;
    const nextItems = list.items.filter((it) => it.id !== itemId);
    await fsSetGroupShoppingList(groupId, listId, { items: nextItems, updatedAt: new Date().toISOString() });
  },

  deleteGroupShoppingList: async (groupId, listId) => {
    await fsDeleteGroupShoppingList(groupId, listId);
  },

  shareNoteToGroup: async (noteId, groupId) => {
    const { uid, data } = get();
    if (!uid) return;
    const note = data.quickNotes.find((n) => n.id === noteId);
    if (!note) return;

    const authorName = data.profile?.displayName || 'סטודנט/ית';
    await postGroupMessage(groupId, {
      kind: 'chat',
      app_origin: 'life',
      author_uid: uid,
      author_name: authorName,
      summary: `שיתפתי פתק: "${note.title || 'פתק ללא כותרת'}" 📝`,
      payload: {
        kind: 'note',
        noteId: note.id,
        title: note.title || '',
        content: note.content || '',
        color: note.color || '#fff',
      },
      type: 'message', // legacy
      user_uid: uid,    // legacy
      user_name: authorName, // legacy
      message: `שיתפתי פתק: "${note.title || 'פתק ללא כותרת'}" 📝`, // legacy
    });
  },

  shareFileToGroup: async (groupId, file) => {
    const { uid, data } = get();
    if (!uid) return;
    try {
      const url = await uploadGroupFile(groupId, file);
      const authorName = data.profile?.displayName || 'סטודנט/ית';
      await postGroupMessage(groupId, {
        kind: 'chat',
        app_origin: 'life',
        author_uid: uid,
        author_name: authorName,
        summary: `שיתפתי קובץ: "${file.name}" 📂`,
        payload: {
          kind: 'file',
          fileUrl: url,
          fileName: file.name,
          fileSize: file.size,
        },
        type: 'message', // legacy
        user_uid: uid,    // legacy
        user_name: authorName, // legacy
        message: `שיתפתי קובץ: "${file.name}" 📂`, // legacy
      });
    } catch (e) {
      console.error('Failed to upload file to group', e);
      throw e;
    }
  },

  addSharedExpense: async (groupId, expenseData) => {
    const { uid, data } = get();
    if (!uid) return;
    const id = 'exp_' + Date.now();
    const authorName = data.profile?.displayName || 'סטודנט/ית';
    const expense = {
      id,
      ...expenseData,
      createdAt: new Date().toISOString(),
    };
    await fsSetGroupExpense(groupId, id, expense);

    // Post to chat
    const summary = expense.isSettleUp
      ? `החזר חוב: ${expense.paidByName} העביר/ה ל-${expense.receivedByName} בסך ${expense.amount} ₪ 🤝`
      : `הוצאה חדשה: "${expense.title}" בסך ${expense.amount} ₪ 💰`;

    await postGroupMessage(groupId, {
      kind: 'chat',
      app_origin: 'life',
      author_uid: uid,
      author_name: authorName,
      summary,
      payload: { 
        kind: 'expense', 
        expenseId: id, 
        expenseTitle: expense.title || 'החזר חוב', 
        expenseAmount: expense.amount,
        isSettleUp: !!expense.isSettleUp
      },
      type: 'message', // legacy
      user_uid: uid,    // legacy
      user_name: authorName, // legacy
      message: summary, // legacy
    });
  },

  deleteSharedExpense: async (groupId, expenseId) => {
    await fsDeleteGroupExpense(groupId, expenseId);
  },

  markGroupAsRead: async (groupId) => {
    const { uid } = get();
    if (!uid) return;
    await fsMarkGroupAsRead(uid, groupId);
  },

  shareCourse: async (courseId) => {
    const { uid, data } = get();
    if (!uid) return null;
    const course = data.courses.find((c) => c.id === courseId);
    if (!course) return null;

    // Gather all related tasks for this course
    const courseTasks = Object.values(data.tasks[courseId] || {}).flat();
    const globalCourseTasks = Object.values(data.globalTasks[courseId] || {}).flat();

    const flatTasks = [
      ...courseTasks.map(t => ({ ...t, scope: 'weekly', courseId })),
      ...globalCourseTasks.map(t => ({ ...t, scope: 'global', courseId })),
    ];

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const shareData = {
      code,
      ownerUid: uid,
      course: {
        id: course.id,
        name: course.name,
        weeksCount: course.weeksCount,
        academicYear: course.academicYear || "שנה א'",
        semester: course.semester || "סמסטר ב'",
        exams: course.exams || {},
        links: course.links || {},
        defaultMoodleLink: course.defaultMoodleLink || '',
        defaultNotebookLmLink: course.defaultNotebookLmLink || '',
        defaultGeminiLink: course.defaultGeminiLink || '',
        defaultLocalFolder: course.defaultLocalFolder || '',
      },
      tasks: flatTasks,
      createdAt: new Date().toISOString(),
    };

    await fsSetSharedCourse(code, shareData);
    return code;
  },

  // Fetches the raw shared payload without importing anything — used by the
  // "adapt to me" preview step before the user commits to an import.
  previewSharedCourse: async (code) => {
    try {
      return await fsGetSharedCourse(code);
    } catch (e) {
      console.error('Failed to preview shared course', e);
      return null;
    }
  },

  // `overrides` lets the importer adapt the shared course to themselves before
  // committing: { name, weeksCount, includeExams, taskTypes (array of type
  // strings to keep from the weekly recurring tasks, or null = keep all) }.
  importCourseFromCode: async (code, overrides = {}) => {
    const { uid } = get();
    if (!uid) return false;
    try {
      const sharedData = await fsGetSharedCourse(code);
      if (!sharedData) {
        toast.error('קוד השיתוף אינו תקין או פג תוקף');
        return false;
      }

      const { course, tasks } = sharedData;
      // Resolve name clashes by suffixing if already exists
      const existing = get().data.courses.some(c => c.id === course.id);
      const newCourseId = existing ? `${course.id}_${Date.now().toString().slice(-4)}` : course.id;

      const importedCourse = {
        ...course,
        name: overrides.name?.trim() || course.name,
        weeksCount: overrides.weeksCount || course.weeksCount,
        exams: overrides.includeExams === false ? {} : course.exams,
        id: newCourseId,
        isArchived: false,
        importedFromCode: code,
      };

      // 1. Create course doc
      await fsSetCourse(uid, newCourseId, importedCourse);

      // 2. Batch create all tasks (with checked: false), optionally filtering
      // which weekly recurring task types to bring along.
      const filteredTasks = overrides.taskTypes
        ? tasks.filter((t) => t.scope !== 'weekly' || overrides.taskTypes.includes(t.type))
        : tasks;
      const tasksToUpload = filteredTasks.map((t, idx) => {
        const taskId = `${newCourseId}-${t.scope === 'weekly' ? 'w' + t.week : 'g' + t.category}-${Date.now()}-${idx}`;
        return {
          id: taskId,
          courseId: newCourseId,
          scope: t.scope,
          week: t.week || null,
          category: t.category || null,
          type: t.type || 'custom',
          label: t.label || '',
          checked: false, // Reset checked status for privacy
          files: Array.isArray(t.files) ? t.files : [], // Duplicates file links!
          order: t.order ?? idx,
        };
      });

      await batchSetCourseTasks(uid, tasksToUpload);
      toast.success(`הקורס "${course.name}" יובא בהצלחה!`);
      return true;
    } catch (e) {
      console.error('Failed to import course', e);
      toast.error('שגיאה בייבוא הקורס');
      return false;
    }
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
    // Reset the "loaded" marker until the first snapshot for this date arrives,
    // so consumers can distinguish "no saved schedule" from "not loaded yet"
    // (data.schedule is null in BOTH cases).
    set({ scheduleLoadedDate: null });
    const unsub = fsSubscribeSchedule(uid, date, (doc) => {
      // Tag the doc with its date so views can ignore a stale doc while
      // navigating between days (snapshot is async).
      set((state) => ({
        data: { ...state.data, schedule: doc ? { ...doc, _docDate: date } : null },
        scheduleLoadedDate: date,
      }));
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

    // Auto-sync the saved schedule to Google Calendar (Calori World write target).
    // Idempotent on the server — re-plans update/remove events.
    // ALWAYS surface a clear message so the user knows what happened: success,
    // not-connected, nothing-to-sync, or failure with the reason.
    try {
      const { syncScheduleToCalendar } = await import('../lib/googleCalendar.js');
      const r = await syncScheduleToCalendar(dateStr, blocks);
      if (!r) {
        toast.info('היומן לא מחובר — היכנס להגדרות → אינטגרציות וחבר את Google Calendar');
      } else if (r.error) {
        toast.error(`סנכרון ליומן נכשל: ${r.detail || r.error}`);
      } else if (r.synced === 0) {
        toast.info(`הלוז נשמר. אין בלוקים לסנכרון (${r.totalBlocks || 0} בלוקים בלוז, אבל רק לימוד/אימון/נסיעה/משימה מסונכרנים)`);
      } else {
        toast.success(`✅ ${r.synced} בלוקים סונכרנו ליומן Google`);
      }
    } catch (e) {
      console.error('Schedule → Google Calendar sync failed', e);
      toast.error(`סנכרון ליומן נכשל: ${String(e?.message || e).slice(0, 100)}`);
    }
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
  setActiveCourse: (course) => {
    set({ activeCourse: course });
    if (course && course.id) {
      touchRecentCourse(course.id);
    }
  },
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
  setCalendarDate: (date) => set({ calendarDate: date }),
  setPendingTuneCommand: (cmd) => set({ pendingTuneCommand: cmd }),
  setSidebarOpen: (isOpen) => set({ sidebarOpen: isOpen }),
  setGroupChatMobileOpen: (isOpen) => set({ groupChatMobileOpen: isOpen }),
  setIsUploading: (status) => set({ isUploading: status }),
  setGoogleCalendarToken: (token) => set({ googleCalendarToken: token }),
  setGoogleSyncEnabled: (enabled) => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('cl_googleSyncEnabled', enabled ? '1' : '0');
    }
    set({ googleSyncEnabled: enabled });
  },
  setTheme: (theme) => {
    try {
      localStorage.setItem('theme', theme);
    } catch {
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
    } catch {
      console.warn('localStorage language failed');
    }
    set({ language });
  },
  setDesktopModeForced: (enabled) => {
    try {
      localStorage.setItem('desktopModeForced', enabled ? '1' : '0');
    } catch {
      console.warn('localStorage desktopModeForced failed');
    }
    set({ desktopModeForced: enabled });
  },
  // Phase 5: merge-update notification settings + persist to localStorage.
  // Phase 5b: also mirror to Firestore (cl_profile/main.notificationSettings)
  // so the scheduled Cloud Function can deliver pushes when the app is closed.
  setNotificationSettings: (partial) => {
    const { uid } = get();
    let next = null;
    set((state) => {
      next = { ...state.notificationSettings, ...partial };
      try { localStorage.setItem('notificationSettings', JSON.stringify(next)); } catch { /* ignore */ }
      return { notificationSettings: next };
    });
    if (uid && next) fsSetProfile(uid, { notificationSettings: next }).catch(console.error);
  },

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
    if (uid) {
      fsSetProfile(uid, profileData).catch(console.error);
      if (profileData.photoURL) {
        setRootProfilePhoto(uid, profileData.photoURL).catch(console.error);
      }
      get().syncProfileToRoot(profileData);
    }
  },

  syncProfileToRoot: async (profilePatch = null, coursesPatch = null) => {
    const { uid, data } = get();
    if (!uid) return;
    const profile = { ...(data.profile || {}), ...profilePatch };
    const courses = coursesPatch || data.courses || [];
    const activeCourses = courses.filter((c) => !c.isArchived).map((c) => c.name);
    
    await syncUserProfile(uid, {
      displayName: profile.displayName || '',
      photoURL: profile.photoURL || null,
      academicInstitution: profile.academicInstitution || '',
      degree: profile.degree || '',
      activeCourses,
    }).catch(console.error);
  },

  // ---------- Onboarding -------------------------------------------------

  // seeds = optional [{ type, label }] array — applies to every selected course.
  completeOnboarding: async (profileData, selectedCourses, seeds = null, progressSettings = null) => {
    const { uid, language } = get();
    if (!uid) return;
    const lang = language || 'he';
    const isOwner = uid === OWNER_UID;

    for (const course of selectedCourses) {
      const notebookLmLink = isOwner ? (course.defaultNotebookLmLink || '') : '';
      const geminiLink = isOwner ? (course.defaultGeminiLink || '') : '';
      const moodleLink = isOwner ? (course.defaultMoodleLink || '') : '';
      const courseDoc = {
        name: course.name,
        academicYear: course.academicYear || profileData.academicYear || "שנה א'",
        semester: course.semester || profileData.semester || "סמסטר א'",
        keywords: course.keywords || [],
        defaultNotebookLmLink: notebookLmLink,
        defaultGeminiLink: geminiLink,
        defaultMoodleLink: moodleLink,
        defaultLocalFolder: course.defaultLocalFolder || '',
        weeksCount: course.weeksCount,
        exams: course.exams || { moedA: null, moedB: null, moedC: null },
        isArchived: false,
        links: {
          notebookLm: notebookLmLink,
          gemini: geminiLink,
          localFolder: course.defaultLocalFolder || '',
          moodle: moodleLink,
        },
        notes: {},
        progressSettings: progressSettings || {
          lecture: true,
          tutorial: true,
          homework: false,
          custom: true
        }
      };
      await fsSetCourse(uid, course.id, courseDoc);
      const tasksMap = buildInitialWeeklyTasksMap(course, lang, seeds);
      await batchSetCourseTasks(uid, tasksMap);
    }

    await fsSetProfile(uid, { ...profileData, hasCompletedOnboarding: true });
    set({ hasCompletedOnboarding: true });
    await get().syncProfileToRoot(profileData, selectedCourses);
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

  // Adding an item already on the list merges into it (bumps quantity) instead
  // of creating a duplicate line. A matching bought item is re-opened.
  addShoppingItem: (listId, item) =>
    get()._patchShoppingItems(listId, (items) => {
      const name = (item.name || '').trim();
      const key = name.toLowerCase();
      const idx = key ? items.findIndex((it) => (it.name || '').trim().toLowerCase() === key) : -1;
      if (idx !== -1) {
        const ex = items[idx];
        const incoming = parseInt(item.qty, 10);
        const base = parseInt(ex.qty, 10);
        const nextN = (Number.isFinite(base) ? base : 1) + (Number.isFinite(incoming) ? incoming : 1);
        const copy = [...items];
        copy[idx] = { ...ex, qty: String(nextN), unit: ex.unit || item.unit || null, checked: false };
        return copy;
      }
      return [
        ...items,
        {
          id: genItemId(),
          name,
          category: item.category || 'other',
          checked: false,
          qty: item.qty || null,
          unit: item.unit || null,
          addedAt: new Date().toISOString(),
        },
      ];
    }),

  updateShoppingItem: (listId, itemId, patch) =>
    get()._patchShoppingItems(listId, (items) =>
      items.map((it) => (it.id === itemId ? { ...it, ...patch } : it))
    ),

  // Inline +/- quantity. An unspecified qty counts as 1; stepping below 2 with
  // no explicit unit clears it back to a plain (implied-1) item.
  bumpShoppingItemQty: (listId, itemId, delta) =>
    get()._patchShoppingItems(listId, (items) =>
      items.map((it) => {
        if (it.id !== itemId) return it;
        const cur = parseInt(it.qty, 10);
        const next = Math.max(1, (Number.isFinite(cur) ? cur : 1) + delta);
        return { ...it, qty: next === 1 && !Number.isFinite(cur) ? null : String(next) };
      })
    ),

  removeShoppingItem: (listId, itemId) =>
    get()._patchShoppingItems(listId, (items) =>
      items.filter((it) => it.id !== itemId)
    ),

  // ---------- Shopping "regulars" (staples) — stored on the profile ------
  // A small curated set of items the user buys regularly. Persisted under
  // cl_profile/main.shoppingRegulars so it follows the user across devices.

  addShoppingRegular: (item) => {
    const { uid, data } = get();
    const name = (item?.name || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    const existing = data.profile?.shoppingRegulars || [];
    if (existing.some((r) => (r.name || '').toLowerCase() === key)) return;
    const next = [...existing, { name, category: item.category || 'other', qty: item.qty ?? null, unit: item.unit ?? null }];
    set((state) => ({ data: { ...state.data, profile: { ...state.data.profile, shoppingRegulars: next } } }));
    if (uid) fsSetProfile(uid, { shoppingRegulars: next }).catch(console.error);
  },

  removeShoppingRegular: (name) => {
    const { uid, data } = get();
    const key = (name || '').trim().toLowerCase();
    const next = (data.profile?.shoppingRegulars || []).filter((r) => (r.name || '').toLowerCase() !== key);
    set((state) => ({ data: { ...state.data, profile: { ...state.data.profile, shoppingRegulars: next } } }));
    if (uid) fsSetProfile(uid, { shoppingRegulars: next }).catch(console.error);
  },

  // ---------- Shopping category layout (aisle order + custom categories) ----
  // Persisted on cl_profile/main so the user's store-aisle order and their own
  // categories follow them across devices.

  setShoppingCategoryOrder: (order) => {
    const { uid } = get();
    set((state) => ({ data: { ...state.data, profile: { ...state.data.profile, shoppingCategoryOrder: order } } }));
    if (uid) fsSetProfile(uid, { shoppingCategoryOrder: order }).catch(console.error);
  },

  addShoppingCustomCategory: ({ he, en, emoji }) => {
    const { uid, data } = get();
    const label = (he || en || '').trim();
    if (!label) return null;
    const key = `custom_${Date.now().toString(36)}`;
    const cat = { key, he: (he || label).trim(), en: (en || label).trim(), emoji: emoji || '🏷️' };
    const next = [...(data.profile?.shoppingCustomCategories || []), cat];
    // Slot the new category just before "other" in the saved aisle order.
    const order = data.profile?.shoppingCategoryOrder;
    let nextOrder = order;
    if (Array.isArray(order) && order.length) {
      const oi = order.indexOf('other');
      nextOrder = oi === -1 ? [...order, key] : [...order.slice(0, oi), key, ...order.slice(oi)];
    }
    const patch = { shoppingCustomCategories: next, ...(nextOrder ? { shoppingCategoryOrder: nextOrder } : {}) };
    set((state) => ({ data: { ...state.data, profile: { ...state.data.profile, ...patch } } }));
    if (uid) fsSetProfile(uid, patch).catch(console.error);
    return key;
  },

  removeShoppingCustomCategory: (key) => {
    const { uid, data } = get();
    const next = (data.profile?.shoppingCustomCategories || []).filter((c) => c.key !== key);
    const nextOrder = (data.profile?.shoppingCategoryOrder || []).filter((k) => k !== key);
    const patch = { shoppingCustomCategories: next, shoppingCategoryOrder: nextOrder };
    set((state) => ({ data: { ...state.data, profile: { ...state.data.profile, ...patch } } }));
    if (uid) fsSetProfile(uid, patch).catch(console.error);
  },

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
    const { uid, language, data } = get();
    if (!uid) return;
    const lang = language || 'he';
    const courseId = course.id || `course-${Date.now()}`;
    const activeYear = course.academicYear || data.profile?.academicYear || "שנה א'";
    const activeSemester = course.semester || data.profile?.semester || "סמסטר א'";

    const courseDoc = {
      name: course.name,
      academicYear: activeYear,
      semester: activeSemester,
      keywords: course.keywords || [],
      defaultNotebookLmLink: course.defaultNotebookLmLink || '',
      defaultGeminiLink: course.defaultGeminiLink || '',
      defaultMoodleLink: course.defaultMoodleLink || '',
      defaultLocalFolder: course.defaultLocalFolder || course.localFolder || '',
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
        localFolder: course.defaultLocalFolder || course.localFolder || '',
        moodle: course.defaultMoodleLink || '',
      },
      notes: {},
      progressSettings: course.progressSettings || {
        lecture: true,
        tutorial: true,
        homework: false,
        custom: true
      },
    };
    await fsSetCourse(uid, courseId, courseDoc).catch(console.error);

    const tasksMap = buildInitialWeeklyTasksMap({ ...course, id: courseId }, lang, seeds);
    await batchSetCourseTasks(uid, tasksMap).catch(console.error);

    const updatedCourses = [...(data.courses || []), { ...courseDoc, id: courseId }];
    await get().syncProfileToRoot(null, updatedCourses);
  },

  updateCourse: (courseId, updates) => {
    const { uid } = get();
    set((state) => {
      const courses = state.data.courses.map((c) =>
        c.id === courseId ? { ...c, ...updates } : c,
      );
      return { data: { ...state.data, courses } };
    });
    if (uid) {
      fsSetCourse(uid, courseId, updates).catch(console.error);
      get().syncProfileToRoot();
    }
  },

  archiveCourse: (courseId, isArchived) => {
    const { uid } = get();
    set((state) => {
      const courses = state.data.courses.map((c) =>
        c.id === courseId ? { ...c, isArchived } : c,
      );
      return { data: { ...state.data, courses } };
    });
    if (uid) {
      fsSetCourse(uid, courseId, { isArchived }).catch(console.error);
      get().syncProfileToRoot();
    }
  },

  // ---------- Weekly tasks ------------------------------------------------

  addWeeklyTask: (courseId, week, label, includeInProgress = true) => {
    touchRecentCourse(courseId);
    const { uid } = get();
    const id = weeklyTaskId(courseId, week, 'custom', Date.now());
    const newTask = {
      id,
      type: 'custom',
      label,
      checked: false,
      files: [],
      includeInProgress,
      order: Date.now(),
    };

    set((state) => {
      const newData = { ...state.data };
      const courseTasks = { ...(newData.tasks[courseId] || {}) };
      const weekTasks = [...(courseTasks[week] || []), newTask];
      courseTasks[week] = weekTasks;
      newData.tasks = { ...newData.tasks, [courseId]: courseTasks };
      return { data: newData };
    });

    if (uid) {
      fsSetCourseTask(uid, id, {
        courseId,
        scope: 'weekly',
        week,
        type: 'custom',
        label,
        checked: false,
        files: [],
        includeInProgress,
        order: Date.now(),
      }).catch(console.error);
    }
  },

  deleteWeeklyTask: (courseId, week, taskId) => {
    const { uid } = get();
    set((state) => {
      const newData = { ...state.data };
      const courseTasks = { ...(newData.tasks[courseId] || {}) };
      courseTasks[week] = (courseTasks[week] || []).filter((t) => t.id !== taskId);
      newData.tasks = { ...newData.tasks, [courseId]: courseTasks };
      return { data: newData };
    });
    if (uid) fsDeleteCourseTask(uid, taskId).catch(console.error);
  },

  toggleTask: (courseId, week, taskId) => {
    touchRecentCourse(courseId);
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
    touchRecentCourse(courseId);
    const { uid, data } = get();
    const courseNotes = { ...(data.notes[courseId] || {}), [week]: note };
    set((state) => ({
      data: { ...state.data, notes: { ...state.data.notes, [courseId]: courseNotes } }
    }));
    if (uid)
      fsSetCourse(uid, courseId, { notes: courseNotes }).catch(console.error);
  },

  saveLinks: (courseId, links) => {
    touchRecentCourse(courseId);
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
    const activeYear = data.profile?.academicYear || "שנה א'";
    const activeSemester = data.profile?.semester || "סמסטר ב'";

    // Filter courses matching the active academic period
    const activeCourses = (data.courses || []).filter(c => 
      (c.academicYear || "שנה א'") === activeYear && 
      (c.semester || "סמסטר ב'") === activeSemester
    );
    const activeCourseIds = new Set(activeCourses.map(c => c.id));

    const currentTasks = [];
    Object.entries(data.tasks || {}).forEach(([courseId, weeks]) => {
      if (!activeCourseIds.has(courseId)) return;
      Object.values(weeks).forEach((weekTasks) => {
        weekTasks.forEach((t) => currentTasks.push(t.id));
      });
    });
    Object.entries(data.globalTasks || {}).forEach(([courseId, cats]) => {
      if (!activeCourseIds.has(courseId)) return;
      Object.values(cats).forEach((catTasks) => {
        catTasks.forEach((t) => currentTasks.push(t.id));
      });
    });

    try {
      for (const course of activeCourses) {
        await fsSetCourse(uid, course.id, { notes: {} });
      }
      for (const tid of currentTasks) {
        await fsDeleteCourseTask(uid, tid);
      }
      for (const course of activeCourses) {
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
    const { uid, data } = get();
    if (!uid) return;
    await fsDeleteCourse(uid, courseId).catch(console.error);
    const updatedCourses = (data.courses || []).filter(c => c.id !== courseId);
    await get().syncProfileToRoot(null, updatedCourses);
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
    // Mirror to Google Calendar (best-effort, non-blocking).
    if (get().googleSyncEnabled && event.start) {
      import('../lib/googleCalendar.js').then(async ({ createGoogleEvent }) => {
        try {
          const gid = await createGoogleEvent(id, event);
          if (gid) await fsSetEvent(uid, id, { googleEventId: gid });
        } catch (e) {
          console.error('GCal mirror create failed', e);
        }
      });
    }
    return id;
  },

  updateEvent: (id, updates) => {
    const { uid } = get();
    if (!uid) return;
    const merged = {
      ...(get().data.events.find((e) => e.id === id) || {}),
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    fsSetEvent(uid, id, { ...updates, updatedAt: merged.updatedAt }).catch(console.error);
    // Mirror to Google. Events already linked to Google (imported or previously
    // pushed) sync back to their own calendar regardless of the mirror flag;
    // brand-new local events only push when mirroring is enabled.
    const linked = !!merged.googleEventId;
    if ((linked || get().googleSyncEnabled) && merged.start) {
      import('../lib/googleCalendar.js').then(async ({ createGoogleEvent, updateGoogleEvent }) => {
        try {
          if (merged.googleEventId) {
            const gid = await updateGoogleEvent(merged.googleEventId, id, merged, merged.calendarId);
            if (gid && gid !== merged.googleEventId) {
              await fsSetEvent(uid, id, { googleEventId: gid });
            }
          } else {
            const gid = await createGoogleEvent(id, merged);
            if (gid) await fsSetEvent(uid, id, { googleEventId: gid });
          }
        } catch (e) {
          console.error('GCal mirror update failed', e);
        }
      });
    }
  },

  deleteEvent: (id) => {
    const { uid } = get();
    if (!uid) return;
    const existing = get().data.events.find((e) => e.id === id);
    fsDeleteEvent(uid, id).catch(console.error);
    // Linked events are removed from their Google calendar even if the mirror
    // flag is off — deleting in-app should delete in Google too.
    if (existing?.googleEventId) {
      import('../lib/googleCalendar.js').then(async ({ deleteGoogleEvent }) => {
        try {
          await deleteGoogleEvent(existing.googleEventId, existing.calendarId);
        } catch (e) {
          console.error('GCal mirror delete failed', e);
        }
      });
    }
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
      // Estimated minutes the task needs. null = a quick task → the AI schedules
      // it as a point reminder; a number → a time block of that length.
      duration: input.duration ?? null,
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

  copySharedNoteToPersonal: async (payload) => {
    const { uid } = get();
    if (!uid) return null;
    const { title, content, color } = payload;
    const id = newId(uid, 'note');
    const now = new Date().toISOString();
    const note = {
      title: title || '',
      content: content || '',
      type: 'note',
      pinned: false,
      color: color || null,
      categoryId: null,
      courseId: null,
      createdAt: now,
      updatedAt: now,
    };
    await fsSetNote(uid, id, note);
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

  // Inline rename of a subtask's title (click-to-edit in the UI).
  updateSubtask: (taskId, subtaskId, title) => {
    const { uid, data } = get();
    if (!uid) return;
    const t = data.personalTasks.find((t) => t.id === taskId);
    if (!t) return;
    const newSubtasks = (t.subtasks || []).map((s) =>
      s.id === subtaskId ? { ...s, title } : s,
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
    const eventIds = new Set((data.events || []).map((e) => e.id));
    const blocks = (draftBlocks || [])
      .filter((b) => b.type !== 'sleep' && b.type !== 'leisure')
      .map((b) => {
        // Point events (reminders / zero-range meals) MUST keep duration 0 —
        // never coerce them to a 60-min block (that defeats the reminder
        // contract: a task with no duration is a point, not a time block).
        const isPoint = b.type === 'reminder' || b.isPointEvent || b.startTime === b.endTime;
        let duration = b.duration;
        if (!isPoint && !duration && b.startTime && b.endTime) {
          try { duration = timeToMin(b.endTime) - timeToMin(b.startTime); } catch { duration = 60; }
        }
        // Resolve the source AUTHORITATIVELY. AI-generated blocks often carry a
        // source/refId that points at no real task or event; if we trust it,
        // buildTimeline drops the block on read (it expects the referenced record
        // to exist) → an empty timeline even though the plan "saved". Keep refId
        // only when it actually resolves; otherwise treat the block as a
        // standalone scheduled item that always renders.
        let source;
        let refId = b.refId;
        if (refId && taskIds.has(refId)) source = 'task';
        else if (refId && eventIds.has(refId)) source = 'event';
        else { source = 'schedule'; refId = undefined; }
        const merged = { ...b, refId, duration: isPoint ? 0 : (duration || 60), source };
        // Firestore rejects the ENTIRE write if any field is `undefined`. AI/repair
        // blocks can carry undefined optionals (refId, notes…) — strip them.
        return Object.fromEntries(
          Object.entries(merged).filter(([, v]) => v !== undefined),
        );
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
        syntheticBlock: null,
        isTracking: true,
        startTime: new Date().toISOString(),
        elapsed: 0,
        wasInterrupted: false,
      }
    }));
  },

  // Quick-focus on an arbitrary task (not necessarily on today's timeline).
  // Builds a synthetic 'task-{id}' block so FocusHub can render the live timer;
  // finishFocusTracking resolves the same id back to the task. Navigates to Focus.
  startFocusOnTask: (task) => {
    if (!task?.id) return;
    const now = new Date();
    const startTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    set((state) => ({
      activeCategory: 'focus',
      focusTracking: {
        ...state.focusTracking,
        activeBlockId: `task-${task.id}`,
        syntheticBlock: {
          id: `task-${task.id}`,
          source: 'task',
          refId: task.id,
          type: 'study',
          title: task.title || '',
          startTime,
          endTime: startTime,
          isLocked: false,
          isProposed: false,
          isCompleted: false,
          notes: task.notes || '',
        },
        isTracking: true,
        startTime: now.toISOString(),
        elapsed: 0,
        wasInterrupted: false,
      },
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
        syntheticBlock: null,
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

  interruptFocusTracking: async (dateStr, shabbatTimes, _gpsLocation) => {
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

        // Filter and construct unscheduled tasks tray. Mirror handleAutoPlan's
        // shape EXACTLY (dueToday/overdue/duration) so the AI applies the same
        // strict duration→block/reminder contract on this reschedule path.
        const unscheduledTasks = data.personalTasks
          .filter((t) => {
            if (t.done) return false;
            // The interrupted task (taskId) is now unscheduled in state, so we want to include it.
            if (t.id === taskId) return true;
            return !t.scheduledDate;
          })
          .map((t) => {
            const due = (t.dueDate || '').slice(0, 10);
            return {
              id: t.id,
              title: t.title,
              priority: t.priority || 'medium',
              dueToday: due === dateStr || t.list === 'today',
              overdue: !!due && due < dateStr,
              duration: t.duration ?? null,
            };
          });

        // Planned Calori workouts mapped to the {title, durationMinutes,
        // scheduledTime} shape the prompt's rule 6 expects. Only for the planned
        // day; date-less sessions only when planning today.
        const plannedWorkouts = (data?.calori?.coachSessions || [])
          .filter((cs) => cs.type !== 'rest' && cs.status !== 'completed' && cs.status !== 'skipped')
          .filter((cs) => (cs.scheduledDate ? cs.scheduledDate.slice(0, 10) === dateStr : dateStr === dateKey()))
          .map((cs) => {
            let tm = null;
            if (cs.scheduledDate) { const d = parseISO(cs.scheduledDate); if (isValid(d)) tm = format(d, 'HH:mm'); }
            return {
              title: cs.title || 'אימון',
              durationMinutes: cs.estimatedDurationMinutes || 60,
              scheduledTime: tm && tm !== '00:00' ? tm : null,
            };
          });

        const courseProgress = getCourseProgressSummary(
          data?.courses || [],
          data?.tasks || {},
          data?.profile?.academicYear,
          data?.profile?.semester
        );

        // Derive day-of-week + Shabbat relevance from the PLANNED date, not "now"
        // — otherwise a reschedule mislabels the day and can leak Shabbat context
        // onto a weekday.
        const plannedDate = parseISO(dateStr);
        const plannedDow = isValid(plannedDate) ? plannedDate.getDay() : new Date().getDay();
        const shabbatRelevant = plannedDow === 5 || plannedDow === 6;

        const context = {
          todayDate: dateStr,
          dayOfWeek: isValid(plannedDate) ? format(plannedDate, 'EEEE') : format(new Date(), 'EEEE'),
          settings: {
            wakeTime: data?.profile?.wakeTime || '07:00',
            sleepTime: data?.profile?.sleepTime || '23:00',
            studyBlockDuration: data?.profile?.studyBlockDuration || 90,
            shabbatMode: !!data?.profile?.shabbatMode && shabbatRelevant,
            studyPreferences: data?.profile?.studyPreferences || {},
          },
          shabbatTimes: (shabbatTimes && shabbatRelevant) ? {
            start: shabbatTimes.start.substring(11, 16),
            end: shabbatTimes.end.substring(11, 16)
          } : null,
          fixedEvents,
          upcomingExams,
          tasks: unscheduledTasks,
          courseProgress,
          workouts: plannedWorkouts,
          meals,
        };

        const result = await generateDailySchedule(context);
        if (result && result.blocks) {
          // Phase 6a fix: route AI fallback into cl_schedule (single source of
          // truth), not the legacy draft pipeline. Normalize AI blocks to the
          // canonical shape and run validateAndRepair before save.
          const normalized = result.blocks.map((b) => ({
            // Always mint a fresh id so an AI-echoed id can't collide with an
            // existing locked block's id.
            id: `ai-${Math.random().toString(36).substring(2, 10)}`,
            source: b.refId
              ? (['study', 'personal', 'task', 'reminder'].includes(b.type) ? 'task' : 'event')
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
        try { toast.error('עדכון הלו"ז נכשל — נסה לסדר מחדש ידנית'); } catch { /* no toast surface */ }
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
