import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import { ChevronLeft, ChevronRight, Send, Image as ImageIcon, Search, CheckCheck, Lock, SmilePlus, X, MoreVertical, Ban, Flag, Trash2, History } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { toast } from '../../store/useToast';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import { fetchGroupMembers } from '../../lib/firestoreRepo';

const REACT_EMOJIS = ['👏', '❤️', '🔥', '💪'];

const toDate = (t) => (t?.toDate ? t.toDate() : t ? new Date(t) : null);

export const dmPeer = (thread, uid) => {
  const peerUid = (thread.participants || []).find((p) => p !== uid) || uid;
  const info = thread.participant_info?.[peerUid] || {};
  return { uid: peerUid, name: info.name || 'משתמש/ת', photoUrl: info.photo_url || null };
};

export const dmUnreadCount = (thread, uid) => thread.unread_counts?.[uid] || 0;

export const isDmUnread = (thread, uid) => {
  const last = toDate(thread.lastActivityTimestamp);
  if (!last || thread.last_author_uid === uid) return false;
  const read = toDate(thread.read_timestamps?.[uid]);
  return !read || last > read;
};

/** One-on-one private chat pane, WhatsApp-style, over a dm_threads thread. */
export const DmChatView = ({ threadId, onBack }) => {
  const {
    uid, data, postDmMessage, postDmImage, reactToDmMessage, markDmAsRead,
    deleteDmMessage, setDmBlocked, reportDmThread, loadMoreDmMessages,
  } = useStore();
  const { language } = useTranslation();
  const isRTL = language === 'he';

  const thread = (data.dmThreads || []).find((t) => t.id === threadId);
  const messages = useMemo(
    () => data.dmMessages?.[threadId] || [],
    [data.dmMessages, threadId]
  );
  const peer = thread ? dmPeer(thread, uid) : { name: '...', photoUrl: null };
  const peerRead = toDate(thread?.read_timestamps?.[peer.uid]);

  const [text, setText] = useState('');
  const [reactPickerFor, setReactPickerFor] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const blocked = (thread?.blocked || []).length > 0;
  const blockedByMe = (thread?.blocked || []).includes(uid);
  const feedRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (threadId) markDmAsRead(threadId);
  }, [threadId, messages.length, markDmAsRead]);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, threadId]);

  const send = async () => {
    if (!text.trim()) return;
    try {
      await postDmMessage(threadId, text.trim());
      setText('');
    } catch {
      toast.error(isRTL ? 'שגיאה בשליחת ההודעה' : 'Error sending message');
    }
  };

  const sendImage = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await postDmImage(threadId, file);
    } catch {
      toast.error(isRTL ? 'שגיאה בהעלאת התמונה' : 'Error uploading image');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const chrono = useMemo(() => [...messages].reverse(), [messages]);

  return (
    <div className="flex flex-col h-full overflow-hidden w-full relative">
      {/* Header */}
      <div className="bg-white border-b border-[rgba(180,140,80,.12)] px-4 py-3 flex items-center gap-3 shrink-0 shadow-sm sticky top-0 z-20 h-[65px]">
        <button
          onClick={onBack}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:bg-[rgba(180,140,80,.08)] active:scale-95 shrink-0 min-[900px]:hidden cursor-pointer"
          aria-label={isRTL ? 'חזרה לרשימה' : 'Back'}
        >
          {isRTL ? <ChevronRight className="w-6 h-6 text-[#2A1A0A]" /> : <ChevronLeft className="w-6 h-6 text-[#2A1A0A]" />}
        </button>
        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 overflow-hidden font-bold text-sm">
          {peer.photoUrl
            ? <img src={peer.photoUrl} alt={peer.name} className="w-full h-full object-cover" />
            : (peer.name || 'ח').slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-base text-foreground truncate leading-tight">{peer.name}</h3>
          <p className="text-[10px] text-muted-foreground">{isRTL ? 'שיחה פרטית' : 'Private chat'}</p>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 rounded-xl hover:bg-[#F5F0E8] active:scale-95 transition-all cursor-pointer"
            aria-label={isRTL ? 'אפשרויות' : 'Options'}
          >
            <MoreVertical className="w-5 h-5 text-[#2A1A0A]" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className={cn(
                'absolute top-10 bg-white rounded-2xl border border-[rgba(180,140,80,.16)] shadow-xl p-2 w-48 space-y-1 z-50',
                isRTL ? 'left-0' : 'right-0'
              )}>
                <button
                  onClick={async () => {
                    setShowMenu(false);
                    await setDmBlocked(threadId, !blockedByMe);
                  }}
                  className="w-full text-start px-3 py-2.5 text-xs font-bold hover:bg-[#FAF7F2] rounded-xl flex items-center gap-2.5 cursor-pointer"
                >
                  <Ban className="w-4 h-4 text-red-500" />
                  <span>{blockedByMe ? (isRTL ? 'בטל חסימה' : 'Unblock') : (isRTL ? 'חסום משתמש' : 'Block user')}</span>
                </button>
                <button
                  onClick={async () => {
                    setShowMenu(false);
                    await reportDmThread(threadId);
                    toast.success(isRTL ? 'הדיווח נשלח, תודה' : 'Report sent, thanks');
                  }}
                  className="w-full text-start px-3 py-2.5 text-xs font-bold hover:bg-[#FAF7F2] rounded-xl flex items-center gap-2.5 cursor-pointer"
                >
                  <Flag className="w-4 h-4 text-amber-500" />
                  <span>{isRTL ? 'דווח על השיחה' : 'Report chat'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={feedRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-1 bg-[#FAF7F2]">
        {messages.length >= 60 && (
          <div className="text-center">
            <button
              onClick={() => loadMoreDmMessages(threadId)}
              className="text-[11px] font-bold text-primary hover:underline cursor-pointer inline-flex items-center gap-1"
            >
              <History className="w-3.5 h-3.5" />
              {isRTL ? 'טען הודעות קודמות' : 'Load older messages'}
            </button>
          </div>
        )}
        {chrono.length === 0 && (
          <div className="text-center py-16 text-muted-foreground text-xs space-y-2">
            <Lock className="w-7 h-7 mx-auto opacity-40 text-primary" />
            <p>{isRTL ? `זו תחילת השיחה עם ${peer.name}` : `This is the start of your chat with ${peer.name}`}</p>
          </div>
        )}
        {chrono.map((m, i) => {
          const mine = (m.author_uid || m.user_uid) === uid;
          const t = toDate(m.timestamp);
          const seen = mine && peerRead && t && t <= peerRead;
          const imageUrl = m.payload?.imageUrl;
          const summary = m.summary || m.message || '';
          const reactions = m.reactions || {};
          const reactionEntries = Object.entries(reactions).filter(([, v]) => Array.isArray(v) && v.length > 0);
          const prev = chrono[i - 1];
          const clustered = prev && (prev.author_uid || prev.user_uid) === (m.author_uid || m.user_uid);
          return (
            <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start', clustered ? 'mt-0.5' : 'mt-2')}>
              <div
                className={cn(
                  'relative max-w-[75%] rounded-2xl px-3 py-2 shadow-sm group',
                  mine ? 'bg-[#D9FDD3]' : 'bg-white'
                )}
                onDoubleClick={() => reactToDmMessage(threadId, m.id, '❤️')}
              >
                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt=""
                    onClick={() => setLightboxUrl(imageUrl)}
                    className="rounded-xl max-w-full mb-1 cursor-zoom-in"
                    style={{ maxHeight: 260 }}
                  />
                )}
                {summary && !(imageUrl && summary === '📷 תמונה') && (
                  <p className="text-[13.5px] leading-snug text-[#111B21] whitespace-pre-wrap break-words">{summary}</p>
                )}
                <div className="flex items-center gap-1 mt-0.5 justify-end">
                  <span className="text-[9.5px] text-[#111B21]/45">{t ? format(t, 'HH:mm') : ''}</span>
                  {mine && (
                    <CheckCheck className={cn('w-3.5 h-3.5', seen ? 'text-[#34B7F1]' : 'text-[#111B21]/40')} />
                  )}
                </div>
                {reactionEntries.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {reactionEntries.map(([emoji, uids]) => (
                      <span key={emoji} className="text-[10.5px] bg-black/5 rounded-full px-1.5 py-0.5">
                        {emoji} {uids.length}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setReactPickerFor(reactPickerFor === m.id ? null : m.id)}
                  className="absolute -top-2 -start-2 w-5 h-5 rounded-full bg-white border border-[rgba(180,140,80,.16)] items-center justify-center hidden group-hover:flex cursor-pointer"
                  aria-label={isRTL ? 'הגב' : 'React'}
                >
                  <SmilePlus className="w-3 h-3 text-[#8A7A6A]" />
                </button>
                {reactPickerFor === m.id && (
                  <div className="absolute -top-9 start-0 bg-white rounded-full border border-[rgba(180,140,80,.16)] shadow-lg px-2 py-1 flex gap-1.5 z-30 items-center">
                    {REACT_EMOJIS.map((e) => (
                      <button
                        key={e}
                        className="text-base hover:scale-125 transition-transform cursor-pointer"
                        onClick={() => { setReactPickerFor(null); reactToDmMessage(threadId, m.id, e); }}
                      >
                        {e}
                      </button>
                    ))}
                    {mine && (
                      <button
                        className="ms-1 cursor-pointer"
                        title={isRTL ? 'מחק הודעה' : 'Delete message'}
                        onClick={() => { setReactPickerFor(null); deleteDmMessage(threadId, m.id); }}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer / blocked banner */}
      {blocked ? (
        <div className="bg-red-50 border-t border-red-100 p-3.5 text-center shrink-0">
          <p className="text-xs font-bold text-red-600">
            {blockedByMe
              ? (isRTL ? 'חסמת את השיחה — לא ניתן לשלוח הודעות' : 'You blocked this chat')
              : (isRTL ? 'השיחה נחסמה — לא ניתן לשלוח הודעות' : 'This chat is blocked')}
          </p>
          {blockedByMe && (
            <button
              onClick={() => setDmBlocked(threadId, false)}
              className="mt-1 text-[11px] font-bold text-primary hover:underline cursor-pointer"
            >
              {isRTL ? 'בטל חסימה' : 'Unblock'}
            </button>
          )}
        </div>
      ) : (
      <div className="bg-white border-t border-[rgba(180,140,80,.12)] p-2.5 flex items-end gap-2 shrink-0">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={sendImage} />
        <button
          onClick={() => fileRef.current?.click()}
          className="w-10 h-10 rounded-full flex items-center justify-center text-[#8A7A6A] hover:bg-[#F5F0E8] active:scale-95 transition-all cursor-pointer shrink-0"
          title={isRTL ? 'שלח תמונה' : 'Send image'}
        >
          <ImageIcon className="w-5 h-5" />
        </button>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder={isRTL ? `הודעה ל${peer.name}...` : `Message ${peer.name}...`}
          className="flex-1 bg-[#FAF7F2] rounded-full border-[rgba(180,140,80,.12)]"
        />
        <Button onClick={send} className="shrink-0 rounded-full w-10 h-10 p-0">
          <Send className={cn('w-4 h-4', isRTL && 'scale-x-[-1]')} />
        </Button>
      </div>
      )}

      {/* Image lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[130] bg-black/90 flex items-center justify-center cursor-zoom-out"
          onClick={() => setLightboxUrl(null)}
        >
          <img src={lightboxUrl} alt="" className="max-w-[95vw] max-h-[92vh] object-contain rounded-lg" />
          <button
            className="absolute top-4 start-4 p-2 rounded-full bg-white/10 hover:bg-white/20 cursor-pointer"
            onClick={() => setLightboxUrl(null)}
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>
      )}
    </div>
  );
};

/** "New private chat" contact picker — everyone who shares a group with me. */
export const NewDmModal = ({ open, onClose, onOpened }) => {
  const { uid, data, openDm } = useStore();
  const { language } = useTranslation();
  const isRTL = language === 'he';
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState(null); // null = loading

  const groups = useMemo(() => data.groups || [], [data.groups]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const byUid = {};
      await Promise.all(groups.map(async (g) => {
        try {
          const members = await fetchGroupMembers(g.id);
          members.forEach((m) => {
            if (m.uid === uid) return;
            if (!byUid[m.uid]) byUid[m.uid] = { ...m, sharedGroups: [], sharedGroupIds: [] };
            byUid[m.uid].sharedGroups.push(g.name);
            byUid[m.uid].sharedGroupIds.push(g.id);
          });
        } catch { /* one bad group must not block the picker */ }
      }));
      if (!cancelled) {
        setContacts(Object.values(byUid).sort((a, b) => a.name.localeCompare(b.name, 'he')));
      }
    })();
    return () => { cancelled = true; setContacts(null); setQuery(''); };
  }, [open, groups, uid]);

  if (!open) return null;

  const filtered = (contacts || []).filter((c) => !query.trim() || c.name.includes(query.trim()));

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
        <motion.div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
        />
        <motion.div
          className="relative w-full max-w-sm overflow-hidden p-5 z-10 space-y-3 max-h-[75vh] flex flex-col"
          style={{ background: '#fff', borderRadius: 22, border: '1px solid rgba(180,140,80,.14)', boxShadow: '0 4px 24px rgba(40,20,0,.07)' }}
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          dir={isRTL ? 'rtl' : 'ltr'}
        >
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg" style={{ fontFamily: "'Instrument Serif', serif", color: '#2A1A0A' }}>
              {isRTL ? 'שיחה פרטית חדשה' : 'New Private Chat'}
            </h3>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[#F5F0E8] cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {isRTL ? 'אפשר לשוחח רק עם חברים מהקבוצות שלך' : 'You can only chat with members of your groups'}
          </p>
          <div className="relative">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isRTL ? 'חיפוש איש קשר...' : 'Search contact...'}
              className="ps-9"
            />
          </div>
          <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-1">
            {contacts === null ? (
              <p className="text-center py-8 text-xs text-muted-foreground">{isRTL ? 'טוען אנשי קשר...' : 'Loading contacts...'}</p>
            ) : filtered.length === 0 ? (
              <p className="text-center py-8 text-xs text-muted-foreground">
                {contacts.length === 0
                  ? (isRTL ? 'אין עדיין אנשי קשר — הצטרף לקבוצה כדי להכיר אנשים' : 'No contacts yet — join a group to meet people')
                  : (isRTL ? 'לא נמצא איש קשר מתאים' : 'No matching contact')}
              </p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.uid}
                  onClick={async () => {
                    const tid = await openDm(c, c.sharedGroupIds[0]);
                    if (tid) { onClose(); onOpened(tid); }
                  }}
                  className="w-full text-start px-2.5 py-2 rounded-xl flex items-center gap-3 hover:bg-[#FAF7F2] transition-all cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 overflow-hidden font-bold text-xs">
                    {c.photoUrl
                      ? <img src={c.photoUrl} alt={c.name} className="w-full h-full object-cover" />
                      : (c.name || 'ח').slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-xs text-[#2A1A0A] truncate">{c.name}</h4>
                    <p className="text-[10px] text-muted-foreground truncate">{c.sharedGroups.join(', ')}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
