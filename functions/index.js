const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
const { defineSecret } = require("firebase-functions/params");

const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_CLIENT_SECRET");

admin.initializeApp();

const app = express();
app.use(cors({ origin: true }));

// Full calendar scope — needed to LIST calendars and CREATE the dedicated
// "Calori World" calendar, on top of reading/writing events.
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

const CALORI_WORLD_NAME = 'Calori World';

// A helper function to create an OAuth2 client dynamically,
// since we want to handle the redirect URI based on the request host/protocol.
const getOAuth2Client = (req) => {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  // For Firebase Functions, we construct the redirect URI using the original base URL
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${protocol}://${host}${req.baseUrl}/auth/google/callback`;
  
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error('Missing Google OAuth credentials');
  }

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
};

// Helper middleware to validate Firebase ID Token
const validateFirebaseIdToken = async (req, res, next) => {
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid authorization header' });
  }

  const idToken = req.headers.authorization.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Error while verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Unauthorized: Verification failed' });
  }
};

// Milestone 3.1.2: Initiate Google OAuth (Secured with Firebase ID Token query parameter)
app.get("/auth/google", async (req, res) => {
  const idToken = req.query.idToken;
  if (!idToken) {
    return res.status(400).send("Missing idToken parameter");
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const oauth2Client = getOAuth2Client(req);
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state: uid,
      prompt: 'consent'
    });

    res.redirect(url);
  } catch (error) {
    console.error("Error during auth/google initiation:", error);
    res.status(401).send("Unauthorized: Authentication failed");
  }
});

// Milestone 3.1.2: Google OAuth Callback
app.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code;
  const uid = req.query.state;

  if (!code || !uid) {
    return res.status(400).send("Missing code or state");
  }

  try {
    const oauth2Client = getOAuth2Client(req);
    const { tokens } = await oauth2Client.getToken(code);
    
    // Save tokens to Firestore
    await admin.firestore()
      .collection("users")
      .doc(uid)
      .collection("integrations")
      .doc("google")
      .set(tokens);

    // Redirect back to the frontend app
    // Assuming the frontend app is hosted on the same domain or a known dev URL
    const appUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    res.redirect(`${appUrl}/settings/data`); // Redirect to a generic page or settings
  } catch (error) {
    console.error("Error during Google OAuth callback:", error);
    res.status(500).send("Authentication failed");
  }
});

// Returns an authenticated Calendar client for the user, or null if they have
// not connected Google yet. Persists silently-refreshed access tokens back to
// Firestore so we never lose the refresh token.
const getCalendarForUid = async (uid, req) => {
  const ref = admin.firestore()
    .collection("users").doc(uid)
    .collection("integrations").doc("google");
  const doc = await ref.get();
  if (!doc.exists) return null;

  const tokens = doc.data();
  const oauth2Client = getOAuth2Client(req);
  oauth2Client.setCredentials(tokens);

  // Persist refreshed tokens (keep the original refresh_token if Google omits it).
  oauth2Client.on('tokens', (fresh) => {
    const merged = { ...tokens, ...fresh };
    if (!fresh.refresh_token && tokens.refresh_token) {
      merged.refresh_token = tokens.refresh_token;
    }
    ref.set(merged, { merge: true }).catch((e) =>
      console.error("Failed to persist refreshed Google tokens:", e));
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
};

// ── Per-user calendar settings (shared by life + fitness + nutrition) ────────
// users/{uid}/integrations/google_settings:
//   writeCalendarId      — where app-created events are written (default primary)
//   readCalendarIds      — calendars whose events are shown in-app
//   caloriWorldCalendarId— id of the dedicated "Calori World" calendar, if any
const settingsRef = (uid) => admin.firestore()
  .collection("users").doc(uid)
  .collection("integrations").doc("google_settings");

const getSettings = async (uid) => {
  const doc = await settingsRef(uid).get();
  const d = doc.exists ? doc.data() : {};
  return {
    writeCalendarId: d.writeCalendarId || 'primary',
    readCalendarIds: Array.isArray(d.readCalendarIds) && d.readCalendarIds.length
      ? d.readCalendarIds
      : ['primary'],
    caloriWorldCalendarId: d.caloriWorldCalendarId || null,
  };
};

// Map of calendarId → accessRole (owner/writer/reader/...) for the user.
const accessRoleMap = async (calendar) => {
  const map = {};
  let pageToken;
  do {
    const resp = await calendar.calendarList.list({ pageToken, maxResults: 250 });
    for (const c of resp.data.items || []) map[c.id] = c.accessRole;
    pageToken = resp.data.nextPageToken;
  } while (pageToken);
  return map;
};

// List all calendars the user can access.
app.get("/api/calendar/list", validateFirebaseIdToken, async (req, res) => {
  try {
    const calendar = await getCalendarForUid(req.user.uid, req);
    if (!calendar) return res.status(401).json({ error: "Google Calendar not connected" });
    const out = [];
    let pageToken;
    do {
      const resp = await calendar.calendarList.list({ pageToken, maxResults: 250 });
      for (const c of resp.data.items || []) {
        out.push({
          id: c.id,
          summary: c.summaryOverride || c.summary,
          primary: !!c.primary,
          accessRole: c.accessRole,
          backgroundColor: c.backgroundColor || null,
          writable: c.accessRole === 'owner' || c.accessRole === 'writer',
        });
      }
      pageToken = resp.data.nextPageToken;
    } while (pageToken);
    res.status(200).json({ calendars: out });
  } catch (error) {
    console.error("Error listing calendars:", error);
    res.status(500).json({ error: "Failed to list calendars" });
  }
});

// Read the user's calendar settings.
app.get("/api/calendar/settings", validateFirebaseIdToken, async (req, res) => {
  try {
    res.status(200).json(await getSettings(req.user.uid));
  } catch (error) {
    console.error("Error reading calendar settings:", error);
    res.status(500).json({ error: "Failed to read settings" });
  }
});

// Update the user's calendar settings (partial).
app.put("/api/calendar/settings", validateFirebaseIdToken, async (req, res) => {
  try {
    const patch = {};
    if (typeof req.body.writeCalendarId === 'string') patch.writeCalendarId = req.body.writeCalendarId;
    if (Array.isArray(req.body.readCalendarIds)) patch.readCalendarIds = req.body.readCalendarIds;
    await settingsRef(req.user.uid).set(patch, { merge: true });
    res.status(200).json(await getSettings(req.user.uid));
  } catch (error) {
    console.error("Error saving calendar settings:", error);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

// Ensure the dedicated "Calori World" calendar exists; make it the write target.
app.post("/api/calendar/calori-world", validateFirebaseIdToken, async (req, res) => {
  const uid = req.user.uid;
  try {
    const calendar = await getCalendarForUid(uid, req);
    if (!calendar) return res.status(401).json({ error: "Google Calendar not connected" });

    // Reuse if already created (by stored id or by name).
    const settings = await getSettings(uid);
    let calId = settings.caloriWorldCalendarId;
    if (calId) {
      try {
        await calendar.calendars.get({ calendarId: calId });
      } catch {
        calId = null; // stale — recreate
      }
    }
    if (!calId) {
      const list = await calendar.calendarList.list({ maxResults: 250 });
      const found = (list.data.items || []).find(
        (c) => (c.summaryOverride || c.summary) === CALORI_WORLD_NAME);
      calId = found ? found.id : null;
    }
    if (!calId) {
      const created = await calendar.calendars.insert({
        requestBody: { summary: CALORI_WORLD_NAME, timeZone: 'Asia/Jerusalem' },
      });
      calId = created.data.id;
    }

    // Make it the write target and ensure it's in the read set.
    const readIds = Array.from(new Set([...settings.readCalendarIds, calId]));
    await settingsRef(uid).set({
      caloriWorldCalendarId: calId,
      writeCalendarId: calId,
      readCalendarIds: readIds,
    }, { merge: true });

    res.status(200).json({ calendarId: calId });
  } catch (error) {
    console.error("Error ensuring Calori World calendar:", error);
    res.status(500).json({ error: "Failed to create Calori World calendar" });
  }
});

// Build a Google Calendar event resource from our client payload.
const toGoogleEvent = (uid, body) => {
  const ev = {
    summary: body.title || 'Calori',
    description: body.notes || body.description || '',
    location: body.location || undefined,
    extendedProperties: {
      private: {
        calori_event_id: body.caloriEventId || '',
        calori_uid: uid,
        calori_source: body.source || 'calori_life',
      },
    },
  };
  if (body.allDay) {
    // All-day events use date (YYYY-MM-DD), end-exclusive.
    const startDate = String(body.start).slice(0, 10);
    const endSrc = body.end ? String(body.end).slice(0, 10) : startDate;
    const endDate = new Date(`${endSrc}T00:00:00`);
    endDate.setDate(endDate.getDate() + 1);
    ev.start = { date: startDate };
    ev.end = { date: endDate.toISOString().slice(0, 10) };
  } else {
    ev.start = { dateTime: new Date(body.start).toISOString() };
    const end = body.end ? new Date(body.end)
      : new Date(new Date(body.start).getTime() + 60 * 60 * 1000);
    ev.end = { dateTime: end.toISOString() };
  }
  return ev;
};

// Milestone 3.1.3: Fetch Calendar Events (Secured with validateFirebaseIdToken middleware)
app.get("/api/calendar/events", validateFirebaseIdToken, async (req, res) => {
  const uid = req.user.uid;
  const timeMin = req.query.timeMin;
  const timeMax = req.query.timeMax;

  if (timeMin && isNaN(Date.parse(timeMin))) {
    return res.status(400).json({ error: "Invalid timeMin parameter" });
  }
  if (timeMax && isNaN(Date.parse(timeMax))) {
    return res.status(400).json({ error: "Invalid timeMax parameter" });
  }

  try {
    const calendar = await getCalendarForUid(uid, req);
    if (!calendar) {
      return res.status(401).json({ error: "Google Calendar not connected" });
    }

    // Which calendars to read: explicit ?calendarIds=a,b override, else settings.
    const settings = await getSettings(uid);
    const calendarIds = req.query.calendarIds
      ? String(req.query.calendarIds).split(',').map((s) => s.trim()).filter(Boolean)
      : settings.readCalendarIds;

    const roles = await accessRoleMap(calendar);

    const mappedEvents = [];
    await Promise.all(calendarIds.map(async (calId) => {
      try {
        const response = await calendar.events.list({
          calendarId: calId,
          timeMin: timeMin ? new Date(timeMin).toISOString() : undefined,
          timeMax: timeMax ? new Date(timeMax).toISOString() : undefined,
          singleEvents: true,
          orderBy: 'startTime',
        });
        const role = calId === 'primary' ? 'owner' : (roles[calId] || 'reader');
        const writable = role === 'owner' || role === 'writer';
        for (const item of response.data.items || []) {
          let start = item.start.dateTime;
          let end = item.end.dateTime;
          if (!start && item.start.date) {
            start = `${item.start.date}T00:00:00`;
            end = `${item.end.date}T23:59:59`;
          }
          const priv = (item.extendedProperties && item.extendedProperties.private) || {};
          const caloriEventId = priv.calori_event_id || null;
          mappedEvents.push({
            id: `gcal-${item.id}`,
            googleEventId: item.id,
            calendarId: calId,
            caloriEventId,                  // set => one of our own mirrored events
            type: 'event',
            title: item.summary || 'Google Calendar Event',
            start: new Date(start).toISOString(),
            end: new Date(end).toISOString(),
            allDay: !item.start.dateTime,
            location: item.location || '',
            notes: item.description || '',
            source: caloriEventId ? 'calori' : 'google',
            writable,
            // Editable in-app when the user can write to that calendar.
            isLocked: !writable,
          });
        }
      } catch (e) {
        console.error(`Failed to read calendar ${calId}:`, e.message);
      }
    }));

    res.status(200).json({ events: mappedEvents });
  } catch (error) {
    console.error("Error fetching Google Calendar events:", error);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// ── Create an event on the user's primary calendar ──────────────────────────
app.post("/api/calendar/events", validateFirebaseIdToken, async (req, res) => {
  const uid = req.user.uid;
  if (!req.body || !req.body.start) {
    return res.status(400).json({ error: "Missing event start" });
  }
  try {
    const calendar = await getCalendarForUid(uid, req);
    if (!calendar) return res.status(401).json({ error: "Google Calendar not connected" });
    const settings = await getSettings(uid);
    const calendarId = req.body.calendarId || settings.writeCalendarId;
    const created = await calendar.events.insert({
      calendarId,
      requestBody: toGoogleEvent(uid, req.body),
    });
    res.status(200).json({ googleEventId: created.data.id, calendarId });
  } catch (error) {
    console.error("Error creating Google Calendar event:", error);
    res.status(500).json({ error: "Failed to create event" });
  }
});

// ── Update an existing event ─────────────────────────────────────────────────
app.patch("/api/calendar/events/:googleEventId", validateFirebaseIdToken, async (req, res) => {
  const uid = req.user.uid;
  const googleEventId = req.params.googleEventId;
  try {
    const calendar = await getCalendarForUid(uid, req);
    if (!calendar) return res.status(401).json({ error: "Google Calendar not connected" });
    const settings = await getSettings(uid);
    const calendarId = req.body.calendarId || req.query.calendarId || settings.writeCalendarId;
    try {
      await calendar.events.patch({
        calendarId,
        eventId: googleEventId,
        requestBody: toGoogleEvent(uid, req.body),
      });
      res.status(200).json({ googleEventId, calendarId });
    } catch (e) {
      // Event was removed from the calendar — recreate it so state converges.
      if (e.code === 404 || e.code === 410) {
        const created = await calendar.events.insert({
          calendarId,
          requestBody: toGoogleEvent(uid, req.body),
        });
        return res.status(200).json({ googleEventId: created.data.id, calendarId, recreated: true });
      }
      throw e;
    }
  } catch (error) {
    console.error("Error updating Google Calendar event:", error);
    res.status(500).json({ error: "Failed to update event" });
  }
});

// ── Delete an event ──────────────────────────────────────────────────────────
app.delete("/api/calendar/events/:googleEventId", validateFirebaseIdToken, async (req, res) => {
  const uid = req.user.uid;
  const googleEventId = req.params.googleEventId;
  try {
    const calendar = await getCalendarForUid(uid, req);
    if (!calendar) return res.status(401).json({ error: "Google Calendar not connected" });
    const settings = await getSettings(uid);
    const calendarId = req.body.calendarId || req.query.calendarId || settings.writeCalendarId;
    try {
      await calendar.events.delete({ calendarId, eventId: googleEventId });
    } catch (e) {
      // Already gone — treat as success.
      if (e.code !== 404 && e.code !== 410) throw e;
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Error deleting Google Calendar event:", error);
    res.status(500).json({ error: "Failed to delete event" });
  }
});

// ── Sync a whole day's schedule (cl_schedule blocks) to the write calendar ───
// Idempotent: events are tagged with calori_block_id + calori_schedule_day, so a
// re-plan updates existing events and removes ones no longer in the schedule.
app.post("/api/calendar/sync-schedule", validateFirebaseIdToken, async (req, res) => {
  const uid = req.user.uid;
  const date = req.body && req.body.date;
  const blocks = (req.body && req.body.blocks) || [];
  if (!date) return res.status(400).json({ error: "Missing date" });
  try {
    const calendar = await getCalendarForUid(uid, req);
    if (!calendar) return res.status(401).json({ error: "Google Calendar not connected" });
    const settings = await getSettings(uid);
    const calendarId = settings.writeCalendarId;

    // Make sure the target calendar is VISIBLE in the user's Google Calendar —
    // a freshly created secondary calendar can be unselected/hidden, so its
    // events exist but never show up. Idempotent + cheap.
    if (calendarId && calendarId !== 'primary') {
      try {
        await calendar.calendarList.patch({ calendarId, requestBody: { selected: true, hidden: false } });
      } catch (e) {
        console.log(`[sync-schedule] visibility patch skipped: ${e.message}`);
      }
    }

    const dayStart = new Date(`${date}T00:00:00`);
    const dayEnd = new Date(`${date}T23:59:59`);

    // Existing schedule events we previously pushed for this day.
    const existingResp = await calendar.events.list({
      calendarId,
      privateExtendedProperty: [`calori_schedule_day=${date}`],
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      singleEvents: true,
      maxResults: 250,
    });
    const existingByBlock = {};
    for (const ev of existingResp.data.items || []) {
      const bid = ev.extendedProperties && ev.extendedProperties.private &&
        ev.extendedProperties.private.calori_block_id;
      if (bid) existingByBlock[bid] = ev;
    }

    const emoji = { study: '📚', workout: '💪', travel: '🚗', meal: '🍽️', task: '✅', event: '📌' };
    // Sync only the plan blocks the app generates (study/workout/travel/task).
    // Fixed 'event' blocks are skipped — they already live in the user's Google
    // calendar or are mirrored via cl_events, so re-pushing would duplicate them.
    const SYNC_TYPES = ['study', 'workout', 'travel', 'task'];
    const timed = blocks.filter((b) =>
      b && b.startTime && b.endTime && b.startTime !== b.endTime && SYNC_TYPES.includes(b.type));
    console.log(`[sync-schedule] uid=${uid} timed-blocks=${timed.length} existing=${Object.keys(existingByBlock).length}`);

    const keep = new Set();
    for (const b of timed) {
      keep.add(b.id);
      const body = {
        summary: `${emoji[b.type] || '📌'} ${b.title || 'בלוק'}`,
        description: b.notes || 'מהלו"ז של Calori Life',
        start: { dateTime: `${date}T${b.startTime}:00`, timeZone: 'Asia/Jerusalem' },
        end: { dateTime: `${date}T${b.endTime}:00`, timeZone: 'Asia/Jerusalem' },
        extendedProperties: { private: { calori_schedule_day: date, calori_block_id: String(b.id), calori_app: 'life_schedule' } },
      };
      try {
        const prior = existingByBlock[b.id];
        if (prior && prior.id) await calendar.events.patch({ calendarId, eventId: prior.id, requestBody: body });
        else await calendar.events.insert({ calendarId, requestBody: body });
      } catch (e) {
        console.error(`sync-schedule block ${b.id} failed:`, e.message);
      }
    }

    // Delete events for blocks that are no longer in the schedule.
    for (const [bid, ev] of Object.entries(existingByBlock)) {
      if (keep.has(bid) || !ev.id) continue;
      try { await calendar.events.delete({ calendarId, eventId: ev.id }); }
      catch (e) { if (e.code !== 404 && e.code !== 410) console.error('sync-schedule delete failed:', e.message); }
    }

    console.log(`[sync-schedule] uid=${uid} DONE synced=${timed.length} → ${calendarId}`);
    res.status(200).json({ ok: true, synced: timed.length, calendarId, totalBlocks: blocks.length });
  } catch (error) {
    console.error(`[sync-schedule] uid=${uid} FAILED:`, error?.message, error?.code, error?.errors);
    res.status(500).json({ error: "Failed to sync schedule", detail: String(error?.message || error) });
  }
});

exports.api = onRequest(
  { cors: true, secrets: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET] },
  app,
);

exports.aiManager = onSchedule({ schedule: "0 7,21 * * *", timeZone: "Asia/Jerusalem" }, async () => {
  const db = admin.firestore();
  const usersSnapshot = await db.collection("users").get();
  
  const batch = db.batch();
  
  usersSnapshot.forEach(doc => {
    const uid = doc.id;
    const suggestionRef = db.collection("users").doc(uid).collection("cl_aiSuggestions").doc();
    
    // Simulate AI suggestion based on time of day
    const hour = new Date().getHours();
    const isMorning = hour < 12;
    
    let suggestionText = "";
    let contextText = "";
    
    if (isMorning) {
      suggestionText = "Good morning! Focus on high-priority tasks first.";
      contextText = "Morning planning.";
    } else {
      suggestionText = "Evening review: prepare your schedule for tomorrow.";
      contextText = "Evening wrap-up.";
    }

    batch.set(suggestionRef, {
      id: suggestionRef.id,
      userId: uid,
      type: "daily_review",
      suggestion: suggestionText,
      context: contextText,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  
  await batch.commit();
  console.log(`Generated AI suggestions for ${usersSnapshot.size} users.`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5b: closed-app push reminders.
//
// Runs every 15 minutes. For each user with FCM tokens and push enabled,
// computes reminders (exams, tasks, events, daily digest) whose fire time falls
// in the recent window, dedupes via cl_pushLog, and delivers via FCM. Mirrors
// the client-side useNotificationScheduler logic but works when the app is shut.
// ─────────────────────────────────────────────────────────────────────────────

const TZ = "Asia/Jerusalem";
const WINDOW_MS = 20 * 60 * 1000; // fire if target is within the last 20 min

// Offset (ms) of a timeZone at a given instant.
const tzOffsetMs = (date, timeZone) => {
  const local = new Date(date.toLocaleString("en-US", { timeZone }));
  const utc = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  return local.getTime() - utc.getTime();
};

// Build a UTC Date for a Jerusalem wall-clock time.
const jerusalemToUtc = (y, mo, d, h, mi) => {
  const naive = Date.UTC(y, mo - 1, d, h, mi, 0);
  const offset = tzOffsetMs(new Date(naive), TZ);
  return new Date(naive - offset);
};

// Parse a stored date/datetime string as a Jerusalem wall-clock instant.
const parseJ = (v) => {
  if (!v) return null;
  const s = String(v);
  if (s.includes("Z") || /[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return jerusalemToUtc(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
};

// Jerusalem Y-M-D key for an instant.
const dayKeyJ = (date) => {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
  return p; // en-CA → YYYY-MM-DD
};

// Fire a Jerusalem wall-clock target derived from a base instant + H:M.
const atJerusalemTime = (baseInstant, h, mi) => {
  const k = dayKeyJ(baseInstant).split("-");
  return jerusalemToUtc(+k[0], +k[1], +k[2], h, mi);
};

const MOED_LABEL = { moedA: "מועד א׳", moedB: "מועד ב׳", moedC: "מועד ג׳" };

exports.pushReminders = onSchedule(
  { schedule: "*/15 * * * *", timeZone: TZ },
  async () => {
    const db = admin.firestore();
    const now = Date.now();
    const usersSnapshot = await db.collection("users").get();
    let sentTotal = 0;

    for (const userDoc of usersSnapshot.docs) {
      const uid = userDoc.id;

      // 1. Tokens — skip user entirely if none registered.
      const tokensSnap = await db.collection("users").doc(uid).collection("cl_fcmTokens").get();
      if (tokensSnap.empty) continue;
      const tokens = tokensSnap.docs.map((d) => d.data().token).filter(Boolean);
      if (!tokens.length) continue;

      // 2. Settings.
      const profileSnap = await db.collection("users").doc(uid).collection("cl_profile").doc("main").get();
      const s = (profileSnap.exists && profileSnap.data().notificationSettings) || null;
      if (!s || !s.enabled) continue;

      // Build candidate reminders.
      const due = [];
      const consider = (key, fireDate, title, body, url = "/") => {
        if (!fireDate) return;
        const ft = fireDate.getTime();
        if (now >= ft && now < ft + WINDOW_MS) due.push({ key, title, body, url });
      };

      // Load the data slices we need.
      const [coursesSnap, tasksSnap, eventsSnap] = await Promise.all([
        db.collection("users").doc(uid).collection("cl_courses").get(),
        db.collection("users").doc(uid).collection("cl_personalTasks").get(),
        db.collection("users").doc(uid).collection("cl_events").get(),
      ]);
      const courses = coursesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // ── Exams ──
      if (s.exams !== false) {
        courses.forEach((c) => {
          ["moedA", "moedB", "moedC"].forEach((moed) => {
            const exam = parseJ(c[moed] || (c.exams && c.exams[moed]));
            if (!exam) return;
            (s.examLeadDays || [7, 1]).forEach((d) => {
              const base = new Date(exam.getTime() - d * 86400000);
              consider(
                `exam:${c.id}:${moed}:${d}`,
                atJerusalemTime(base, 9, 0),
                "תזכורת מבחן",
                `${c.name} — ${MOED_LABEL[moed]} בעוד ${d} ימים`,
              );
            });
            consider(
              `exam:${c.id}:${moed}:0`,
              atJerusalemTime(exam, 8, 0),
              "מבחן היום",
              `${c.name} — ${MOED_LABEL[moed]} היום. בהצלחה!`,
            );
          });
        });
      }

      // ── Personal tasks ──
      if (s.tasks !== false) {
        tasksSnap.docs.forEach((doc) => {
          const task = doc.data();
          if (task.done || !task.dueDate) return;
          if (task.reminderMinutes === -1) return;
          let fire;
          if (task.dueTime) {
            const dt = parseJ(`${task.dueDate}T${task.dueTime}`);
            if (!dt) return;
            const lead = task.reminderMinutes != null && task.reminderMinutes >= 0 ? task.reminderMinutes : 0;
            fire = new Date(dt.getTime() - lead * 60000);
          } else {
            fire = parseJ(`${task.dueDate}T08:00`);
          }
          consider(`task:${doc.id}`, fire, "תזכורת משימה", task.title || "משימה");
        });
      }

      // ── Events ──
      if (s.events !== false) {
        eventsSnap.docs.forEach((doc) => {
          const ev = doc.data();
          const start = parseJ(ev.start);
          if (!start) return;
          if (ev.reminderMinutes === -1) return;
          let fire;
          if (ev.allDay) {
            fire = parseJ(`${String(ev.start).slice(0, 10)}T08:00`);
          } else {
            const lead = ev.reminderMinutes != null && ev.reminderMinutes >= 0
              ? ev.reminderMinutes : (s.eventLeadMinutes != null ? s.eventLeadMinutes : 30);
            fire = new Date(start.getTime() - lead * 60000);
          }
          consider(`event:${doc.id}`, fire, "תזכורת אירוע", ev.title || "אירוע");
        });
      }

      // ── Daily digest ──
      if (s.dailyDigest !== false) {
        const [h, mi] = (s.dailyDigestTime || "08:00").split(":").map(Number);
        const fire = atJerusalemTime(new Date(now), h || 8, mi || 0);
        const tk = dayKeyJ(new Date(now));
        let events = 0, tasks = 0, exams = 0;
        eventsSnap.docs.forEach((doc) => {
          const d = parseJ(doc.data().start);
          if (d && dayKeyJ(d) === tk) events++;
        });
        tasksSnap.docs.forEach((doc) => {
          const tt = doc.data();
          if (tt.done || !tt.dueDate) return;
          const d = parseJ(tt.dueDate);
          if (d && dayKeyJ(d) === tk) tasks++;
        });
        courses.forEach((c) => {
          ["moedA", "moedB", "moedC"].forEach((moed) => {
            const d = parseJ(c[moed] || (c.exams && c.exams[moed]));
            if (d && dayKeyJ(d) === tk) exams++;
          });
        });
        const total = events + tasks + exams;
        const body = total === 0
          ? "אין אירועים או משימות מתוזמנים להיום. יום פנוי!"
          : `היום: ${events} אירועים · ${tasks} משימות · ${exams} מבחנים`;
        consider(`digest:${tk}`, fire, "סיכום יומי", body);
      }

      if (!due.length) continue;

      // Dedupe via cl_pushLog and send.
      const logCol = db.collection("users").doc(uid).collection("cl_pushLog");
      for (const n of due) {
        const logRef = logCol.doc(encodeURIComponent(n.key));
        const exists = await logRef.get();
        if (exists.exists) continue;

        const resp = await admin.messaging().sendEachForMulticast({
          tokens,
          data: { title: n.title, body: n.body, url: n.url, tag: n.key },
        });

        // Prune tokens that are no longer valid.
        const stale = [];
        resp.responses.forEach((r, i) => {
          if (!r.success) {
            const code = r.error && r.error.code;
            if (code === "messaging/registration-token-not-registered" ||
                code === "messaging/invalid-argument") {
              stale.push(tokens[i]);
            }
          }
        });
        for (const tok of stale) {
          await db.collection("users").doc(uid).collection("cl_fcmTokens")
            .doc(encodeURIComponent(tok)).delete().catch(() => {});
        }

        await logRef.set({ sentAt: admin.firestore.FieldValue.serverTimestamp(), key: n.key });
        sentTotal++;
      }
    }

    console.log(`pushReminders: dispatched ${sentTotal} reminders.`);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Staples reminder: "אולי נגמר לך?"
//
// Runs daily at 09:00. For each user with FCM tokens and push enabled (and
// notificationSettings.staples !== false), learns each grocery item's purchase
// cadence from shopping-list history, and nudges them about items that look due
// to be re-bought. One push per day max, deduped via cl_pushLog.
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

exports.staplesReminder = onSchedule(
  { schedule: "0 9 * * *", timeZone: TZ },
  async () => {
    const db = admin.firestore();
    const now = Date.now();
    const usersSnapshot = await db.collection("users").get();
    let sentTotal = 0;

    for (const userDoc of usersSnapshot.docs) {
      const uid = userDoc.id;

      // 1. Tokens — skip user entirely if none registered.
      const tokensSnap = await db.collection("users").doc(uid).collection("cl_fcmTokens").get();
      if (tokensSnap.empty) continue;
      const tokens = tokensSnap.docs.map((d) => d.data().token).filter(Boolean);
      if (!tokens.length) continue;

      // 2. Settings — opt-out via staples === false.
      const profileSnap = await db.collection("users").doc(uid).collection("cl_profile").doc("main").get();
      const s = (profileSnap.exists && profileSnap.data().notificationSettings) || null;
      if (!s || !s.enabled) continue;
      if (s.staples === false) continue;

      // 3. Read all shopping lists.
      const listsSnap = await db.collection("users").doc(uid).collection("cl_shoppingLists").get();
      if (listsSnap.empty) continue;

      // Per normalized name: purchase timestamps (bought items) + most recent display name + on-list (unchecked) flag.
      const stats = new Map();
      const getStat = (norm) => {
        let st = stats.get(norm);
        if (!st) {
          st = { times: [], display: null, displayAt: -Infinity, onList: false };
          stats.set(norm, st);
        }
        return st;
      };

      listsSnap.docs.forEach((doc) => {
        const items = doc.data().items;
        if (!Array.isArray(items)) return;
        items.forEach((it) => {
          if (!it || !it.name) return;
          const norm = String(it.name).trim().toLowerCase();
          if (!norm) return;
          const st = getStat(norm);
          const at = it.addedAt ? Date.parse(it.addedAt) : NaN;
          if (it.checked === true) {
            if (!Number.isNaN(at)) st.times.push(at);
            // Track most recent display name from purchases.
            if (!Number.isNaN(at) && at >= st.displayAt) {
              st.display = it.name;
              st.displayAt = at;
            }
          } else {
            // Currently on a list to buy — exclude from suggestions.
            st.onList = true;
          }
        });
      });

      // 4. Compute due items.
      const dueItems = [];
      stats.forEach((st, norm) => {
        if (st.onList) return; // already on a list
        if (st.times.length < 3) return;

        const times = st.times.slice().sort((a, b) => a - b);
        let sum = 0;
        for (let i = 1; i < times.length; i++) sum += times[i] - times[i - 1];
        const avgInterval = sum / (times.length - 1);
        if (avgInterval < DAY_MS || avgInterval > 60 * DAY_MS) return; // not a sane cadence

        const lastPurchase = times[times.length - 1];
        const sinceLast = now - lastPurchase;
        if (sinceLast < DAY_MS) return; // bought very recently
        if (sinceLast < 1.2 * avgInterval) return; // not yet due

        dueItems.push({
          name: st.display || norm,
          overdue: sinceLast / avgInterval,
        });
      });

      if (!dueItems.length) continue;

      // 5. Rank by overdue ratio, take top 3.
      dueItems.sort((a, b) => b.overdue - a.overdue);
      const top = dueItems.slice(0, 3);
      const names = top.map((d) => d.name);

      // 6. Send one push (deduped to once per day).
      const key = `staples:${dayKeyJ(new Date())}`;
      const logRef = db.collection("users").doc(uid).collection("cl_pushLog").doc(encodeURIComponent(key));
      const exists = await logRef.get();
      if (exists.exists) continue;

      const body = `${names.join(", ")} — אולי הגיע הזמן לקנות?`;
      const resp = await admin.messaging().sendEachForMulticast({
        tokens,
        data: { title: "אולי נגמר לך?", body, url: "/", tag: key },
      });

      // Prune tokens that are no longer valid.
      const stale = [];
      resp.responses.forEach((r, i) => {
        if (!r.success) {
          const code = r.error && r.error.code;
          if (code === "messaging/registration-token-not-registered" ||
              code === "messaging/invalid-argument") {
            stale.push(tokens[i]);
          }
        }
      });
      for (const tok of stale) {
        await db.collection("users").doc(uid).collection("cl_fcmTokens")
          .doc(encodeURIComponent(tok)).delete().catch(() => {});
      }

      await logRef.set({ sentAt: admin.firestore.FieldValue.serverTimestamp(), key });
      sentTotal++;
    }

    console.log(`staplesReminder: dispatched ${sentTotal} staples nudges.`);
  },
);
