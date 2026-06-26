# Google Calendar — Two-Way Sync Setup

What the code already does (all committed):

| App | Direction | Mechanism |
|-----|-----------|-----------|
| **calori_life** (web) | read **+ write** | server-side OAuth via `api` Cloud Function. Local `cl_events` mirror to Google on add/update/delete; Google events render in-app. |
| **calori_fitness** (Flutter) | write (Firestore→Calendar) | `CalendarSyncService` pushes upcoming workouts (`coach_sessions`) on every plan mutation. Opt-in in Settings. |
| **calori_nutrition** (Flutter) | write (Firestore→Calendar) | `CalendarSyncService` pushes one event per meal-category per day. Opt-in in "אפליקציות מחוברות". |

Project: **calori1300** (number `411703703093`). Life hosting site: **calori-life-app**.

---

## One-time external setup (Google Cloud Console — project calori1300)

1. **Enable the Calendar API**
   APIs & Services → Library → "Google Calendar API" → Enable.

2. **OAuth consent screen** → add scope
   `https://www.googleapis.com/auth/calendar.events`

3. **OAuth 2.0 Web client** (Credentials) → Authorized redirect URIs, add:
   `https://calori-life-app.web.app/auth/google/callback`
   (and your custom domain's equivalent, if any — must match `GOOGLE_REDIRECT_URI`).

4. **Android** (fitness + nutrition): the OAuth **Android** client must list the
   SHA-1 of the signing keystore (debug + release).

5. **iOS** (fitness): add the reversed client id to
   `apps/calori_fitness/ios/Runner/Info.plist` (nutrition already has it).

---

## Deploy (calori_life)

```bash
cd apps/calori_life

# 1. Set the Web OAuth credentials as Firebase secrets (paste when prompted):
firebase functions:secrets:set GOOGLE_CLIENT_ID
firebase functions:secrets:set GOOGLE_CLIENT_SECRET

# 2. Non-secret config lives in functions/.env (GOOGLE_REDIRECT_URI, FRONTEND_URL).
#    Adjust the domain there if you use a custom one.

# 3. Build + deploy hosting (rewrites /api/** and /auth/** → the api function) and functions:
npm run build
firebase deploy --only functions:api,hosting
```

Local dev against the emulator: set `VITE_API_URL` in `.env.local`
(e.g. `http://localhost:5001/calori1300/us-central1/api`).

---

## How users turn it on

- **life**: Settings → Integrations → Connect Google Calendar (redirects to Google,
  returns linked; two-way mirror is enabled automatically).
- **fitness**: Settings → "סנכרון יומן Google".
- **nutrition**: Settings → אפליקציות מחוברות → "סנכרון יומן Google".
