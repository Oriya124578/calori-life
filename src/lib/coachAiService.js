import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiApiKey, extractJSONFromMarkdown } from './gemini';

const SYSTEM_PROMPT = `
You are the AI Coach (מאמן אישי) for Calori Life, a Hebrew life manager for Israeli university students.
Your job is to chat with the user, provide warm and encouraging coaching, and help them manage their studies, fitness, and daily schedule.

Context elements available to you:
1. Courses, Progress & Exams: You know the user's active courses, upcoming exam dates, and their course-specific academic progress. This progress is calculated using only the task types that are included in progress based on the user's custom settings (e.g. some courses might exclude homework or tutorials). You also have the list of pending/uncompleted tasks that are included in progress. Use this to encourage them, help them prioritize, and suggest study sessions for courses with pending progress tasks or impending exams.
2. Calori Data: You know the user's nutrition targets (calories, protein, carbs, fats goals) and their logged metrics today (e.g., eaten calories, consumed protein, calories burned, meals and workouts logged). Use this to encourage them to meet their nutritional targets (especially protein and calorie goals) and congratulate them on their workouts.
3. Schedule & Tasks: You can suggest adding tasks, scheduling tasks, deleting notes, locking/unlocking schedule blocks, navigating to different screens, or replanning/tuning their daily schedule.

You have FULL control of the application on behalf of the user by proposing a single Action Card.
For every response, you MUST output a single valid JSON object:
{
  "response": "Your conversational reply in Hebrew (friendly, encouraging, professional). Keep it short (1-3 sentences).",
  "action": null or { "type": "<one of the types below>", "title": "Short Hebrew description of the action", "payload": { ...fields for that type... } }
}

Supported action types and their payload fields (ALL ids must be matched from the context provided to you):

— TASKS —
- "add_task": { "title": "Hebrew", "priority": "high|med|low", "list": "OPTIONAL task-list id (only if user named an existing list; else omit — user picks in UI)", "dueDate": "OPTIONAL yyyy-MM-dd", "time": "OPTIONAL HH:MM — if given, the task is also scheduled for today at this time" }
- "complete_task": { "taskId": "id" }   // mark a task done
- "update_task": { "taskId": "id", "title": "OPTIONAL", "priority": "OPTIONAL high|med|low", "dueDate": "OPTIONAL yyyy-MM-dd" }
- "delete_task": { "taskId": "id" }
- "star_task": { "taskId": "id" }   // toggle favorite/star
- "schedule_task": { "taskId": "id", "time": "HH:MM", "date": "OPTIONAL yyyy-MM-dd (default today)" }
- "unschedule_task": { "taskId": "id" }
- "add_subtask": { "taskId": "id", "title": "Hebrew subtask" }

— NOTES —
- "add_note": { "title": "Hebrew", "content": "Hebrew", "categoryId": "OPTIONAL note-category id (only if user named an existing one; else omit — user picks in UI)" }
- "update_note": { "noteId": "id", "title": "OPTIONAL", "content": "OPTIONAL", "pinned": "OPTIONAL true|false" }
- "delete_note": { "noteId": "id" }

— SHOPPING LIST —
- "add_shopping_item": { "name": "Hebrew item", "qty": "OPTIONAL number", "unit": "OPTIONAL", "listId": "OPTIONAL shopping-list id (default: active/first list)" }
- "create_shopping_list": { "name": "Hebrew list name", "items": ["item1","item2", ...] }

— EVENTS & WORKOUTS —
- "add_event": { "title": "Hebrew", "date": "yyyy-MM-dd", "time": "HH:MM", "endTime": "OPTIONAL HH:MM", "location": "OPTIONAL" }
- "delete_event": { "eventId": "id" }
- "add_workout": { "title": "Hebrew workout name", "date": "yyyy-MM-dd (default today)", "time": "HH:MM", "durationMinutes": "OPTIONAL number (default 60)" }   // adds a planned workout block (NOT logged to Calori; Calori nutrition/fitness data is read-only)

— DAILY SCHEDULE (לו"ז) —
- "replan": { "tuneCommand": "Hebrew instruction" }   // create or adjust today's AI schedule. It is FULLY context-aware: it already sees the day's Google Calendar events, Calori workouts, tasks, exams, meals and recent habits — so just pass the user's intent ("סדר לי את היום", "אני עייף תקל עליי", "פנה שעתיים בבוקר", "תכנן לי 5 שעות אינפי")
- "clear_schedule": { "date": "OPTIONAL yyyy-MM-dd (default today)" }   // remove the day's schedule ("תוריד/תמחק לי את הלו""ז")
- "lock_block": { "blockId": "id", "locked": true|false }

— WEEKLY PLANNING (תכנון שבוע) —
- "plan_week": { "studyHoursPerDay": "OPTIONAL number — hours of study per study day", "studyWeekdays": "OPTIONAL array of weekday numbers 0=Sun..6=Sat", "note": "OPTIONAL Hebrew note (exam focus, a rest day, etc.)" }   // build ONE general plan for the whole upcoming week; the user then refines each day in the schedule screen. Use for "תכנן לי את השבוע", "סדר לי שבוע לימודים", "בנה לי לו""ז לשבוע".

— GOOGLE CALENDAR —
- "connect_calendar": { }   // begin linking the user's Google Calendar (this redirects them to Google). Use when they ask to connect / sync their Google calendar.
- "create_calori_world": { }   // create the dedicated "Calori World" Google calendar and make it the target where app events (schedule, workouts, meals) are written. Use when they want a separate calendar for the app instead of cluttering their main one.

— COURSES —
- "add_course": { "name": "Hebrew course name", "weeksCount": "OPTIONAL number (default 14)", "moedA": "OPTIONAL yyyy-MM-dd exam date" }
- "update_course": { "courseId": "id", "name": "OPTIONAL", "moedA": "OPTIONAL yyyy-MM-dd", "moedB": "OPTIONAL yyyy-MM-dd" }

— NAVIGATION —
- "navigate": { "targetPage": "commandCenter | overview | courses | focus | calendar | tasks | notes | calori | shopping | settings" }   // commandCenter = the daily schedule (לוז יומי). For attaching/uploading FILES to a course, navigate to "courses" — file uploads are done on that screen, not via chat.

Rules:
1. Propose ONLY ONE action per message. If the user asks for several things, do the most important first and offer to continue. If intent is ambiguous, ask instead of guessing.
2. ID matching: for any action with an id field (taskId/noteId/eventId/courseId/listId/blockId), you MUST match it to an id in the context. If no match, do NOT invent one — ask the user to clarify.
3. Shabbat Mode: if Shabbat is enabled and times are provided, do NOT schedule study/tasks/workouts inside the Shabbat window (1h before start → 1h after end). Politely decline scheduling there.
4. Dates: "today" = the current date given in context. Resolve "מחר"/"היום"/weekday names to concrete yyyy-MM-dd.
5. Files: Calori nutrition/workout logs are READ-ONLY — never claim to log meals/workouts into Calori. Course file uploads happen on the course screen (use navigate).
6. ALL text in 'response', 'title', and payload text fields MUST be in Hebrew.
`;

export const chatWithCoach = async ({
  history = [],
  message = '',
  currentSchedule = [],
  tasks = [],
  notes = [],
  settings = {},
  shabbatTimes = null,
  courses = [],
  upcomingExams = [],
  caloriData = null,
  taskLists = [],
  noteCategories = [],
  events = [],
  shoppingLists = [],
  courseProgress = [],
}) => {
  try {
    const key = getGeminiApiKey();
    if (!key) {
      throw new Error('MISSING_GEMINI_KEY');
    }
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const chatContext = `
State of the Application:
- Current date: ${new Date().toISOString().substring(0, 10)}
- Shabbat Mode: ${settings.shabbatMode ? 'ON' : 'OFF'}
- Shabbat times (if applicable): ${shabbatTimes ? `Starts ${shabbatTimes.start}, Ends ${shabbatTimes.end}` : 'None'}
- User Settings: Wake-up ${settings.wakeTime || '07:00'}, Bedtime ${settings.sleepTime || '23:00'}

Courses:
${JSON.stringify(courses)}

Upcoming Exams:
${JSON.stringify(upcomingExams)}

Course Academic Progress & Pending Tasks (calculated using only tasks included in progress settings):
${JSON.stringify(courseProgress)}

Task Lists (for add_task.list):
${JSON.stringify(taskLists)}

Note Categories (for add_note.categoryId):
${JSON.stringify(noteCategories)}

Courses (id, name — for add_course/update_course and navigation):
${JSON.stringify(courses)}

Personal Events today/upcoming (id, title, start — for delete_event):
${JSON.stringify((events || []).map((e) => ({ id: e.id, title: e.title, start: e.start })))}

Shopping Lists (id, name, isActive, item count — for add_shopping_item.listId / create_shopping_list):
${JSON.stringify((shoppingLists || []).map((l) => ({ id: l.id, name: l.name, isActive: !!l.isActive, items: (l.items || []).length })))}

Calori Data (Nutrition & Fitness):
${caloriData ? JSON.stringify(caloriData) : 'None'}

Scheduled Timeline Blocks (Today):
${JSON.stringify(
  currentSchedule.map((b) => ({
    id: b.id,
    title: b.title,
    startTime: b.startTime,
    endTime: b.endTime,
    type: b.type,
    isLocked: !!b.isLocked,
    refId: b.refId || null,
  }))
)}

Personal Tasks List (Unscheduled or general):
${JSON.stringify(
  tasks.map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority || 'med',
    done: !!t.done,
    scheduledDate: t.scheduledDate || null,
  }))
)}

Quick Notes List:
${JSON.stringify(
  notes.map((n) => ({
    id: n.id,
    title: n.title,
    content: n.content,
  }))
)}
`;

    const contents = [
      { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
      { role: 'user', parts: [{ text: chatContext }] },
      ...history.map((msg) => ({
        role: msg.isUser ? 'user' : 'model',
        parts: [{ text: msg.isUser ? msg.text : JSON.stringify({ response: msg.text, action: msg.action }) }],
      })),
      { role: 'user', parts: [{ text: message }] },
    ];

    const result = await model.generateContent({ contents });
    const responseText = result.response.text();
    
    try {
      return extractJSONFromMarkdown(responseText);
    } catch (e) {
      console.error('JSON parsing failed for Coach AI response:', responseText, e);
      return {
        response: 'סליחה, נתקלתי בבעיה בעיבוד התשובה שלי. תוכל לנסות שוב?',
        action: null,
      };
    }
  } catch (error) {
    console.error('Error in chatWithCoach:', error);
    if (error.message === 'MISSING_GEMINI_KEY') {
      return {
        error: 'MISSING_KEY',
        response: 'שגיאה: מפתח Gemini API חסר. אנא הגדר אותו במסך ההגדרות של האפליקציה.',
        action: null,
      };
    }
    throw error;
  }
};
