import { auth } from './firebase';

// In production the app is served from the same origin as the `api` function
// (Firebase Hosting rewrites /api/** and /auth/** → the function), so an empty
// base means same-origin. For local dev against the emulator, set VITE_API_URL
// (e.g. http://localhost:5001/calori1300/us-central1/api).
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// `new URL()` needs an absolute base; when API_BASE_URL is same-origin ('') we
// fall back to the current origin so URL construction doesn't throw.
const apiUrl = (path) => new URL(`${API_BASE_URL}${path}`, window.location.origin);

export const initGoogleCalendarAuth = async () => {
  return Promise.resolve();
};

export const connectGoogleCalendar = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");
  
  const idToken = await user.getIdToken();
  
  // We need to redirect the browser to the Cloud Function, passing the verification token
  const authUrl = apiUrl('/auth/google');
  authUrl.searchParams.append('idToken', idToken);
  
  window.location.href = authUrl.toString();
  
  // This promise will technically never resolve because of the redirect,
  // but we can just return a pending promise
  return new Promise(() => {});
};

export const fetchGoogleEvents = async (dateStr) => {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");
  
  const idToken = await user.getIdToken();
  
  const startOfDay = new Date(dateStr);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateStr);
  endOfDay.setHours(23, 59, 59, 999);

  const url = apiUrl('/api/calendar/events');
  url.searchParams.append('timeMin', startOfDay.toISOString());
  url.searchParams.append('timeMax', endOfDay.toISOString());

  const response = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${idToken}`
    }
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("No access token available. Please connect Google Calendar.");
    }
    throw new Error(`Cloud Function error: HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.events || [];
};

// ── Write API (two-way sync) ────────────────────────────────────────────────
// All calls resolve to null when the user has not connected Google Calendar,
// so callers can mirror best-effort without blocking the local write.

const authedFetch = async (path, options = {}) => {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");
  const idToken = await user.getIdToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
      ...(options.headers || {}),
    },
  });
  if (response.status === 401 || response.status === 403) {
    // Not connected — caller treats this as "no mirror", not a hard error.
    return { notConnected: true };
  }
  if (!response.ok) {
    // Try to return the JSON body so the caller can show the real reason
    // ({error, detail}) instead of a generic statusText.
    let body = null;
    try { body = await response.json(); } catch { /* not JSON */ }
    if (body) return { error: body.error || `HTTP ${response.status}`, detail: body.detail || '' };
    throw new Error(`Cloud Function error: HTTP ${response.status}`);
  }
  return response.json();
};

// Maps a cl_events doc to the payload the Cloud Function expects. When
// calendarId is omitted the server uses the user's configured write target.
const eventPayload = (caloriEventId, event, calendarId) => ({
  caloriEventId,
  title: event.title || '',
  notes: event.notes || '',
  location: event.location || '',
  start: event.start,
  end: event.end,
  allDay: !!event.allDay,
  source: event.source || 'calori_life',
  ...(calendarId ? { calendarId } : {}),
});

export const createGoogleEvent = async (caloriEventId, event, calendarId) => {
  const res = await authedFetch('/api/calendar/events', {
    method: 'POST',
    body: JSON.stringify(eventPayload(caloriEventId, event, calendarId)),
  });
  return res?.notConnected ? null : (res?.googleEventId || null);
};

export const updateGoogleEvent = async (googleEventId, caloriEventId, event, calendarId) => {
  const res = await authedFetch(`/api/calendar/events/${encodeURIComponent(googleEventId)}`, {
    method: 'PATCH',
    body: JSON.stringify(eventPayload(caloriEventId, event, calendarId)),
  });
  return res?.notConnected ? null : (res?.googleEventId || googleEventId);
};

export const deleteGoogleEvent = async (googleEventId, calendarId) => {
  await authedFetch(`/api/calendar/events/${encodeURIComponent(googleEventId)}`, {
    method: 'DELETE',
    body: JSON.stringify(calendarId ? { calendarId } : {}),
  });
};

// ── Calendar management ─────────────────────────────────────────────────────

// [{ id, summary, primary, accessRole, backgroundColor, writable }]
export const listGoogleCalendars = async () => {
  const res = await authedFetch('/api/calendar/list', { method: 'GET' });
  return res?.notConnected ? null : (res?.calendars || []);
};

// { writeCalendarId, readCalendarIds, caloriWorldCalendarId }
export const getCalendarSettings = async () => {
  const res = await authedFetch('/api/calendar/settings', { method: 'GET' });
  return res?.notConnected ? null : res;
};

export const saveCalendarSettings = async ({ writeCalendarId, readCalendarIds }) => {
  const body = {};
  if (writeCalendarId !== undefined) body.writeCalendarId = writeCalendarId;
  if (readCalendarIds !== undefined) body.readCalendarIds = readCalendarIds;
  const res = await authedFetch('/api/calendar/settings', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return res?.notConnected ? null : res;
};

// Creates (or reuses) the dedicated "Calori World" calendar and makes it the
// write target. Returns its calendar id.
export const ensureCaloriWorldCalendar = async () => {
  const res = await authedFetch('/api/calendar/calori-world', { method: 'POST', body: '{}' });
  return res?.notConnected ? null : (res?.calendarId || null);
};

// Pushes a whole day's schedule (cl_schedule blocks) to the write-target
// calendar (Calori World). Idempotent — re-saving converges the day's events.
export const syncScheduleToCalendar = async (date, blocks) => {
  const res = await authedFetch('/api/calendar/sync-schedule', {
    method: 'POST',
    body: JSON.stringify({ date, blocks }),
  });
  return res?.notConnected ? null : res;
};

// True once the user has linked their Google account (token doc persisted).
export const isGoogleCalendarConnected = async () => {
  try {
    const res = await authedFetch('/api/calendar/events?probe=1', { method: 'GET' });
    return !(res?.notConnected);
  } catch {
    return false;
  }
};
