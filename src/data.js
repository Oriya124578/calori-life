// Only this user gets default AI links pre-filled; all other users start empty.
export const OWNER_UID = 'tdg5ks2RFfTpJeTSkdPyrBtGf8j2';

export const DEFAULT_COURSES = [
  {
    id: 'infi2',
    name: "אינפי 2",
    academicYear: "שנה א'",
    semester: "סמסטר ב'",
    keywords: ['אינפי', 'infi', 'calculus', 'חשבון אינפיניטסימלי'],
    defaultNotebookLmLink: "https://notebooklm.google.com/notebook/c794b117-dcf9-4eb7-a02e-4ecc5bf938dc",
    defaultGeminiLink: "https://gemini.google.com/notebook/c794b117-dcf9-4eb7-a02e-4ecc5bf938dc",
    defaultMoodleLink: "https://moodle.runi.ac.il/2026/course/view.php?id=2602191",
    defaultLocalFolder: "אינפי 2",
    weeksCount: 12,
    exams: {
      moedA: "2026-07-03T09:00:00",
      moedB: "2026-08-06T09:45:00",
      moedC: null
    }
  },
  {
    id: 'linear2',
    name: "אלגברה לינארית 2",
    academicYear: "שנה א'",
    semester: "סמסטר ב'",
    keywords: ['לינארית', 'linear', 'la', 'אלגברה'],
    defaultNotebookLmLink: "https://notebooklm.google.com/notebook/77081b2d-d76a-4b1e-a241-6262ec2558ff",
    defaultGeminiLink: "https://gemini.google.com/notebook/77081b2d-d76a-4b1e-a241-6262ec2558ff",
    defaultMoodleLink: "https://moodle.runi.ac.il/2026/course/view.php?id=2601713",
    defaultLocalFolder: "אלגברה לינארית 2",
    weeksCount: 12,
    exams: {
      moedA: "2026-07-27T09:45:00",
      moedB: "2026-08-27T09:45:00",
      moedC: null
    }
  },
  {
    id: 'c_sys',
    name: "תכנות בשפת C",
    academicYear: "שנה א'",
    semester: "סמסטר ב'",
    keywords: ['תכנות', 'שפת c', 'systemprog', 'c_sys', 'שפת סי', 'מערכות הפעלה'],
    defaultNotebookLmLink: "https://notebooklm.google.com/notebook/fbd62fab-6c05-428f-b1a3-81254d54597f",
    defaultGeminiLink: "https://gemini.google.com/notebook/fbd62fab-6c05-428f-b1a3-81254d54597f",
    defaultMoodleLink: "https://moodle.runi.ac.il/2026/course/view.php?id=2601709",
    defaultLocalFolder: "תכנות בשפת C",
    weeksCount: 12,
    exams: {
      moedA: "2026-07-14T09:45:00",
      moedB: "2026-08-17T09:45:00",
      moedC: null
    }
  },
  {
    id: 'data_structures',
    name: "מבני נתונים",
    academicYear: "שנה א'",
    semester: "סמסטר ב'",
    keywords: ['מבני נתונים', 'מבנה נתונים', 'ds', 'data_structures'],
    defaultNotebookLmLink: "https://notebooklm.google.com/notebook/aa843f5a-4c13-4cce-9b19-2996dd947b4a",
    defaultGeminiLink: "https://gemini.google.com/notebook/aa843f5a-4c13-4cce-9b19-2996dd947b4a",
    defaultMoodleLink: "https://moodle.runi.ac.il/2026/course/view.php?id=2602402",
    defaultLocalFolder: "מבני נתונים",
    weeksCount: 12,
    exams: {
      moedA: "2026-07-09T09:45:00",
      moedB: "2026-08-12T09:45:00",
      moedC: null
    }
  },
  {
    id: 'logic',
    name: "לוגיקה ותורת הקבוצות",
    academicYear: "שנה א'",
    semester: "סמסטר ב'",
    keywords: ['לוגיקה', 'תורת הקבוצות', 'logic', 'קבוצות'],
    defaultNotebookLmLink: "https://notebooklm.google.com/notebook/3c441193-4665-4cc2-bb90-c630cca092b5",
    defaultGeminiLink: "https://gemini.google.com/notebook/3c441193-4665-4cc2-bb90-c630cca092b5",
    defaultMoodleLink: "https://moodle.runi.ac.il/2026/course/view.php?id=2602426",
    defaultLocalFolder: "לוגיקה ותורת הקבוצות",
    weeksCount: 12,
    exams: {
      moedA: "2026-07-19T09:45:00",
      moedB: "2026-08-20T09:45:00",
      moedC: null
    }
  },
  {
    id: 'algorithms',
    name: "אלגוריתמים",
    academicYear: "שנה ב'",
    semester: "סמסטר א'",
    keywords: ['אלגוריתמים', 'אלגו', 'algorithms', 'algo'],
    defaultNotebookLmLink: "",
    defaultGeminiLink: "",
    defaultMoodleLink: "",
    defaultLocalFolder: "אלגוריתמים",
    weeksCount: 13,
    exams: {
      moedA: null,
      moedB: null,
      moedC: null
    }
  },
  {
    id: 'infi3',
    name: "אינפי 3",
    academicYear: "שנה ב'",
    semester: "סמסטר א'",
    keywords: ['אינפי 3', 'infi 3', 'infi3', 'אנליזה'],
    defaultNotebookLmLink: "",
    defaultGeminiLink: "",
    defaultMoodleLink: "",
    defaultLocalFolder: "אינפי 3",
    weeksCount: 13,
    exams: {
      moedA: null,
      moedB: null,
      moedC: null
    }
  }
];

export const DEFAULT_TASKS = [
  { type: 'lecture', label: 'הרצאה' },
  { type: 'tutorial', label: 'תרגול' },
  { type: 'homework', label: 'שיעורי בית' }
];

export const generateInitialState = () => {
  const state = {
    courses: [],
    tasks: {}, // courseId -> week -> array of tasks { id, type, label, checked }
    links: {},
    notes: {},
    globalTasks: {},
    profile: { displayName: "", academicYear: "שנה א'", semester: "סמסטר א'", academicInstitution: "", degree: "" },
    // Phase 2: unified life-manager item types
    events: [],         // { id, title, start, end, allDay, location, notes, color, source }
    personalTasks: [],  // { id, title, dueDate, dueTime, done, doneAt, priority, list, notes, courseId?, categoryIds: string[], subtasks[] }
    quickNotes: [],     // { id, title, content, createdAt, updatedAt, pinned, color }
    taskLists: [],
    noteCategories: [],
    categories: [],
    // Phase 3: calori bridge (READ-ONLY mirror of calori_1300 data)
    calori: {
      meals: [],          // normalized meals for the selected day
      workouts: [],       // normalized workouts for the selected day
      dayHistory: null,   // daily_history aggregate doc for the selected day
      recentHistory: [],  // last ~14 daily_history docs (desc by date)
      weight: null,       // current user weight in kg
      targetWeight: null, // target weight in kg
    },
    // Phase 6a: single source of truth for one day's timeline (cl_schedule doc).
    schedule: null,
    // Phase 6d: recurring task rules (cl_recurringTasks).
    recurringTasks: [],
    // Shopping lists (cl_shoppingLists).
    shoppingLists: [],
    // Groups & sharing
    groups: [],
    groupUpdates: {},       // groupId -> updates[]
    groupShoppingLists: {}, // groupId -> shoppingLists[]
    groupNotes: {},         // groupId -> notes[]
    groupExpenses: {},      // groupId -> expenses[]
    groupMembers: {},       // groupId -> members[]
  };

  return state;
};
