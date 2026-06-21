import { auth } from './firebase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/calorie-life-dev/us-central1/api';

export const initGoogleCalendarAuth = async () => {
  return Promise.resolve();
};

export const connectGoogleCalendar = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");
  
  const idToken = await user.getIdToken();
  
  // We need to redirect the browser to the Cloud Function, passing the verification token
  const authUrl = new URL(`${API_BASE_URL}/auth/google`);
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

  const url = new URL(`${API_BASE_URL}/api/calendar/events`);
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
    throw new Error(`Cloud Function error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.events || [];
};
