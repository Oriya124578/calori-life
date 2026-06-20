import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import {
  ShoppingCart, Plus, ClipboardPaste, Wand2, Check, Trash2, Edit3,
  ChevronDown, X, ArrowRight, Loader2, Sparkles, Share2, GripVertical,
  ArrowUpDown, MoreVertical, Copy, Star, RotateCcw, ListChecks,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import { toast } from '../../store/useToast';
import { cn } from '../../lib/utils';
import {
  parseShoppingText, categorizeWithAI, groupByCategory, getCategoryMeta, parseQuantity,
  getAllCategories, learnCategory,
} from '../../lib/groceryCategories';
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
const BuyAgainStrip = ({ memory, existingNames, onAdd, t, language }) => {
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

/* ── Item Row (normal mode: tap-check + swipe-delete) ─────── */
const ItemRow = ({ item, onToggle, onEdit, onDelete, onMoveCat, t, isRTL, highlight = false }) => {
  const meta = item.qty ? `${item.qty}${item.unit ? ' ' + item.unit : ''}` : null;
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
          {meta && <span className="text-[11px] font-medium" style={{ color: CREAM.muted }}>{meta}</span>}
        </div>
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
const CategorySection = ({ group, isOpen, onToggleOpen, onToggleItem, onEditItem, onMoveItem, onDeleteItem, onAddItem, t, language, isRTL, sinkChecked }) => {
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
                  <ItemRow item={item} highlight={fresh} onToggle={() => onToggleItem(item.id)} onEdit={() => onEditItem(item)} onMoveCat={() => onMoveItem(item)} onDelete={() => onDeleteItem(item.id)} t={t} isRTL={isRTL} />
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
const EditItemModal = ({ item, onClose, onSave, t, isRTL, language }) => {
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
          <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-lg shrink-0" style={{ background: 'rgba(180,140,80,.06)' }}>🛒</div>
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="text-sm font-semibold truncate" style={{ color: CREAM.ink }}>
              {list.name}{list.isActive && <span className="ms-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full align-middle" style={{ background: CREAM.greenSoft, color: CREAM.green }}>{t('activeLabel')}</span>}
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

  const [mode, setMode] = useState('lists'); // 'lists' | 'paste'
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

  const activeList = useMemo(() => shoppingLists.find((l) => l.isActive), [shoppingLists]);
  const viewingList = useMemo(() => shoppingLists.find((l) => l.id === viewingListId), [shoppingLists, viewingListId]);
  const groups = useMemo(() => (viewingList ? groupByCategory(viewingList.items || []) : []), [viewingList]);

  // Purchase memory across all lists + the set of names already in this list
  // (so suggestions never duplicate what's already here).
  const itemMemory = useMemo(() => buildItemMemory(shoppingLists), [shoppingLists]);
  const existingNames = useMemo(
    () => new Set((viewingList?.items || []).map((i) => (i.name || '').trim().toLowerCase())),
    [viewingList],
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
    moveShoppingItem(viewingList.id, draggableId, destination.droppableId, destination.index);
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

  const totals = useMemo(() => {
    const items = viewingList?.items || [];
    return { done: items.filter((i) => i.checked).length, total: items.length };
  }, [viewingList]);
  const pct = totals.total ? Math.round((totals.done / totals.total) * 100) : 0;

  const toggleSink = () => {
    setSinkChecked((s) => { try { localStorage.setItem('cl_shop_sink', s ? '0' : '1'); } catch { /* ignore */ } return !s; });
  };

  const isCatOpen = (g) => {
    if (g.key in openOverrides) return openOverrides[g.key];
    const allDone = g.items.length > 0 && g.items.every((i) => i.checked);
    return !allDone;
  };
  const toggleCat = (g) => setOpenOverrides((o) => ({ ...o, [g.key]: !isCatOpen(g) }));

  // Quick add: parse one line → name/qty/category from the dictionary.
  // Unknowns go to AI in the background so next time they're recognized.
  const handleQuickAdd = (raw) => {
    const { items, unresolved } = parseShoppingText(raw);
    const it = items[0] || { name: raw, qty: null, unit: null, category: 'other' };
    addShoppingItem(viewingList.id, it);
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
    addShoppingItem(viewingList.id, { name: mem.name, category: mem.category, qty: mem.qty, unit: mem.unit });
    setOpenOverrides((o) => ({ ...o, [mem.category]: true }));
    const m = getCategoryMeta(mem.category);
    toast.success(`${mem.name} ← ${m.emoji} ${language === 'he' ? m.he : m.en}`);
  };

  // One-tap move from the row's category badge.
  const handleMoveToCategory = (item, catKey) => {
    moveShoppingItem(viewingList.id, item.id, catKey, 0);
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

  const menuList = shoppingLists.find((l) => l.id === menuListId);
  const buildMenu = (list) => [
    list.isActive
      ? { icon: Star, label: t('unsetActive'), onClick: () => unsetActiveShoppingList(list.id) }
      : { icon: Star, label: t('setActive'), onClick: () => setActiveShoppingList(list.id) },
    { icon: Copy, label: t('duplicateList'), onClick: async () => { const id = await duplicateShoppingList(list.id); if (id) setViewingListId(id); } },
    { icon: Share2, label: t('shareList'), onClick: () => handleShare(list) },
    ...((list.items || []).some((i) => i.checked) ? [{ icon: RotateCcw, label: t('resetChecks'), onClick: () => resetShoppingChecks(list.id) }] : []),
    { icon: Trash2, label: t('delete'), danger: true, onClick: () => { if (window.confirm(t('deleteListConfirm'))) { if (viewingListId === list.id) setViewingListId(null); deleteShoppingList(list.id); } } },
  ];

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
              <InlineRename value={viewingList.name} style={{ fontFamily: serif, fontSize: 18, color: CREAM.ink, textAlign: isRTL ? 'right' : 'left' }} onSave={(v) => { renameShoppingList(viewingList.id, v); setRenaming(false); }} onCancel={() => setRenaming(false)} />
            ) : (
              <button onClick={() => setRenaming(true)} className="text-lg truncate min-w-0" style={{ fontFamily: serif, color: CREAM.ink }}>{viewingList.name}</button>
            )}
            {viewingList.isActive && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: CREAM.greenSoft, color: CREAM.green }}>{t('activeLabel')}</span>}
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
              <button onClick={() => resetShoppingChecks(viewingList.id)} className="text-xs font-bold px-3 py-2 rounded-xl shrink-0 transition-transform active:scale-95" style={{ background: 'rgba(255,255,255,.18)', color: '#fff' }}>
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
        ) : (
          <div className="flex flex-col gap-2.5 rise-in-stagger">
            {groups.map((g) => (
              <CategorySection
                key={g.key}
                group={g}
                isOpen={isCatOpen(g)}
                onToggleOpen={() => toggleCat(g)}
                onToggleItem={(itemId) => toggleShoppingItem(viewingList.id, itemId)}
                onEditItem={(item) => setEditItem(item)}
                onMoveItem={(item) => setMoveItem(item)}
                onDeleteItem={(itemId) => removeShoppingItem(viewingList.id, itemId)}
                onAddItem={(nameVal, catKey) => addShoppingItem(viewingList.id, { name: nameVal, category: catKey })}
                t={t}
                language={language}
                isRTL={isRTL}
                sinkChecked={sinkChecked}
              />
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

        {/* Add new list shortcut */}
        <button onClick={() => setMode('paste')} className="flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-semibold transition-colors" style={{ background: CREAM.greenLight, color: CREAM.green }}>
          <Plus className="w-4 h-4" strokeWidth={2.5} />{t('newShoppingList')}
        </button>

        <AnimatePresence>
          {menuList && <OptionsMenu items={buildMenu(menuList)} onClose={() => setMenuListId(null)} isRTL={isRTL} />}
        </AnimatePresence>
        <AnimatePresence>
          {editItem && (
            <EditItemModal
              item={editItem} t={t} isRTL={isRTL} language={language}
              onClose={() => setEditItem(null)}
              onSave={(patch, categoryChanged) => {
                updateShoppingItem(viewingList.id, editItem.id, patch);
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
      </div>
    );
  }

  /* — Overview — */
  const hasLists = shoppingLists.length > 0;
  return (
    <div className="max-w-xl mx-auto px-4 py-4 flex flex-col gap-3.5" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between -mt-1">
        <h2 className="text-xl" style={{ fontFamily: serif, color: CREAM.ink }}>{t('myLists')}</h2>
        <button onClick={() => setMode('paste')} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-semibold" style={{ background: CREAM.green, color: '#fff', boxShadow: '0 2px 10px rgba(5,150,105,.25)' }}>
          <Plus className="w-4 h-4" strokeWidth={2.5} />{t('newList')}
        </button>
      </div>

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
            {shoppingLists.filter((l) => !l.isActive).map((l) => (
              <ListCard key={l.id} list={l} t={t} locale={locale} onOpen={() => setViewingListId(l.id)} onMenu={() => setMenuListId(l.id)} />
            ))}
          </div>
        </>
      )}

      <AnimatePresence>
        {menuList && <OptionsMenu items={buildMenu(menuList)} onClose={() => setMenuListId(null)} isRTL={isRTL} />}
      </AnimatePresence>
    </div>
  );
};
