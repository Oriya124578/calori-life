// Firestore repository for the Calori Life app.
// All data is scoped per-user under `users/{uid}/...`. Subscribe-style helpers
// return the `onSnapshot` unsubscribe function; callers are responsible for
// invoking it on cleanup. Mutating helpers are async and throw on error.

import {
  collection,
  doc,
  deleteDoc,
  getDocs,
  onSnapshot,
  setDoc,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from './firebase';

export { increment } from 'firebase/firestore';

const commitInChunks = async (operations) => {
  const CHUNK_SIZE = 450;
  for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
    const chunk = operations.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((op) => op(batch));
    await batch.commit();
  }
};

// --- Path helpers ---------------------------------------------------------

const profileDoc = (uid) => doc(db, 'users', uid, 'cl_profile', 'main');
const coursesCol = (uid) => collection(db, 'users', uid, 'cl_courses');
const courseDoc = (uid, courseId) => doc(db, 'users', uid, 'cl_courses', courseId);
const courseTasksCol = (uid) => collection(db, 'users', uid, 'cl_courseTasks');
const courseTaskDoc = (uid, taskId) => doc(db, 'users', uid, 'cl_courseTasks', taskId);
const pomodoroCol = (uid) => collection(db, 'users', uid, 'cl_pomodoroSessions');
const pomodoroDoc = (uid, sessionId) =>
  doc(db, 'users', uid, 'cl_pomodoroSessions', sessionId);
const eventsCol = (uid) => collection(db, 'users', uid, 'cl_events');
const eventDoc = (uid, id) => doc(db, 'users', uid, 'cl_events', id);
const personalTasksCol = (uid) =>
  collection(db, 'users', uid, 'cl_personalTasks');
const personalTaskDoc = (uid, id) =>
  doc(db, 'users', uid, 'cl_personalTasks', id);
const notesCol = (uid) => collection(db, 'users', uid, 'cl_notes');
const noteDoc = (uid, id) => doc(db, 'users', uid, 'cl_notes', id);
const taskListsCol = (uid) => collection(db, 'users', uid, 'cl_taskLists');
const taskListDoc = (uid, id) => doc(db, 'users', uid, 'cl_taskLists', id);
const noteCategoriesCol = (uid) => collection(db, 'users', uid, 'cl_noteCategories');
const noteCategoryDoc = (uid, id) => doc(db, 'users', uid, 'cl_noteCategories', id);
// Phase 6a: single source-of-truth daily schedule.
const scheduleDoc = (uid, dateStr) => doc(db, 'users', uid, 'cl_schedule', dateStr);
// Phase 6e: per-day analytics aggregate doc.
const dailyAnalyticsCol = (uid) => collection(db, 'users', uid, 'cl_dailyAnalytics');
const dailyAnalyticsDoc = (uid, date) => doc(db, 'users', uid, 'cl_dailyAnalytics', date);
// Phase 6d: recurring task rules.
const recurringTasksCol = (uid) => collection(db, 'users', uid, 'cl_recurringTasks');
const recurringTaskDoc = (uid, id) => doc(db, 'users', uid, 'cl_recurringTasks', id);
const categoriesCol = (uid) => collection(db, 'users', uid, 'cl_categories');
const categoryDoc = (uid, id) => doc(db, 'users', uid, 'cl_categories', id);
// Shopping Lists
const shoppingListsCol = (uid) => collection(db, 'users', uid, 'cl_shoppingLists');
const shoppingListDoc = (uid, id) => doc(db, 'users', uid, 'cl_shoppingLists', id);
// Grocery learned dictionary (synced across devices)
const groceryDictDoc = (uid) => doc(db, 'users', uid, 'cl_profile', 'groceryDict');

// Phase 4: AI Manager Suggestions
const aiSuggestionsCol = (uid) => collection(db, 'users', uid, 'cl_aiSuggestions');
const aiSuggestionDoc = (uid, id) => doc(db, 'users', uid, 'cl_aiSuggestions', id);

// New id helper for client-minted documents.
export const newId = (uid, kind) => {
  const col =
    kind === 'event'
      ? eventsCol(uid)
      : kind === 'personalTask'
      ? personalTasksCol(uid)
      : kind === 'note'
      ? notesCol(uid)
      : kind === 'taskList'
      ? taskListsCol(uid)
      : kind === 'noteCategory'
      ? noteCategoriesCol(uid)
      : kind === 'recurringTask'
      ? recurringTasksCol(uid)
      : kind === 'category'
      ? categoriesCol(uid)
      : kind === 'shoppingList'
      ? shoppingListsCol(uid)
      : null;
  if (!col) throw new Error(`newId: unknown kind ${kind}`);
  return doc(col).id;
};

// Map a QuerySnapshot to a plain array of {id, ...data} so callers don't have
// to know about Firestore snapshot shapes.
const snapshotToArray = (snap) =>
  snap.docs.map((d) => ({ id: d.id, ...d.data() }));

// --- Profile --------------------------------------------------------------

/**
 * Subscribe to the user's profile doc. Calls `cb(profile|null)` whenever it
 * changes. Returns an unsubscribe function.
 */
export const subscribeProfile = (uid, cb) =>
  onSnapshot(profileDoc(uid), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });

/** Merge-write the profile doc. */
export const setProfile = async (uid, profileObj) => {
  await setDoc(profileDoc(uid), profileObj, { merge: true });
};

// --- FCM push tokens (Phase 5b) -------------------------------------------
// One doc per device token under users/{uid}/cl_fcmTokens. Doc id is the
// URL-encoded token so re-registration of the same token is idempotent.

const fcmTokenDoc = (uid, token) =>
  doc(db, 'users', uid, 'cl_fcmTokens', encodeURIComponent(token));

/** Register/refresh an FCM token for this device. */
export const setFcmToken = async (uid, token) => {
  await setDoc(
    fcmTokenDoc(uid, token),
    { token, platform: 'web', lastSeen: Date.now() },
    { merge: true },
  );
};

/** Remove an FCM token (on opt-out). */
export const deleteFcmToken = async (uid, token) => {
  await deleteDoc(fcmTokenDoc(uid, token));
};

// --- Courses --------------------------------------------------------------

/**
 * Subscribe to the user's courses collection. cb receives an array of
 * {id, ...data}. Returns an unsubscribe function.
 */
export const subscribeCourses = (uid, cb) =>
  onSnapshot(coursesCol(uid), (snap) => cb(snapshotToArray(snap)));

/** Merge-write a course doc. */
export const setCourse = async (uid, courseId, data) => {
  await setDoc(courseDoc(uid, courseId), data, { merge: true });
};

/**
 * Delete a course and all of its related course tasks atomically (single
 * batch). Tasks are matched by `courseId` field rather than by ID prefix.
 */
export const deleteCourse = async (uid, courseId) => {
  const q = query(courseTasksCol(uid), where('courseId', '==', courseId));
  const tasksSnap = await getDocs(q);
  const ops = [];
  ops.push((batch) => batch.delete(courseDoc(uid, courseId)));
  tasksSnap.forEach((t) => {
    ops.push((batch) => batch.delete(t.ref));
  });
  await commitInChunks(ops);
};

// --- Course tasks ---------------------------------------------------------

/** Subscribe to all course tasks for the user. Returns unsubscribe. */
export const subscribeCourseTasks = (uid, cb) =>
  onSnapshot(courseTasksCol(uid), (snap) => cb(snapshotToArray(snap)));

/** Merge-write a single course task. */
export const setCourseTask = async (uid, taskId, data) => {
  await setDoc(courseTaskDoc(uid, taskId), data, { merge: true });
};

/** Delete a single course task by id. */
export const deleteCourseTask = async (uid, taskId) => {
  await deleteDoc(courseTaskDoc(uid, taskId));
};

/**
 * Batch merge-write many course tasks at once.
 * @param {string} uid
 * @param {Object<string, object>} tasksMap - { taskId: data }
 */
export const batchSetCourseTasks = async (uid, tasksMap) => {
  const ops = [];
  for (const [taskId, data] of Object.entries(tasksMap)) {
    ops.push((batch) => batch.set(courseTaskDoc(uid, taskId), data, { merge: true }));
  }
  await commitInChunks(ops);
};

// --- Pomodoro sessions ----------------------------------------------------

/** Subscribe to all pomodoro sessions for the user. Returns unsubscribe. */
export const subscribePomodoroSessions = (uid, cb) =>
  onSnapshot(pomodoroCol(uid), (snap) => cb(snapshotToArray(snap)));

/**
 * Add a pomodoro session with an auto-generated id. Returns the new id.
 * Uses `doc(col)` to mint a client-side id so we can return it synchronously.
 */
export const addPomodoroSession = async (uid, sessionData) => {
  const ref = doc(pomodoroCol(uid));
  await setDoc(ref, sessionData);
  return ref.id;
};

/** Delete a pomodoro session by id. */
export const deletePomodoroSession = async (uid, sessionId) => {
  await deleteDoc(pomodoroDoc(uid, sessionId));
};

// --- Events (cl_events) ---------------------------------------------------

export const subscribeEvents = (uid, cb) =>
  onSnapshot(eventsCol(uid), (snap) => cb(snapshotToArray(snap)));

export const setEvent = async (uid, id, data) => {
  await setDoc(eventDoc(uid, id), data, { merge: true });
};

export const deleteEvent = async (uid, id) => {
  await deleteDoc(eventDoc(uid, id));
};

// --- Personal tasks (cl_personalTasks) ------------------------------------

export const subscribePersonalTasks = (uid, cb) =>
  onSnapshot(personalTasksCol(uid), (snap) => cb(snapshotToArray(snap)));

export const setPersonalTask = async (uid, id, data) => {
  await setDoc(personalTaskDoc(uid, id), data, { merge: true });
};

export const deletePersonalTask = async (uid, id) => {
  await deleteDoc(personalTaskDoc(uid, id));
};

// --- Quick notes (cl_notes) -----------------------------------------------

export const subscribeNotes = (uid, cb) =>
  onSnapshot(notesCol(uid), (snap) => cb(snapshotToArray(snap)));

export const setNote = async (uid, id, data) => {
  await setDoc(noteDoc(uid, id), data, { merge: true });
};

export const deleteNote = async (uid, id) => {
  await deleteDoc(noteDoc(uid, id));
};

// --- Task lists (cl_taskLists) -------------------------------------------

export const subscribeTaskLists = (uid, cb) =>
  onSnapshot(taskListsCol(uid), (snap) => cb(snapshotToArray(snap)));

export const setTaskList = async (uid, id, data) => {
  await setDoc(taskListDoc(uid, id), data, { merge: true });
};

export const deleteTaskListAndMigrateTasks = async (uid, listId, taskIdsToMigrate, targetListId = 'personal') => {
  const ops = [];
  ops.push((batch) => batch.delete(taskListDoc(uid, listId)));
  taskIdsToMigrate.forEach((taskId) => {
    ops.push((batch) => batch.set(personalTaskDoc(uid, taskId), {
      list: targetListId,
      updatedAt: new Date().toISOString(),
    }, { merge: true }));
  });
  await commitInChunks(ops);
};

// --- Note categories (cl_noteCategories) ---------------------------------

export const subscribeNoteCategories = (uid, cb) =>
  onSnapshot(noteCategoriesCol(uid), (snap) => cb(snapshotToArray(snap)));

export const setNoteCategory = async (uid, id, data) => {
  await setDoc(noteCategoryDoc(uid, id), data, { merge: true });
};

export const deleteNoteCategoryAndMigrateNotes = async (uid, categoryId, noteIdsToMigrate) => {
  const ops = [];
  ops.push((batch) => batch.delete(noteCategoryDoc(uid, categoryId)));
  noteIdsToMigrate.forEach((noteId) => {
    ops.push((batch) => batch.set(noteDoc(uid, noteId), {
      categoryId: null,
      updatedAt: new Date().toISOString(),
    }, { merge: true }));
  });
  await commitInChunks(ops);
};

// --- Categories (cl_categories) ------------------------------------------

export const subscribeCategories = (uid, cb) =>
  onSnapshot(categoriesCol(uid), (snap) => cb(snapshotToArray(snap)));

export const setCategory = async (uid, id, data) => {
  await setDoc(categoryDoc(uid, id), data, { merge: true });
};

export const deleteCategory = async (uid, id) => {
  await deleteDoc(categoryDoc(uid, id));
};

// --- Phase 6a: Daily schedule (cl_schedule) ------------------------------
// Doc id = 'yyyy-MM-dd'. Single source of truth for one day's timeline.
// Shape:
//   { date, blocks: Block[], coachNote, source, version, generatedAt, updatedAt }
// See src/lib/scheduleEngine.js for the canonical Block shape.

export const subscribeSchedule = (uid, dateStr, cb) =>
  onSnapshot(scheduleDoc(uid, dateStr), (snap) =>
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null)
  );

export const setSchedule = async (uid, dateStr, data) => {
  await setDoc(
    scheduleDoc(uid, dateStr),
    { date: dateStr, version: 1, updatedAt: new Date().toISOString(), ...data },
    { merge: true }
  );
};

export const deleteSchedule = async (uid, dateStr) => {
  await deleteDoc(scheduleDoc(uid, dateStr));
};

// --- Phase 6e: Daily analytics (cl_dailyAnalytics) -----------------------
// Doc id = 'yyyy-MM-dd'. Counters accumulated via Firestore increment().
// Shape:
//   {
//     date, plannedStudyMinutes, actualStudyMinutes, completedBlocks,
//     interruptions, interruptedMinutes, shiftedMinutes, updatedAt,
//   }

export const subscribeDailyAnalytics = (uid, date, cb) =>
  onSnapshot(dailyAnalyticsDoc(uid, date), (snap) =>
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null)
  );

export const subscribeRecentDailyAnalytics = (uid, cb, days = 14) =>
  onSnapshot(
    query(dailyAnalyticsCol(uid), orderBy('date', 'desc'), limit(days)),
    (snap) => cb(snapshotToArray(snap))
  );

export const mergeDailyAnalytics = async (uid, date, patch) =>
  setDoc(
    dailyAnalyticsDoc(uid, date),
    { date, ...patch, updatedAt: new Date().toISOString() },
    { merge: true }
  );

// --- Phase 6d: Recurring tasks (cl_recurringTasks) ------------------------

export const subscribeRecurringTasks = (uid, cb) =>
  onSnapshot(recurringTasksCol(uid), (snap) => cb(snapshotToArray(snap)));

export const setRecurringTask = async (uid, id, data) => {
  await setDoc(recurringTaskDoc(uid, id), data, { merge: true });
};

export const deleteRecurringTask = async (uid, id) => {
  await deleteDoc(recurringTaskDoc(uid, id));
};

// --- Shopping Lists (cl_shoppingLists) -----------------------------------
// Doc shape: { id, name, createdAt, updatedAt, isActive, items: [...], rawText }

export const subscribeShoppingLists = (uid, cb) =>
  onSnapshot(
    query(shoppingListsCol(uid), orderBy('createdAt', 'desc')),
    (snap) => cb(snapshotToArray(snap))
  );

export const setShoppingList = async (uid, id, data) => {
  await setDoc(shoppingListDoc(uid, id), data, { merge: true });
};

export const deleteShoppingList = async (uid, id) => {
  await deleteDoc(shoppingListDoc(uid, id));
};

// --- Grocery learned dictionary (cl_profile/groceryDict) -----------------
// One doc holding { dict: { itemNameLower: categoryKey }, updatedAt }.

export const subscribeGroceryDict = (uid, cb) =>
  onSnapshot(groceryDictDoc(uid), (snap) =>
    cb(snap.exists() ? snap.data().dict || {} : {})
  );

export const mergeGroceryDict = async (uid, dictPatch) => {
  await setDoc(
    groceryDictDoc(uid),
    { dict: dictPatch, updatedAt: new Date().toISOString() },
    { merge: true }
  );
};

// --- Phase 4: AI Suggestions (cl_aiSuggestions) --------------------------

export const subscribeAiSuggestions = (uid, cb) =>
  onSnapshot(query(aiSuggestionsCol(uid), where('status', '==', 'pending')), (snap) => cb(snapshotToArray(snap)));

export const updateAiSuggestion = async (uid, id, data) => {
  await setDoc(aiSuggestionDoc(uid, id), data, { merge: true });
};
