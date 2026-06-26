import { GoogleGenerativeAI } from '@google/generative-ai';

/** Get the configured Gemini API key.
 *  Priority: a user-entered key in localStorage (Settings → AI), else the build
 *  env key. The env key is bundled into the production build, so restrict it to
 *  the app's domains in the Google Cloud Console to prevent quota abuse. */
export const getGeminiApiKey = () => {
  // A user-entered key wins — but only if it LOOKS like a real Google API key
  // (AIza-prefixed, ~39 chars). This auto-heals a stale/empty/garbage value left
  // in localStorage that would otherwise shadow the working build key and break
  // every AI feature.
  const localKey = (localStorage.getItem('gemini_api_key') || '').trim();
  if (/^AIza[\w-]{30,}$/.test(localKey)) return localKey;
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
18. ALWAYS FIT THE WINDOW — NEVER FAIL OR RETURN AN EMPTY DAY. Everything you schedule MUST fit inside the waking window (wake time → bedtime); on Shabbat eve that window already ends 1h before Shabbat. If what the user asked for does not fit (e.g. they requested more study hours than the window holds, or a very short Friday), do NOT overflow past the window and do NOT give up — instead ADAPT by scaling DOWN the flexible parts:
   - Priority order, highest first: fixed events / travel / appointments / locked items (MANDATORY — keep exactly, never shorten or drop) > a planned workout with a set time > due/overdue tasks > requested study blocks > optional tasks.
   - To make things fit, reduce the NUMBER of study blocks, then their length, then drop optional tasks — in that order. Keep at least the mandatory items plus as much study as genuinely fits.
   - The result MUST be a non-empty, valid, non-overlapping schedule fully inside the window. Returning zero blocks (or blocks outside the window) is a FAILURE. If you had to cut the user's request to fit, say so briefly and kindly in the coachNote.
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
 * AI-driven clarifier. Reads the user's free-text request + the full day context
 * and decides which (if any) follow-up questions are genuinely needed before
 * building the schedule. Study is the primary goal, so it ensures study volume,
 * sleep window, and any unknown commitments are pinned down — but only asks what
 * the user's text + context didn't already answer.
 *
 * @returns {{questions: Array, note: string}} questions: [{id,label,type,options?,optional?}]
 */
export const clarifyDayRequest = async (userText, context) => {
  try {
    const genAI = getAIClient();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    const prompt = `
You are the intake assistant for a Hebrew-first daily planner for an Israeli
university student. Studying is the PRIMARY purpose of this planner.

The user wrote this free-text request for their day (may be empty):
"${userText || ''}"

Known context (do NOT ask about anything already answered here or in the text):
- Wake time (profile default): ${context?.wakeTime || '07:00'}
- Bedtime (profile default): ${context?.sleepTime || '23:00'}
- Preferred study block length: ${context?.studyBlockDuration || 90} min
- Fixed events already on the calendar today: ${context?.eventsToday ?? 0}
- Planned Calori workout today: ${context?.hasWorkout ? 'yes' : 'no'}
- Courses: ${JSON.stringify((context?.courses || []).map((c) => c.name))}
- Nearest exam: ${context?.nearestExam ? `${context.nearestExam.name} in ${context.nearestExam.days} days` : 'none'}
- openTaskCount (open unscheduled tasks in the pool): ${context?.openTaskCount ?? 0}
- Current time now: ${context?.nowTime || 'n/a'}${context?.isToday ? ' (planning TODAY — plan from now, not the morning)' : ''}

Decide the MINIMUM set of follow-up questions needed to build a great day.
Rules:
- Ask AT MOST 3 questions. Fewer is better. If the text already makes the day
  clear, return an empty questions array.
- ALWAYS make sure we know the study volume for the day, UNLESS the user clearly
  stated it or asked for no studying. If unknown, ask it (id "study_hours",
  type "chips", options ["שעתיים","4 שעות","6 שעות","כל היום","בלי לימודים"]).
- Only ask about sleep/wake if the user hinted at an unusual schedule (late
  night, early start, tired). Otherwise assume the profile defaults — do NOT ask.
- If a workout is planned or the user mentioned one and its timing is unknown,
  ask "workout_time" (chips: ["בוקר","צהריים","ערב","תחליט אתה"]).
- If the user mentions a trip / drive / going somewhere / an appointment at another
  location (נסיעה, נוסע, לנסוע, תור, פגישה ב..., ל...), and the destination is not a
  concrete city/address, ALWAYS ask "travel_destination" (type "text", label
  "לאן אתה נוסע? (עיר או כתובת מדויקת לחישוב זמן הנסיעה)"). If the departure time
  is unknown, also ask "travel_time" (type "time"). These let us compute the real
  drive time from the user's current location via Google Maps.
  - Additionally, when relevant — the user implies they start the trip from somewhere
    OTHER than their current location, or there are MULTIPLE trips/transitions in the
    day — ask "travel_origin" (type "text", optional true, label
    "מאיפה אתה יוצא? (השאר ריק = מהמיקום הנוכחי)"). For a single simple trip from home,
    do NOT ask origin (we default to the current location).
- If there are open tasks in the pool (openTaskCount > 0), ask "include_tasks"
  (type "chips", options ["כן, מלא משימות פתוחות","רק הדחופות","לא, רק מה שביקשתי"]) —
  whether to also pull additional open tasks from the task pool into the day's free time.
- If the user named studying but not which course AND there are courses, you may
  ask "study_subject" (chips: course names + "כללי — בלי קורס מסוים").
- Never ask about things already in the context (fixed events, known exam).
- Questions must be in Hebrew, concise.

Return STRICTLY this JSON:
{
  "questions": [
    { "id": "string", "label": "Hebrew question", "type": "chips" | "time" | "text",
      "options": ["he", ...], "optional": false }
  ],
  "note": "one short Hebrew sentence on what you'll assume (defaults used)"
}`;

    const result = await model.generateContent([{ text: prompt }]);
    const parsed = parseGeminiJSON(result.response.text());
    return {
      questions: Array.isArray(parsed?.questions) ? parsed.questions.slice(0, 3) : [],
      note: typeof parsed?.note === 'string' ? parsed.note : '',
    };
  } catch (error) {
    if (error.message === 'MISSING_GEMINI_KEY') return { error: 'MISSING_KEY', questions: [], note: '' };
    console.error('[Gemini Service] Error clarifying request:', error);
    // Fail open — no questions, let the generator work from the free text alone.
    return { questions: [], note: '' };
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
${context.currentTime ? `IMPORTANT — it is currently ${context.currentTime} and the user is planning the rest of TODAY. Do NOT schedule anything before ${context.currentTime}; the FIRST block must start at or after ${context.currentTime}. Plan only the remaining hours of the day (from now until bedtime).` : ''}

User settings:
- Wake up time: ${context.settings?.wakeTime || '07:00'}
- Bedtime: ${context.settings?.sleepTime || '23:00'}
- Preferred study times: ${JSON.stringify(context.settings?.studyPreferences || {})}
- Preferred study block duration: ${context.settings?.studyBlockDuration || 90} minutes
- Shabbat Mode: ${context.settings?.shabbatMode ? 'ON' : 'OFF'}
- Shabbat times (if applicable): ${context.shabbatTimes ? `Starts ${context.shabbatTimes.start}, Ends ${context.shabbatTimes.end}` : 'None'}
${context.shabbatTimes ? `
CRITICAL — SHABBAT EVE (today is Friday and Shabbat starts at ${context.shabbatTimes.start}):
- The usable window today is wake time (${context.settings?.wakeTime || '07:00'}) until ONE HOUR BEFORE Shabbat (i.e. treat that as today's hard end-of-day, NOT bedtime).
- Place EVERY block — including all study — INSIDE the daytime window above. Do NOT schedule anything in the evening or after that cutoff. "High energy / long blocks / full study day" all still apply but must fit BEFORE the cutoff.
- It is INVALID to leave the daytime empty and put study in the evening. Front-load the study into the morning/early-afternoon.` : ''}

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
 * Generate a GENERAL week plan in one shot. Produces a coarse per-day directive
 * (focus + study hours + one-line summary) the user can later refine into a full
 * daily schedule. Studying is the primary objective.
 *
 * @param {Object} context - { weekDays:[{date,weekday}], wakeTime, sleepTime,
 *   studyHoursPerDay, studyWeekdays:[...], courses, exams, note, workoutDays }
 * @returns {{days: Array}} days: [{date, weekday, focus, studyHours, summary, directive}]
 */
export const generateWeeklyPlan = async (context) => {
  try {
    const genAI = getAIClient();
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
    });

    const prompt = `
You are planning a STUDENT's week at a high level. Studying is the PRIMARY goal.
Produce a general plan for each day — not a minute-by-minute schedule (that is
refined per-day later). Hebrew output.

The week (plan a row for EACH of these dates, in order):
${JSON.stringify(context.weekDays)}

User preferences:
- Default study target: ${context.studyHoursPerDay || 'לא צויין'} hours per study day
- Preferred study weekdays (0=Sun..6=Sat): ${JSON.stringify(context.studyWeekdays || [])}
- Wake/Bedtime: ${context.wakeTime || '07:00'} – ${context.sleepTime || '23:00'}
- Fill open tasks this week: ${context.fillTasks || 'כן'} (open tasks in pool: ${context.openTaskCount ?? 0})
- Per-day trips / fixed events / emphases (free text, Hebrew): "${context.note || ''}"
- Courses: ${JSON.stringify((context.courses || []).map((c) => c.name))}
- Upcoming exams: ${JSON.stringify(context.exams || [])}
- Days with a planned workout (0=Sun..6=Sat): ${JSON.stringify(context.workoutDays || [])}

Rules:
- For each date decide a "focus": one of "study" | "exam-prep" | "light" | "rest".
- PARSE the per-day note: map each mentioned trip / appointment / workout / rest /
  exam to the RIGHT weekday and fold it into that day's "directive" and "summary"
  (e.g. "ראשון נסיעה לאוניברסיטה 8:00" → Sunday's directive must include that trip).
- As an exam approaches, ramp up exam-prep for that course on the days before it.
- Spread study load across the preferred study weekdays; lighten days right after
  an exam; keep a rest/light day when sensible.
- Tasks: if "Fill open tasks" is "כן", spread the pool's open tasks across the week's
  study/light days; if "רק דחופות", only on days near their due dates; if "לא", do not
  add tasks. Reflect this in each day's directive.
- "studyHours": integer hours of study you allocate that day (0 for rest/light).
- "summary": ONE short Hebrew line describing the day (e.g. "4ש׳ אינפי + אימון ערב").
- "directive": a SELF-CONTAINED Hebrew instruction (1-2 sentences) the per-day
  scheduler consumes to build the full day — concrete about study hours, course
  focus, any trip (with destination + time), workout, and whether to pull tasks.
  This directive is the BASE that each daily build starts from, so include everything
  that day needs.

Return STRICTLY:
{ "days": [ { "date":"yyyy-MM-dd", "weekday":"Hebrew", "focus":"study", "studyHours":4, "summary":"...", "directive":"...", "trip": "OPTIONAL destination if a trip that day, else omit" } ] }`;

    const result = await model.generateContent([{ text: prompt }]);
    const parsed = parseGeminiJSON(result.response.text());
    return { days: Array.isArray(parsed?.days) ? parsed.days : [] };
  } catch (error) {
    if (error.message === 'MISSING_GEMINI_KEY') return { error: 'MISSING_KEY', days: [] };
    console.error('[Gemini Service] Error generating weekly plan:', error);
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
- Bedtime: ${context.settings?.sleepTime || '23:00'} (this window already accounts for Shabbat when relevant — never schedule outside it)
${context.currentTime ? `- It is currently ${context.currentTime} (tuning TODAY). Do NOT place any block before ${context.currentTime}; keep/move blocks to start at or after now.` : ''}
- Shabbat times (if applicable): ${context.shabbatTimes ? `Starts ${context.shabbatTimes.start}, Ends ${context.shabbatTimes.end}` : 'None'}

The user's real data (use it when the command refers to tasks or exams):
- Open tasks in the pool: ${JSON.stringify(context.tasks || [])}
- Upcoming exams: ${JSON.stringify(context.upcomingExams || [])}

Please modify the schedule to satisfy the user's command.
- You can resize, move, add, or delete 'study', 'task', 'reminder', 'meal', 'workout', and 'travel' blocks. NEVER add 'leisure' or break blocks.
- If the command asks to ADD TASKS ("תוסיף לי משימות", "תכניס את המשימות הפתוחות"), pull items from the open-tasks pool into free time: a task WITH a duration → a 'task' block (refId = the task id) of that length; WITHOUT a duration → a 'reminder' point (startTime === endTime, refId = the task id). Order by priority then due date.
- If the command mentions a NEW commitment — a trip ("נסיעה"), appointment ("תור"), meeting, or event with a time — ADD it as a new locked block ('event' or 'travel') at the stated time, and move conflicting non-locked blocks out of its way.
- If the command mentions an exam, restructure the study blocks to focus on that course's exam from the list above.
- EVERYTHING must stay inside the wake→bedtime window. If a change does not fit, scale DOWN the flexible parts (shorten/drop study or optional tasks) — keep fixed events, trips and locked items. Never overflow the window and never return an empty schedule.
- DO NOT move any 'isLocked': true blocks unless the command explicitly asks to change that specific locked item.
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
