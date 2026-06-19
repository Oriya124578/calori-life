const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");

admin.initializeApp();

const app = express();
app.use(cors({ origin: true }));

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

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

// Milestone 3.1.2: Initiate Google OAuth
app.get("/auth/google", (req, res) => {
  const uid = req.query.uid;
  if (!uid) {
    return res.status(400).send("Missing uid parameter");
  }

  const oauth2Client = getOAuth2Client(req);
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state: uid,
    prompt: 'consent'
  });

  res.redirect(url);
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

// Milestone 3.1.3: Fetch Calendar Events
app.get("/api/calendar/events", async (req, res) => {
  const uid = req.query.uid;
  const timeMin = req.query.timeMin;
  const timeMax = req.query.timeMax;

  if (!uid) {
    return res.status(401).json({ error: "Missing uid parameter" });
  }

  try {
    // Retrieve tokens from Firestore
    const doc = await admin.firestore()
      .collection("users")
      .doc(uid)
      .collection("integrations")
      .doc("google")
      .get();

    if (!doc.exists) {
      return res.status(401).json({ error: "Google Calendar not connected" });
    }

    const tokens = doc.data();
    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials(tokens);

    // If refresh token exists, googleapis will auto-refresh.
    // If we want to persist the newly refreshed token, we'd listen to 'tokens' event on oauth2Client,
    // but for simplicity, we rely on googleapis doing it in memory for this request.

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin ? new Date(timeMin).toISOString() : undefined,
      timeMax: timeMax ? new Date(timeMax).toISOString() : undefined,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const items = response.data.items || [];
    
    // Map events
    const mappedEvents = items.map(item => {
      let start = item.start.dateTime;
      let end = item.end.dateTime;
      
      if (!start && item.start.date) {
        start = `${item.start.date}T00:00:00`;
        end = `${item.end.date}T23:59:59`;
      }

      return {
        id: `gcal-${item.id}`,
        type: 'event',
        title: item.summary || 'Google Calendar Event',
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        source: 'google',
        isLocked: true
      };
    });

    res.status(200).json({ events: mappedEvents });
  } catch (error) {
    console.error("Error fetching Google Calendar events:", error);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

exports.api = onRequest({ cors: true }, app);

exports.aiManager = onSchedule({ schedule: "0 7,21 * * *", timeZone: "Asia/Jerusalem" }, async (event) => {
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
