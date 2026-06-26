// scheduleEngine.js — Phase 6a
// Pure, framework-free deterministic schedule transforms.
// NO AI, NO Firebase, NO Zustand. Everything here is a pure function so it can
// be unit-tested in isolation and called from the store after AI returns.
//
// Block shape (canonical, see Phase 6a spec):
//   {
//     id: string,                    // opaque, for display / dnd-kit key
//     source: 'schedule'|'event'|'task'|'calori_meal'|'calori_workout'|'recurring'|'google',
//     refId: string|null,            // id in the source collection (for non-'schedule')
//     type:  'sleep'|'study'|'event'|'meal'|'workout'|'travel'|'leisure'|'personal'|'task',
//     title: string,
//     startTime: 'HH:MM',
//     endTime:   'HH:MM',
//     duration:  number,             // minutes; derived if absent
//     isLocked:  boolean,            // canonical lock flag (alias: 'locked')
//     isCompleted: boolean,
//     status: 'planned'|'active'|'completed'|'skipped'|'didnt_start',
//     isProposed: boolean,
//     notes: string,
//   }

export const MIN_BLOCK_MIN = 5;

// ---------- Time helpers --------------------------------------------------

/** "HH:MM" -> minutes since midnight (0..1439). Throws on invalid input. */
export const timeToMin = (hhmm) => {
  if (typeof hhmm !== 'string') throw new Error(`timeToMin: not a string: ${hhmm}`);
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`timeToMin: bad format: ${hhmm}`);
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) {
    throw new Error(`timeToMin: out of range: ${hhmm}`);
  }
  return h * 60 + mm;
};

/** minutes -> "HH:MM". Clamps within 0..1439. */
export const minToTime = (min) => {
  const v = Math.max(0, Math.min(1439, Math.round(min)));
  const h = Math.floor(v / 60);
  const m = v % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// ---------- Block normalization ------------------------------------------

/** Treat both `isLocked` and `locked` as the canonical lock flag. */
const isBlockLocked = (b) => Boolean(b.isLocked || b.locked);

/** Movable = not locked, not completed, not a structural sleep, not a real event. */
export const isMovable = (b) =>
  !isBlockLocked(b) &&
  !b.isCompleted &&
  b.type !== 'sleep' &&
  b.type !== 'event';

const cloneBlock = (b) => ({ ...b });

const durationOf = (b) => {
  if (typeof b.duration === 'number' && b.duration > 0) return b.duration;
  return timeToMin(b.endTime) - timeToMin(b.startTime);
};

const withTimes = (b, startMin, dur) => ({
  ...b,
  startTime: minToTime(startMin),
  endTime: minToTime(startMin + dur),
  duration: dur,
});

const byStartAsc = (a, b) => {
  const da = timeToMin(a.startTime);
  const db = timeToMin(b.startTime);
  if (da !== db) return da - db;
  // stable tiebreak: locked first, then by id
  if (isBlockLocked(a) !== isBlockLocked(b)) return isBlockLocked(a) ? -1 : 1;
  return String(a.id || '').localeCompare(String(b.id || ''));
};

// ---------- Forbidden window helpers (Shabbat etc.) ----------------------

/**
 * bounds: { wakeMin, sleepMin, shabbat?: { blockStartMin, blockEndMin } | null }
 *   - blockStartMin: minutes-from-midnight after which the day is forbidden
 *     (Friday eve case: forbid [blockStartMin .. 1439]).
 *   - blockEndMin:   minutes-from-midnight before which the day is forbidden
 *     (Saturday morning case: forbid [0 .. blockEndMin]).
 * Either may be null/undefined.
 */
const forbiddenIntervals = (bounds) => {
  const out = [];
  const sh = bounds && bounds.shabbat;
  if (sh && typeof sh.blockStartMin === 'number') out.push([sh.blockStartMin, 1440]);
  if (sh && typeof sh.blockEndMin === 'number') out.push([0, sh.blockEndMin]);
  return out;
};

const intersects = (aStart, aEnd, bStart, bEnd) =>
  aStart < bEnd && bStart < aEnd;

// ---------- nextLegalStart -----------------------------------------------

/**
 * Find the earliest start >= `from` where a block of length `dur` fits inside
 * wake/sleep bounds, doesn't overlap any anchor in `anchors`, and doesn't
 * intersect any forbidden window.
 *
 * anchors: array of { start, end } in minutes (locked anchors + non-movable blocks).
 * Returns minutes-from-midnight, or NO_FIT.
 */
export const NO_FIT = -1;

export const nextLegalStart = (from, dur, anchors, bounds) => {
  const wake = bounds?.wakeMin ?? 0;
  const sleep = bounds?.sleepMin ?? 1440;
  if (dur <= 0) return NO_FIT;

  const forbids = forbiddenIntervals(bounds);
  const blockers = [
    ...anchors.map((a) => [a.start, a.end]),
    ...forbids,
  ].sort((x, y) => x[0] - y[0]);

  let cursor = Math.max(from, wake);

  // Walk forward, jumping over any blocker we collide with.
  // Loop bounded by number of blockers + 1 — terminates.
  for (let i = 0; i <= blockers.length; i++) {
    if (cursor + dur > sleep) return NO_FIT;
    let collided = false;
    for (const [bs, be] of blockers) {
      if (intersects(cursor, cursor + dur, bs, be)) {
        cursor = be;
        collided = true;
        break;
      }
    }
    if (!collided) return cursor;
  }
  return NO_FIT;
};

// ---------- Accordion -----------------------------------------------------

/**
 * Pure re-packer. Reacts to a single timeline change (early finish / late
 * finish / removal / resize) by rippling non-locked blocks. Never moves
 * locked anchors, never compresses, never invents leisure blocks.
 *
 * change:
 *   { kind: 'FINISH_EARLY'|'FINISH_LATE'|'REMOVE'|'RESIZE',
 *     blockId, newEndTime?: 'HH:MM', newDuration?: number }
 *
 * Returns { blocks, tray, diagnostics }.
 */
export const accordion = (blocksIn, change, bounds) => {
  const diagnostics = { shifts: [], overflow: false, notes: [] };
  const tray = [];

  if (!Array.isArray(blocksIn) || blocksIn.length === 0) {
    return { blocks: [], tray, diagnostics };
  }

  const B = blocksIn.map(cloneBlock).sort(byStartAsc);
  const idx = B.findIndex((b) => b.id === change.blockId);
  if (idx === -1 && change.kind !== 'REMOVE') {
    diagnostics.notes.push('anchor_not_found');
    return { blocks: B, tray, diagnostics };
  }

  // Reject attempts to mutate a locked anchor (defensive — UI shouldn't allow).
  if (idx !== -1 && isBlockLocked(B[idx]) && change.kind !== 'REMOVE') {
    diagnostics.notes.push('tried_to_move_lock');
    return { blocks: B, tray, diagnostics };
  }

  // Snapshot ORIGINAL start times BEFORE any mutation — used to identify
  // "blocks that come after the change point" and to compute their desired
  // new position via delta. Map block-id -> original {start, end}.
  const originalPos = new Map(
    blocksIn.map((b) => [b.id, { start: timeToMin(b.startTime), end: timeToMin(b.endTime) }])
  );

  let cursorMin;
  let delta = 0;
  let changedBlockOriginalEnd;
  let changedBlockId = null;

  if (change.kind === 'REMOVE') {
    const removed = B[idx];
    changedBlockId = removed.id;
    const origStart = originalPos.get(removed.id).start;
    const origEnd = originalPos.get(removed.id).end;
    cursorMin = origStart;
    changedBlockOriginalEnd = origEnd;
    delta = -(origEnd - origStart);
    B.splice(idx, 1);
  } else if (change.kind === 'RESIZE') {
    changedBlockId = B[idx].id;
    const startMin = timeToMin(B[idx].startTime);
    const oldEnd = originalPos.get(B[idx].id).end;
    const dur = Math.max(MIN_BLOCK_MIN, change.newDuration ?? durationOf(B[idx]));
    B[idx] = withTimes(B[idx], startMin, dur);
    cursorMin = startMin + dur;
    changedBlockOriginalEnd = oldEnd;
    delta = startMin + dur - oldEnd;
  } else {
    // FINISH_EARLY / FINISH_LATE
    changedBlockId = B[idx].id;
    const newEndMin = timeToMin(change.newEndTime);
    const startMin = timeToMin(B[idx].startTime);
    const oldEnd = originalPos.get(B[idx].id).end;
    const dur = Math.max(MIN_BLOCK_MIN, newEndMin - startMin);
    B[idx] = withTimes(B[idx], startMin, dur);
    cursorMin = startMin + dur;
    changedBlockOriginalEnd = oldEnd;
    delta = startMin + dur - oldEnd;
  }

  // Anchors for collision detection: every non-movable block in the current
  // (post-change) B array — i.e. locked / event / sleep / completed blocks,
  // INCLUDING the changed block itself (so subsequent movables can't overlap it).
  const anchorsCurrent = () =>
    B.filter((b) => b && !isMovable(b))
      .map((b) => ({ start: timeToMin(b.startTime), end: timeToMin(b.endTime) }));

  // Also treat the changed block as an anchor for collision purposes
  // (it might be movable type-wise but its position is now fixed by user intent).
  const findChanged = () => B.find((b) => b && b.id === changedBlockId);
  const changedAnchor =
    change.kind !== 'REMOVE' && findChanged()
      ? [{ start: timeToMin(findChanged().startTime), end: timeToMin(findChanged().endTime) }]
      : [];

  // Walk movable blocks whose ORIGINAL start was >= the changed block's
  // ORIGINAL end. Process in original-start order so ripple is stable.
  const movableQueue = B
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b && isMovable(b))
    .filter(({ b }) => b.id !== changedBlockId)
    .filter(({ b }) => {
      const op = originalPos.get(b.id);
      return op && op.start >= changedBlockOriginalEnd;
    })
    .sort((x, y) => originalPos.get(x.b.id).start - originalPos.get(y.b.id).start);

  for (const { b, i } of movableQueue) {
    const dur = durationOf(b);
    const op = originalPos.get(b.id);
    const originalStart = op.start;
    // Desired: ripple by delta but never earlier than cursor.
    let desired = Math.max(cursorMin, originalStart + delta);
    // On a late change, never pull a block earlier than its original start.
    if (delta > 0) desired = Math.max(desired, originalStart);

    // Anchors = non-movable blocks + changed block; exclude this block's own slot.
    const allAnchors = [...anchorsCurrent(), ...changedAnchor];
    const otherAnchors = allAnchors.filter(
      (a) => !(a.start === timeToMin(b.startTime) && a.end === timeToMin(b.endTime))
    );

    const placedStart = nextLegalStart(desired, dur, otherAnchors, bounds);
    if (placedStart === NO_FIT) {
      tray.push({ ...b, trayReason: 'overflow' });
      diagnostics.overflow = true;
      B[i] = null;
      continue;
    }
    if (placedStart !== originalStart) {
      diagnostics.shifts.push({ id: b.id, deltaMin: placedStart - originalStart });
    }
    B[i] = withTimes(b, placedStart, dur);
    cursorMin = placedStart + dur;
  }

  const finalBlocks = B.filter(Boolean).sort(byStartAsc);
  return { blocks: finalBlocks, tray, diagnostics };
};

// ---------- validateAndRepair --------------------------------------------

/**
 * Defensive layer to run after EVERY Gemini output (generateDailySchedule /
 * tuneSchedule). Repairs overlaps, out-of-bounds, moved-locked-blocks,
 * leisure injections, Shabbat violations. Does not call AI.
 *
 * Returns { blocks, valid, violations, repairs, tray }.
 */
export const validateAndRepair = (blocksIn, bounds, originalBlocks = []) => {
  const violations = [];
  const repairs = [];
  const tray = [];

  if (!Array.isArray(blocksIn)) {
    return { blocks: [], valid: false, violations: ['not_array'], repairs, tray };
  }

  // 1) Schema sanity — drop blocks missing required fields.
  let B = blocksIn
    .map(cloneBlock)
    .filter((b) => {
      if (!b || !b.startTime || !b.endTime || !b.type) {
        violations.push({ kind: 'malformed', id: b?.id });
        return false;
      }
      try {
        timeToMin(b.startTime);
        timeToMin(b.endTime);
        return true;
      } catch {
        violations.push({ kind: 'bad_time', id: b.id });
        return false;
      }
    })
    .map((b) => {
      // Normalize lock alias.
      if (b.locked && !b.isLocked) b.isLocked = true;
      return b;
    });

  // 2) End-after-start: swap if invertible, drop otherwise.
  B = B.filter((b) => {
    const s = timeToMin(b.startTime);
    const e = timeToMin(b.endTime);
    if (e > s) return true;
    if (e < s) {
      // Point-event types (meal/reminder) carry no range — an inverted time is
      // an AI slip; collapse to a point at the start rather than swapping into a
      // tiny ranged block (which would lose their no-time-range semantics).
      if (b.type === 'meal' || b.type === 'reminder') {
        b.endTime = b.startTime;
        return true;
      }
      // swap
      const tmp = b.startTime;
      b.startTime = b.endTime;
      b.endTime = tmp;
      repairs.push({ kind: 'swapped_times', id: b.id });
      return true;
    }
    // e === s: point event — allowed for meals and reminders (no time range).
    if (b.type === 'meal' || b.type === 'reminder') return true;
    violations.push({ kind: 'zero_duration', id: b.id });
    return false;
  });

  // 3) Forbidden types — leisure/break (rule #12: no leisure blocks).
  B = B.filter((b) => {
    if (b.type === 'leisure') {
      violations.push({ kind: 'leisure_dropped', id: b.id });
      repairs.push({ kind: 'leisure_dropped', id: b.id });
      return false;
    }
    return true;
  });

  // 4) Moved-locked-blocks: restore original coordinates.
  if (originalBlocks.length > 0) {
    const originalById = new Map(
      originalBlocks.filter((b) => isBlockLocked(b)).map((b) => [b.id, b])
    );
    B = B.map((b) => {
      const orig = originalById.get(b.id);
      if (!orig) return b;
      if (b.startTime !== orig.startTime || b.endTime !== orig.endTime) {
        violations.push({ kind: 'moved_lock', id: b.id });
        repairs.push({ kind: 'restored_lock', id: b.id });
        return { ...b, startTime: orig.startTime, endTime: orig.endTime, isLocked: true };
      }
      return b;
    });
  }

  B.sort(byStartAsc);

  // Point events (reminders / point meals) have no time range, so the bounds
  // and overlap repair below would wrongly relocate or drop them (nextLegalStart
  // refuses dur<=0). Pull them aside and pass them through untouched.
  const pointEvents = B.filter((b) => timeToMin(b.startTime) === timeToMin(b.endTime));
  B = B.filter((b) => timeToMin(b.startTime) !== timeToMin(b.endTime));

  // 5) Out-of-bounds (wake/sleep) — exempt 'sleep' type.
  const wake = bounds?.wakeMin ?? 0;
  const sleep = bounds?.sleepMin ?? 1440;
  const forbids = forbiddenIntervals(bounds);

  const isForbidden = (s, e) => forbids.some(([fs, fe]) => intersects(s, e, fs, fe));

  const anchors = B.filter((b) => isBlockLocked(b) || b.type === 'event' || b.type === 'sleep' || b.isCompleted)
    .map((b) => ({ start: timeToMin(b.startTime), end: timeToMin(b.endTime) }));

  // Repair non-locked blocks that violate bounds or shabbat or overlap.
  const repaired = [];
  for (const b of B) {
    const s = timeToMin(b.startTime);
    const e = timeToMin(b.endTime);
    const dur = e - s;
    const locked = isBlockLocked(b);

    if (b.type === 'sleep') {
      repaired.push(b);
      continue;
    }

    if (locked) {
      // Locked blocks were already restored above; pass through even if OOB.
      if (s < wake || e > sleep) violations.push({ kind: 'locked_oob', id: b.id });
      repaired.push(b);
      continue;
    }

    const inBounds = s >= wake && e <= sleep;
    const inForbidden = isForbidden(s, e);
    const overlapsAnchor = anchors.some(
      (a) => intersects(s, e, a.start, a.end) && !(a.start === s && a.end === e)
    );

    if (inBounds && !inForbidden && !overlapsAnchor) {
      repaired.push(b);
      continue;
    }

    // Graceful degradation: a block that STARTS inside the window but overruns
    // its end (e.g. a study block running past the pre-Shabbat cutoff) is
    // SHORTENED to fit rather than dropped — keeping the user's study time.
    if (!inForbidden && !overlapsAnchor && s >= wake && s < sleep && e > sleep && (sleep - s) >= 15) {
      repaired.push(withTimes(b, s, sleep - s));
      repairs.push({ kind: 'clamped_end', id: b.id });
      continue;
    }

    // Try to relocate. Include blocks already placed in THIS pass as anchors so
    // several relocated blocks pack sequentially instead of stacking on the same
    // earliest slot (which previously caused later ones to be trayed).
    const placedAnchors = repaired
      .filter((rb) => rb.type !== 'sleep')
      .map((rb) => ({ start: timeToMin(rb.startTime), end: timeToMin(rb.endTime) }));
    const otherAnchors = [...anchors, ...placedAnchors].filter((a) => !(a.start === s && a.end === e));
    const placed = nextLegalStart(wake, dur, otherAnchors, bounds);
    if (placed === NO_FIT) {
      tray.push({ ...b, trayReason: inForbidden ? 'shabbat' : inBounds ? 'overlap' : 'oob' });
      violations.push({ kind: 'displaced', id: b.id });
      continue;
    }
    repaired.push(withTimes(b, placed, dur));
    repairs.push({ kind: 'relocated', id: b.id });
  }

  // 6) Pair-wise overlap pass on the repaired list.
  // FIX: maintain a "live" anchor set that grows as blocks are placed, so a
  // later block's slide considers ALL previously placed blocks (locked OR not),
  // not just its immediate predecessor. This closes the residual-overlap hole
  // when ≥3 non-locked blocks mutually overlap.
  repaired.sort(byStartAsc);
  const finalBlocks = [];
  const liveAnchors = [...anchors];
  // Track the running cursor = max end of any placed block, so a non-locked
  // slide can't accidentally land on top of an earlier sibling.
  let runningCursor = -Infinity;
  for (const b of repaired) {
    const s = timeToMin(b.startTime);
    const e = timeToMin(b.endTime);
    const prev = finalBlocks[finalBlocks.length - 1];
    const overlapsPrev = prev && timeToMin(prev.endTime) > s;
    const overlapsRunning = s < runningCursor;
    if (overlapsPrev || overlapsRunning) {
      const prevLocked = prev && isBlockLocked(prev);
      const curLocked = isBlockLocked(b);
      if (prevLocked && curLocked) {
        tray.push({ ...b, trayReason: 'double_lock' });
        violations.push({ kind: 'double_lock', id: b.id });
        continue;
      }
      if (curLocked) {
        // Locked wins: tray the previous non-locked, recompute runningCursor.
        tray.push({ ...finalBlocks.pop(), trayReason: 'displaced_by_lock' });
        violations.push({ kind: 'displaced_by_lock', id: prev.id });
        finalBlocks.push(b);
        liveAnchors.push({ start: s, end: e });
        runningCursor = Math.max(...finalBlocks.map((x) => timeToMin(x.endTime)));
        continue;
      }
      // Non-locked current: slide it past EVERY already-placed block.
      const dur = e - s;
      const fromCursor = Math.max(runningCursor, prev ? timeToMin(prev.endTime) : wake);
      const placed = nextLegalStart(fromCursor, dur, liveAnchors, bounds);
      if (placed === NO_FIT) {
        tray.push({ ...b, trayReason: 'overflow' });
        violations.push({ kind: 'overflow', id: b.id });
        continue;
      }
      const moved = withTimes(b, placed, dur);
      finalBlocks.push(moved);
      liveAnchors.push({ start: placed, end: placed + dur });
      runningCursor = Math.max(runningCursor, placed + dur);
      repairs.push({ kind: 'slid', id: b.id });
    } else {
      finalBlocks.push(b);
      liveAnchors.push({ start: s, end: e });
      runningCursor = Math.max(runningCursor, e);
    }
  }

  return {
    // Merge the untouched point events (reminders) back in.
    blocks: [...finalBlocks, ...pointEvents].sort(byStartAsc),
    valid: violations.length === 0,
    violations,
    repairs,
    tray,
  };
};

// ---------- chooseEngine --------------------------------------------------

/**
 * Decision rule: deterministic vs AI.
 * Inputs: event {kind}, blocks, bounds.
 * Returns one of:
 *   { engine: 'DETERMINISTIC', result }   — accordion handled it
 *   { engine: 'ESCALATE_AI', tray }       — accordion overflowed, AI needed
 *   { engine: 'AI', reason }              — caller should call AI directly
 */
export const chooseEngine = (event, blocks, bounds) => {
  const det = new Set(['FINISH_EARLY', 'FINISH_LATE', 'REMOVE', 'RESIZE', 'DRAG']);
  if (det.has(event.kind)) {
    const result = accordion(blocks, event, bounds);
    if (result.tray.length === 0) return { engine: 'DETERMINISTIC', result };
    return { engine: 'ESCALATE_AI', result, tray: result.tray };
  }
  if (event.kind === 'MORNING_BUILD' || event.kind === 'NL_TUNE') {
    return { engine: 'AI', reason: event.kind };
  }
  return { engine: 'AI', reason: 'unknown_event' };
};
