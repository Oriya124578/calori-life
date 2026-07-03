import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  ShoppingCart, Plus, Minus, ClipboardPaste, Wand2, Check, Trash2, Edit3,
  ChevronDown, X, ArrowRight, Loader2, Sparkles, Share2, GripVertical,
  ArrowUpDown, MoreVertical, Copy, Star, RotateCcw, ListChecks, ChefHat,
  Search, ChevronsDownUp, ChevronsUpDown, SlidersHorizontal, Store,
  Users, History, Archive, ArchiveRestore, BookmarkPlus, Bookmark,
  PackageX, Undo2, ListPlus,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import { toast } from '../../store/useToast';
import { cn } from '../../lib/utils';
import {
  parseShoppingText, categorizeWithAI, groupByCategory, getCategoryMeta, parseQuantity,
  getAllCategories, learnCategory, setShoppingCatConfig, isCustomCategory,
} from '../../lib/groceryCategories';
import { fetchSavedRecipes } from '../../lib/caloriRepo';
import { format, parseISO, isValid } from 'date-fns';
import { he as heLocale } from 'date-fns/locale';

/* ── cream v3 palette ─────────────────────────────────────── */
const CREAM = {
  bg: '#FAF7F2',
  ink: '#2A1A0A',
  muted: '#8A7A6A',
  sub: '#5A4A3A',
  border: 'rgba(180,140,80,.14)',
  borderLight: 'rgba(180,140,80,.12)',
  green: '#059669',
  greenSoft: '#D1FAE5',
  greenLight: 'rgba(5,150,105,.08)',
  red: '#DC2626',
  redSoft: '#FEE2E2',
};
const serif = "'Instrument Serif', serif";
const display = "'Fraunces', serif";

const card = {
  background: '#fff', borderRadius: 14, border: `1px solid ${CREAM.border}`,
  boxShadow: '0 2px 10px rgba(40,20,0,.05)',
};

// unchecked-first display order; preserves stored order within each group.
const sortForDisplay = (items, sinkChecked) =>
  sinkChecked
    ? [...items.filter((i) => !i.checked), ...items.filter((i) => i.checked)]
    : items;

/* Aggregate every item the user ever added across ALL lists into a ranked
   "memory": items actually bought (checked) rank first, then by total count,
   then recency. Powers the "buy again" chips + quick-add autocomplete. Pure —
   derived from existing lists, so no extra storage is needed. */
const buildItemMemory = (lists) => {
  const map = new Map();
  (lists || []).forEach((l) => {
    (l.items || []).forEach((it) => {
      const name = (it.name || '').trim();
      if (!name) return;
      const key = name.toLowerCase();
      const ts = it.addedAt ? new Date(it.addedAt).getTime() : 0;
      const prev = map.get(key);
      if (prev) {
        prev.count += 1;
        if (it.checked) prev.bought += 1;
        if (ts >= prev.lastUsed) {
          prev.lastUsed = ts;
          prev.name = name;
          prev.category = it.category || prev.category;
          prev.qty = it.qty ?? prev.qty;
          prev.unit = it.unit ?? prev.unit;
        }
      } else {
        map.set(key, {
          key, name,
          category: it.category || 'other',
          qty: it.qty ?? null,
          unit: it.unit ?? null,
          count: 1,
          bought: it.checked ? 1 : 0,
          lastUsed: ts,
        });
      }
    });
  });
  return [...map.values()].sort(
    (a, b) => (b.bought - a.bought) || (b.count - a.count) || (b.lastUsed - a.lastUsed),
  );
};

/* ── "Buy again" strip — one-tap re-add of frequently bought items ───── */
const BuyAgainStrip = ({ memory, existingNames, onAdd, t }) => {
  const suggestions = memory
    .filter((m) => m.count >= 2 && !existingNames.has(m.key))
    .slice(0, 14);
  if (suggestions.length === 0) return null;
  return (
    <div style={{ ...card, borderRadius: 16 }} className="px-3.5 py-3">
      <div className="flex items-center gap-1.5 mb-2 px-0.5">
        <RotateCcw className="w-3.5 h-3.5" style={{ color: CREAM.green }} />
        <span className="text-[12px] font-bold" style={{ color: CREAM.sub }}>
          {t('buyAgain', 'קניתי בעבר')}
        </span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {suggestions.map((m) => {
          const meta = getCategoryMeta(m.category);
          return (
            <button
              key={m.key}
              onClick={() => onAdd(m)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-transform active:scale-95"
              style={{ background: 'rgba(5,150,105,.07)', border: `1px solid ${CREAM.borderLight}` }}
            >
              <span className="text-sm">{meta.emoji}</span>
              <span className="text-[13px] font-medium whitespace-nowrap" style={{ color: CREAM.ink }}>{m.name}</span>
              <Plus className="w-3 h-3" strokeWidth={2.5} style={{ color: CREAM.green }} />
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ── Checkbox ─────────────────────────────────────────────── */
const Checkbox = ({ checked, onClick }) => (
  <motion.button
    whileTap={{ scale: 0.8 }}
    onClick={(e) => { e.stopPropagation(); onClick(); }}
    role="checkbox"
    aria-checked={checked}
    className="w-[22px] h-[22px] rounded-full shrink-0 flex items-center justify-center transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
    style={{
      border: `2px solid ${checked ? CREAM.green : 'rgba(180,140,80,.28)'}`,
      background: checked ? CREAM.green : 'transparent',
    }}
  >
    <motion.div animate={{ scale: checked ? 1 : 0 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}>
      <Check className="w-[13px] h-[13px] text-white" strokeWidth={3} />
    </motion.div>
  </motion.button>
);

/* True when the item was added in the last moments — drives the "lands in its
   category" entrance (green sweep + spring). */
const isJustAdded = (item) => {
  if (!item.addedAt) return false;
  const ts = new Date(item.addedAt).getTime();
  return Number.isFinite(ts) && Date.now() - ts < 2500;
};

/* ── Inline quantity stepper (− N +) — bump qty without opening edit ─── */
const QtyStepper = ({ item, onBump, t }) => {
  const n = parseInt(item.qty, 10);
  const display = Number.isFinite(n) ? n : 1;
  const unit = item.unit ? ` ${item.unit}` : '';
  return (
    <div className="flex items-center shrink-0 rounded-[10px] overflow-hidden" style={{ border: `1px solid ${CREAM.borderLight}` }} onClick={(e) => e.stopPropagation()}>
      <button onClick={() => onBump(-1)} disabled={display <= 1} aria-label={t('decrease', 'הפחת')} className="w-7 h-7 flex items-center justify-center transition-colors disabled:opacity-30 hover:bg-[rgba(180,140,80,.07)]" style={{ color: CREAM.muted }}>
        <Minus className="w-3.5 h-3.5" strokeWidth={2.5} />
      </button>
      <span className="min-w-[22px] text-center text-[12px] font-bold tabular-nums" style={{ color: CREAM.ink }}>{display}{unit}</span>
      <button onClick={() => onBump(1)} aria-label={t('increase', 'הוסף')} className="w-7 h-7 flex items-center justify-center transition-colors hover:bg-[rgba(5,150,105,.08)]" style={{ color: CREAM.green }}>
        <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
      </button>
    </div>
  );
};

/* ── Item Row (normal mode: tap-check + swipe-delete) ─────── */
const ItemRow = ({ item, onToggle, onEdit, onDelete, onMoveCat, onBumpQty, t, isRTL, highlight = false, shared = false }) => {
  const meta = item.qty ? `${item.qty}${item.unit ? ' ' + item.unit : ''}` : null;
  // Member attribution on shared (group) lists — who added / who bought.
  const whoLine = shared
    ? (item.checked && item.checkedBy?.name
        ? `✓ ${item.checkedBy.name}`
        : item.addedBy?.name || null)
    : null;
  const dragElastic = isRTL ? { left: 0, right: 0.6 } : { left: 0.6, right: 0 };
  const passedThreshold = (x) => (isRTL ? x > 90 : x < -90);
  return (
    <div className="relative overflow-hidden" style={{ borderBottom: `1px solid rgba(180,140,80,.06)` }}>
      {/* One-shot green sweep over a freshly added item */}
      {highlight && (
        <motion.div
          className="absolute inset-0 pointer-events-none z-10"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 1.5, delay: 0.25, ease: 'easeOut' }}
          style={{ background: 'linear-gradient(90deg, rgba(5,150,105,.18), rgba(16,185,129,.06))' }}
        />
      )}
      <div className={cn('absolute inset-0 flex items-center px-5', isRTL ? 'justify-end' : 'justify-start')} style={{ background: CREAM.redSoft }}>
        <Trash2 className="w-5 h-5" style={{ color: CREAM.red }} />
      </div>
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={dragElastic}
        onDragEnd={(_, info) => { if (passedThreshold(info.offset.x)) onDelete(); }}
        className="relative flex items-center gap-3 py-3 px-3 bg-white cursor-pointer group"
        style={{ touchAction: 'pan-y' }}
        onClick={onToggle}
      >
        <Checkbox checked={item.checked} onClick={onToggle} />
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="text-sm transition-all" style={{ color: item.checked ? CREAM.muted : CREAM.ink, textDecoration: item.checked ? 'line-through' : 'none' }}>
            {item.name}
          </span>
          {item.unit && meta && <span className="text-[11px] font-medium" style={{ color: CREAM.muted }}>{meta}</span>}
          {whoLine && <span className="text-[10px]" style={{ color: item.checked ? CREAM.green : CREAM.muted }}>{whoLine}</span>}
        </div>
        {/* Inline quantity stepper */}
        {onBumpQty && !item.checked && <QtyStepper item={item} onBump={onBumpQty} t={t} />}
        {/* One-tap category move — always visible so it works on touch too */}
        <button onClick={(e) => { e.stopPropagation(); onMoveCat(); }} aria-label={t('moveCategory', 'העבר קטגוריה')} className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0 text-base transition-transform active:scale-90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none" style={{ background: 'rgba(180,140,80,.07)' }}>
          {getCategoryMeta(item.category).emoji}
        </button>
        <button onClick={(e) => { e.stopPropagation(); onEdit(); }} aria-label={t('edit')} className="w-8 h-8 rounded-[10px] flex items-center justify-center opacity-50 hover:!opacity-100 transition-opacity shrink-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:opacity-100" style={{ color: CREAM.muted, background: 'rgba(180,140,80,.07)' }}>
          <Edit3 className="w-[14px] h-[14px]" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label={t('delete')} className="w-8 h-8 rounded-[10px] hidden sm:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:opacity-100 shrink-0" style={{ background: CREAM.redSoft, color: CREAM.red }}>
          <Trash2 className="w-4 h-4" />
        </button>
      </motion.div>
    </div>
  );
};

/* ── "My regulars" strip — curated staples, one-tap add (incl. "add all") ─ */
const RegularsStrip = ({ regulars, existingNames, onAdd, onAddAll, t }) => {
  const pending = regulars.filter((r) => !existingNames.has((r.name || '').trim().toLowerCase()));
  if (regulars.length === 0) return null;
  return (
    <div style={{ ...card, borderRadius: 16 }} className="px-3.5 py-3">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <div className="flex items-center gap-1.5">
          <Star className="w-3.5 h-3.5" style={{ color: '#D97706', fill: '#D97706' }} />
          <span className="text-[12px] font-bold" style={{ color: CREAM.sub }}>
            {t('myRegulars', 'הקבועים שלי')}
          </span>
        </div>
        {pending.length > 0 && (
          <button
            onClick={onAddAll}
            className="text-[11px] font-bold px-2.5 py-1 rounded-full transition-transform active:scale-95"
            style={{ background: CREAM.greenLight, color: CREAM.green }}
          >
            {t('addAll', 'הוסף הכל')} ({pending.length})
          </button>
        )}
      </div>
      {pending.length === 0 ? (
        <p className="text-[12px] px-0.5" style={{ color: CREAM.muted }}>{t('allRegularsAdded', 'כל הקבועים כבר ברשימה ✓')}</p>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {pending.map((r) => {
            const meta = getCategoryMeta(r.category);
            return (
              <button
                key={(r.name || '').toLowerCase()}
                onClick={() => onAdd(r)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-transform active:scale-95"
                style={{ background: 'rgba(217,119,6,.07)', border: '1px solid rgba(217,119,6,.18)' }}
              >
                <span className="text-sm">{meta.emoji}</span>
                <span className="text-[13px] font-medium whitespace-nowrap" style={{ color: CREAM.ink }}>{r.name}</span>
                <Plus className="w-3 h-3" strokeWidth={2.5} style={{ color: '#D97706' }} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ── Quick Add bar (auto-categorizes a single typed item; autocompletes from
      the user's purchase history) ─── */
const QuickAddBar = ({ onAdd, onPick, memory = [], existingNames, t, language }) => {
  const [v, setV] = useState('');
  const q = v.trim().toLowerCase();
  const matches = q.length >= 1
    ? memory.filter((m) => !existingNames.has(m.key) && m.name.toLowerCase().includes(q)).slice(0, 5)
    : [];
  const submit = () => {
    const s = v.trim();
    if (!s) return;
    setV('');
    onAdd(s);
  };
  const pick = (m) => { setV(''); onPick(m); };
  return (
    <div className="relative">
      <div className="flex items-center gap-2.5 px-3.5 py-2" style={{ ...card, borderRadius: 16 }}>
        <span className="w-[26px] h-[26px] rounded-full flex items-center justify-center shrink-0" style={{ border: '2px dashed rgba(5,150,105,.35)', color: CREAM.green }}>
          <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
        </span>
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          placeholder={t('quickAddPlaceholder', 'הוסף מוצר — הקטגוריה תזוהה לבד')}
          className="flex-1 min-w-0 bg-transparent outline-none text-sm py-1.5"
          style={{ color: CREAM.ink }}
          enterKeyHint="done"
        />
        <AnimatePresence>
          {v.trim() && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
              onClick={submit}
              className="text-xs font-bold px-3 py-1.5 rounded-lg shrink-0"
              style={{ background: CREAM.green, color: '#fff' }}
            >
              {t('add')}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
      {/* History autocomplete — tap a past item to add it with its known category */}
      <AnimatePresence>
        {matches.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="absolute left-0 right-0 z-30 mt-1.5 py-1 rounded-2xl overflow-hidden"
            style={{ background: '#fff', border: `1px solid ${CREAM.border}`, boxShadow: '0 8px 30px rgba(40,20,0,.14)' }}
          >
            {matches.map((m) => {
              const meta = getCategoryMeta(m.category);
              return (
                <button
                  key={m.key}
                  onClick={() => pick(m)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-start transition-colors hover:bg-[rgba(180,140,80,.06)]"
                >
                  <span className="text-base shrink-0">{meta.emoji}</span>
                  <span className="flex-1 min-w-0 text-sm truncate" style={{ color: CREAM.ink }}>{m.name}</span>
                  <span className="text-[10px] font-medium shrink-0" style={{ color: CREAM.muted }}>{language === 'he' ? meta.he : meta.en}</span>
                  <Plus className="w-3.5 h-3.5 shrink-0" style={{ color: CREAM.green }} />
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ── Move-to-category bottom sheet (one tap from any row) ─── */
const MoveCategorySheet = ({ item, onClose, onMove, language, isRTL, t }) => {
  const allCats = getAllCategories();
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={t('moveCategory', 'העבר קטגוריה')}>
      <motion.div className="fixed inset-0 bg-black/45 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        className="relative w-full max-w-xl z-10 p-5 pb-8"
        style={{ background: '#fff', borderRadius: '24px 24px 0 0', border: `1px solid ${CREAM.border}`, boxShadow: '0 -8px 40px rgba(40,20,0,.18)', maxHeight: '70vh', overflowY: 'auto' }}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: 'rgba(180,140,80,.25)' }} />
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg truncate" style={{ fontFamily: serif, color: CREAM.ink }}>
            {t('moveCategoryTitle', 'לאן להעביר את')} <em style={{ color: CREAM.green }}>{item.name}</em>?
          </h3>
          <button onClick={onClose} aria-label={t('cancel')} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 hover:bg-[rgba(180,140,80,.08)]">
            <X className="w-4 h-4" style={{ color: CREAM.muted }} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {allCats.map((c) => {
            const active = c.key === item.category;
            return (
              <button
                key={c.key}
                onClick={() => { if (!active) onMove(c.key); onClose(); }}
                className="flex flex-col items-center gap-1.5 px-2 py-3 rounded-2xl transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                style={{
                  border: `1.5px solid ${active ? CREAM.green : CREAM.borderLight}`,
                  background: active ? CREAM.greenLight : '#fff',
                }}
              >
                <span className="text-2xl">{c.emoji}</span>
                <span className="text-[11px] font-semibold text-center leading-tight" style={{ color: active ? CREAM.green : CREAM.sub }}>
                  {language === 'he' ? c.he : c.en}
                </span>
              </button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
};

/* ── Reorder category (drag items, incl. across categories) ── */
// Long-press (touch) or press-drag (mouse) anywhere on the row drags it; drop
// into another category's zone to re-file it. All categories render as drop
// targets — even empty ones — so an item can move into any category.
const ReorderCategory = ({ cat, items, language, t }) => {
  const name = language === 'he' ? cat.he : cat.en;
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div className="flex items-center gap-2.5 px-4 py-3">
        <span className="w-9 h-9 rounded-[12px] flex items-center justify-center text-lg shrink-0" style={{ background: 'rgba(5,150,105,.07)' }}>{cat.emoji}</span>
        <span className="flex-1 text-sm font-semibold text-start" style={{ color: CREAM.ink }}>{name}</span>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: items.length ? CREAM.greenSoft : 'rgba(180,140,80,.08)', color: items.length ? CREAM.green : CREAM.muted }}>
          {items.length}
        </span>
      </div>
      <Droppable droppableId={cat.key}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            style={{ borderTop: `1px solid ${CREAM.borderLight}`, minHeight: items.length ? undefined : 40, background: snapshot.isDraggingOver ? CREAM.greenLight : 'transparent', transition: 'background .15s' }}
          >
            {items.length === 0 && (
              <div className="px-4 py-2.5 text-[12px]" style={{ color: CREAM.muted }}>{t('dragHere')}</div>
            )}
            {items.map((item, index) => {
              const meta = item.qty ? `${item.qty}${item.unit ? ' ' + item.unit : ''}` : null;
              return (
                <Draggable key={item.id} draggableId={item.id} index={index}>
                  {(prov, snap) => (
                    <div
                      ref={prov.innerRef}
                      {...prov.draggableProps}
                      {...prov.dragHandleProps}
                      className="flex items-center gap-3 py-3 px-3"
                      style={{
                        borderBottom: `1px solid rgba(180,140,80,.06)`,
                        background: '#fff',
                        boxShadow: snap.isDragging ? '0 8px 24px rgba(40,20,0,.15)' : 'none',
                        borderRadius: snap.isDragging ? 10 : 0,
                        ...prov.draggableProps.style,
                      }}
                    >
                      <GripVertical className="w-[18px] h-[18px] shrink-0" style={{ color: CREAM.muted }} />
                      <span className="flex-1 min-w-0 text-sm truncate" style={{ color: CREAM.ink, textDecoration: item.checked ? 'line-through' : 'none', opacity: item.checked ? 0.6 : 1 }}>{item.name}</span>
                      {meta && <span className="text-[11px] font-medium shrink-0" style={{ color: CREAM.muted }}>{meta}</span>}
                    </div>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
};

/* ── Compact drop chip for EMPTY categories in reorder mode ── */
const EmptyDropChip = ({ cat, language }) => {
  const name = language === 'he' ? cat.he : cat.en;
  return (
    <Droppable droppableId={cat.key}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl min-w-0"
          style={{
            border: `1.5px dashed ${snapshot.isDraggingOver ? CREAM.green : 'rgba(180,140,80,.25)'}`,
            background: snapshot.isDraggingOver ? CREAM.greenLight : '#fff',
            transition: 'border-color .15s, background .15s',
          }}
        >
          <span className="text-base shrink-0">{cat.emoji}</span>
          <span className="text-[12px] font-medium truncate" style={{ color: snapshot.isDraggingOver ? CREAM.green : CREAM.sub }}>{name}</span>
          <div style={{ maxHeight: 0, maxWidth: 0, overflow: 'hidden' }}>{provided.placeholder}</div>
        </div>
      )}
    </Droppable>
  );
};

/* ── Category Accordion ───────────────────────────────────── */
const CategorySection = ({ group, isOpen, onToggleOpen, onToggleItem, onEditItem, onMoveItem, onDeleteItem, onAddItem, onBumpQty, t, language, isRTL, sinkChecked, shared = false }) => {
  const meta = getCategoryMeta(group.key);
  const done = group.items.filter((i) => i.checked).length;
  const total = group.items.length;
  const allDone = done === total && total > 0;
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const name = language === 'he' ? meta.he : meta.en;
  const panelId = `shop-cat-${group.key}`;
  const displayItems = sortForDisplay(group.items, sinkChecked);

  const submitAdd = () => {
    const v = draft.trim();
    setDraft('');
    setAdding(false);
    if (v) onAddItem(v, group.key);
  };

  return (
    <motion.div layout style={{ ...card, overflow: 'hidden', opacity: allDone && !isOpen ? 0.65 : 1 }}>
      <button
        onClick={onToggleOpen}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="w-full flex items-center gap-2.5 px-4 py-3 transition-colors hover:bg-[rgba(180,140,80,.04)] focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-inset"
      >
        <span className="w-9 h-9 rounded-[12px] flex items-center justify-center text-lg shrink-0" style={{ background: 'rgba(5,150,105,.07)' }}>{meta.emoji}</span>
        <span className="flex-1 text-sm font-semibold text-start" style={{ color: CREAM.ink }}>{name}</span>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ fontVariantNumeric: 'tabular-nums', ...(allDone ? { background: 'rgba(180,140,80,.08)', color: CREAM.muted, textDecoration: 'line-through' } : { background: CREAM.greenSoft, color: CREAM.green }) }}>
          {done}/{total}
        </span>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-[18px] h-[18px]" style={{ color: CREAM.muted }} />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={panelId}
            role="region"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ borderTop: `1px solid ${CREAM.borderLight}` }}
          >
            {displayItems.map((item) => {
              const fresh = isJustAdded(item);
              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={fresh ? { opacity: 0, scale: 0.92, y: -12 } : false}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                >
                  <ItemRow item={item} highlight={fresh} shared={shared} onToggle={() => onToggleItem(item.id)} onEdit={() => onEditItem(item)} onMoveCat={() => onMoveItem(item)} onDelete={() => onDeleteItem(item.id)} onBumpQty={(d) => onBumpQty(item.id, d)} t={t} isRTL={isRTL} />
                </motion.div>
              );
            })}
            {adding ? (
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderTop: `1px solid ${CREAM.borderLight}` }}>
                <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); if (e.key === 'Escape') { setAdding(false); setDraft(''); } }} onBlur={submitAdd} placeholder={t('productName')} className="flex-1 bg-transparent outline-none text-sm" style={{ color: CREAM.ink }} />
                <button onClick={submitAdd} className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: CREAM.greenLight, color: CREAM.green }}>{t('add')}</button>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-[rgba(180,140,80,.04)] transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none focus-visible:ring-inset" style={{ borderTop: `1px solid ${CREAM.borderLight}` }}>
                <span className="w-[22px] h-[22px] rounded-full flex items-center justify-center" style={{ border: `2px dashed rgba(5,150,105,.3)`, color: CREAM.green }}>
                  <Plus className="w-3 h-3" strokeWidth={2.5} />
                </span>
                <span className="text-[13px] font-medium" style={{ color: CREAM.green }}>{t('addProduct')}</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

/* ── Edit Item Modal (with category picker that teaches the dict) ── */
const EditItemModal = ({ item, onClose, onSave, isRegular, onToggleRegular, t, isRTL, language }) => {
  const [name, setName] = useState(item.name || '');
  const [qty, setQty] = useState(item.qty ? `${item.qty}${item.unit ? ' ' + item.unit : ''}` : '');
  const [category, setCategory] = useState(item.category || 'other');
  const allCats = getAllCategories();

  const handleSave = () => {
    if (!name.trim()) return;
    const trimmedQty = qty.trim();
    const parsed = trimmedQty ? parseQuantity(trimmedQty) : { qty: null, unit: null };
    onSave({ name: name.trim(), qty: parsed.qty, unit: parsed.unit, category }, category !== item.category);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('editProduct')} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
      <motion.div className="fixed inset-0 bg-black/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div className="relative w-full max-w-sm p-5 z-10 space-y-4" style={{ background: '#fff', borderRadius: 22, border: `1px solid ${CREAM.border}`, boxShadow: '0 4px 24px rgba(40,20,0,.12)' }} initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }} dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg" style={{ fontFamily: serif, color: CREAM.ink }}>{t('editProduct')}</h3>
          <button onClick={onClose} aria-label={t('cancel')} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[rgba(180,140,80,.08)]">
            <X className="w-4 h-4" style={{ color: CREAM.muted }} />
          </button>
        </div>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('productName')} className="w-full px-3.5 py-3 rounded-xl outline-none text-sm" style={{ border: `1.5px solid ${CREAM.border}`, color: CREAM.ink, background: 'rgba(250,247,242,.5)' }} />
        <input value={qty} onChange={(e) => setQty(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }} placeholder={t('itemsCount')} className="w-full px-3.5 py-3 rounded-xl outline-none text-sm" style={{ border: `1.5px solid ${CREAM.border}`, color: CREAM.ink, background: 'rgba(250,247,242,.5)' }} />
        <div>
          <div className="text-xs font-semibold mb-2 px-0.5" style={{ color: CREAM.muted }}>{t('categoryLabel')}</div>
          <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto no-scrollbar">
            {allCats.map((c) => {
              const active = category === c.key;
              return (
                <button key={c.key} onClick={() => setCategory(c.key)} className="flex items-center gap-2 px-2.5 py-2 rounded-xl text-[13px] transition-colors text-start focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none" style={{ border: `1.5px solid ${active ? CREAM.green : CREAM.borderLight}`, background: active ? CREAM.greenLight : 'transparent', color: active ? CREAM.green : CREAM.sub, fontWeight: active ? 600 : 400 }}>
                  <span className="text-base shrink-0">{c.emoji}</span>
                  <span className="truncate">{language === 'he' ? c.he : c.en}</span>
                </button>
              );
            })}
          </div>
        </div>
        {/* Mark as a regular (staple) — toggles membership in "my regulars" */}
        <button
          onClick={() => onToggleRegular({ name: name.trim(), category, qty: null, unit: null })}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl transition-colors text-start"
          style={{ border: `1.5px solid ${isRegular ? 'rgba(217,119,6,.4)' : CREAM.borderLight}`, background: isRegular ? 'rgba(217,119,6,.07)' : 'transparent' }}
        >
          <Star className="w-[18px] h-[18px] shrink-0" style={{ color: '#D97706', fill: isRegular ? '#D97706' : 'transparent' }} />
          <span className="flex-1 text-[13px] font-semibold" style={{ color: isRegular ? '#B45309' : CREAM.sub }}>
            {isRegular ? t('isRegularOn', 'מוצר קבוע — לחץ להסרה') : t('markRegular', 'סמן כמוצר קבוע')}
          </span>
        </button>
        <button onClick={handleSave} className="w-full py-3 rounded-xl text-white text-sm font-semibold" style={{ background: CREAM.green }}>{t('save')}</button>
      </motion.div>
    </div>
  );
};

/* ── Options menu (⋯) ─────────────────────────────────────── */
const OptionsMenu = ({ items, onClose, isRTL }) => (
  <div className="fixed inset-0 z-[55]" onClick={onClose}>
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.12 }}
      onClick={(e) => e.stopPropagation()}
      className={cn('absolute min-w-[180px] py-1.5 rounded-2xl overflow-hidden', isRTL ? 'left-4' : 'right-4')}
      style={{ top: 64, background: '#fff', border: `1px solid ${CREAM.border}`, boxShadow: '0 8px 30px rgba(40,20,0,.14)' }}
    >
      {items.map((it, i) => (
        <button key={i} onClick={() => { it.onClick(); onClose(); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[rgba(180,140,80,.06)] text-start" style={{ color: it.danger ? CREAM.red : CREAM.ink }}>
          <it.icon className="w-[18px] h-[18px] shrink-0" style={{ color: it.danger ? CREAM.red : CREAM.muted }} />
          {it.label}
        </button>
      ))}
    </motion.div>
  </div>
);

/* ── Paste / Parse View ───────────────────────────────────── */
const PasteView = ({ onCancel, onCreate, t, isRTL }) => {
  const learnGroceryItems = useStore((s) => s.learnGroceryItems);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [parsed, setParsed] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleParse = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const { items, unresolved } = parseShoppingText(text);
      if (items.length === 0) { toast.info(t('shoppingEmptyParse')); setBusy(false); return; }
      if (unresolved.length > 0) {
        const { learned } = await categorizeWithAI(unresolved);
        if (learned && Object.keys(learned).length > 0) learnGroceryItems(learned);
      }
      setParsed({ items, groups: groupByCategory(items) });
    } catch (e) { console.error(e); }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <button onClick={onCancel} className="flex items-center gap-2 text-sm font-semibold self-start" style={{ color: CREAM.green }}>
        <ArrowRight className={cn('w-[18px] h-[18px]', !isRTL && 'rotate-180')} />
        {t('cancel')}
      </button>

      <div style={{ ...card }} className="p-5 flex flex-col gap-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: CREAM.greenLight }}>📋</div>
          <div className="flex flex-col gap-0.5">
            <span className="text-lg" style={{ fontFamily: serif, color: CREAM.ink }}>{t('pasteList')}</span>
            <span className="text-xs" style={{ color: CREAM.muted }}>{t('pasteListSub')}</span>
          </div>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('listNamePlaceholder')} className="w-full px-3.5 py-2.5 rounded-xl outline-none text-sm" style={{ border: `1.5px solid ${CREAM.border}`, color: CREAM.ink, background: 'rgba(250,247,242,.5)' }} />
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t('pastePlaceholder')} className="w-full px-4 py-3.5 rounded-xl outline-none text-sm resize-y" style={{ minHeight: 180, border: `1.5px solid ${CREAM.border}`, color: CREAM.ink, background: 'rgba(250,247,242,.5)', lineHeight: 1.7 }} />
        <div className="flex items-center gap-1.5 text-xs px-0.5" style={{ color: CREAM.muted }}>
          <Sparkles className="w-3.5 h-3.5 shrink-0 opacity-60" />
          {t('pasteHint')}
        </div>
        <button onClick={handleParse} disabled={busy || !text.trim()} className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-white text-[15px] font-semibold disabled:opacity-50 transition-transform active:scale-[.98]" style={{ background: CREAM.green, boxShadow: '0 4px 16px rgba(5,150,105,.25)' }}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Wand2 className="w-5 h-5" />}
          {busy ? t('aiCategorizing') : t('parseList')}
        </button>
      </div>

      {parsed && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{ ...card }} className="p-4 flex flex-col gap-3">
          <div className="text-[13px] font-bold uppercase tracking-wide" style={{ color: CREAM.muted }}>
            {parsed.items.length} {t('itemsInCategories').replace('{cats}', parsed.groups.length)}
          </div>
          {parsed.groups.map((g, gi) => {
            const m = getCategoryMeta(g.key);
            const nm = isRTL ? m.he : m.en;
            return (
              <motion.div
                key={g.key}
                initial={{ opacity: 0, x: isRTL ? 18 : -18, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 360, damping: 26, delay: gi * 0.07 }}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(250,247,242,.6)', border: `1px solid ${CREAM.borderLight}` }}>
                <span className="text-xl w-7 text-center">{m.emoji}</span>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-[13px] font-semibold" style={{ color: CREAM.ink }}>{nm}</span>
                  <span className="text-[11px] truncate" style={{ color: CREAM.muted }}>{g.items.map((i) => i.name).join(', ')}</span>
                </div>
                <span className="text-base font-semibold min-w-6 text-center" style={{ fontFamily: display, color: CREAM.green }}>{g.items.length}</span>
              </motion.div>
            );
          })}
          <button onClick={() => onCreate(name.trim() || t('shoppingTitle'), text, parsed.items)} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white text-[15px] font-semibold mt-1 transition-transform active:scale-[.98]" style={{ background: CREAM.green, boxShadow: '0 4px 16px rgba(5,150,105,.25)' }}>
            <Check className="w-5 h-5" strokeWidth={2.5} />
            {t('createListWith')} — {parsed.items.length} {t('itemsCount')}
          </button>
        </motion.div>
      )}
    </div>
  );
};

/* ── List Card (Overview) ─────────────────────────────────── */
const ListCard = ({ list, onOpen, onMenu, t, locale, hero }) => {
  const items = list.items || [];
  const done = items.filter((i) => i.checked).length;
  const total = items.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const date = list.createdAt && isValid(parseISO(list.createdAt)) ? format(parseISO(list.createdAt), 'dd/MM', { locale }) : '';

  if (hero) {
    return (
      <button onClick={onOpen} className="w-full text-start rounded-2xl overflow-hidden relative transition-transform active:scale-[.99]" style={{ background: '#fff', border: `1.5px solid ${CREAM.green}`, boxShadow: '0 4px 18px rgba(5,150,105,.12)' }}>
        <div className="absolute top-0 bottom-0 w-1.5" style={{ background: CREAM.green, insetInlineEnd: 0 }} />
        <div className="p-4 pe-5 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: CREAM.greenSoft, color: CREAM.green }}>{t('activeLabel')}</span>
            <span className="text-[11px]" style={{ color: CREAM.muted }}>{date}</span>
          </div>
          <div className="text-xl" style={{ fontFamily: serif, color: CREAM.ink }}>{list.name}</div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(180,140,80,.08)' }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#10B981,#059669)' }} />
            </div>
            <span className="text-sm font-semibold" style={{ fontFamily: display, color: CREAM.green }}>{done}/{total}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-sm font-semibold" style={{ color: CREAM.green }}>
            <ShoppingCart className="w-4 h-4" />{t('continueShopping')}
          </div>
        </div>
      </button>
    );
  }

  return (
    <div style={{ ...card, borderRadius: 14, overflow: 'hidden' }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={onOpen} className="flex items-center gap-3 flex-1 min-w-0 text-start">
          <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-lg shrink-0" style={{ background: list.groupId ? 'rgba(59,130,246,.08)' : 'rgba(180,140,80,.06)' }}>{list.groupId ? '👥' : '🛒'}</div>
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="text-sm font-semibold truncate" style={{ color: CREAM.ink }}>
              {list.name}{list.isActive && <span className="ms-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full align-middle" style={{ background: CREAM.greenSoft, color: CREAM.green }}>{t('activeLabel')}</span>}
              {list.groupName && <span className="ms-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full align-middle inline-flex items-center gap-1" style={{ background: 'rgba(59,130,246,.1)', color: '#2563EB' }}><Users className="w-2.5 h-2.5 inline" />{list.groupName}</span>}
            </span>
            <span className="text-[11px]" style={{ color: CREAM.muted }}>{date} · {total} {t('itemsCount')} · {done}/{total} {t('completedItems')}</span>
          </div>
        </button>
        <button onClick={onMenu} aria-label={t('listOptions')} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 hover:bg-[rgba(180,140,80,.08)]" style={{ color: CREAM.muted }}>
          <MoreVertical className="w-[18px] h-[18px]" />
        </button>
      </div>
      <div className="h-[3px]" style={{ background: 'rgba(180,140,80,.06)' }}>
        <div className="h-full" style={{ width: `${pct}%`, background: CREAM.green, opacity: 0.5 }} />
      </div>
    </div>
  );
};

/* ── Inline rename input ──────────────────────────────────── */
const InlineRename = ({ value, onSave, onCancel, style }) => {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const [v, setV] = useState(value);
  return (
    <input
      ref={ref}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSave(v.trim() || value); if (e.key === 'Escape') onCancel(); }}
      onBlur={() => onSave(v.trim() || value)}
      className="bg-transparent outline-none border-b-2 min-w-0 flex-1"
      style={{ borderColor: CREAM.green, ...style }}
    />
  );
};

/* ── Recipe picker — turn a saved Calori recipe into shopping items ──── */
const RecipePickerSheet = ({ uid, onClose, onPick, busyId, t, isRTL }) => {
  const [recipes, setRecipes] = useState(null); // null = loading

  useEffect(() => {
    let alive = true;
    fetchSavedRecipes(uid).then((r) => { if (alive) setRecipes(r); });
    return () => { alive = false; };
  }, [uid]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={t('fromRecipe', 'ממתכון')}>
      <motion.div className="fixed inset-0 bg-black/45 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        className="relative w-full max-w-xl z-10 p-5 pb-8"
        style={{ background: '#fff', borderRadius: '24px 24px 0 0', border: `1px solid ${CREAM.border}`, boxShadow: '0 -8px 40px rgba(40,20,0,.18)', maxHeight: '78vh', overflowY: 'auto' }}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: 'rgba(180,140,80,.25)' }} />
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg flex items-center gap-2" style={{ fontFamily: serif, color: CREAM.ink }}>
            <ChefHat className="w-5 h-5" style={{ color: CREAM.green }} />
            {t('chooseRecipe', 'בחר מתכון')}
          </h3>
          <button onClick={onClose} aria-label={t('cancel')} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 hover:bg-[rgba(180,140,80,.08)]">
            <X className="w-4 h-4" style={{ color: CREAM.muted }} />
          </button>
        </div>
        <p className="text-xs mb-4 px-0.5" style={{ color: CREAM.muted }}>{t('fromRecipeSub', 'הרכיבים יתווספו כרשימת קניות מסודרת לפי קטגוריות')}</p>

        {recipes === null ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: CREAM.green }} /></div>
        ) : recipes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <ChefHat className="w-12 h-12" style={{ color: 'rgba(180,140,80,.3)' }} strokeWidth={1.5} />
            <p className="text-sm max-w-xs" style={{ color: CREAM.muted }}>{t('noSavedRecipes', 'אין מתכונים שמורים. שמור מתכונים באפליקציית Calori והם יופיעו כאן.')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recipes.map((r) => {
              const busy = busyId === r.id;
              return (
                <button
                  key={r.id}
                  disabled={!!busyId}
                  onClick={() => onPick(r)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-start transition-colors hover:bg-[rgba(180,140,80,.05)] disabled:opacity-60"
                  style={{ border: `1px solid ${CREAM.borderLight}` }}
                >
                  <div className="w-11 h-11 rounded-xl overflow-hidden shrink-0 flex items-center justify-center" style={{ background: CREAM.greenLight }}>
                    {r.imageUrl ? <img src={r.imageUrl} alt="" className="w-full h-full object-cover" /> : <ChefHat className="w-5 h-5" style={{ color: CREAM.green }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: CREAM.ink }}>{r.title}</div>
                    {r.portions ? <div className="text-[11px]" style={{ color: CREAM.muted }}>{r.portions} {t('portions', 'מנות')}</div> : null}
                  </div>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: CREAM.green }} /> : <Plus className="w-4 h-4 shrink-0" style={{ color: CREAM.green }} />}
                </button>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
};

/* ── Category jump bar — sticky chips, tap to scroll to a section ─────── */
const CategoryJumpBar = ({ groups, onJump, language }) => {
  if (groups.length <= 1) return null;
  return (
    <div className="sticky z-20 -mx-4 px-4 py-1.5" style={{ top: 62, background: 'linear-gradient(180deg, rgba(250,247,242,.96), rgba(250,247,242,.82))', backdropFilter: 'blur(8px)' }}>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
        {groups.map((g) => {
          const left = g.items.filter((i) => !i.checked).length;
          const done = left === 0;
          return (
            <button
              key={g.key}
              onClick={() => onJump(g.key)}
              className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full transition-transform active:scale-95"
              style={{ background: done ? 'rgba(180,140,80,.06)' : '#fff', border: `1px solid ${done ? CREAM.borderLight : 'rgba(5,150,105,.22)'}`, opacity: done ? 0.55 : 1 }}
            >
              <span className="text-sm">{g.emoji}</span>
              <span className="text-[12px] font-semibold whitespace-nowrap" style={{ color: done ? CREAM.muted : CREAM.ink }}>{language === 'he' ? g.he : g.en}</span>
              {!done && <span className="text-[10px] font-bold tabular-nums" style={{ color: CREAM.green }}>{left}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ── Category manager — reorder to match store aisles + add/remove custom ─ */
const CategoryManagerSheet = ({ allCats, onReorder, onAddCustom, onRemoveCustom, onClose, language, isRTL, t }) => {
  const [cats, setCats] = useState(allCats);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('🏷️');
  // Re-sync the local list only when categories are added/removed (length
  // change); a reorder keeps the user's in-flight order intact.
  useEffect(() => { setCats(allCats); }, [allCats.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragEnd = (r) => {
    if (!r.destination || r.destination.index === r.source.index) return;
    const next = [...cats];
    const [moved] = next.splice(r.source.index, 1);
    next.splice(r.destination.index, 0, moved);
    setCats(next);
    onReorder(next.map((c) => c.key));
  };

  const addCustom = () => {
    const name = newName.trim();
    if (!name) return;
    onAddCustom({ he: name, en: name, emoji: newEmoji.trim() || '🏷️' });
    setNewName('');
    setNewEmoji('🏷️');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={t('categoryOrderTitle', 'סדר קטגוריות')}>
      <motion.div className="fixed inset-0 bg-black/45 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        className="relative w-full max-w-xl z-10 p-5 pb-8"
        style={{ background: '#fff', borderRadius: '24px 24px 0 0', border: `1px solid ${CREAM.border}`, boxShadow: '0 -8px 40px rgba(40,20,0,.18)', maxHeight: '82vh', overflowY: 'auto' }}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: 'rgba(180,140,80,.25)' }} />
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg flex items-center gap-2" style={{ fontFamily: serif, color: CREAM.ink }}>
            <SlidersHorizontal className="w-5 h-5" style={{ color: CREAM.green }} />
            {t('categoryOrderTitle', 'סדר קטגוריות')}
          </h3>
          <button onClick={onClose} aria-label={t('cancel')} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 hover:bg-[rgba(180,140,80,.08)]">
            <X className="w-4 h-4" style={{ color: CREAM.muted }} />
          </button>
        </div>
        <p className="text-xs mb-4 px-0.5" style={{ color: CREAM.muted }}>{t('categoryOrderSub', 'גרור כדי לסדר לפי סדר המעברים בסופר שלך. הסדר נשמר ומסונכרן.')}</p>

        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="catorder">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps} className="flex flex-col gap-1.5">
                {cats.map((c, index) => (
                  <Draggable key={c.key} draggableId={c.key} index={index}>
                    {(prov, snap) => (
                      <div
                        ref={prov.innerRef}
                        {...prov.draggableProps}
                        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl"
                        style={{ border: `1px solid ${CREAM.borderLight}`, background: '#fff', boxShadow: snap.isDragging ? '0 8px 24px rgba(40,20,0,.15)' : 'none', ...prov.draggableProps.style }}
                      >
                        <span {...prov.dragHandleProps} className="flex items-center justify-center shrink-0" style={{ color: CREAM.muted, touchAction: 'none' }}>
                          <GripVertical className="w-[18px] h-[18px]" />
                        </span>
                        <span className="text-lg shrink-0">{c.emoji}</span>
                        <span className="flex-1 min-w-0 text-sm truncate" style={{ color: CREAM.ink }}>{language === 'he' ? c.he : c.en}</span>
                        {isCustomCategory(c.key) ? (
                          <button onClick={() => onRemoveCustom(c.key)} aria-label={t('delete')} className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: CREAM.redSoft, color: CREAM.red }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0" style={{ background: 'rgba(180,140,80,.07)', color: CREAM.muted }}>{t('builtIn', 'מובנה')}</span>
                        )}
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        {/* Add custom category */}
        <div className="mt-4 pt-4 flex items-center gap-2" style={{ borderTop: `1px solid ${CREAM.borderLight}` }}>
          <input value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} aria-label={t('emoji', 'אייקון')} maxLength={2} className="w-12 text-center px-2 py-2.5 rounded-xl outline-none text-lg" style={{ border: `1.5px solid ${CREAM.border}`, background: 'rgba(250,247,242,.5)' }} />
          <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addCustom(); }} placeholder={t('newCategoryName', 'שם קטגוריה חדשה')} className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl outline-none text-sm" style={{ border: `1.5px solid ${CREAM.border}`, color: CREAM.ink, background: 'rgba(250,247,242,.5)' }} />
          <button onClick={addCustom} disabled={!newName.trim()} className="shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: CREAM.green }}>
            <Plus className="w-4 h-4" strokeWidth={2.5} />{t('add')}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

/* ── Bottom-sheet shell shared by the new sheets ─────────────────────── */
const Sheet = ({ title, icon: Icon, sub, onClose, isRTL, t, children }) => (
  <div className="fixed inset-0 z-[60] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
    <motion.div className="fixed inset-0 bg-black/45 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
    <motion.div
      className="relative w-full max-w-xl z-10 p-5 pb-8"
      style={{ background: '#fff', borderRadius: '24px 24px 0 0', border: `1px solid ${CREAM.border}`, boxShadow: '0 -8px 40px rgba(40,20,0,.18)', maxHeight: '78vh', overflowY: 'auto' }}
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: 'rgba(180,140,80,.25)' }} />
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg flex items-center gap-2" style={{ fontFamily: serif, color: CREAM.ink }}>
          {Icon && <Icon className="w-5 h-5" style={{ color: CREAM.green }} />}
          {title}
        </h3>
        <button onClick={onClose} aria-label={t('cancel')} className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 hover:bg-[rgba(180,140,80,.08)]">
          <X className="w-4 h-4" style={{ color: CREAM.muted }} />
        </button>
      </div>
      {sub && <p className="text-xs mb-4 px-0.5" style={{ color: CREAM.muted }}>{sub}</p>}
      {children}
    </motion.div>
  </div>
);

/* ── Group picker — share an existing list or create a new group list ── */
const GroupPickerSheet = ({ groups, onPick, onClose, t, isRTL, title, sub }) => (
  <Sheet title={title} icon={Users} sub={sub} onClose={onClose} isRTL={isRTL} t={t}>
    {groups.length === 0 ? (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <Users className="w-12 h-12" style={{ color: 'rgba(180,140,80,.3)' }} strokeWidth={1.5} />
        <p className="text-sm max-w-xs" style={{ color: CREAM.muted }}>{t('noGroupsYet', 'אין קבוצות עדיין. צור או הצטרף לקבוצה במסך הקבוצות.')}</p>
      </div>
    ) : (
      <div className="flex flex-col gap-2 mt-2">
        {groups.map((g) => (
          <button key={g.id} onClick={() => onPick(g)} className="flex items-center gap-3 px-3 py-3 rounded-2xl text-start transition-colors hover:bg-[rgba(180,140,80,.05)]" style={{ border: `1px solid ${CREAM.borderLight}` }}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(59,130,246,.08)' }}>
              <Users className="w-5 h-5" style={{ color: '#2563EB' }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: CREAM.ink }}>{g.name}</div>
              {g.members?.length ? <div className="text-[11px]" style={{ color: CREAM.muted }}>{g.members.length} {t('members', 'חברים')}</div> : null}
            </div>
            <Plus className="w-4 h-4 shrink-0" style={{ color: CREAM.green }} />
          </button>
        ))}
      </div>
    )}
  </Sheet>
);

/* ── Purchase history — every item ever bought, ranked; add to active list ── */
const HistorySheet = ({ memory, onAdd, canAdd, onClose, t, isRTL, locale }) => (
  <Sheet
    title={t('purchaseHistory', 'היסטוריית קניות')} icon={History}
    sub={t('purchaseHistorySub', 'הפריטים שקנית, לפי תדירות. הפופולריים מוצעים אוטומטית ברשימות חדשות.')}
    onClose={onClose} isRTL={isRTL} t={t}
  >
    {memory.length === 0 ? (
      <p className="text-sm text-center py-10" style={{ color: CREAM.muted }}>{t('noHistory', 'עדיין אין היסטוריה — התחל לקנות :)')}</p>
    ) : (
      <div className="flex flex-col">
        {memory.slice(0, 40).map((m) => {
          const meta = getCategoryMeta(m.category);
          const last = m.lastUsed ? format(new Date(m.lastUsed), 'dd/MM/yy', { locale }) : null;
          return (
            <div key={m.key} className="flex items-center gap-3 py-2.5" style={{ borderBottom: `1px solid rgba(180,140,80,.06)` }}>
              <span className="text-lg w-7 text-center shrink-0">{meta.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate" style={{ color: CREAM.ink }}>{m.name}</div>
                <div className="text-[11px]" style={{ color: CREAM.muted }}>
                  {t('boughtTimes', 'נקנה')} {m.bought || m.count} {t('times', 'פעמים')}{last ? ` · ${t('lastTime', 'לאחרונה')} ${last}` : ''}
                </div>
              </div>
              {canAdd && (
                <button onClick={() => onAdd(m)} aria-label={t('add')} className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0" style={{ background: CREAM.greenLight, color: CREAM.green }}>
                  <Plus className="w-4 h-4" strokeWidth={2.5} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    )}
  </Sheet>
);

/* ── Template chips — one-tap new list from a saved template ─────────── */
const TemplatesStrip = ({ templates, onUse, onDelete, t }) => {
  if (!templates?.length) return null;
  return (
    <div style={{ ...card, borderRadius: 16 }} className="px-3.5 py-3">
      <div className="flex items-center gap-1.5 mb-2 px-0.5">
        <Bookmark className="w-3.5 h-3.5" style={{ color: '#7C3AED' }} />
        <span className="text-[12px] font-bold" style={{ color: CREAM.sub }}>{t('myTemplates', 'תבניות שלי')}</span>
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
        {templates.map((tpl) => (
          <div key={tpl.id} className="shrink-0 flex items-center gap-1 ps-3 pe-1.5 py-1.5 rounded-full" style={{ background: 'rgba(124,58,237,.06)', border: '1px solid rgba(124,58,237,.18)' }}>
            <button onClick={() => onUse(tpl)} className="flex items-center gap-1.5 transition-transform active:scale-95">
              <span className="text-[13px] font-medium whitespace-nowrap" style={{ color: CREAM.ink }}>{tpl.name}</span>
              <span className="text-[10px] font-bold" style={{ color: '#7C3AED' }}>{tpl.items.length}</span>
            </button>
            <button onClick={() => onDelete(tpl)} aria-label={t('delete')} className="w-5 h-5 rounded-full flex items-center justify-center" style={{ color: CREAM.muted }}>
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── Supermarket mode — focused, big-target shopping run; hides bought,
      keeps the screen awake ─────────────────────────────────────────── */
const SupermarketMode = ({ list, onToggle, onUpdateItem, onClose, onCreateFollowup, onSaveRoute, t, language, isRTL }) => {
  useEffect(() => {
    let lock = null;
    let released = false;
    const req = async () => {
      try { if ('wakeLock' in navigator) lock = await navigator.wakeLock.request('screen'); } catch { /* denied / unsupported */ }
    };
    req();
    const onVis = () => { if (document.visibilityState === 'visible' && !released) req(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { released = true; document.removeEventListener('visibilitychange', onVis); try { lock && lock.release(); } catch { /* ignore */ } };
  }, []);

  // Undo stack of this session's actions + the category order actually walked
  // (first-check order) — used to learn the user's personal aisle route.
  const [undoStack, setUndoStack] = useState([]);
  const [routeSeq, setRouteSeq] = useState([]);
  const [confirmExit, setConfirmExit] = useState(false);
  const [summary, setSummary] = useState(false);

  const items = list.items || [];
  const unavailable = items.filter((i) => !i.checked && i.unavailable);
  const remaining = groupByCategory(items.filter((i) => !i.checked && !i.unavailable));
  const done = items.filter((i) => i.checked).length;
  const total = items.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const leftCount = total - done;
  const allPicked = total > 0 && remaining.length === 0;

  const handleCheck = (item) => {
    setRouteSeq((s) => (s.includes(item.category) ? s : [...s, item.category]));
    setUndoStack((s) => [...s.slice(-19), { type: 'check', id: item.id }]);
    onToggle(item.id);
  };
  const handleUnavailable = (item) => {
    setUndoStack((s) => [...s.slice(-19), { type: 'unavail', id: item.id }]);
    onUpdateItem(item.id, { unavailable: true });
  };
  const handleUndo = () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack((s) => s.slice(0, -1));
    if (last.type === 'check') onToggle(last.id);
    else onUpdateItem(last.id, { unavailable: false });
  };

  const tryClose = () => {
    if (leftCount > 0 && done > 0) setConfirmExit(true);
    else if (allPicked || (total > 0 && done === total)) setSummary(true);
    else onClose();
  };

  const followupCount = leftCount; // unchecked (incl. unavailable)
  const canSaveRoute = routeSeq.length >= 3;

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex flex-col"
      style={{ background: CREAM.bg }}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Header + progress */}
      <div className="shrink-0 px-4 pt-4 pb-3" style={{ background: '#fff', borderBottom: `1px solid ${CREAM.border}` }}>
        <div className="flex items-center gap-3 mb-3">
          <button onClick={tryClose} aria-label={t('exitSupermarket', 'צא ממצב סופר')} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(180,140,80,.08)', color: CREAM.ink }}>
            <X className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wide flex items-center gap-1" style={{ color: CREAM.green }}>
              <Store className="w-3.5 h-3.5" />{t('supermarketMode', 'מצב סופר')}
            </div>
            <div className="text-lg truncate" style={{ fontFamily: serif, color: CREAM.ink }}>{list.name}</div>
          </div>
          <div className="text-base font-bold tabular-nums" style={{ fontFamily: display, color: CREAM.green }}>{done}/{total}</div>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(180,140,80,.1)' }}>
          <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg,#10B981,#059669)' }} animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} />
        </div>
      </div>

      {/* Big-target list — only unbought items */}
      <div className="flex-1 overflow-y-auto px-3 py-3 pb-24" style={{ WebkitOverflowScrolling: 'touch' }}>
        {allPicked ? (
          <div className="flex flex-col items-center justify-center gap-4 h-full text-center px-6">
            <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#10B981,#047857)' }}>
              <Check className="w-10 h-10 text-white" strokeWidth={3} />
            </div>
            <div className="text-2xl" style={{ fontFamily: serif, color: CREAM.ink }}>{t('shoppingDoneTitle', 'הקנייה הושלמה 🎉')}</div>
            {unavailable.length > 0 && (
              <p className="text-sm" style={{ color: CREAM.muted }}>{unavailable.length} {t('itemsMissingAtStore', 'פריטים לא היו במלאי')}</p>
            )}
            <button onClick={() => setSummary(true)} className="px-6 py-3 rounded-2xl text-white text-[15px] font-semibold" style={{ background: CREAM.green }}>{t('finishShopping', 'סיכום קנייה')}</button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 max-w-xl mx-auto">
            {remaining.map((g) => (
              <div key={g.key}>
                <div className="flex items-center gap-2 px-1 pb-1.5">
                  <span className="text-lg">{g.emoji}</span>
                  <span className="text-sm font-bold" style={{ color: CREAM.sub }}>{language === 'he' ? g.he : g.en}</span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: CREAM.greenSoft, color: CREAM.green }}>{g.items.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {g.items.map((item) => (
                    <motion.div key={item.id} layout className="flex items-center gap-2 w-full px-3 py-3 rounded-2xl" style={{ ...card, borderRadius: 18 }}>
                      <button onClick={() => handleCheck(item)} className="flex items-center gap-4 flex-1 min-w-0 text-start transition-transform active:scale-[.98] py-1">
                        <span className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center" style={{ border: `2.5px solid rgba(180,140,80,.3)` }} />
                        <span className="flex-1 min-w-0 text-[17px] font-semibold truncate" style={{ color: CREAM.ink }}>{item.name}</span>
                        {item.qty && <span className="text-[15px] font-bold tabular-nums shrink-0" style={{ color: CREAM.green }}>{item.qty}{item.unit ? ` ${item.unit}` : ''}</span>}
                      </button>
                      <button onClick={() => handleUnavailable(item)} aria-label={t('outOfStock', 'אין במלאי')} className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform active:scale-90" style={{ background: 'rgba(220,38,38,.06)', color: CREAM.red }}>
                        <PackageX className="w-5 h-5" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}

            {/* Out-of-stock shelf — tap to restore */}
            {unavailable.length > 0 && (
              <div className="mt-2">
                <div className="flex items-center gap-2 px-1 pb-1.5">
                  <PackageX className="w-4 h-4" style={{ color: CREAM.red }} />
                  <span className="text-sm font-bold" style={{ color: CREAM.sub }}>{t('outOfStockSection', 'לא היה במלאי')}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {unavailable.map((item) => (
                    <button key={item.id} onClick={() => onUpdateItem(item.id, { unavailable: false })} className="flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-start" style={{ background: 'rgba(220,38,38,.04)', border: '1px dashed rgba(220,38,38,.25)', opacity: 0.8 }}>
                      <PackageX className="w-4 h-4 shrink-0" style={{ color: CREAM.red }} />
                      <span className="flex-1 min-w-0 text-sm truncate" style={{ color: CREAM.sub, textDecoration: 'line-through' }}>{item.name}</span>
                      <RotateCcw className="w-3.5 h-3.5 shrink-0" style={{ color: CREAM.muted }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom bar: undo + finish */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-5 pt-3 flex items-center gap-2" style={{ background: 'linear-gradient(0deg, rgba(250,247,242,.98), rgba(250,247,242,0))' }}>
        <AnimatePresence>
          {undoStack.length > 0 && (
            <motion.button
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
              onClick={handleUndo}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold shrink-0"
              style={{ background: '#fff', border: `1px solid ${CREAM.border}`, color: CREAM.ink, boxShadow: '0 4px 14px rgba(40,20,0,.1)' }}
            >
              <Undo2 className="w-4 h-4" />{t('undo', 'בטל')}
            </motion.button>
          )}
        </AnimatePresence>
        <div className="flex-1" />
        <button onClick={tryClose} className="px-5 py-3 rounded-2xl text-sm font-semibold text-white" style={{ background: CREAM.green, boxShadow: '0 4px 14px rgba(5,150,105,.3)' }}>
          {t('finishShopping', 'סיכום קנייה')}
        </button>
      </div>

      {/* Exit confirmation — items still left */}
      <AnimatePresence>
        {confirmExit && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
            <motion.div className="fixed inset-0 bg-black/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setConfirmExit(false)} />
            <motion.div className="relative w-full max-w-sm p-5 z-10 flex flex-col gap-3" style={{ background: '#fff', borderRadius: 22 }} initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}>
              <div className="text-lg" style={{ fontFamily: serif, color: CREAM.ink }}>{t('itemsLeftTitle', 'נשארו פריטים ברשימה')}</div>
              <p className="text-sm" style={{ color: CREAM.muted }}>{leftCount} {t('itemsLeftSub', 'פריטים עדיין לא סומנו. לסיים בכל זאת?')}</p>
              <button onClick={() => { setConfirmExit(false); setSummary(true); }} className="w-full py-3 rounded-xl text-white text-sm font-semibold" style={{ background: CREAM.green }}>{t('finishAnyway', 'סיים וראה סיכום')}</button>
              <button onClick={() => setConfirmExit(false)} className="w-full py-3 rounded-xl text-sm font-semibold" style={{ background: 'rgba(180,140,80,.08)', color: CREAM.ink }}>{t('keepShopping', 'המשך קנייה')}</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Shopping summary */}
      <AnimatePresence>
        {summary && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-6">
            <motion.div className="fixed inset-0 bg-black/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div className="relative w-full max-w-sm p-5 z-10 flex flex-col gap-4" style={{ background: '#fff', borderRadius: 22 }} initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}>
              <div className="text-xl text-center" style={{ fontFamily: serif, color: CREAM.ink }}>{t('shoppingSummary', 'סיכום קנייה')} 🛒</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl py-3" style={{ background: CREAM.greenLight }}>
                  <div className="text-xl font-bold" style={{ fontFamily: display, color: CREAM.green }}>{done}</div>
                  <div className="text-[11px]" style={{ color: CREAM.sub }}>{t('bought', 'נקנו')}</div>
                </div>
                <div className="rounded-xl py-3" style={{ background: 'rgba(220,38,38,.06)' }}>
                  <div className="text-xl font-bold" style={{ fontFamily: display, color: CREAM.red }}>{unavailable.length}</div>
                  <div className="text-[11px]" style={{ color: CREAM.sub }}>{t('outOfStockShort', 'אין במלאי')}</div>
                </div>
                <div className="rounded-xl py-3" style={{ background: 'rgba(180,140,80,.07)' }}>
                  <div className="text-xl font-bold" style={{ fontFamily: display, color: CREAM.sub }}>{leftCount - unavailable.length}</div>
                  <div className="text-[11px]" style={{ color: CREAM.sub }}>{t('skipped', 'דולגו')}</div>
                </div>
              </div>
              {followupCount > 0 && (
                <button onClick={() => { onCreateFollowup(); onClose(); }} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white text-sm font-semibold" style={{ background: CREAM.green }}>
                  <ListPlus className="w-4 h-4" />{t('createFollowup', 'צור רשימת השלמות')} ({followupCount})
                </button>
              )}
              {canSaveRoute && (
                <button onClick={() => { onSaveRoute(routeSeq); setSummary(false); onClose(); }} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold" style={{ background: 'rgba(124,58,237,.08)', color: '#7C3AED' }}>
                  <SlidersHorizontal className="w-4 h-4" />{t('saveRoute', 'שמור את סדר המסלול שלי')}
                </button>
              )}
              <button onClick={onClose} className="w-full py-3 rounded-xl text-sm font-semibold" style={{ background: 'rgba(180,140,80,.08)', color: CREAM.ink }}>{t('done', 'סיום')}</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

/* ── Main View ────────────────────────────────────────────── */
export const ShoppingListView = () => {
  const { t, language } = useTranslation();
  const isRTL = language === 'he';
  const locale = isRTL ? heLocale : undefined;

  const shoppingLists = useStore((s) => s.data.shoppingLists);
  const createShoppingList = useStore((s) => s.createShoppingList);
  const toggleShoppingItem = useStore((s) => s.toggleShoppingItem);
  const addShoppingItem = useStore((s) => s.addShoppingItem);
  const updateShoppingItem = useStore((s) => s.updateShoppingItem);
  const removeShoppingItem = useStore((s) => s.removeShoppingItem);
  const deleteShoppingList = useStore((s) => s.deleteShoppingList);
  const renameShoppingList = useStore((s) => s.renameShoppingList);
  const setActiveShoppingList = useStore((s) => s.setActiveShoppingList);
  const unsetActiveShoppingList = useStore((s) => s.unsetActiveShoppingList);
  const moveShoppingItem = useStore((s) => s.moveShoppingItem);
  const resetShoppingChecks = useStore((s) => s.resetShoppingChecks);
  const duplicateShoppingList = useStore((s) => s.duplicateShoppingList);
  const learnGroceryItems = useStore((s) => s.learnGroceryItems);
  const addShoppingRegular = useStore((s) => s.addShoppingRegular);
  const removeShoppingRegular = useStore((s) => s.removeShoppingRegular);
  const bumpShoppingItemQty = useStore((s) => s.bumpShoppingItemQty);
  const setShoppingCategoryOrder = useStore((s) => s.setShoppingCategoryOrder);
  const addShoppingCustomCategory = useStore((s) => s.addShoppingCustomCategory);
  const removeShoppingCustomCategory = useStore((s) => s.removeShoppingCustomCategory);
  // Groups + shared lists
  const myGroups = useStore((s) => s.data.groups);
  const groupShoppingLists = useStore((s) => s.data.groupShoppingLists);
  const toggleGroupShoppingItem = useStore((s) => s.toggleGroupShoppingItem);
  const addGroupShoppingItem = useStore((s) => s.addGroupShoppingItem);
  const updateGroupShoppingItem = useStore((s) => s.updateGroupShoppingItem);
  const removeGroupShoppingItem = useStore((s) => s.removeGroupShoppingItem);
  const bumpGroupShoppingItemQty = useStore((s) => s.bumpGroupShoppingItemQty);
  const moveGroupShoppingItem = useStore((s) => s.moveGroupShoppingItem);
  const resetGroupShoppingChecks = useStore((s) => s.resetGroupShoppingChecks);
  const renameGroupShoppingList = useStore((s) => s.renameGroupShoppingList);
  const createGroupShoppingList = useStore((s) => s.createGroupShoppingList);
  const deleteGroupShoppingList = useStore((s) => s.deleteGroupShoppingList);
  const shareShoppingListToGroup = useStore((s) => s.shareShoppingListToGroup);
  // Deep-link: a shared list id to auto-open (set from the group "Open List" card).
  const pendingShoppingListId = useStore((s) => s.pendingShoppingListId);
  const clearPendingShoppingList = useStore((s) => s.clearPendingShoppingList);
  // Archive + templates + follow-up
  const archiveShoppingList = useStore((s) => s.archiveShoppingList);
  const unarchiveShoppingList = useStore((s) => s.unarchiveShoppingList);
  const saveShoppingTemplate = useStore((s) => s.saveShoppingTemplate);
  const deleteShoppingTemplate = useStore((s) => s.deleteShoppingTemplate);
  const createListFromTemplate = useStore((s) => s.createListFromTemplate);
  const createFollowupList = useStore((s) => s.createFollowupList);
  const shoppingTemplates = useStore((s) => s.data.profile?.shoppingTemplates);
  const shoppingRegulars = useStore((s) => s.data.profile?.shoppingRegulars);
  const shoppingCategoryOrder = useStore((s) => s.data.profile?.shoppingCategoryOrder);
  const shoppingCustomCategories = useStore((s) => s.data.profile?.shoppingCustomCategories);
  const regulars = useMemo(() => shoppingRegulars || [], [shoppingRegulars]);
  const uid = useStore((s) => s.uid);

  // Push the user's aisle order + custom categories into the grocery engine so
  // every pure helper (getCategoryMeta / getAllCategories / groupByCategory)
  // below reflects it. Synchronous so the very first render is already correct.
  setShoppingCatConfig({ custom: shoppingCustomCategories || [], order: shoppingCategoryOrder || null });

  const [mode, setMode] = useState('lists'); // 'lists' | 'paste'
  const [recipePicker, setRecipePicker] = useState(false);
  const [recipeBusyId, setRecipeBusyId] = useState(null);
  const [viewingListId, setViewingListId] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [moveItem, setMoveItem] = useState(null);
  const [openOverrides, setOpenOverrides] = useState({});
  const [reorderMode, setReorderMode] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [menuListId, setMenuListId] = useState(null);
  const [sinkChecked, setSinkChecked] = useState(() => {
    try { return localStorage.getItem('cl_shop_sink') === '1'; } catch { return false; }
  });
  const [query, setQuery] = useState('');
  const [showCatManager, setShowCatManager] = useState(false);
  const [supermarketOpen, setSupermarketOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [groupPicker, setGroupPicker] = useState(null); // { mode: 'share'|'create', listId? }

  // Flatten group lists (from every group the user belongs to) into the same
  // shape as personal lists, tagged with groupId + groupName.
  const groupLists = useMemo(() => {
    const byId = {};
    (myGroups || []).forEach((g) => { byId[g.id] = g; });
    return Object.entries(groupShoppingLists || {}).flatMap(([gid, ls]) =>
      (ls || []).map((l) => ({ ...l, groupId: gid, groupName: byId[gid]?.name || '' }))
    );
  }, [groupShoppingLists, myGroups]);

  const visibleLists = useMemo(() => shoppingLists.filter((l) => !l.archived), [shoppingLists]);
  const archivedLists = useMemo(() => shoppingLists.filter((l) => l.archived), [shoppingLists]);
  const templates = useMemo(() => shoppingTemplates || [], [shoppingTemplates]);

  const activeList = useMemo(() => visibleLists.find((l) => l.isActive), [visibleLists]);
  const viewingList = useMemo(
    () => shoppingLists.find((l) => l.id === viewingListId) || groupLists.find((l) => l.id === viewingListId),
    [shoppingLists, groupLists, viewingListId],
  );

  // Single action surface for the detail view — personal and group lists get
  // the same UI; only the store calls differ.
  const listApi = useMemo(() => {
    if (!viewingList) return null;
    const id = viewingList.id;
    const gid = viewingList.groupId;
    if (gid) {
      return {
        shared: true,
        toggle: (itemId) => toggleGroupShoppingItem(gid, id, itemId),
        add: (item) => addGroupShoppingItem(gid, id, item),
        update: (itemId, patch) => updateGroupShoppingItem(gid, id, itemId, patch),
        remove: (itemId) => removeGroupShoppingItem(gid, id, itemId),
        bump: (itemId, d) => bumpGroupShoppingItemQty(gid, id, itemId, d),
        move: (itemId, cat, idx) => moveGroupShoppingItem(gid, id, itemId, cat, idx),
        rename: (name) => renameGroupShoppingList(gid, id, name),
        resetChecks: () => resetGroupShoppingChecks(gid, id),
      };
    }
    return {
      shared: false,
      toggle: (itemId) => toggleShoppingItem(id, itemId),
      add: (item) => addShoppingItem(id, item),
      update: (itemId, patch) => updateShoppingItem(id, itemId, patch),
      remove: (itemId) => removeShoppingItem(id, itemId),
      bump: (itemId, d) => bumpShoppingItemQty(id, itemId, d),
      move: (itemId, cat, idx) => moveShoppingItem(id, itemId, cat, idx),
      rename: (name) => renameShoppingList(id, name),
      resetChecks: () => resetShoppingChecks(id),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingList?.id, viewingList?.groupId]);
  // groupByCategory/getAllCategories read the aisle config set via
  // setShoppingCatConfig above, so these must recompute when the profile config
  // changes even though the callbacks don't name those vars directly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const groups = useMemo(() => (viewingList ? groupByCategory(viewingList.items || []) : []), [viewingList, shoppingCategoryOrder, shoppingCustomCategories]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allCats = useMemo(() => getAllCategories(), [shoppingCategoryOrder, shoppingCustomCategories]);

  // Search filter within the open list.
  const q = query.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (!q) return groups;
    return groups
      .map((g) => ({ ...g, items: g.items.filter((i) => (i.name || '').toLowerCase().includes(q)) }))
      .filter((g) => g.items.length);
  }, [groups, q]);

  // Purchase memory across all lists + the set of names already in this list
  // (so suggestions never duplicate what's already here).
  const itemMemory = useMemo(() => buildItemMemory([...shoppingLists, ...groupLists]), [shoppingLists, groupLists]);
  const existingNames = useMemo(
    () => new Set((viewingList?.items || []).map((i) => (i.name || '').trim().toLowerCase())),
    [viewingList],
  );
  const regularNames = useMemo(
    () => new Set(regulars.map((r) => (r.name || '').trim().toLowerCase())),
    [regulars],
  );

  // Reorder mode shows ALL categories (even empty) as drop targets so an item
  // can move into any category. Categories with items come first.
  const reorderGroups = useMemo(() => {
    const items = viewingList?.items || [];
    const byCat = {};
    items.forEach((it) => { (byCat[it.category] || (byCat[it.category] = [])).push(it); });
    const all = getAllCategories();
    return [
      ...all.filter((c) => byCat[c.key]).map((c) => ({ ...c, items: byCat[c.key] })),
      ...all.filter((c) => !byCat[c.key]).map((c) => ({ ...c, items: [] })),
    ];
  }, [viewingList]);

  const handleDragEnd = (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    listApi.move(draggableId, destination.droppableId, destination.index);
    // Moving across categories teaches the dictionary (like the edit picker).
    if (source.droppableId !== destination.droppableId) {
      const it = (viewingList.items || []).find((i) => i.id === draggableId);
      if (it) learnGroceryItems(learnCategory(it.name, destination.droppableId));
    }
  };

  // Guard: if the viewed list disappears (deleted / listener drop), fall back.
  useEffect(() => {
    if (viewingListId && !viewingList) { setViewingListId(null); setReorderMode(false); }
  }, [viewingListId, viewingList]);

  // Deep-link from a group's "Open List" card: open that shared list once it has
  // loaded (group lists arrive async), then clear the pending flag so it fires once.
  useEffect(() => {
    if (!pendingShoppingListId) return;
    const exists =
      shoppingLists.some((l) => l.id === pendingShoppingListId) ||
      groupLists.some((l) => l.id === pendingShoppingListId);
    if (exists) {
      setViewingListId(pendingShoppingListId);
      clearPendingShoppingList();
    }
  }, [pendingShoppingListId, shoppingLists, groupLists, clearPendingShoppingList]);

  const totals = useMemo(() => {
    const items = viewingList?.items || [];
    return { done: items.filter((i) => i.checked).length, total: items.length };
  }, [viewingList]);
  const pct = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;

  const toggleSink = () => {
    setSinkChecked((s) => { try { localStorage.setItem('cl_shop_sink', s ? '0' : '1'); } catch { /* ignore */ } return !s; });
  };

  const isCatOpen = (g) => {
    if (q) return true; // while searching, keep every matching section open
    if (g.key in openOverrides) return openOverrides[g.key];
    const allDone = g.items.length > 0 && g.items.every((i) => i.checked);
    return !allDone;
  };
  const toggleCat = (g) => setOpenOverrides((o) => ({ ...o, [g.key]: !isCatOpen(g) }));

  const anyCatOpen = groups.some((g) => isCatOpen(g));
  const setAllCatsOpen = (open) => setOpenOverrides(() => {
    const o = {};
    groups.forEach((g) => { o[g.key] = open; });
    return o;
  });

  // Jump bar → open + smooth-scroll to a category section.
  const jumpToCategory = (key) => {
    setOpenOverrides((o) => ({ ...o, [key]: true }));
    requestAnimationFrame(() => {
      const el = document.getElementById(`shopcat-wrap-${key}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleBumpQty = (itemId, delta) => listApi.bump(itemId, delta);

  const handleAddCustomCat = (c) => {
    const key = addShoppingCustomCategory(c);
    if (key) toast.success(`${c.emoji} ${c.he}`);
    return key;
  };

  // Quick add: parse one line → name/qty/category from the dictionary.
  // Unknowns go to AI in the background so next time they're recognized.
  const handleQuickAdd = (raw) => {
    const { items, unresolved } = parseShoppingText(raw);
    const it = items[0] || { name: raw, qty: null, unit: null, category: 'other' };
    listApi.add(it);
    // Pop the target category open so the user SEES the item land in place.
    setOpenOverrides((o) => ({ ...o, [it.category]: true }));
    const m = getCategoryMeta(it.category);
    toast.success(`${it.name} ← ${m.emoji} ${language === 'he' ? m.he : m.en}`);
    if (unresolved.length > 0) {
      categorizeWithAI(unresolved)
        .then(({ learned }) => {
          if (learned && Object.keys(learned).length > 0) learnGroceryItems(learned);
        })
        .catch(() => { /* offline / no key — dictionary stays as-is */ });
    }
  };

  // Add a remembered item directly — category/qty are known, so no AI round-trip.
  const handleAddKnown = (mem) => {
    listApi.add({ name: mem.name, category: mem.category, qty: mem.qty, unit: mem.unit });
    setOpenOverrides((o) => ({ ...o, [mem.category]: true }));
    const m = getCategoryMeta(mem.category);
    toast.success(`${mem.name} ← ${m.emoji} ${language === 'he' ? m.he : m.en}`);
  };

  // Add every regular not already on the list, in one tap.
  const handleAddAllRegulars = () => {
    const pending = regulars.filter((r) => !existingNames.has((r.name || '').trim().toLowerCase()));
    pending.forEach((r) => listApi.add({ name: r.name, category: r.category, qty: r.qty, unit: r.unit }));
    if (pending.length) toast.success(`${pending.length} ${t('itemsAdded', 'מוצרים נוספו')}`);
  };

  // Toggle an item's membership in "my regulars".
  const handleToggleRegular = (item) => {
    const key = (item.name || '').trim().toLowerCase();
    if (regularNames.has(key)) removeShoppingRegular(item.name);
    else addShoppingRegular(item);
  };

  // One-tap move from the row's category badge.
  const handleMoveToCategory = (item, catKey) => {
    listApi.move(item.id, catKey, 0);
    learnGroceryItems(learnCategory(item.name, catKey));
    const m = getCategoryMeta(catKey);
    toast.success(`${item.name} ← ${m.emoji} ${language === 'he' ? m.he : m.en}`);
  };

  const handleCreate = async (name, rawText, items) => {
    const id = await createShoppingList(name, rawText, items);
    setMode('lists');
    setOpenOverrides({});
    setViewingListId(id); // jump straight into the new list
    toast.success(t('addedSuccessfully'));
  };

  // Recipe → shopping list: parse the recipe's ingredient lines through the same
  // pipeline as paste (dictionary categories + AI for unknowns), then create a
  // new list named after the recipe.
  const handleRecipeToList = async (recipe) => {
    const text = recipe.ingredientsText || '';
    const { items, unresolved } = parseShoppingText(text);
    if (items.length === 0) { toast.info(t('shoppingEmptyParse')); return; }
    setRecipeBusyId(recipe.id);
    let finalItems = items;
    if (unresolved.length > 0) {
      try {
        const { learned } = await categorizeWithAI(unresolved);
        if (learned && Object.keys(learned).length > 0) {
          learnGroceryItems(learned);
          const norm = (s) => (s || '').trim().toLowerCase();
          finalItems = items.map((it) => {
            const cat = learned[norm(it.name)];
            return cat ? { ...it, category: cat } : it;
          });
        }
      } catch { /* offline / no key — keep dictionary categories */ }
    }
    const id = await createShoppingList(recipe.title || t('shoppingTitle'), text, finalItems);
    setRecipeBusyId(null);
    setRecipePicker(false);
    setMode('lists');
    setOpenOverrides({});
    setViewingListId(id);
    toast.success(t('addedSuccessfully'));
  };

  const handleShare = async (list) => {
    const grps = groupByCategory(list.items || []);
    const lines = [`🛒 ${list.name}`, ''];
    grps.forEach((g) => {
      const m = getCategoryMeta(g.key);
      lines.push(`${m.emoji} ${language === 'he' ? m.he : m.en}`);
      g.items.forEach((it) => {
        const q = it.qty ? ` (${it.qty}${it.unit ? ' ' + it.unit : ''})` : '';
        lines.push(`${it.checked ? '✓' : '▢'} ${it.name}${q}`);
      });
      lines.push('');
    });
    const text = lines.join('\n').trim();
    try {
      if (navigator.share) await navigator.share({ title: list.name, text });
      else { await navigator.clipboard.writeText(text); toast.success(t('listCopied')); }
    } catch { /* cancelled */ }
  };

  // Follow-up list from everything left unbought — then jump into it.
  const handleFollowup = async (list) => {
    const id = await createFollowupList(list);
    if (id) { setViewingListId(id); toast.success(t('followupCreated', 'רשימת השלמות נוצרה')); }
  };

  const handleSaveTemplate = (list) => {
    const name = window.prompt(t('templateNamePrompt', 'שם התבנית:'), list.name);
    if (name === null) return;
    saveShoppingTemplate(list, name);
    toast.success(t('templateSaved', 'נשמר כתבנית'));
  };

  const handleUseTemplate = async (tpl) => {
    const id = await createListFromTemplate(tpl.id);
    if (id) { setViewingListId(id); toast.success(t('addedSuccessfully')); }
  };

  // Learn the walked aisle route: categories in check order first, the rest keep
  // their current relative order.
  const handleSaveRoute = (seq) => {
    const current = getAllCategories().map((c) => c.key);
    const merged = [...seq.filter((k) => current.includes(k)), ...current.filter((k) => !seq.includes(k))];
    setShoppingCategoryOrder(merged);
    toast.success(t('routeSaved', 'סדר המסלול נשמר'));
  };

  const handleCreateEmpty = async () => {
    const name = window.prompt(t('listNamePlaceholder'), t('shoppingTitle', 'רשימת קניות'));
    if (name === null) return;
    const id = await createShoppingList(name || t('shoppingTitle', 'רשימת קניות'), '', []);
    setOpenOverrides({});
    setViewingListId(id);
  };

  const handleGroupPick = async (g) => {
    const picker = groupPicker;
    setGroupPicker(null);
    if (!picker) return;
    if (picker.mode === 'share') {
      await shareShoppingListToGroup(picker.listId, g.id);
      if (viewingListId === picker.listId) setViewingListId(null);
      toast.success(t('sharedToGroup', 'הרשימה שותפה לקבוצה') + ` · ${g.name}`);
    } else {
      const name = window.prompt(t('listNamePlaceholder'), t('shoppingTitle', 'רשימת קניות'));
      if (name === null) return;
      const id = await createGroupShoppingList(g.id, name || t('shoppingTitle', 'רשימת קניות'), '', []);
      if (id) { setViewingListId(id); toast.success(t('addedSuccessfully')); }
    }
  };

  const menuList = shoppingLists.find((l) => l.id === menuListId) || groupLists.find((l) => l.id === menuListId);
  const buildMenu = (list) => {
    if (list.groupId) {
      // Shared list — no pin/archive; delete removes it for the whole group.
      return [
        { icon: Share2, label: t('shareList'), onClick: () => handleShare(list) },
        ...((list.items || []).some((i) => i.checked) ? [{ icon: RotateCcw, label: t('resetChecks'), onClick: () => resetGroupShoppingChecks(list.groupId, list.id) }] : []),
        ...((list.items || []).some((i) => !i.checked || i.unavailable) ? [{ icon: ListPlus, label: t('createFollowup', 'צור רשימת השלמות'), onClick: () => handleFollowup(list) }] : []),
        { icon: BookmarkPlus, label: t('saveAsTemplate', 'שמור כתבנית'), onClick: () => handleSaveTemplate(list) },
        { icon: Trash2, label: t('delete'), danger: true, onClick: () => { if (window.confirm(t('deleteGroupListConfirm', 'למחוק את הרשימה לכל חברי הקבוצה?'))) { if (viewingListId === list.id) setViewingListId(null); deleteGroupShoppingList(list.groupId, list.id); } } },
      ];
    }
    if (list.archived) {
      return [
        { icon: ArchiveRestore, label: t('unarchive', 'שחזר מהארכיון'), onClick: () => unarchiveShoppingList(list.id) },
        { icon: Copy, label: t('duplicateList'), onClick: async () => { const id = await duplicateShoppingList(list.id); if (id) setViewingListId(id); } },
        { icon: BookmarkPlus, label: t('saveAsTemplate', 'שמור כתבנית'), onClick: () => handleSaveTemplate(list) },
        { icon: Trash2, label: t('delete'), danger: true, onClick: () => { if (window.confirm(t('deleteListConfirm'))) deleteShoppingList(list.id); } },
      ];
    }
    return [
      list.isActive
        ? { icon: Star, label: t('unsetActive'), onClick: () => unsetActiveShoppingList(list.id) }
        : { icon: Star, label: t('setActive'), onClick: () => setActiveShoppingList(list.id) },
      { icon: Copy, label: t('duplicateList'), onClick: async () => { const id = await duplicateShoppingList(list.id); if (id) setViewingListId(id); } },
      { icon: Users, label: t('shareToGroup', 'שתף לקבוצה'), onClick: () => setGroupPicker({ mode: 'share', listId: list.id }) },
      { icon: BookmarkPlus, label: t('saveAsTemplate', 'שמור כתבנית'), onClick: () => handleSaveTemplate(list) },
      { icon: Share2, label: t('shareList'), onClick: () => handleShare(list) },
      ...((list.items || []).some((i) => i.checked) ? [{ icon: RotateCcw, label: t('resetChecks'), onClick: () => resetShoppingChecks(list.id) }] : []),
      ...((list.items || []).some((i) => !i.checked || i.unavailable) && (list.items || []).some((i) => i.checked) ? [{ icon: ListPlus, label: t('createFollowup', 'צור רשימת השלמות'), onClick: () => handleFollowup(list) }] : []),
      { icon: Archive, label: t('archiveList', 'העבר לארכיון'), onClick: () => archiveShoppingList(list.id) },
      { icon: Trash2, label: t('delete'), danger: true, onClick: () => { if (window.confirm(t('deleteListConfirm'))) { if (viewingListId === list.id) setViewingListId(null); deleteShoppingList(list.id); } } },
    ];
  };

  /* — Paste mode — */
  if (mode === 'paste') {
    return (
      <div className="max-w-xl mx-auto px-4 py-4" dir={isRTL ? 'rtl' : 'ltr'}>
        <PasteView onCancel={() => setMode('lists')} onCreate={handleCreate} t={t} isRTL={isRTL} />
      </div>
    );
  }

  /* — Detail — */
  if (viewingList) {
    return (
      <div className="max-w-xl mx-auto px-4 py-4 flex flex-col gap-3.5" dir={isRTL ? 'rtl' : 'ltr'}>
        {/* Detail header */}
        <div className="flex items-center gap-2 -mt-1">
          <button onClick={() => { setViewingListId(null); setReorderMode(false); }} className="flex items-center gap-1 text-sm font-semibold shrink-0" style={{ color: CREAM.green }}>
            <ArrowRight className={cn('w-[18px] h-[18px]', !isRTL && 'rotate-180')} />
            {t('backToLists')}
          </button>
          <div className="flex-1 min-w-0 flex items-center gap-2 justify-end">
            {renaming ? (
              <InlineRename value={viewingList.name} style={{ fontFamily: serif, fontSize: 18, color: CREAM.ink, textAlign: isRTL ? 'right' : 'left' }} onSave={(v) => { listApi.rename(v); setRenaming(false); }} onCancel={() => setRenaming(false)} />
            ) : (
              <button onClick={() => setRenaming(true)} className="text-lg truncate min-w-0" style={{ fontFamily: serif, color: CREAM.ink }}>{viewingList.name}</button>
            )}
            {viewingList.isActive && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: CREAM.greenSoft, color: CREAM.green }}>{t('activeLabel')}</span>}
            {viewingList.groupName && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 inline-flex items-center gap-1" style={{ background: 'rgba(59,130,246,.1)', color: '#2563EB' }}><Users className="w-2.5 h-2.5" />{viewingList.groupName}</span>}
          </div>
          <button onClick={() => setMenuListId(viewingList.id)} aria-label={t('listOptions')} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 hover:bg-[rgba(180,140,80,.08)]" style={{ color: CREAM.muted }}>
            <MoreVertical className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* Progress (sticky) */}
        <div style={{ ...card, position: 'sticky', top: 8, zIndex: 10 }} className="flex items-center gap-3.5 px-4 py-3.5">
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="text-sm font-semibold flex items-baseline gap-1.5" style={{ color: CREAM.ink }}>
              <span style={{ fontFamily: display, fontSize: 22, fontWeight: 700, color: CREAM.green }}>{totals.done}</span>
              / {totals.total} {t('itemsCount')}
            </div>
          </div>
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(180,140,80,.08)' }}>
            <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg,#10B981,#059669)' }} animate={{ width: `${pct}%` }} transition={{ duration: 0.4 }} />
          </div>
          <div className="text-base font-semibold min-w-9 text-center" style={{ fontFamily: display, color: CREAM.green }}>{pct}%</div>
        </div>

        {/* Toolbar: search · expand/collapse all · category order · supermarket */}
        {!reorderMode && totals.total > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl min-w-0" style={{ background: '#fff', border: `1px solid ${CREAM.border}` }}>
              <Search className="w-4 h-4 shrink-0" style={{ color: CREAM.muted }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchInList', 'חיפוש ברשימה')} className="flex-1 min-w-0 bg-transparent outline-none text-sm" style={{ color: CREAM.ink }} />
              {query && (
                <button onClick={() => setQuery('')} aria-label={t('cancel')} className="shrink-0">
                  <X className="w-4 h-4" style={{ color: CREAM.muted }} />
                </button>
              )}
            </div>
            <button onClick={() => setAllCatsOpen(!anyCatOpen)} aria-label={anyCatOpen ? t('collapseAll', 'כווץ הכל') : t('expandAll', 'פתח הכל')} className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#fff', border: `1px solid ${CREAM.border}`, color: CREAM.muted }}>
              {anyCatOpen ? <ChevronsDownUp className="w-[18px] h-[18px]" /> : <ChevronsUpDown className="w-[18px] h-[18px]" />}
            </button>
            <button onClick={() => setShowCatManager(true)} aria-label={t('categoryOrderTitle', 'סדר קטגוריות')} className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#fff', border: `1px solid ${CREAM.border}`, color: CREAM.muted }}>
              <SlidersHorizontal className="w-[18px] h-[18px]" />
            </button>
            <button onClick={() => setSupermarketOpen(true)} aria-label={t('supermarketMode', 'מצב סופר')} className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white" style={{ background: CREAM.green, boxShadow: '0 2px 10px rgba(5,150,105,.28)' }}>
              <Store className="w-[18px] h-[18px]" />
            </button>
          </div>
        )}

        {/* Category jump bar — tap a chip to scroll to that section */}
        {!reorderMode && !q && (
          <CategoryJumpBar groups={groups} onJump={jumpToCategory} language={language} />
        )}

        {/* Quick add — type a product, category is auto-detected; suggests
            matches from your purchase history as you type */}
        {!reorderMode && (
          <QuickAddBar
            onAdd={handleQuickAdd}
            onPick={handleAddKnown}
            memory={itemMemory}
            existingNames={existingNames}
            t={t}
            language={language}
          />
        )}

        {/* My regulars — curated staples, one-tap add (incl. add-all) */}
        {!reorderMode && (
          <RegularsStrip regulars={regulars} existingNames={existingNames} onAdd={handleAddKnown} onAddAll={handleAddAllRegulars} t={t} />
        )}

        {/* Buy again — frequently bought items not already on this list */}
        {!reorderMode && (
          <BuyAgainStrip memory={itemMemory} existingNames={existingNames} onAdd={handleAddKnown} t={t} language={language} />
        )}

        {/* All bought — celebration */}
        <AnimatePresence>
          {!reorderMode && totals.total > 0 && pct === 100 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex items-center gap-3 px-4 py-3.5 rounded-2xl"
              style={{ background: 'linear-gradient(135deg,#10B981,#047857)', color: '#fff', boxShadow: '0 6px 22px rgba(5,150,105,.3)' }}
            >
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(255,255,255,.2)' }}>
                <Check className="w-5 h-5" strokeWidth={3} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-bold">{t('shoppingDoneTitle', 'הקנייה הושלמה 🎉')}</div>
                <div className="text-xs opacity-85">{t('shoppingDoneSub', 'כל הפריטים סומנו')}</div>
              </div>
              <button onClick={() => listApi.resetChecks()} className="text-xs font-bold px-3 py-2 rounded-xl shrink-0 transition-transform active:scale-95" style={{ background: 'rgba(255,255,255,.18)', color: '#fff' }}>
                {t('resetChecks')}
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reorder hint */}
        {reorderMode && (
          <div className="flex items-center gap-1.5 text-xs px-1" style={{ color: CREAM.muted }}>
            <GripVertical className="w-3.5 h-3.5 opacity-60" />{t('reorderHintCross')}
          </div>
        )}

        {/* Categories */}
        {totals.total === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <ShoppingCart className="w-12 h-12" style={{ color: 'rgba(180,140,80,.3)' }} strokeWidth={1.5} />
            <p className="text-sm max-w-xs" style={{ color: CREAM.muted }}>{t('emptyListPrompt')}</p>
          </div>
        ) : reorderMode ? (
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex flex-col gap-2.5">
              {/* Categories that have items — full cards */}
              {reorderGroups.filter((g) => g.items.length > 0).map((g) => (
                <ReorderCategory key={g.key} cat={g} items={g.items} language={language} t={t} />
              ))}
              {/* Empty categories — compact drop chips instead of endless empty cards */}
              <div className="text-[11px] font-bold uppercase tracking-wide px-1 mt-1" style={{ color: CREAM.muted }}>
                {t('dragToOtherCat', 'גרור פריט לאחת מהקטגוריות:')}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {reorderGroups.filter((g) => g.items.length === 0).map((g) => (
                  <EmptyDropChip key={g.key} cat={g} language={language} />
                ))}
              </div>
            </div>
          </DragDropContext>
        ) : q && visibleGroups.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Search className="w-10 h-10" style={{ color: 'rgba(180,140,80,.3)' }} strokeWidth={1.5} />
            <p className="text-sm" style={{ color: CREAM.muted }}>{t('noSearchResults', 'לא נמצאו מוצרים')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 rise-in-stagger">
            {visibleGroups.map((g) => (
              <div key={g.key} id={`shopcat-wrap-${g.key}`} style={{ scrollMarginTop: 116 }}>
                <CategorySection
                  group={g}
                  isOpen={isCatOpen(g)}
                  onToggleOpen={() => toggleCat(g)}
                  onToggleItem={(itemId) => listApi.toggle(itemId)}
                  onEditItem={(item) => setEditItem(item)}
                  onMoveItem={(item) => setMoveItem(item)}
                  onDeleteItem={(itemId) => listApi.remove(itemId)}
                  onAddItem={(nameVal, catKey) => listApi.add({ name: nameVal, category: catKey })}
                  onBumpQty={handleBumpQty}
                  t={t}
                  language={language}
                  isRTL={isRTL}
                  sinkChecked={sinkChecked}
                  shared={listApi.shared}
                />
              </div>
            ))}
          </div>
        )}

        {/* Controls */}
        {totals.total > 0 && (
          <div className="flex items-center gap-2">
            <button onClick={() => { setReorderMode((r) => !r); setOpenOverrides({}); }} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-semibold transition-colors" style={reorderMode ? { background: CREAM.green, color: '#fff' } : { background: CREAM.greenLight, color: CREAM.green }}>
              {reorderMode ? <Check className="w-4 h-4" strokeWidth={2.5} /> : <ArrowUpDown className="w-4 h-4" />}
              {reorderMode ? t('reorderDone') : t('reorder')}
            </button>
            {!reorderMode && (
              <button onClick={toggleSink} aria-pressed={sinkChecked} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-medium transition-colors" style={{ border: `1px solid ${sinkChecked ? CREAM.green : 'rgba(180,140,80,.25)'}`, color: sinkChecked ? CREAM.green : CREAM.muted, background: sinkChecked ? CREAM.greenLight : 'transparent' }}>
                <ListChecks className="w-4 h-4" />{t('moveCheckedDown')}
              </button>
            )}
          </div>
        )}

        {/* Add new list shortcuts */}
        <div className="flex items-center gap-2">
          <button onClick={() => setMode('paste')} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-semibold transition-colors" style={{ background: CREAM.greenLight, color: CREAM.green }}>
            <Plus className="w-4 h-4" strokeWidth={2.5} />{t('newShoppingList')}
          </button>
          <button onClick={() => setRecipePicker(true)} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-semibold transition-colors" style={{ border: `1px solid ${CREAM.borderLight}`, color: CREAM.green }}>
            <ChefHat className="w-4 h-4" />{t('fromRecipe', 'ממתכון')}
          </button>
        </div>

        <AnimatePresence>
          {menuList && <OptionsMenu items={buildMenu(menuList)} onClose={() => setMenuListId(null)} isRTL={isRTL} />}
        </AnimatePresence>
        <AnimatePresence>
          {groupPicker && (
            <GroupPickerSheet
              groups={myGroups || []} t={t} isRTL={isRTL}
              title={groupPicker.mode === 'share' ? t('shareToGroup', 'שתף לקבוצה') : t('newGroupList', 'רשימה קבוצתית חדשה')}
              sub={groupPicker.mode === 'share' ? t('shareToGroupSub', 'הרשימה תעבור לקבוצה וכל החברים יוכלו לערוך אותה') : t('newGroupListSub', 'כל חברי הקבוצה יראו ויערכו את הרשימה')}
              onPick={handleGroupPick} onClose={() => setGroupPicker(null)}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {recipePicker && (
            <RecipePickerSheet uid={uid} busyId={recipeBusyId} t={t} isRTL={isRTL} onClose={() => setRecipePicker(false)} onPick={handleRecipeToList} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {editItem && (
            <EditItemModal
              item={editItem} t={t} isRTL={isRTL} language={language}
              isRegular={regularNames.has((editItem.name || '').trim().toLowerCase())}
              onToggleRegular={handleToggleRegular}
              onClose={() => setEditItem(null)}
              onSave={(patch, categoryChanged) => {
                listApi.update(editItem.id, patch);
                if (categoryChanged && patch.name) learnGroceryItems(learnCategory(patch.name, patch.category));
              }}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {moveItem && (
            <MoveCategorySheet
              item={moveItem} t={t} isRTL={isRTL} language={language}
              onClose={() => setMoveItem(null)}
              onMove={(catKey) => handleMoveToCategory(moveItem, catKey)}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showCatManager && (
            <CategoryManagerSheet
              allCats={allCats}
              onReorder={setShoppingCategoryOrder}
              onAddCustom={handleAddCustomCat}
              onRemoveCustom={removeShoppingCustomCategory}
              onClose={() => setShowCatManager(false)}
              language={language} isRTL={isRTL} t={t}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {supermarketOpen && (
            <SupermarketMode
              list={viewingList}
              onToggle={(itemId) => listApi.toggle(itemId)}
              onUpdateItem={(itemId, patch) => listApi.update(itemId, patch)}
              onCreateFollowup={() => handleFollowup(viewingList)}
              onSaveRoute={handleSaveRoute}
              onClose={() => setSupermarketOpen(false)}
              t={t} language={language} isRTL={isRTL}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  /* — Overview — */
  const hasLists = visibleLists.length > 0 || groupLists.length > 0;
  return (
    <div className="max-w-xl mx-auto px-4 py-4 flex flex-col gap-3.5" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between -mt-1">
        <h2 className="text-xl" style={{ fontFamily: serif, color: CREAM.ink }}>{t('myLists')}</h2>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowHistory(true)} aria-label={t('purchaseHistory', 'היסטוריית קניות')} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#fff', border: `1px solid ${CREAM.border}`, color: CREAM.muted }}>
            <History className="w-4 h-4" />
          </button>
          <button onClick={() => setRecipePicker(true)} aria-label={t('fromRecipe', 'ממתכון')} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: CREAM.greenLight, color: CREAM.green }}>
            <ChefHat className="w-4 h-4" />
          </button>
          <button onClick={() => setMode('paste')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold" style={{ background: CREAM.green, color: '#fff', boxShadow: '0 2px 10px rgba(5,150,105,.25)' }}>
            <Plus className="w-4 h-4" strokeWidth={2.5} />{t('newList')}
          </button>
        </div>
      </div>

      {/* Quick-create row: empty list · group list */}
      <div className="flex items-center gap-2">
        <button onClick={handleCreateEmpty} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold" style={{ border: `1px solid ${CREAM.borderLight}`, color: CREAM.green, background: '#fff' }}>
          <ListPlus className="w-4 h-4" />{t('emptyList', 'רשימה ריקה')}
        </button>
        <button onClick={() => setGroupPicker({ mode: 'create' })} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold" style={{ border: '1px solid rgba(59,130,246,.2)', color: '#2563EB', background: '#fff' }}>
          <Users className="w-4 h-4" />{t('newGroupList', 'רשימה קבוצתית')}
        </button>
      </div>

      {/* Templates — one tap to rebuild a saved list */}
      <TemplatesStrip
        templates={templates}
        onUse={handleUseTemplate}
        onDelete={(tpl) => { if (window.confirm(t('deleteTemplateConfirm', 'למחוק את התבנית?'))) deleteShoppingTemplate(tpl.id); }}
        t={t}
      />

      {!hasLists ? (
        <div className="flex flex-col items-center justify-center gap-6 py-12">
          <div className="w-40 h-40 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(145deg, #D1FAE5, rgba(5,150,105,.08))' }}>
            <ShoppingCart className="w-16 h-16" style={{ color: CREAM.green }} strokeWidth={1.5} />
          </div>
          <div className="text-2xl text-center" style={{ fontFamily: serif, color: CREAM.ink }}>{t('noLists')}</div>
          <p className="text-sm text-center max-w-xs leading-relaxed" style={{ color: CREAM.muted }}>{t('noActiveShoppingSub')}</p>
          <button onClick={() => setMode('paste')} className="flex items-center gap-2.5 px-7 py-3.5 rounded-2xl text-white text-[15px] font-semibold transition-transform active:scale-[.97]" style={{ background: CREAM.green, boxShadow: '0 4px 16px rgba(5,150,105,.25)' }}>
            <ClipboardPaste className="w-5 h-5" />{t('pasteFromWhatsApp')}
          </button>
        </div>
      ) : (
        <>
          {activeList && <ListCard list={activeList} hero t={t} locale={locale} onOpen={() => setViewingListId(activeList.id)} />}
          <div className="flex flex-col gap-2.5 rise-in-stagger">
            {visibleLists.filter((l) => !l.isActive).map((l) => (
              <ListCard key={l.id} list={l} t={t} locale={locale} onOpen={() => setViewingListId(l.id)} onMenu={() => setMenuListId(l.id)} />
            ))}
          </div>

          {/* Group lists — live-synced with every member */}
          {groupLists.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 px-1 mt-1">
                <Users className="w-3.5 h-3.5" style={{ color: '#2563EB' }} />
                <span className="text-[12px] font-bold" style={{ color: CREAM.sub }}>{t('groupLists', 'רשימות קבוצתיות')}</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {groupLists.map((l) => (
                  <ListCard key={`${l.groupId}-${l.id}`} list={l} t={t} locale={locale} onOpen={() => setViewingListId(l.id)} onMenu={() => setMenuListId(l.id)} />
                ))}
              </div>
            </>
          )}

          {/* Archive — completed lists tucked away */}
          {archivedLists.length > 0 && (
            <div className="mt-1">
              <button onClick={() => setShowArchived((v) => !v)} className="w-full flex items-center gap-2 px-1 py-1.5">
                <Archive className="w-3.5 h-3.5" style={{ color: CREAM.muted }} />
                <span className="text-[12px] font-bold" style={{ color: CREAM.sub }}>{t('archive', 'ארכיון')} ({archivedLists.length})</span>
                <motion.div animate={{ rotate: showArchived ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className="w-4 h-4" style={{ color: CREAM.muted }} />
                </motion.div>
              </button>
              <AnimatePresence initial={false}>
                {showArchived && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                    <div className="flex flex-col gap-2.5 pt-1.5" style={{ opacity: 0.75 }}>
                      {archivedLists.map((l) => (
                        <ListCard key={l.id} list={l} t={t} locale={locale} onOpen={() => setViewingListId(l.id)} onMenu={() => setMenuListId(l.id)} />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {menuList && <OptionsMenu items={buildMenu(menuList)} onClose={() => setMenuListId(null)} isRTL={isRTL} />}
      </AnimatePresence>
      <AnimatePresence>
        {recipePicker && (
          <RecipePickerSheet uid={uid} busyId={recipeBusyId} t={t} isRTL={isRTL} onClose={() => setRecipePicker(false)} onPick={handleRecipeToList} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {groupPicker && (
          <GroupPickerSheet
            groups={myGroups || []} t={t} isRTL={isRTL}
            title={groupPicker.mode === 'share' ? t('shareToGroup', 'שתף לקבוצה') : t('newGroupList', 'רשימה קבוצתית חדשה')}
            sub={groupPicker.mode === 'share' ? t('shareToGroupSub', 'הרשימה תעבור לקבוצה וכל החברים יוכלו לערוך אותה') : t('newGroupListSub', 'כל חברי הקבוצה יראו ויערכו את הרשימה')}
            onPick={handleGroupPick} onClose={() => setGroupPicker(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showHistory && (
          <HistorySheet
            memory={itemMemory} locale={locale} t={t} isRTL={isRTL}
            canAdd={!!activeList}
            onAdd={(m) => { addShoppingItem(activeList.id, { name: m.name, category: m.category, qty: m.qty, unit: m.unit }); toast.success(`${m.name} ← ${activeList.name}`); }}
            onClose={() => setShowHistory(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
