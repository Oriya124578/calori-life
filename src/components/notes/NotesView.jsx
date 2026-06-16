import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Pin, PinOff, Trash2, X, Palette, Plus, Edit3, MoreVertical } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import { cn } from '../../lib/utils';
import { format, parseISO } from 'date-fns';

// ── Cream v3 color palette ────────────────────────────────────────────────────

const NOTE_COLORS = [
  { id: null,     bg: '',     style: { background: '#fff', border: '1px solid rgba(180,140,80,.15)' }, swatch: 'bg-white border-2 border-border',   catBg: 'rgba(5,150,105,.12)', catColor: '#059669', bodyColor: '#5A4A3A', titleAccent: '#059669' },
  { id: 'yellow', bg: '',     style: { background: '#FEF3C7', border: '1px solid rgba(217,119,6,.15)' }, swatch: 'bg-yellow-300', catBg: 'rgba(146,64,14,.12)', catColor: '#78350F', bodyColor: '#78350F', titleAccent: '#92400E' },
  { id: 'green',  bg: '',     style: { background: '#D1FAE5', border: '1px solid rgba(5,150,105,.15)' }, swatch: 'bg-emerald-300', catBg: 'rgba(6,95,70,.12)', catColor: '#065F46', bodyColor: '#064E3B', titleAccent: '#065F46' },
  { id: 'pink',   bg: '',     style: { background: '#FEE2E2', border: '1px solid rgba(220,38,38,.15)' }, swatch: 'bg-pink-300',    catBg: 'rgba(127,29,29,.12)', catColor: '#7F1D1D', bodyColor: '#991B1B', titleAccent: '#7F1D1D' },
  { id: 'purple', bg: '',     style: { background: '#F5F3FF', border: '1px solid rgba(124,58,237,.15)' }, swatch: 'bg-purple-300',  catBg: 'rgba(91,33,182,.12)', catColor: '#5B21B6', bodyColor: '#4C1D95', titleAccent: '#5B21B6' },
  { id: 'blue',   bg: '',     style: { background: '#DBEAFE', border: '1px solid rgba(37,99,235,.15)' }, swatch: 'bg-blue-300',    catBg: 'rgba(30,58,138,.12)', catColor: '#1E3A8A', bodyColor: '#1E40AF', titleAccent: '#1E3A8A' },
];

const getColorMeta = (colorId) =>
  NOTE_COLORS.find((c) => c.id === colorId) ?? NOTE_COLORS[0];

// ── Edit/Add Category Modal ──
const EditCategoryModal = ({ onClose, onSave, onDelete, initialValue, isEdit = false, t, isRTL }) => {
  const [value, setValue] = useState(initialValue || '');

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />
        {/* Card */}
        <motion.div
          className="relative w-full max-w-sm overflow-hidden p-5 z-10 space-y-4"
          style={{ background: '#fff', border: '1px solid rgba(180,140,80,.14)', borderRadius: 22, boxShadow: '0 4px 24px rgba(40,20,0,.07)' }}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          dir={isRTL ? 'rtl' : 'ltr'}
        >
          <h3 className="text-base font-bold text-foreground">
            {isEdit ? t('editCategoryName') : t('addNewCategory')}
          </h3>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t('categoryNamePlaceholder')}
            className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-muted/30 text-foreground outline-none focus:border-primary"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onSave(value.trim());
                onClose();
              }
            }}
          />
          <div className="flex justify-end gap-2 text-xs font-bold pt-2">
            {isEdit && onDelete && (
              <button
                onClick={() => { onDelete(); onClose(); }}
                className="px-3 py-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors me-auto"
              >
                {t('delete')}
              </button>
            )}
            <button
              onClick={onClose}
              className="px-3 py-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              onClick={() => { onSave(value.trim()); onClose(); }}
              disabled={!value.trim()}
              className="px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:brightness-110 disabled:opacity-50 transition-all"
            >
              {t('save')}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

// ── Edit Sheet ────────────────────────────────────────────────────────────────

const NoteEditSheet = ({ note, onClose }) => {
  const { updateQuickNote, deleteQuickNote, data } = useStore();
  const { t, language } = useTranslation();
  const isRTL = language === 'he';

  const [title,   setTitle]   = useState(note.title   || '');
  const [content, setContent] = useState(note.content || '');
  const [pinned,  setPinned]  = useState(!!note.pinned);
  const [color,   setColor]   = useState(note.color   ?? null);
  const [categoryId, setCategoryId] = useState(note.categoryId || 'general');

  const handleSave = () => {
    updateQuickNote(note.id, { title: title.trim(), content: content.trim(), pinned, color, categoryId });
    onClose();
  };

  const handleDelete = () => {
    deleteQuickNote(note.id);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 bg-black/40 z-[60]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleSave}
      />

      {/* Sheet */}
      <motion.div
        className="fixed bottom-0 inset-x-0 z-[61] rounded-t-2xl max-h-[90dvh] overflow-y-auto"
        style={{ ...getColorMeta(color).style, boxShadow: '0 -10px 40px rgba(40,20,0,.12)' }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1.5 rounded-full bg-foreground/20" />
        </div>

        <div className="px-5 pb-8 pt-2 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button onClick={handleSave} className="text-sm font-bold text-primary">
              {t('saveNote')}
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPinned((v) => !v)}
                className="p-1.5 rounded-full hover:bg-foreground/10 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                aria-pressed={pinned}
                aria-label={pinned ? t('unpinNote') : t('pinNote')}
              >
                {pinned
                  ? <PinOff className="w-4 h-4 text-primary" />
                  : <Pin    className="w-4 h-4 text-muted-foreground" />}
              </button>
              <button
                onClick={handleDelete}
                className="p-1.5 rounded-full hover:bg-destructive/10 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                aria-label={t('deleteNote')}
              >
                <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
              </button>
              <button
                onClick={handleSave}
                className="p-1.5 rounded-full hover:bg-foreground/10 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                aria-label={t('saveNote')}
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Title */}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('noteTitlePlaceholder')}
            className="w-full text-lg font-bold text-foreground bg-transparent outline-none placeholder:text-foreground/30"
            autoFocus
          />

          {/* Content */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('noteContentPlaceholder')}
            rows={6}
            className="w-full text-[15px] text-foreground bg-transparent outline-none placeholder:text-foreground/30 resize-none"
          />

          {/* Category picker */}
          {data?.noteCategories?.length > 0 && (
            <div className="pt-2 border-t border-foreground/10 flex items-center gap-3">
              <span className="text-sm font-semibold text-muted-foreground shrink-0">{t('categoryLabel')}:</span>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="text-sm bg-transparent text-foreground outline-none cursor-pointer border border-foreground/10 rounded-lg px-2 py-1"
              >
                {data.noteCategories.map((c) => (
                  <option key={c.id} value={c.id} className="bg-card text-foreground">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Color picker */}
          <div className="pt-2 border-t border-foreground/10">
            <div className="flex items-center gap-3">
              <Palette className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex gap-2" role="radiogroup" aria-label={t('noteColor')}>
                {NOTE_COLORS.map((c) => (
                  <button
                    key={String(c.id)}
                    onClick={() => setColor(c.id)}
                    role="radio"
                    aria-checked={color === c.id}
                    aria-label={c.id || t('none')}
                    className={cn(
                      'w-7 h-7 rounded-full transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none',
                      c.swatch,
                      color === c.id && 'ring-2 ring-offset-2 ring-primary scale-110',
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
};

// ── Note card ─────────────────────────────────────────────────────────────────

const NoteCard = ({ note, onClick }) => {
  const { data } = useStore();
  const dateStr = note.updatedAt || note.createdAt;
  let dateLabel = '';
  try { dateLabel = format(parseISO(dateStr), 'd/M'); } catch { /* ignore */ }
  const cat = data?.noteCategories?.find((c) => c.id === note.categoryId);
  const cm = getColorMeta(note.color);

  return (
    <button
      onClick={() => onClick(note)}
      className="w-full text-start p-[13px_14px] transition-all hover:shadow-md active:scale-[0.98] duration-200"
      style={{ ...cm.style, borderRadius: 14, boxShadow: '0 1px 4px rgba(40,20,0,.04)', position: 'relative' }}
    >
      {note.pinned && (
        <Pin className="w-3.5 h-3.5 mb-1.5" style={{ color: '#8A7A6A' }} />
      )}
      {note.title && (
        <h3 className="mb-1 line-clamp-2" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 15, fontWeight: 400, color: '#2A1A0A', letterSpacing: '-.02em', lineHeight: 1.15 }}>
          {note.title}
        </h3>
      )}
      {note.content && (
        <p className="line-clamp-4 leading-relaxed" style={{ fontSize: 12, color: cm.bodyColor }}>
          {note.content}
        </p>
      )}
      <div className="flex items-center justify-between mt-1.5">
        {cat && (
          <span className="select-none" style={{ display: 'inline-block', borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 700, background: cm.catBg, color: cm.catColor }}>
            {cat.name}
          </span>
        )}
        {dateLabel && (
          <p style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 11, color: cm.bodyColor, opacity: 0.65 }}>{dateLabel}</p>
        )}
      </div>
    </button>
  );
};

// ── Main view ─────────────────────────────────────────────────────────────────

export const NotesView = () => {
  const { data, openAddSheet, addNoteCategory, updateNoteCategory, deleteNoteCategory } = useStore();
  const { t, language } = useTranslation();
  const isRTL = language === 'he';
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [editingNote, setEditingNote] = useState(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const allNotes     = data?.quickNotes || [];

  // Construct categories, each with a note-count badge (like the tasks page).
  const noteCount = (id) =>
    id === 'all'       ? allNotes.length
    : id === 'favorites' ? allNotes.filter((n) => n.pinned).length
    : allNotes.filter((n) => n.categoryId === id).length;
  const categories = [
    { id: 'all', name: t('allNotesFilter') },
    { id: 'favorites', name: t('favorites') },
    ...(data?.noteCategories || [])
  ].map((c) => ({ ...c, count: noteCount(c.id) }));

  // Filter notes
  const filteredNotes = selectedCategoryId === 'all'
    ? allNotes
    : selectedCategoryId === 'favorites'
    ? allNotes.filter((n) => !!n.pinned)
    : allNotes.filter((n) => n.categoryId === selectedCategoryId);

  const pinnedNotes  = filteredNotes.filter((n) => n.pinned);
  const regularNotes = filteredNotes.filter((n) => !n.pinned);

  const currentCategory = categories.find(c => c.id === selectedCategoryId);
  const isCustomCategory = selectedCategoryId !== 'all' && selectedCategoryId !== 'favorites' && selectedCategoryId !== 'general';

  return (
    <div
      className="max-w-2xl mx-auto w-full px-4 py-5 sm:px-6 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-400"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* ── Cream v3 Categories Strip ── */}
      <div className="flex items-center gap-1.5 pb-1 overflow-x-auto no-scrollbar">
        {categories.map((cat) => {
          const isActive = selectedCategoryId === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategoryId(cat.id)}
              className="shrink-0 flex items-center gap-[5px] select-none transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              style={{
                borderRadius: 999,
                padding: isActive ? '5px 14px' : '6px 13px',
                fontSize: isActive ? 14 : 12,
                fontWeight: isActive ? 400 : 600,
                fontFamily: isActive ? "'Instrument Serif', serif" : "'Inter', sans-serif",
                fontStyle: isActive ? 'italic' : 'normal',
                background: isActive ? '#D97706' : '#fff',
                border: isActive ? '1px solid #D97706' : '1px solid rgba(180,140,80,.15)',
                color: isActive ? '#fff' : '#8A7A6A',
              }}
            >
              {cat.name}
              {cat.count > 0 && (
                <span
                  style={{
                    fontFamily: "'Fraunces', serif", fontStyle: 'normal', fontSize: 11, fontWeight: 700,
                    minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: isActive ? 'rgba(255,255,255,.25)' : 'rgba(217,119,6,.1)',
                    color: isActive ? '#fff' : '#D97706',
                  }}
                >
                  {cat.count}
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={() => setIsAddOpen(true)}
          className="shrink-0 flex items-center gap-[5px] transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          style={{ borderRadius: 999, padding: '6px 13px', fontSize: 12, fontWeight: 600, background: 'transparent', border: '1px dashed rgba(180,140,80,.3)', color: '#8A7A6A' }}
          aria-label={t('addNewCategory')}
        >
          <Plus className="w-3.5 h-3.5" />
          {t('addNewCategory', '+ קטגוריה')}
        </button>
      </div>

      {/* ── Category Title + Options ── */}
      {selectedCategoryId !== 'all' && (
        <div className="flex items-center justify-between px-1">
          <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 18, fontWeight: 400, color: '#2A1A0A', letterSpacing: '-.02em' }}>
            {currentCategory ? currentCategory.name : ''}
          </h2>
          {isCustomCategory && (
            <button
              onClick={() => setIsEditOpen(true)}
              className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-all active:scale-95 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              aria-label={t('editCategoryName')}
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* ── Quick Note Creator Bar ── */}
      <div
        onClick={() => openAddSheet('note', {
          categoryId: (selectedCategoryId === 'all' || selectedCategoryId === 'favorites') ? 'general' : selectedCategoryId,
          pinned: selectedCategoryId === 'favorites'
        })}
        className="flex items-center gap-3 px-4 py-3 cursor-pointer active:scale-[0.99] transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(180,140,80,.14)', boxShadow: '0 2px 10px rgba(40,20,0,.05)' }}
      >
        <button
          className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: '#F0FDF4', border: '1px solid rgba(5,150,105,.2)', color: '#065F46' }}
          aria-label={t('addNewItem')}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <span className="select-none" style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 14, color: '#8A7A6A' }}>
          {t('addNotePlaceholder')}
        </span>
      </div>

      {filteredNotes.length === 0 ? (
        <div className="py-24 text-center text-muted-foreground text-sm">
          <div className="text-4xl mb-3">🗒️</div>
          {t('noNotes')}
        </div>
      ) : (
        <motion.div layout className="space-y-4">
          {/* Pinned section */}
          {pinnedNotes.length > 0 && (
            <div>
              <div className="flex justify-between items-baseline px-0.5 pb-1">
                <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 18, fontWeight: 400, color: '#2A1A0A', letterSpacing: '-.02em' }}>
                  <em style={{ fontStyle: 'italic', color: '#D97706' }}>{t('pinnedNotes')}</em>
                </span>
                <span style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 13, color: '#8A7A6A' }}>
                  {pinnedNotes.length} {t('items', 'פריטים')}
                </span>
              </div>
              <motion.div layout className="grid grid-cols-2 gap-2.5">
                <AnimatePresence mode="popLayout">
                  {pinnedNotes.map((n) => (
                    <motion.div
                      key={n.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                    >
                      <NoteCard note={n} onClick={setEditingNote} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            </div>
          )}

          {/* Regular notes */}
          {regularNotes.length > 0 && (
            <div>
              {pinnedNotes.length > 0 && (
                <div className="flex justify-between items-baseline px-0.5 pb-1">
                  <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 18, fontWeight: 400, color: '#2A1A0A', letterSpacing: '-.02em' }}>
                    {t('otherNotes', 'פתקים')} <em style={{ fontStyle: 'italic', color: '#D97706' }}>{t('recent', 'אחרונים')}</em>
                  </span>
                  <span style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 13, color: '#8A7A6A' }}>
                    {regularNotes.length} {t('items', 'פריטים')}
                  </span>
                </div>
              )}
              <motion.div layout className="grid grid-cols-2 gap-2.5">
                <AnimatePresence mode="popLayout">
                  {regularNotes.map((n) => (
                    <motion.div
                      key={n.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                    >
                      <NoteCard note={n} onClick={setEditingNote} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            </div>
          )}
        </motion.div>
      )}

      {/* Edit Sheet */}
      <AnimatePresence>
        {editingNote && (
          <NoteEditSheet
            key={editingNote.id}
            note={editingNote}
            onClose={() => setEditingNote(null)}
          />
        )}
      </AnimatePresence>

      {/* Add Category Modal */}
      {isAddOpen && (
        <EditCategoryModal
          onClose={() => setIsAddOpen(false)}
          onSave={async (name) => {
            const newId = await addNoteCategory(name);
            if (newId) setSelectedCategoryId(newId);
          }}
          t={t}
          isRTL={isRTL}
        />
      )}

      {/* Edit Category Modal */}
      {isEditOpen && (
        <EditCategoryModal
          onClose={() => setIsEditOpen(false)}
          isEdit={true}
          initialValue={currentCategory?.name}
          onSave={(name) => updateNoteCategory(selectedCategoryId, name)}
          onDelete={() => {
            if (window.confirm(t('confirmDeleteCategory'))) {
              deleteNoteCategory(selectedCategoryId);
              setSelectedCategoryId('all');
            }
          }}
          t={t}
          isRTL={isRTL}
        />
      )}
    </div>
  );
};
