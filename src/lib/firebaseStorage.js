// Firebase Storage replacement for the previous Supabase-backed
// `courseFilesStorage.js`. Same exports / signatures so existing callers
// don't need to change.
//
// Path scheme (top-level `cl_files` namespace, keyed by user, so course files
// stay isolated from the shared `users/{userId}/**` tree that other parts of
// the Calori Storage Rules grant broader authenticated read access to):
//   cl_files/{userId}/{courseId}/{folder}/{storedName}
//
// Caveats vs Supabase:
//   * Firebase Storage has no "signed URL with expiry" for normal client SDK
//     usage — `getDownloadURL` returns a long-lived token URL. The `expiresIn`
//     param on `createSignedUrl` is accepted for API compatibility but ignored.
//   * `listAll` returns `{items, prefixes}` (no folder placeholder entries),
//     so the recursive walk is simpler than the Supabase version.

import {
  deleteObject,
  getDownloadURL,
  listAll,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { auth, storage } from './firebase';

// Logical namespace prefix inside each user's storage tree. Not a "bucket" in
// the Supabase sense — Firebase Storage has a single project bucket — but we
// keep the export name for API compatibility.
export const BUCKET = 'cl_files';

// Reject oversized uploads client-side.
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Storage path segments must stay ASCII and free of path-traversal segments.
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;
const assertSafeSegment = (value, label) => {
  if (!SAFE_SEGMENT.test(String(value))) {
    throw new Error(`Invalid ${label}: "${value}"`);
  }
};

// --- Hex helpers (legacy display support) ---------------------------------

export const stringToHex = (str) =>
  Array.from(new TextEncoder().encode(str))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

export const hexToString = (hex) => {
  const bytes = new Uint8Array(hex.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
  return new TextDecoder().decode(bytes);
};

const hasControlChars = (str) =>
  Array.from(str).some((ch) => ch.charCodeAt(0) < 32);

// Best-effort human-readable name for a stored object name. Mirrors the old
// Supabase impl: strip a leading timestamp prefix, then hex-decode if the
// remainder is pure hex of even length and decodes to non-control text.
export const decodeStoredName = (storedName) => {
  if (!storedName) return storedName;

  let name = storedName.replace(/^\d{10,}_/, '');

  if (/^[0-9a-f]+$/i.test(name) && name.length % 2 === 0) {
    try {
      const decoded = hexToString(name);
      if (!hasControlChars(decoded)) {
        name = decoded;
      }
    } catch {
      /* keep original */
    }
  }

  return name;
};

// --- Path + auth ----------------------------------------------------------

export const buildPath = (userId, courseId, folder, fileName) =>
  `${BUCKET}/${userId}/${courseId}/${folder}/${fileName}`;

export const getUserId = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.uid;
};

// --- CRUD -----------------------------------------------------------------

// Uploads a file and returns metadata to persist in app state ({name, path}).
// The storage key hex-encodes the filename so non-ASCII names (e.g. Hebrew)
// and spaces don't produce awkward storage keys.
export const uploadFile = async ({ userId, courseId, folder, file }) => {
  if (file.size > MAX_FILE_SIZE) {
    const err = new Error('FILE_TOO_LARGE');
    err.code = 'FILE_TOO_LARGE';
    throw err;
  }
  assertSafeSegment(courseId, 'courseId');
  assertSafeSegment(folder, 'folder');

  const storedName = `${Date.now()}_${stringToHex(file.name)}`;
  const path = buildPath(userId, courseId, folder, storedName);
  const objectRef = ref(storage, path);
  
  // Encode filename safely for HTTP Content-Disposition (supports Hebrew and spaces)
  const utf8Filename = encodeURIComponent(file.name);
  await uploadBytes(objectRef, file, {
    contentType: file.type || 'application/octet-stream',
    cacheControl: 'public, max-age=3600',
    contentDisposition: `attachment; filename*=UTF-8''${utf8Filename}`,
  });
  return { name: file.name, path };
};

// Firebase Storage `listAll` returns {items, prefixes}. We walk one level
// into each prefix (folder) to mirror the Supabase version's behavior.
export const listFilesRecursive = async (userId, courseId) => {
  const base = `${BUCKET}/${userId}/${courseId}`;
  const baseRef = ref(storage, base);

  let baseListing;
  try {
    baseListing = await listAll(baseRef);
  } catch {
    return [];
  }

  const results = [];

  // Files sitting directly under the course (rare, but the Supabase code
  // handled them so we do too).
  for (const item of baseListing.items) {
    results.push({
      id: item.fullPath,
      path: item.fullPath,
      displayName: decodeStoredName(item.name),
    });
  }

  // Walk each folder one level deep.
  for (const folderRef of baseListing.prefixes) {
    let inner;
    try {
      inner = await listAll(folderRef);
    } catch {
      continue;
    }
    for (const f of inner.items) {
      results.push({
        id: f.fullPath,
        path: f.fullPath,
        displayName: decodeStoredName(f.name),
      });
    }
  }

  // Stable ordering for UI.
  results.sort((a, b) => a.path.localeCompare(b.path));
  return results;
};

// Firebase download URLs are token-based and don't expire by default for
// unauthenticated access. The `expiresIn` arg is accepted for API
// compatibility with the old Supabase impl but is unused.
// eslint-disable-next-line no-unused-vars
export const createSignedUrl = async (path, expiresIn = 3600) => {
  return getDownloadURL(ref(storage, path));
};

export const deleteFile = async (path) => {
  await deleteObject(ref(storage, path));
};
