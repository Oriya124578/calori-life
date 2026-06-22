import { GoogleGenerativeAI } from '@google/generative-ai';

/** Get the configured Gemini API key.
 *  Priority: a user-entered key in localStorage (Settings → AI), else the build
 *  env key. The env key is bundled into the production build, so restrict it to
 *  the app's domains in the Google Cloud Console to prevent quota abuse. */
export const getGeminiApiKey = () => {
  const localKey = localStorage.getItem('gemini_api_key');
  if (localKey) return localKey;
  return import.meta.env.VITE_GEMINI_API_KEY || '';
};

/** Initialize the Gemini API client. Throws if no key found. */
const getAIClient = () => {
  const key = getGeminiApiKey();
  if (!key) {
    throw new Error('MISSING_GEMINI_KEY');
  }
  return new GoogleGenerativeAI(key);
};

const SYSTEM_PROMPT = `
You are an advanced AI Scheduler and Personal Coach for Calori Life, a Hebrew-first life manager for Israeli university students.
Your job is to arrange the user's daily schedule into structured hourly blocks (from wake-up to bedtime) based on their settings, tasks, course exams, appointments, and fitness activities.

You must ALWAYS output a single valid JSON object with the following structure:
{
  "blocks": [
    {
      "id": "string",
      "type": "sleep | study | event | meal | workout | travel | task | reminder",
      "title": "string (Hebrew, descriptive)",
      "startTime": "HH:MM (24-hour format)",
      "endTime": "HH:MM (24-hour format)",
      "duration": number (minutes),
      "refId": "string (optional reference id of a task, course, or Calori session)",
      "isLocked": boolean (true for fixed classes/appointments, false for proposed items),
      "isProposed": boolean (true if suggested by AI, false if already exists/logged),
      "isCompleted": boolean,
      "notes": "string (optional detail in Hebrew)"
    }
  ],
  "coachNote": "string (A brief, encouraging explanation of the schedule in Hebrew, max 2-3 sentences)"
}

Scheduling Rules:
1. Sleep hours: Plan ONLY between the user's wake time and bedtime. Do NOT output 'sleep' blocks — anything outside the waking window is simply not scheduled.
2. NO automatic filler: do NOT add prayer ("תפילה"), meals, breaks, or any block the user did not ask for and that isn't already in the input. Only schedule: the provided fixed events, the user's tasks (rule 8), a planned Calori workout (rule 6), study blocks the user actually requested (rule 7), and whatever the day directive explicitly asks for.
3. Fixed events (events, university lectures, tutorials, exams, doctor appointments): These are pre-existing and MUST NOT be moved. Mark them with isLocked = true, isProposed = false.
4. Travel blocks: Each fixed event MAY carry a "travelTimeMinutes" field on the event object itself. When present (and > 0), insert a 'travel' block (e.g. "נסיעה") of that length before and after the event. Events without that field need no travel block.
5. Shabbat: Shabbat is RELEVANT ONLY when "Shabbat times" are provided in the context (the app sends them only on Friday/Saturday). It is a RESTRICTION, never a task: NEVER create "הכנות לשבת" / "Shabbat preparation" or any Shabbat-themed block. If Shabbat times are provided and start today, schedule NO blocks from 1 hour before it starts to end of day; if they end today, schedule NO blocks from start of day until 1 hour after it ends. If NO Shabbat times are provided, ignore Shabbat entirely and plan a normal day — do not mention or prepare for Shabbat.
6. Calori Workouts: For each planned Calori workout in context (type = 'workout'): if it has a "scheduledTime", it is a fixed commitment — place it EXACTLY there with isLocked = true, isProposed = false, and arrange study/tasks around it (never overlap it). If "scheduledTime" is null, propose a 'workout' block (isProposed = true) at an optimal time (late afternoon/evening, avoiding study hours and fixed events). Use the workout's "durationMinutes" for its length.
7. Study Blocks: Schedule study blocks ('study') ONLY when the user asked to study (via the day directive) OR a task clearly needs a study session. Each study block's length = the user's preferred study block duration (provided as "Preferred study block duration") — use that as the default, don't exceed it without a clear reason. Do NOT pick a course on your own from exam dates. If the user named a specific course/exam to study → focus there and title it "למידה: [Course Name]". If the user asked to study but did NOT name a course → use a GENERIC block titled "לימודים" with NO course name and NO refId.
8. Tasks: the context lists open tasks, each flagged "dueToday"/"overdue" and with an optional "duration" (minutes). You MUST place EVERY task flagged dueToday or overdue in the day. The form is decided STRICTLY by the duration field — do NOT use your own judgement about how "big" a task sounds:
   - duration is a number → a 'task' block (type: "task") of EXACTLY that many minutes (set endTime = startTime + duration), refId = the task id, isProposed = true.
   - duration is null / missing → a 'reminder' (type: "reminder") as a POINT event: startTime === endTime at a sensible moment, duration 0, refId = the task id, isProposed = true. A reminder occupies NO time range.
   DEFAULT to reminders: a task WITHOUT a duration stays a reminder even if its title sounds substantial (e.g. "לכתוב עבודה") — only the user-provided duration turns it into a time block. Order by priority (high first). Tasks NOT flagged dueToday/overdue are optional — add them only if there is spare room.
9. Meals: Do NOT invent meal blocks. Include a 'meal' block only if it is already logged/provided in the input (then lock it), or if the user explicitly asks for meals in the directive.
10. Do not overlap blocks! They must be sequential.
11. All text fields (title, notes, coachNote) MUST be in Hebrew (RTL friendly). Number/time fields should use standard numerals.
12. NEVER generate any blocks of type 'leisure' or any block representing breaks, rest, leisure, or free time (e.g. 'הפסקה קצרה', 'הפסקה', 'זמן חופשי', 'מנוחה'). The timeline MUST only contain active blocks like 'study', 'meal', 'workout', 'event', 'travel'. Gaps in the timeline represent free/break time and must simply have no blocks at all.
13. Packed & productive pacing: make good use of the waking window. When there is enough to schedule (tasks / requested study), fill the day densely with only SHORT ~10–15 minute gaps between consecutive blocks (fixed events excepted). Don't artificially leave large empty stretches. Never overlap blocks. If there is little to schedule, that's fine — don't invent filler just to fill time.
14. Round times: all proposed startTime/endTime values must land on :00, :15, :30 or :45.
15. Study volume: there is NO fixed cap on the number of study blocks — schedule as many as the requested study load (and the day's tasks) require, each at the preferred duration with short gaps. Order by what the user asked and by task priority, NOT by exam dates (unless the user explicitly asked to focus on an exam). Place demanding study in the user's preferred study hours when available.
16. Keep every existing/locked item exactly where it is — never duplicate it, never re-time it, never invent fixed events that were not provided.
17. coachNote must be personal and concrete (reference the actual plan: nearest exam, workout timing, load level) — not a generic motivational phrase.
`;

export const extractJSONFromMarkdown = (text) => {
  let cleanText = String(text).trim();
  // Strip a ```json … ``` or ~~~ … ~~~ fence (with or without a newline after it).
  const fence = cleanText.match(/(?:```|~~~)(?:json)?\s*([\s\S]*?)(?:```|~~~)/i);
  if (fence) cleanText = fence[1].trim();
  return JSON.parse(cleanText);
};

// Best-effort recovery for a slightly-malformed model response: isolate the
// outermost {...} and strip trailing commas before the closing brace/bracket.
const salvageJSON = (text) => {
  const s = String(text);
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  let body = s.slice(first, last + 1).replace(/,(\s*[}\]])/g, '$1');
  try { return JSON.parse(body); } catch { return null; }
};

const parseGeminiJSON = (text) => {
  if (!text) return { blocks: [], coachNote: '' };
  try {
    return extractJSONFromMarkdown(text);
  } catch (err) {
    const salvaged = salvageJSON(text);
    if (salvaged) return salvaged;
    console.error('[Gemini Service] Failed to parse JSON:', err, text);
    // Hebrew fallback so the message never leaks English into the RTL UI.
    return { blocks: [], coachNote: 'לא הצלחתי לעבד את התשובה — נסה שוב' };
  }
};

/**
 * Generate a new daily schedule from scratch based on user data.
 * @param {Object} context - The user preferences, fixed events, tasks, workouts, and Shabbat times.
 */
export const generateDailySchedule = async (context) => {
  try {
    const genAI = getAIClient();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { 
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 }
      },
    });

    const prompt = `
Generate today's schedule.
Today's date is: ${context.todayDate} (Day of week: ${context.dayOfWeek}).

User settings:
- Wake up time: ${context.settings?.wakeTime || '07:00'}
- Bedtime: ${context.settings?.sleepTime || '23:00'}
- Preferred study times: ${JSON.stringify(context.settings?.studyPreferences || {})}
- Preferred study block duration: ${context.settings?.studyBlockDuration || 90} minutes
- Shabbat Mode: ${context.settings?.shabbatMode ? 'ON' : 'OFF'}
- Shabbat times (if applicable): ${context.shabbatTimes ? `Starts ${context.shabbatTimes.start}, Ends ${context.shabbatTimes.end}` : 'None'}

Input data:
- Pre-scheduled fixed events for today (do not move, lock them):
  ${JSON.stringify(context.fixedEvents)}
- Upcoming exams (courses and days remaining):
  ${JSON.stringify(context.upcomingExams)}
- Unscheduled tasks (place them in slots or link to study blocks):
  ${JSON.stringify(context.tasks)}
- Course academic progress & pending tasks (only tasks included in progress calculation):
  ${JSON.stringify(context.courseProgress || [])}
- Today's planned Calori workouts ({title, durationMinutes, scheduledTime|null}; lock those with a scheduledTime, propose a slot for null ones — see rule 6):
  ${JSON.stringify(context.workouts)}
- Today's logged meals (already eaten, lock them):
  ${JSON.stringify(context.meals)}
${context.dailyAnalytics ? `
User's recent scheduling analytics (last 3 days):
  ${JSON.stringify(context.dailyAnalytics)}
Use this data to personalize study block durations and frequency. For example, if actualStudyDuration < plannedStudyDuration, suggest shorter blocks. If interruptionCount is high, insert more spacing between blocks.
` : ''}
${context.dayProfile ? `
User's day directive — this is the MOST IMPORTANT input. Build the whole schedule around it:
  "${context.dayProfile}"
Interpretation rules for the directive:
- If it asks for a full / all-day study day ("שאלמד כל היום", "יום לימודים מלא", "להתמקד בלימודים כל היום", "intensive"), FILL the ENTIRE waking window — from wake time (${context.settings?.wakeTime || '07:00'}) all the way until about 1 hour before bedtime (${context.settings?.sleepTime || '23:00'}) — with study blocks. This OVERRIDES rule 13's "leave 2-3 hours empty" guidance AND rule 15's 3-block limit: there is NO cap on the number of study blocks — create as many blocks (each at the user's preferred study block duration) as it takes to reach the evening. CRITICAL: the LAST block of the day MUST end no earlier than one hour before bedtime. Do NOT stop in the afternoon or early evening — a day that ends at 16:00/17:00/18:00 for an all-day request is WRONG and unacceptable; keep generating consecutive study blocks until you reach the evening. Use short ~10–15 minute gaps between consecutive blocks. Do NOT add meal blocks unless the user explicitly asked for them.
- GENERIC (course-agnostic) study: if the user wants plain study blocks WITHOUT you choosing a course — e.g. "בלי קורס מסוים", "בלוקי לימוד כלליים", "אל תחליט לי קורס", "just study blocks", "רק בלוקי למידה" — title every study block generically as "לימודים" (you MAY number them, e.g. "לימודים — בלוק 1") and DO NOT set a course name, DO NOT set a refId, and DO NOT pick or mention any specific course. The same applies when there are NO upcoming exams and no course is implied: prefer generic "לימודים" blocks over guessing a course. Only attach a specific course when the user explicitly names one or asks you to focus on an exam.
- Only when the USER explicitly named a course or asked to focus on an exam: prioritize that course (and you may use the nearest-exam ordering across the courses they mentioned). If the user did not ask about any course/exam, NEVER pick one from exam dates — use generic "לימודים" blocks.
- If it mentions an exam ("מבחן מחר/היום ב[קורס]"), dedicate MOST study blocks to that course (this overrides rule 15's block limit — up to 5 focused blocks with real gaps between them).
- If it mentions a trip, drive, appointment or any time commitment ("נסיעה ב-16:00", "תור לרופא"), ADD it as a locked 'event' or 'travel' block at the stated time (estimate a sensible duration if not given).
- If it mentions fatigue or a light day, schedule fewer and shorter blocks.
` : ''}`;

    const result = await model.generateContent([
      { text: SYSTEM_PROMPT },
      { text: prompt },
    ]);
    const responseText = result.response.text();
    return parseGeminiJSON(responseText);
  } catch (error) {
    if (error.message === 'MISSING_GEMINI_KEY') {
      return { error: 'MISSING_KEY', blocks: [], coachNote: '' };
    }
    console.error('[Gemini Service] Error generating schedule:', error);
    throw error;
  }
};

/**
 * Modify an existing schedule based on a user's natural language tuning command.
 * @param {Array} currentBlocks - The current scheduled blocks.
 * @param {string} command - The user instruction (e.g. "היום אני עייף, תקל עליי").
 * @param {Object} context - User settings, Shabbat times, etc.
 */
export const tuneSchedule = async (currentBlocks, command, context) => {
  try {
    const genAI = getAIClient();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { 
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 }
      },
    });

    const prompt = `
You are tuning an existing schedule based on the user's manual feedback.
Current schedule blocks:
${JSON.stringify(currentBlocks)}

User tuning command (Hebrew):
"${command}"

User settings:
- Wake time: ${context.settings?.wakeTime || '07:00'}
- Bedtime: ${context.settings?.sleepTime || '23:00'}
- Shabbat times (if applicable): ${context.shabbatTimes ? `Starts ${context.shabbatTimes.start}, Ends ${context.shabbatTimes.end}` : 'None'}

Please modify the schedule to satisfy the user's command.
- You can resize, move, add, or delete 'study', 'meal', 'workout', and 'travel' blocks. NEVER add, suggest, or include any 'leisure' or break blocks.
- If the command mentions a NEW commitment — a trip ("נסיעה"), appointment ("תור"), meeting, or event with a time — ADD it as a new locked block ('event' or 'travel') at the stated time, and move conflicting non-locked blocks out of its way.
- If the command mentions an exam ("יש לי מחר מבחן ב..."), restructure the study blocks to focus on that course — replace other study blocks if needed.
- DO NOT move any 'isLocked': true blocks (like lectures, exams, or doctor appointments) unless the user's command explicitly requests changing/deleting that specific locked item.
- Keep all unchanged blocks EXACTLY as they are (same id, times, titles) — return the FULL schedule, not just the changed blocks.
- Provide a new coachNote explaining the adjustments made in Hebrew.
`;

    const result = await model.generateContent([
      { text: SYSTEM_PROMPT },
      { text: prompt },
    ]);
    const responseText = result.response.text();
    return parseGeminiJSON(responseText);
  } catch (error) {
    if (error.message === 'MISSING_GEMINI_KEY') {
      return { error: 'MISSING_KEY', blocks: currentBlocks, coachNote: '' };
    }
    console.error('[Gemini Service] Error tuning schedule:', error);
    throw error;
  }
};
