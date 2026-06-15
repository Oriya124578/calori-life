import { GoogleGenerativeAI } from '@google/generative-ai';

/** Get the configured Gemini API key from localStorage or VITE env. */
export const getGeminiApiKey = () => {
  return localStorage.getItem('gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '';
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
      "type": "sleep | study | event | meal | workout | travel",
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
2. Morning Prayer: Immediately after the user's wake-up time (e.g., if wake time is 07:00, then from 07:00 to 07:45), ALWAYS schedule a block titled "תפילה" (type: 'event') for 45 minutes.
3. Fixed events (events, university lectures, tutorials, exams, doctor appointments): These are pre-existing and MUST NOT be moved. Mark them with isLocked = true, isProposed = false.
4. Travel blocks: For fixed events with location, check the travelTimeMinutes (provided in context) and insert a 'travel' block (e.g. "נסיעה") before and after the event.
5. Shabbat: If Shabbat starts today (Shabbat times provided in context), ensure NO blocks are scheduled from 1 hour before Shabbat starts until the end of the day. If Shabbat ends today, ensure NO blocks (like study, workout, travel) are scheduled from the start of the day until 1 hour after Shabbat ends. Shabbat time is sacred rest.
6. Calori Workouts: If there is a planned Calori workout for today (provided in context), schedule a 'workout' block (isProposed = true, type = 'workout') at an optimal time (e.g. late afternoon/evening, avoiding study hours/fixed events).
7. Study Blocks: Schedule study blocks ('study') focusing on courses with upcoming exams (exams are sorted by days remaining). Group tasks under these study blocks. A study block should ideally be around 90-120 minutes, or match the user's preferred duration. Name the block like "למידה: [Course Name]".
8. Tasks: Incorporate high/med priority tasks into appropriate study blocks or as separate task blocks, setting refId to the task id.
9. Meals: Schedule 'meal' blocks (e.g. breakfast, lunch, dinner) at normal times (e.g. 08:30, 13:00, 19:30) of about 30-45 minutes.
10. Do not overlap blocks! They must be sequential.
11. All text fields (title, notes, coachNote) MUST be in Hebrew (RTL friendly). Number/time fields should use standard numerals.
12. NEVER generate any blocks of type 'leisure' or any block representing breaks, rest, leisure, or free time (e.g. 'הפסקה קצרה', 'הפסקה', 'זמן חופשי', 'מנוחה'). The timeline MUST only contain active blocks like 'study', 'meal', 'workout', 'event', 'travel'. Gaps in the timeline represent free/break time and must simply have no blocks at all.
13. Realistic pacing: do NOT pack the day wall-to-wall. Leave a gap of at least 15-30 minutes between consecutive proposed blocks (fixed events excepted), and leave at least 2-3 hours of the waking day completely unscheduled. A day with 3-5 well-placed blocks beats a day with 10 crammed ones.
14. Round times: all proposed startTime/endTime values must land on :00, :15, :30 or :45.
15. Study focus: at most 3 study blocks per day. Prioritize the course with the NEAREST exam; do not create a study block for a course without a clear reason (upcoming exam or a linked task). Put the most demanding study block in the user's preferred study hours, or in the morning if no preference exists.
16. Keep every existing/locked item exactly where it is — never duplicate it, never re-time it, never invent fixed events that were not provided.
17. coachNote must be personal and concrete (reference the actual plan: nearest exam, workout timing, load level) — not a generic motivational phrase.
`;

export const extractJSONFromMarkdown = (text) => {
  let cleanText = text.trim();
  const match = cleanText.match(/```(?:json)?\n([\s\S]*?)```/);
  if (match) cleanText = match[1].trim();
  return JSON.parse(cleanText);
};

const parseGeminiJSON = (text) => {
  if (!text) return { blocks: [], coachNote: '' };
  try {
    return extractJSONFromMarkdown(text);
  } catch (err) {
    console.error('[Gemini Service] Failed to parse JSON:', err, text);
    return { blocks: [], coachNote: 'Failed to parse AI response' };
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
- Today's Calori workouts (if planned, recommend a slot for it):
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
- If it asks for a full / all-day study day ("שאלמד כל היום", "יום לימודים מלא", "להתמקד בלימודים כל היום", "intensive"), FILL the waking window from wake time to bedtime with study blocks. This OVERRIDES rule 13's "leave 2-3 hours empty" guidance AND rule 15's 3-block limit: create as many ~90–120 minute study blocks as needed to cover the day. Keep it humane and realistic: insert 'meal' blocks (~30–45 min) around 08:30, 13:00 and 19:30, and a short 15-minute gap between consecutive study blocks — but do NOT leave large empty stretches.
- GENERIC (course-agnostic) study: if the user wants plain study blocks WITHOUT you choosing a course — e.g. "בלי קורס מסוים", "בלוקי לימוד כלליים", "אל תחליט לי קורס", "just study blocks", "רק בלוקי למידה" — title every study block generically as "לימודים" (you MAY number them, e.g. "לימודים — בלוק 1") and DO NOT set a course name, DO NOT set a refId, and DO NOT pick or mention any specific course. The same applies when there are NO upcoming exams and no course is implied: prefer generic "לימודים" blocks over guessing a course. Only attach a specific course when the user explicitly names one or asks you to focus on an exam.
- Otherwise (a specific course or exam IS implied): prioritize the course with the nearest exam, then spread remaining blocks across the other exam courses / linked tasks.
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
