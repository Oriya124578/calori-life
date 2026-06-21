// ─────────────────────────────────────────────────────────────────────────────
// Calori bridge — READ-ONLY access to the calori_1300 Flutter app's data.
//
// ⚠️  NEVER WRITE to these collections. They belong to the calori app.
//     This module only subscribes/reads. No setDoc / deleteDoc / batch here.
//
// Data shapes (discovered from the calori Dart code):
//   users/{uid}/daily_history/{yyyy-MM-dd}  ← daily aggregate (best source)
//       { date, calories, protein, carbs, fats, meals_count, nutrition_score,
//         workout_count, workout_minutes, workout_calories }
//   users/{uid}/meals/{mealId}
//       { name, calories, protein, carbs, fats, weight_grams, meal_category,
//         timestamp(Timestamp), imageUrl, is_deleted }
//   users/{uid}/workouts/{workoutId}
//       { name, calories_burned, duration_minutes, exercises[], timestamp }
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

// --- Path helpers ----------------------------------------------------------

const dailyHistoryCol = (uid) => collection(db, 'users', uid, 'daily_history');
const dailyHistoryDoc = (uid, date) =>
  doc(db, 'users', uid, 'daily_history', date);
const mealsCol = (uid) => collection(db, 'users', uid, 'meals');
const workoutsCol = (uid) => collection(db, 'users', uid, 'workouts');
const coachSessionsCol = (uid) => collection(db, 'users', uid, 'coach_sessions');

// --- Date helpers ----------------------------------------------------------

/** Format a Date as the calori daily_history doc-id key: 'yyyy-MM-dd' (local). */
export const dateKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

// Parse a YYYY-MM-DD string as a local date (midnight), avoiding UTC timezone shifts.
export const parseLocalDate = (dateStr) => {
  if (dateStr instanceof Date) return dateStr;
  if (!dateStr || typeof dateStr !== 'string') return new Date();
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }
  return new Date(dateStr);
};

const snapshotToArray = (snap) =>
  snap.docs.map((d) => ({ id: d.id, ...d.data() }));

// Convert a Firestore Timestamp | Date | string to an ISO string (or null).
const toIso = (ts) => {
  if (!ts) return null;
  if (ts instanceof Timestamp) return ts.toDate().toISOString();
  if (ts?.toDate) return ts.toDate().toISOString();
  if (ts instanceof Date) return ts.toISOString();
  if (typeof ts === 'string') return ts;
  if (typeof ts?.seconds === 'number')
    return new Date(ts.seconds * 1000).toISOString();
  return null;
};

// --- Daily history (aggregate) --------------------------------------------

/**
 * Subscribe to a single day's aggregate snapshot.
 * cb receives { date, calories, protein, ... } | null.
 */
export const subscribeDailyHistory = (uid, date, cb) => {
  if (!date) {
    cb(null);
    return () => {};
  }
  return onSnapshot(
    dailyHistoryDoc(uid, date),
    (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null),
    (err) => {
      console.warn('[calori] daily_history subscribe failed:', err?.code);
      cb(null);
    },
  );
};

/**
 * Subscribe to the most-recent N daily_history docs (sorted desc by date).
 * Useful for a weekly strip / dashboard trend.
 */
export const subscribeRecentDailyHistory = (uid, cb, days = 14) =>
  onSnapshot(
    query(dailyHistoryCol(uid), orderBy('date', 'desc'), limit(days)),
    (snap) => cb(snapshotToArray(snap)),
    (err) => {
      console.warn('[calori] recent daily_history failed:', err?.code);
      cb([]);
    },
  );

/** Subscribe to the user's main Calori profile doc (goals, weight, CP). */
export const subscribeCaloriProfile = (uid, cb) =>
  onSnapshot(
    doc(db, 'users', uid),
    (snap) => cb(snap.exists() ? snap.data() : null),
    (err) => {
      console.warn('[calori] profile subscribe failed:', err?.code);
      cb(null);
    },
  );

// --- Meals -----------------------------------------------------------------

/**
 * Subscribe to a given day's meals. cb receives a normalized array:
 *   { id, name, calories, protein, carbs, fats, weightGrams, category,
 *     timestamp(ISO), imageUrl }
 * Deleted meals (is_deleted) are filtered out.
 */
export const subscribeMealsForDay = (uid, date, cb) => {
  const day = parseLocalDate(date);
  const q = query(
    mealsCol(uid),
    where('timestamp', '>=', Timestamp.fromDate(startOfDay(day))),
    where('timestamp', '<=', Timestamp.fromDate(endOfDay(day))),
    orderBy('timestamp', 'asc'),
  );
  return onSnapshot(
    q,
    (snap) => {
      const meals = snap.docs
        .map((d) => {
          const x = d.data();
          return {
            id: d.id,
            kind: 'meal',
            name: x.name || 'ארוחה',
            calories: Number(x.calories) || 0,
            protein: Number(x.protein) || 0,
            carbs: Number(x.carbs) || 0,
            fats: Number(x.fats) || 0,
            weightGrams: x.weight_grams != null ? Number(x.weight_grams) : null,
            category: x.meal_category || 'breakfast',
            timestamp: toIso(x.timestamp),
            imageUrl: x.imageUrl || null,
            isDeleted: x.is_deleted === true,
          };
        })
        .filter((m) => !m.isDeleted);
      cb(meals);
    },
    (err) => {
      console.warn('[calori] meals subscribe failed:', err?.code);
      cb([]);
    },
  );
};

// --- Workouts --------------------------------------------------------------

/**
 * Subscribe to a given day's workouts. cb receives a normalized array:
 *   { id, name, caloriesBurned, durationMinutes, exercisesCount, timestamp(ISO) }
 */
export const subscribeWorkoutsForDay = (uid, date, cb) => {
  const day = parseLocalDate(date);
  const q = query(
    workoutsCol(uid),
    where('timestamp', '>=', Timestamp.fromDate(startOfDay(day))),
    where('timestamp', '<=', Timestamp.fromDate(endOfDay(day))),
    orderBy('timestamp', 'asc'),
  );
  return onSnapshot(
    q,
    (snap) => {
      const workouts = snap.docs.map((d) => {
        const x = d.data();
        return {
          id: d.id,
          kind: 'workout',
          name: x.name || 'אימון',
          caloriesBurned: Number(x.calories_burned) || 0,
          durationMinutes: Number(x.duration_minutes) || 0,
          exercisesCount: Array.isArray(x.exercises) ? x.exercises.length : 0,
          timestamp: toIso(x.timestamp),
        };
      });
      cb(workouts);
    },
    (err) => {
      console.warn('[calori] workouts subscribe failed:', err?.code);
      cb([]);
    },
  );
};

/**
 * Subscribe to today's coach workout sessions (workout program forecast).
 */
export const subscribeCoachSessionsForDay = (uid, date, cb) => {
  const day = parseLocalDate(date);
  const q = query(
    coachSessionsCol(uid),
    where('scheduled_date', '>=', Timestamp.fromDate(startOfDay(day))),
    where('scheduled_date', '<=', Timestamp.fromDate(endOfDay(day))),
  );
  return onSnapshot(
    q,
    (snap) => {
      const sessions = snap.docs.map((d) => {
        const x = d.data();
        return {
          id: d.id,
          kind: 'coach_session',
          type: x.type || 'rest',
          title: x.title || 'אימון מתוכנן',
          status: x.status || 'pending',
          estimatedDurationMinutes: Number(x.estimated_duration_minutes) || 0,
          scheduledDate: toIso(x.scheduled_date),
        };
      });
      cb(sessions);
    },
    (err) => {
      console.warn('[calori] coach_sessions subscribe failed:', err?.code);
      cb([]);
    },
  );
};

// --- Recipes (read-only) ---------------------------------------------------

/**
 * Fetch the user's saved recipes from the calori app's top-level `recipes`
 * collection (one-shot; used by the shopping "recipe → list" picker). Recipes
 * store their ingredients as newline-separated plain text in `ingredients_text`.
 * Returns [{ id, title, ingredientsText, imageUrl, portions }] or [].
 */
export const fetchSavedRecipes = async (uid) => {
  try {
    const q = query(
      collection(db, 'recipes'),
      where('saved_by', 'array-contains', uid),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        title: x.title || 'מתכון',
        ingredientsText: x.ingredients_text || '',
        imageUrl: x.image_url || null,
        portions: Number(x.portions) || null,
      };
    });
  } catch (err) {
    console.warn('[calori] fetchSavedRecipes failed:', err?.code);
    return [];
  }
};

