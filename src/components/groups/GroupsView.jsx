import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from '../../store/useToast';
import { 
  Users, Plus, LogOut, Send, Paperclip, Clipboard, 
  Trash2, DollarSign, BookOpen, Clock,
  AlertTriangle, Copy, FileText, ShoppingCart, HelpCircle, FileDown, BookMarked, X,
  Car, Coffee, TrendingUp, Award, Sparkles, Pin, Star, Info
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';

const EXPENSE_CATEGORIES = {
  food: { label: 'אוכל וסופר 🛒', color: '#10B981', bg: '#ECFDF5', icon: ShoppingCart },
  travel: { label: 'נסיעות ודלק 🚗', color: '#3B82F6', bg: '#EFF6FF', icon: Car },
  drinks: { label: 'בילויים וקפה ☕', color: '#F59E0B', bg: '#FEF3C7', icon: Coffee },
  studies: { label: 'לימודים וציוד 📚', color: '#8B5CF6', bg: '#F5F3FF', icon: BookOpen },
  misc: { label: 'שונות ⚙️', color: '#6B7280', bg: '#F3F4F6', icon: HelpCircle },
};

const HE_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const HE_WEEKDAYS = ['יום ראשון', 'יום שני', 'יום שלישי', 'יום רביעי', 'יום חמישי', 'יום שישי', 'שבת'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EN_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// WhatsApp-style day divider label: "Today" / "Yesterday" / weekday / full date.
function dayLabel(date, isRTL) {
  const now = new Date();
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today - d) / 86400000);
  if (diffDays === 0) return isRTL ? 'היום' : 'Today';
  if (diffDays === 1) return isRTL ? 'אתמול' : 'Yesterday';
  if (diffDays > 1 && diffDays < 7) {
    return isRTL ? HE_WEEKDAYS[date.getDay()] : EN_WEEKDAYS[date.getDay()];
  }
  const months = isRTL ? HE_MONTHS : EN_MONTHS;
  const yearSuffix = date.getFullYear() === now.getFullYear() ? '' : ` ${date.getFullYear()}`;
  return isRTL ? `${date.getDate()} ב${months[date.getMonth()]}${yearSuffix}` : `${months[date.getMonth()]} ${date.getDate()}${yearSuffix}`;
}

function updateTimestamp(update) {
  return update.timestamp?.toDate ? update.timestamp.toDate() : (update.timestamp ? new Date(update.timestamp) : new Date());
}

function isChatKind(update) {
  const kind = update.kind || update.type || 'chat';
  return kind === 'chat' || kind === 'message';
}

// Consecutive same-sender plain chat messages within 5 minutes cluster
// together, WhatsApp-style: header/avatar only shown once per run.
function sameCluster(a, b) {
  if (!a || !b) return false;
  if (!isChatKind(a) || !isChatKind(b)) return false;
  const authorA = a.author_uid || a.user_uid;
  const authorB = b.author_uid || b.user_uid;
  if (authorA !== authorB) return false;
  return Math.abs(updateTimestamp(b) - updateTimestamp(a)) < 5 * 60 * 1000;
}

export const GroupsView = () => {
  const { 
    uid, data, createGroup, joinGroupByCode, leaveGroup, 
    postGroupMessage, reactToGroupUpdate, loadGroupMembers, 
    shareShoppingListToGroup, shareNoteToGroup, 
    shareFileToGroup, addSharedExpense, deleteSharedExpense, shareCourse, 
    importCourseFromCode, copySharedNoteToPersonal, markGroupAsRead,
    setProfile, toggleGroupMute
  } = useStore();

  const { language } = useTranslation();
  const isRTL = language === 'he';

  const serifFont = "'Instrument Serif', serif";
  const [groupFilter, setGroupFilter] = useState('all');
  const [showInfoPanel, setShowInfoPanel] = useState(true);

  const isGroupPinned = (g) => {
    const pinnedIds = data.profile?.pinned_group_ids || [];
    return pinnedIds.includes(g.id);
  };
  const isGroupFavorite = (g) => {
    const favoriteIds = data.profile?.favorite_group_ids || [];
    return favoriteIds.includes(g.id);
  };

  const groups = useMemo(() => {
    const list = data.groups || [];
    const pinnedIds = data.profile?.pinned_group_ids || [];
    return [...list].sort((a, b) => {
      const pa = pinnedIds.includes(a.id);
      const pb = pinnedIds.includes(b.id);
      if (pa !== pb) return pa ? -1 : 1;
      const ta = a.lastActivityTimestamp ? (a.lastActivityTimestamp.toDate ? a.lastActivityTimestamp.toDate() : new Date(a.lastActivityTimestamp)) : new Date(0);
      const tb = b.lastActivityTimestamp ? (b.lastActivityTimestamp.toDate ? b.lastActivityTimestamp.toDate() : new Date(b.lastActivityTimestamp)) : new Date(0);
      return tb - ta;
    });
  }, [data.groups, data.profile?.pinned_group_ids]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const activeGroup = groups.find((g) => g.id === selectedGroupId);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

  const isGroupUnread = (g) => {
    if (!g.lastActivityTimestamp) return false;
    const readMap = data.profile?.group_read_timestamps || {};
    const readTime = readMap[g.id];
    if (!readTime) return true;
    const lastDate = g.lastActivityTimestamp.toDate ? g.lastActivityTimestamp.toDate() : new Date(g.lastActivityTimestamp);
    const readDate = readTime.toDate ? readTime.toDate() : new Date(readTime);
    return lastDate > readDate;
  };

  // Verify selected group exists
  useEffect(() => {
    if (selectedGroupId) {
      const exists = groups.some((g) => g.id === selectedGroupId);
      if (!exists) {
        setSelectedGroupId('');
      }
    }
  }, [groups, selectedGroupId]);

  const [activeTab, setActiveTab] = useState('chat'); // 'chat' | 'exams' | 'expenses' | 'members'
  
  // Forms state
  const [newGroupName, setNewGroupName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  // Splid-like Expense state
  const [expenseCategory, setExpenseCategory] = useState('misc');
  const [expensePayer, setExpensePayer] = useState(uid);
  const [expenseSplitMode, setExpenseSplitMode] = useState('equal'); // 'equal' | 'exact' | 'percentage'
  const [expenseSplits, setExpenseSplits] = useState({}); // uid -> value
  const [isSettleUpMode, setIsSettleUpMode] = useState(false);
  const [settleUpFrom, setSettleUpFrom] = useState(uid);
  const [settleUpTo, setSettleUpTo] = useState('');
  const [settleUpAmount, setSettleUpAmount] = useState('');

  const groupMembersCount = data.groupMembers[selectedGroupId]?.length || 0;
  const groupMembersList = useMemo(() => data.groupMembers[selectedGroupId] || [], [data.groupMembers, selectedGroupId]);

  // Sync Payer and splits default state
  useEffect(() => {
    setExpensePayer(uid);
    setSettleUpFrom(uid);
    const other = groupMembersList.find(m => m.uid !== uid);
    if (other) setSettleUpTo(other.uid);
    else setSettleUpTo('');
    
    const initialSplits = {};
    groupMembersList.forEach(m => {
      initialSplits[m.uid] = true;
    });
    setExpenseSplits(initialSplits);
  }, [selectedGroupId, groupMembersCount, groupMembersList, uid]);

  // Modals state
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [shareType, setShareType] = useState(null); // 'note' | 'list' | 'course'
  const [selectedWorkoutDetail, setSelectedWorkoutDetail] = useState(null);
  const [selectedMealDetail, setSelectedMealDetail] = useState(null);

  // Study Buddy state
  const [isStudying, setIsStudying] = useState(false);
  const [studyingCourse, setStudyingCourse] = useState('');

  const messagesFeedRef = useRef(null);
  const fileInputRef = useRef(null);

  const activeGroupId = activeGroup?.id;
  const activeGroupMemberCount = activeGroup?.member_count;

  // Sync group members and active group changes
  useEffect(() => {
    if (activeGroupId) {
      loadGroupMembers(activeGroupId);
      markGroupAsRead(activeGroupId);
    }
  }, [activeGroupId, activeGroupMemberCount, loadGroupMembers, markGroupAsRead]);

  const groupUpdatesLength = data.groupUpdates[selectedGroupId]?.length || 0;

  // Mark as read when new updates arrive and user is viewing the chat
  useEffect(() => {
    if (activeGroupId && activeTab === 'chat') {
      markGroupAsRead(activeGroupId);
    }
  }, [activeGroupId, groupUpdatesLength, activeTab, markGroupAsRead]);

  // Scroll chat to bottom — scoped to the feed's own scrollTop so this never
  // asks an outer ancestor (the route/page) to scroll, which was dragging the
  // sticky group header out of view and fighting the user's own scroll-up.
  useEffect(() => {
    const el = messagesFeedRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [groupUpdatesLength, activeTab, selectedGroupId]);

  // Handle group creation
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error(isRTL ? 'אנא הזן שם קבוצה' : 'Please enter a group name');
      return;
    }
    try {
      const gid = await createGroup(newGroupName.trim());
      setSelectedGroupId(gid);
      setNewGroupName('');
      setActiveTab('chat');
      toast.success(isRTL ? 'הקבוצה נוצרה בהצלחה!' : 'Group created successfully!');
    } catch {
      toast.error(isRTL ? 'שגיאה ביצירת הקבוצה' : 'Error creating group');
    }
  };

  // Handle joining group
  const handleJoinGroup = async () => {
    if (joinCode.trim().length !== 6) {
      toast.error(isRTL ? 'קוד קבוצה חייב להכיל 6 תווים' : 'Group code must be 6 characters');
      return;
    }
    try {
      const gid = await joinGroupByCode(joinCode.trim().toUpperCase());
      if (gid) {
        setSelectedGroupId(gid);
        setJoinCode('');
        setActiveTab('chat');
        toast.success(isRTL ? 'הצטרפת לקבוצה בהצלחה!' : 'Joined group successfully!');
      } else {
        toast.error(isRTL ? 'קוד קבוצה לא נמצא' : 'Group code not found');
      }
    } catch {
      toast.error(isRTL ? 'שגיאה בהצטרפות לקבוצה' : 'Error joining group');
    }
  };

  // Handle sending chat message
  const handleSendChatMessage = async () => {
    if (!chatMessage.trim()) return;
    try {
      await postGroupMessage(selectedGroupId, chatMessage.trim());
      setChatMessage('');
    } catch {
      toast.error(isRTL ? 'שגיאה בשליחת ההודעה' : 'Error sending message');
    }
  };

  // Handle file sharing
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setIsUploading(true);
    try {
      await shareFileToGroup(selectedGroupId, file);
      toast.success(isRTL ? 'הקובץ שותף בהצלחה!' : 'File shared successfully!');
    } catch {
      toast.error(isRTL ? 'שגיאה בהעלאת הקובץ' : 'Error uploading file');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle adding expense
  const handleAddExpense = async () => {
    if (!expenseTitle.trim() || !expenseAmount || parseFloat(expenseAmount) <= 0) {
      toast.error(isRTL ? 'נא למלא את כל השדות ולהזין סכום תקין' : 'Please fill all fields with positive amount');
      return;
    }

    const membersList = data.groupMembers[selectedGroupId] || [];
    const totalAmount = parseFloat(expenseAmount);

    // Validation based on split mode
    if (expenseSplitMode === 'exact') {
      let sum = 0;
      membersList.forEach(m => {
        sum += parseFloat(expenseSplits[m.uid] || 0);
      });
      if (Math.abs(sum - totalAmount) > 0.1) {
        toast.error(isRTL 
          ? `סכום החלוקה (${sum.toFixed(1)} ₪) חייב להיות שווה לסך ההוצאה (${totalAmount} ₪)` 
          : `Split sum (${sum.toFixed(1)}) must equal total amount (${totalAmount})`
        );
        return;
      }
    } else if (expenseSplitMode === 'percentage') {
      let sum = 0;
      membersList.forEach(m => {
        sum += parseFloat(expenseSplits[m.uid] || 0);
      });
      if (Math.abs(sum - 100) > 0.1) {
        toast.error(isRTL 
          ? `סכום האחוזים (${sum.toFixed(0)}%) חייב להיות שווה בדיוק ל-100%` 
          : `Percentage sum (${sum.toFixed(0)}%) must equal 100%`
        );
        return;
      }
    }

    try {
      const payer = membersList.find(m => m.uid === expensePayer);
      const payload = {
        title: expenseTitle.trim(),
        amount: totalAmount,
        paidBy: expensePayer,
        paidByName: payer?.name || 'חבר/ה',
        category: expenseCategory,
        splitMode: expenseSplitMode,
        splits: expenseSplits,
        isSettleUp: false,
      };

      await addSharedExpense(selectedGroupId, payload);
      setExpenseTitle('');
      setExpenseAmount('');
      toast.success(isRTL ? 'הוצאה נוספה בהצלחה!' : 'Expense added successfully!');
    } catch {
      toast.error(isRTL ? 'שגיאה בהוספת ההוצאה' : 'Error adding expense');
    }
  };

  // Handle settle up repayment
  const handleSettleUp = async () => {
    if (!settleUpAmount || parseFloat(settleUpAmount) <= 0 || !settleUpTo) {
      toast.error(isRTL ? 'נא להזין סכום תקין ולבחור חבר קבוצה' : 'Please select recipient and positive amount');
      return;
    }
    if (settleUpFrom === settleUpTo) {
      toast.error(isRTL ? 'אי אפשר להחזיר חוב לעצמך' : 'Cannot settle debt with yourself');
      return;
    }

    const membersList = data.groupMembers[selectedGroupId] || [];
    try {
      const fromMember = membersList.find(m => m.uid === settleUpFrom);
      const toMember = membersList.find(m => m.uid === settleUpTo);

      const payload = {
        title: 'החזר חוב 🤝',
        amount: parseFloat(settleUpAmount),
        paidBy: settleUpFrom,
        paidByName: fromMember?.name || 'חבר/ה',
        receivedBy: settleUpTo,
        receivedByName: toMember?.name || 'חבר/ה',
        isSettleUp: true,
      };

      await addSharedExpense(selectedGroupId, payload);
      setSettleUpAmount('');
      setIsSettleUpMode(false);
      toast.success(isRTL ? 'החזר החוב נרשם בהצלחה!' : 'Repayment registered successfully!');
    } catch {
      toast.error(isRTL ? 'שגיאה ברישום החזר החוב' : 'Error registering repayment');
    }
  };

  // Handle copying join code
  const copyJoinCode = () => {
    if (activeGroup?.join_code) {
      navigator.clipboard.writeText(activeGroup.join_code);
      toast.success(isRTL ? 'הקוד הועתק!' : 'Code copied!');
    }
  };

  // Handle study status toggle
  const toggleStudyStatus = async () => {
    const nextState = !isStudying;
    setIsStudying(nextState);
    const authorName = data.profile?.displayName || 'סטודנט/ית';
    if (nextState && studyingCourse) {
      await postGroupMessage(selectedGroupId, {
        kind: 'chat',
        app_origin: 'life',
        author_uid: uid,
        author_name: authorName,
        summary: `התחלתי ללמוד כרגע את הקורס: "${studyingCourse}" 📖`,
        payload: { kind: 'studyStatus', courseName: studyingCourse, isStudying: true },
        type: 'message',
        user_uid: uid,
        user_name: authorName,
        message: `התחלתי ללמוד כרגע את הקורס: "${studyingCourse}" 📖`
      });
    }
  };

  // Shared Academic Gate verification
  const verifyAcademicMatch = () => {
    const members = data.groupMembers[selectedGroupId] || [];
    if (members.length <= 1) return { success: true };

    const first = members[0];
    const institution = (first.academicInstitution || '').trim().toLowerCase();
    const degree = (first.degree || '').trim().toLowerCase();
    
    // Check if institution or degree are empty
    if (!institution || !degree) {
      return { success: false, reason: 'missing_profile_data' };
    }

    const mismatch = members.some(m => 
      (m.academicInstitution || '').trim().toLowerCase() !== institution ||
      (m.degree || '').trim().toLowerCase() !== degree
    );

    if (mismatch) {
      return { success: false, reason: 'mismatch_profile' };
    }

    // Check courses overlap
    const firstCoursesSet = new Set(first.courses || []);
    let coursesMismatch = false;
    members.forEach(m => {
      const currentSet = new Set(m.courses || []);
      if (firstCoursesSet.size !== currentSet.size) {
        coursesMismatch = true;
      } else {
        for (let c of firstCoursesSet) {
          if (!currentSet.has(c)) {
            coursesMismatch = true;
            break;
          }
        }
      }
    });

    if (coursesMismatch) {
      return { success: false, reason: 'mismatch_courses' };
    }

    return { success: true };
  };

  // Calculations for Expense Split Ledger
  const calculateSplitDebts = () => {
    const expenses = data.groupExpenses[selectedGroupId] || [];
    const membersList = data.groupMembers[selectedGroupId] || [];
    if (membersList.length <= 1) return [];

    const balances = {};
    membersList.forEach((m) => { balances[m.uid] = 0; });

    expenses.forEach((e) => {
      const amount = parseFloat(e.amount) || 0;
      if (amount <= 0) return;

      if (e.isSettleUp) {
        // Repayment: e.paidBy paid e.amount to e.receivedBy
        if (balances[e.paidBy] !== undefined) balances[e.paidBy] += amount;
        if (balances[e.receivedBy] !== undefined) balances[e.receivedBy] -= amount;
      } else {
        // Normal expense: e.paidBy paid e.amount
        if (balances[e.paidBy] !== undefined) {
          balances[e.paidBy] += amount;
        }

        const mode = e.splitMode || 'equal';
        const splits = e.splits || {};

        if (mode === 'equal') {
          // Equal split among selected members
          let participants = membersList.filter(m => splits[m.uid] !== false);
          if (participants.length === 0) participants = membersList; // fallback to all
          
          const share = amount / participants.length;
          participants.forEach((m) => {
            if (balances[m.uid] !== undefined) {
              balances[m.uid] -= share;
            }
          });
        } else if (mode === 'exact') {
          // Exact amount splits
          membersList.forEach((m) => {
            const share = parseFloat(splits[m.uid]) || 0;
            if (balances[m.uid] !== undefined) {
              balances[m.uid] -= share;
            }
          });
        } else if (mode === 'percentage') {
          // Percentage splits
          membersList.forEach((m) => {
            const pct = parseFloat(splits[m.uid]) || 0;
            const share = (pct / 100) * amount;
            if (balances[m.uid] !== undefined) {
              balances[m.uid] -= share;
            }
          });
        }
      }
    });

    const debtorCreditorList = membersList.map((m) => ({
      uid: m.uid,
      name: m.name,
      balance: balances[m.uid] || 0,
    }));

    const transactions = [];
    debtorCreditorList.sort((a, b) => a.balance - b.balance);

    let i = 0;
    let j = debtorCreditorList.length - 1;

    while (i < j) {
      const debtor = debtorCreditorList[i];
      const creditor = debtorCreditorList[j];

      if (Math.abs(debtor.balance) < 0.1) { i++; continue; }
      if (Math.abs(creditor.balance) < 0.1) { j--; continue; }

      const transAmount = Math.min(Math.abs(debtor.balance), creditor.balance);
      transactions.push({
        from: debtor.name,
        fromUid: debtor.uid,
        to: creditor.name,
        toUid: creditor.uid,
        amount: transAmount.toFixed(1),
      });

      debtor.balance += transAmount;
      creditor.balance -= transAmount;

      if (Math.abs(debtor.balance) < 0.1) i++;
      if (Math.abs(creditor.balance) < 0.1) j--;
    }

    return transactions;
  };

  const [searchQuery, setSearchQuery] = useState('');
  const filteredGroups = useMemo(() => {
    let list = groups;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((g) => g.name.toLowerCase().includes(q));
    }
    return list.filter((g) => {
      if (groupFilter === 'all') return true;
      if (groupFilter === 'unread') return isGroupUnread(g);
      if (groupFilter === 'favorites') return isGroupFavorite(g);
      if (groupFilter === 'pinned') return isGroupPinned(g);
      return true;
    });
  }, [groups, searchQuery, groupFilter]);

  const renderModals = () => {
    return (
      <AnimatePresence>
        {isCreateModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreateModalOpen(false)}
            />
            <motion.div
              className="relative w-full max-w-sm overflow-hidden p-5 z-10 space-y-4"
              style={{ background: '#fff', borderRadius: 22, border: '1px solid rgba(180,140,80,.14)', boxShadow: '0 4px 24px rgba(40,20,0,.07)' }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              dir={isRTL ? 'rtl' : 'ltr'}
            >
              <h3 className="font-bold text-lg" style={{ fontFamily: serifFont, color: '#2A1A0A' }}>
                {isRTL ? 'יצירת קבוצה חדשה' : 'Create New Group'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isRTL ? 'הגדר שם קבוצה וקבל קוד שיתוף להזמנת החברים.' : 'Define group name and get code to invite peers.'}
              </p>
              <Input 
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder={isRTL ? 'לדוגמה: לומדי אינפי מאי 2026' : 'e.g. Infi Learners May 2026'}
                className="w-full bg-[#FAF8F5]"
              />
              <div className="flex justify-end gap-2 text-xs font-bold pt-2">
                <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
                  {isRTL ? 'ביטול' : 'Cancel'}
                </Button>
                <Button onClick={async () => { await handleCreateGroup(); setIsCreateModalOpen(false); }}>
                  {isRTL ? 'צור קבוצה' : 'Create Group'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}

        {isJoinModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsJoinModalOpen(false)}
            />
            <motion.div
              className="relative w-full max-w-sm overflow-hidden p-5 z-10 space-y-4"
              style={{ background: '#fff', borderRadius: 22, border: '1px solid rgba(180,140,80,.14)', boxShadow: '0 4px 24px rgba(40,20,0,.07)' }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              dir={isRTL ? 'rtl' : 'ltr'}
            >
              <h3 className="font-bold text-lg" style={{ fontFamily: serifFont, color: '#2A1A0A' }}>
                {isRTL ? 'הצטרפות לקבוצה קיימת' : 'Join Existing Group'}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isRTL ? 'הזן קוד הצטרפות בן 6 תווים שקיבלת מהיוצר.' : 'Enter the 6-character code shared by the creator.'}
              </p>
              <Input 
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder={isRTL ? 'לדוגמה: AB39XF' : 'e.g. AB39XF'}
                maxLength={6}
                className="uppercase tracking-widest text-center text-lg font-bold bg-[#FAF8F5]"
              />
              <div className="flex justify-end gap-2 text-xs font-bold pt-2">
                <Button variant="outline" onClick={() => setIsJoinModalOpen(false)}>
                  {isRTL ? 'ביטול' : 'Cancel'}
                </Button>
                <Button onClick={async () => { await handleJoinGroup(); setIsJoinModalOpen(false); }}>
                  {isRTL ? 'הצטרף' : 'Join'}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  };

  // Active Group Details View
  const updates = selectedGroupId ? (data.groupUpdates[selectedGroupId] || []) : [];
  const members = selectedGroupId ? (data.groupMembers[selectedGroupId] || []) : [];
  const chronoUpdates = useMemo(() => [...updates].reverse(), [updates]);

  const handleCopyNote = async (payload) => {
    try {
      await copySharedNoteToPersonal(payload);
      toast.success(isRTL ? 'הפתק הועתק לפתקים שלך!' : 'Note copied to your notes!');
    } catch {
      toast.error(isRTL ? 'שגיאה בהעתקת הפתק' : 'Failed to copy note');
    }
  };

  const handleImportCourse = async (code) => {
    try {
      const ok = await importCourseFromCode(code);
      if (ok) {
        toast.success(isRTL ? 'הקורס יובא בהצלחה!' : 'Course imported!');
      }
    } catch {
      toast.error(isRTL ? 'שגיאה בייבוא הקורס' : 'Failed to import');
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#FAF8F5] relative" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* 1. RIGHT SIDEBAR: Chat List (On desktop: always visible. On mobile: visible only when selectedGroupId is empty) */}
      <div className={cn(
        "flex flex-col h-full bg-white border-e border-[rgba(180,140,80,.12)] shadow-sm shrink-0",
        selectedGroupId ? "hidden min-[900px]:flex min-[900px]:w-[360px] xl:w-[400px]" : "w-full min-[900px]:w-[360px] xl:w-[400px] flex"
      )}>
        {/* Index Header */}
        <div className="bg-white border-b border-[rgba(180,140,80,.12)] px-4 py-4 flex items-center justify-between shrink-0 h-[65px]">
          <h2 style={{ fontFamily: serifFont, fontSize: 20, fontWeight: 400, color: '#2A1A0A' }}>
            {isRTL ? 'הקבוצות שלי' : 'My Groups'}
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="p-2 rounded-xl text-primary hover:bg-[#FAF8F5] active:scale-95 transition-all cursor-pointer"
              title={isRTL ? 'קבוצה חדשה' : 'New Group'}
            >
              <Plus className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsJoinModalOpen(true)}
              className="p-2 rounded-xl text-[#8A7A6A] hover:bg-[#FAF8F5] active:scale-95 transition-all cursor-pointer"
              title={isRTL ? 'הצטרף לקבוצה' : 'Join Group'}
            >
              <Users className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="p-3 bg-[#FAF8F5] border-b border-[rgba(180,140,80,.06)] shrink-0">
          <Input 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isRTL ? 'חיפוש קבוצה...' : 'Search group...'}
            className="w-full text-xs bg-white border border-[rgba(180,140,80,.12)] px-3 py-1.5 rounded-xl h-9"
          />
        </div>

        {/* Filter Chips */}
        <div className="px-3 py-2 bg-white border-b border-[rgba(180,140,80,.06)] shrink-0 flex gap-1.5 overflow-x-auto select-none no-scrollbar">
          {[
            { id: 'all', label: isRTL ? 'הכל' : 'All' },
            { id: 'unread', label: isRTL ? 'לא נקראו' : 'Unread' },
            { id: 'favorites', label: isRTL ? 'מועדפים' : 'Favorites' },
            { id: 'pinned', label: isRTL ? 'נעוצות' : 'Pinned' }
          ].map(f => {
            const isActive = groupFilter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setGroupFilter(f.id)}
                className={cn(
                  "px-3 py-1 rounded-full text-[11px] font-bold shrink-0 transition-all active:scale-95 cursor-pointer border",
                  isActive 
                    ? "bg-primary border-primary text-white shadow-sm" 
                    : "bg-[#FAF8F5] border-[rgba(180,140,80,.08)] text-[#8A7A6A] hover:bg-[#F5F0E8]"
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Scrollable Groups List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-white">
          {filteredGroups.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-xs space-y-2">
              <Users className="w-8 h-8 mx-auto opacity-40 text-primary" />
              <p>{isRTL ? 'אין קבוצות מתאימות' : 'No matching groups'}</p>
            </div>
          ) : (
            filteredGroups.map((g) => {
              const isActive = g.id === selectedGroupId;
              const unread = isGroupUnread(g);
              const lastActivity = g.lastActivitySnippet || (isRTL ? 'אין פעילות בקבוצה' : 'No recent activity');
              const lastTime = g.lastActivityTimestamp 
                ? format(g.lastActivityTimestamp.toDate ? g.lastActivityTimestamp.toDate() : new Date(g.lastActivityTimestamp), 'HH:mm')
                : '';
              const isPinned = isGroupPinned(g);
              const isFavorite = isGroupFavorite(g);
              return (
                <button
                  key={g.id}
                  onClick={() => {
                    setSelectedGroupId(g.id);
                    setActiveTab('chat');
                  }}
                  className={cn(
                    "w-full text-start p-3 rounded-2xl flex items-center justify-between gap-3 transition-all cursor-pointer border",
                    isActive 
                      ? "bg-primary/[0.06] border-primary/10" 
                      : "border-transparent hover:bg-[#FAF8F5]/80"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Circle Avatar */}
                    <div className={cn(
                      "w-11 h-11 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border overflow-hidden",
                      isActive ? "bg-primary/20 text-primary border-primary/20" : "bg-primary/10 text-primary border-primary/10"
                    )}>
                      {(g.imageUrl || g.image_url)
                        ? <img src={g.imageUrl || g.image_url} alt={g.name} className="w-full h-full object-cover" />
                        : g.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <h4 className="font-bold text-xs text-foreground truncate">{g.name}</h4>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate font-medium">
                        {lastActivity}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end justify-between shrink-0 gap-1.5 h-full min-h-[36px]">
                    <span className="text-[9px] text-muted-foreground">{lastTime}</span>
                    <div className="flex items-center gap-1">
                      {isPinned && <Pin className="w-3 h-3 text-primary fill-primary" />}
                      {isFavorite && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                      {unread && (
                        <span className="w-2 h-2 bg-red-500 rounded-full shrink-0 shadow-[0_0_6px_rgba(239,68,68,0.5)] animate-pulse" />
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 2. LEFT DETAIL PANE: Selected Group Content (On desktop: always visible. On mobile: visible only when selectedGroupId is NOT empty) */}
      <div className={cn(
        "flex-1 flex flex-col h-full bg-[#FAF8F5] overflow-hidden min-w-0",
        selectedGroupId ? "flex" : "hidden min-[900px]:flex"
      )}>
        {selectedGroupId && activeGroup ? (
          <div className="flex flex-col h-full overflow-hidden w-full relative">
            {/* Sticky Group Header */}
            <div className="bg-white border-b border-[rgba(180,140,80,.12)] px-4 py-3 flex items-center justify-between gap-4 shrink-0 shadow-sm sticky top-0 z-20 h-[65px]">
              <div className="flex items-center gap-3 min-w-0">
                {/* Back button to Groups list (on mobile) */}
                <button 
                  onClick={() => setSelectedGroupId('')} 
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:bg-[rgba(180,140,80,.08)] active:scale-95 shrink-0 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none min-[900px]:hidden cursor-pointer"
                  title={isRTL ? 'חזרה לקבוצות' : 'Back to Groups'}
                  aria-label="חזרה לרשימת הקבוצות"
                >
                  {isRTL ? <ChevronRight className="w-6 h-6 text-[#2A1A0A]" /> : <ChevronLeft className="w-6 h-6 text-[#2A1A0A]" />}
                </button>

                {/* Group Avatar in Header */}
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0 border border-primary/10 shadow-sm overflow-hidden">
                  {(activeGroup.imageUrl || activeGroup.image_url)
                    ? <img src={activeGroup.imageUrl || activeGroup.image_url} alt={activeGroup.name} className="w-full h-full object-cover" />
                    : activeGroup.name.slice(0, 2).toUpperCase()}
                </div>

                <div className="min-w-0">
                  <h3 className="font-bold text-sm md:text-base text-foreground truncate leading-tight">{activeGroup.name}</h3>
                  <span className="text-[10px] text-muted-foreground font-semibold block">
                    {isRTL ? 'קוד קבוצה:' : 'Group Code:'} <code className="font-bold text-primary select-all">{activeGroup.join_code}</code>
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Pin Button */}
                <button 
                  onClick={async () => {
                    const pinned = isGroupPinned(activeGroup);
                    const pinnedIds = data.profile?.pinned_group_ids || [];
                    const next = pinned ? pinnedIds.filter(id => id !== activeGroup.id) : [...pinnedIds, activeGroup.id];
                    await setProfile({ pinned_group_ids: next });
                    toast.success(pinned ? (isRTL ? 'הקבוצה הוסרה מנעוצות' : 'Group unpinned') : (isRTL ? 'הקבוצה ננעצה' : 'Group pinned'));
                  }}
                  className="text-[#8A7A6A] hover:text-primary active:scale-90 transition-all p-2 rounded-xl hover:bg-[rgba(180,140,80,.05)] cursor-pointer"
                  title={isGroupPinned(activeGroup) ? (isRTL ? 'בטל נעילה' : 'Unpin') : (isRTL ? 'נעץ קבוצה' : 'Pin')}
                >
                  <Pin className={cn("w-4 h-4", isGroupPinned(activeGroup) && "fill-primary text-primary")} />
                </button>

                {/* Favorite Button */}
                <button 
                  onClick={async () => {
                    const fav = isGroupFavorite(activeGroup);
                    const favIds = data.profile?.favorite_group_ids || [];
                    const next = fav ? favIds.filter(id => id !== activeGroup.id) : [...favIds, activeGroup.id];
                    await setProfile({ favorite_group_ids: next });
                    toast.success(fav ? (isRTL ? 'הוסר ממועדפים' : 'Removed from favorites') : (isRTL ? 'נוסף למועדפים' : 'Added to favorites'));
                  }}
                  className="text-[#8A7A6A] hover:text-amber-500 active:scale-90 transition-all p-2 rounded-xl hover:bg-[rgba(180,140,80,.05)] cursor-pointer"
                  title={isGroupFavorite(activeGroup) ? (isRTL ? 'הסר ממועדפים' : 'Unfavorite') : (isRTL ? 'הוסף למועדפים' : 'Favorite')}
                >
                  <Star className={cn("w-4 h-4", isGroupFavorite(activeGroup) && "fill-amber-500 text-amber-500")} />
                </button>

                {/* Info Pane Toggle */}
                <button 
                  onClick={() => setShowInfoPanel(!showInfoPanel)}
                  className="text-[#8A7A6A] hover:text-primary active:scale-90 transition-all p-2 rounded-xl hover:bg-[rgba(180,140,80,.05)] cursor-pointer"
                  title={isRTL ? 'פרטי קבוצה' : 'Group Info'}
                >
                  <Info className={cn("w-4 h-4", showInfoPanel && "text-primary fill-primary/10")} />
                </button>

                <button onClick={copyJoinCode} className="text-[#8A7A6A] hover:text-primary active:scale-90 transition-all p-2 rounded-xl hover:bg-[rgba(180,140,80,.05)] cursor-pointer" title={isRTL ? 'העתק קוד' : 'Copy Code'}>
                  <Copy className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => {
                    if (window.confirm(isRTL ? 'האם אתה בטוח שברצונך לעזוב את הקבוצה?' : 'Are you sure you want to leave the group?')) {
                      leaveGroup(selectedGroupId);
                      setSelectedGroupId('');
                    }
                  }}
                  className="text-[#8A7A6A] hover:text-red-500 active:scale-95 transition-all p-2 rounded-xl hover:bg-red-50 cursor-pointer"
                  title={isRTL ? 'עזוב קבוצה' : 'Leave Group'}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Sticky Tab Switcher */}
            <div className="bg-[#FAF8F5] border-b border-[rgba(180,140,80,.08)] px-4 py-1.5 flex gap-2 shrink-0 overflow-x-auto select-none sticky top-[65px] z-10 min-[900px]:hidden">
              {[
                { id: 'chat', label: isRTL ? 'צ\'אט ועדכונים' : 'Chat', icon: Send },
                { id: 'exams', label: isRTL ? 'לוח בחינות' : 'Exams', icon: Clock },
                { id: 'expenses', label: isRTL ? 'חלוקת הוצאות' : 'Expenses', icon: DollarSign },
                { id: 'members', label: isRTL ? 'חברי קבוצה' : 'Members', icon: Users }
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all active:scale-95",
                      isActive 
                         ? "bg-primary text-white shadow-sm font-bold" 
                         : "bg-white text-[#8A7A6A] border border-[rgba(180,140,80,.12)] hover:bg-[#FAF8F5]"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Tab Contents Area */}
            <div className="flex-1 flex flex-col min-[900px]:flex-row min-h-0 overflow-hidden relative bg-[#FAF8F5]">
        
        {/* 1. CHAT TAB */}
        {(activeTab === 'chat' || true) && (
          <div className={cn("flex flex-col h-full min-h-0 flex-1", activeTab === 'chat' ? "flex" : "hidden min-[900px]:flex")}>
            {/* Messages Feed */}
            <div ref={messagesFeedRef} className="flex-1 overflow-y-auto overscroll-contain p-4 min-h-0">
              {updates.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground text-sm">
                  {isRTL ? 'אין הודעות או פעילות בקבוצה עדיין. התחילו לשוחח!' : 'No updates yet. Write something!'}
                </div>
              ) : (
                chronoUpdates.map((update, idx) => {
                  const isMe = update.author_uid === uid || update.user_uid === uid;
                  const authorUid = update.author_uid || update.user_uid;
                  const authorMember = groupMembersList.find((m) => m.uid === authorUid);
                  const authorPhotoUrl = authorMember?.photoUrl || update.author_photo_url || null;

                  // Support cross-app messages and legacy updates
                  const itemKind = update.kind || update.type || 'chat';
                  const isRichCard = !!update.payload || ['workout', 'shared_workout', 'meal', 'shared_meal', 'new_recipe', 'badge_earned', 'weight_milestone', 'champion_crowned'].includes(itemKind);
                  const isSystem = !isRichCard && itemKind !== 'chat' && itemKind !== 'message';

                  const prevUpdate = chronoUpdates[idx - 1];
                  const nextUpdate = chronoUpdates[idx + 1];
                  const thisDate = updateTimestamp(update);
                  const showDayDivider = !prevUpdate || updateTimestamp(prevUpdate).toDateString() !== thisDate.toDateString();
                  const isTopOfCluster = showDayDivider || !sameCluster(prevUpdate, update);
                  const isBottomOfCluster = !sameCluster(update, nextUpdate);
                  const divider = showDayDivider && (
                    <div className="flex justify-center my-3">
                      <span className="text-[11px] font-bold text-muted-foreground bg-[rgba(180,140,80,.08)] px-3 py-1 rounded-full">
                        {dayLabel(thisDate, isRTL)}
                      </span>
                    </div>
                  );

                  if (isSystem) {
                    return (
                      <React.Fragment key={update.id || idx}>
                        {divider}
                        <div className="text-center text-[11px] text-muted-foreground py-1 my-1 bg-white/40 rounded-full max-w-sm mx-auto border border-dashed border-border/40">
                          {update.summary}
                        </div>
                      </React.Fragment>
                    );
                  }

                  const payload = update.payload || {};

                  return (
                    <React.Fragment key={update.id || idx}>
                      {divider}
                      <div
                        className={cn(
                          "flex gap-2 max-w-[85%] md:max-w-[70%]",
                          isMe ? "ms-auto flex-row-reverse text-end" : "me-auto flex-row text-start",
                          isTopOfCluster ? "mt-3" : "mt-0.5"
                        )}
                      >
                        {/* Avatar — reserved even when hidden, so bubbles stay aligned */}
                        <div className="w-8 h-8 shrink-0 self-end">
                          {isBottomOfCluster && !isMe && (
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs text-primary font-bold border border-primary/10 overflow-hidden">
                              {authorPhotoUrl
                                ? <img src={authorPhotoUrl} alt={update.author_name} className="w-full h-full object-cover" />
                                : (update.author_name ? update.author_name.slice(0, 2) : 'ח׳')}
                            </div>
                          )}
                        </div>

                      {/* Content Bubble */}
                      <div className="space-y-1">
                        {isTopOfCluster && !isMe && (
                          <div className="text-[10px] text-muted-foreground px-1 font-semibold flex gap-2 items-center justify-end">
                            <span>{update.author_name}</span>
                            <span>·</span>
                            <span>
                              {update.timestamp?.toDate
                                ? format(update.timestamp.toDate(), 'HH:mm')
                                : 'כרגע'}
                            </span>
                          </div>
                        )}

                        {isRichCard ? (
                          <div className="text-start space-y-2">
                            {payload.kind === 'shoppingList' && (
                              <Card className="border-l-4 border-l-emerald-500 border-border bg-white shadow-sm overflow-hidden w-64 md:w-72">
                                <CardContent className="p-3 space-y-3">
                                  <div className="flex gap-2.5 items-start">
                                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                      <ShoppingCart className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <h4 className="text-xs font-bold text-foreground truncate">{payload.sharedListName || 'רשימת קניות קבוצתית'}</h4>
                                      <p className="text-[10px] text-muted-foreground mt-0.5">{isRTL ? 'רשימה משותפת לתיאום קניות' : 'Shared shopping list'}</p>
                                    </div>
                                  </div>
                                  <Button 
                                    size="sm" 
                                    className="w-full text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                                    onClick={() => setActiveTab('expenses')}
                                  >
                                    <ShoppingCart className="w-3.5 h-3.5 me-1.5" />
                                    {isRTL ? 'פתח רשימה משותפת' : 'Open List'}
                                  </Button>
                                </CardContent>
                              </Card>
                            )}

                            {payload.kind === 'note' && (
                              <Card className="border-l-4 border-l-amber-500 border-border bg-white shadow-sm overflow-hidden w-64 md:w-72">
                                <CardContent className="p-3 space-y-3">
                                  <div className="flex gap-2.5 items-start">
                                    <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                                      <FileText className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <h4 className="text-xs font-bold text-foreground truncate">{payload.title || 'פתק ללא כותרת'}</h4>
                                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{payload.content}</p>
                                    </div>
                                  </div>
                                  <Button 
                                    size="sm" 
                                    className="w-full text-xs h-8 bg-amber-600 hover:bg-amber-700 text-white"
                                    onClick={() => handleCopyNote(payload)}
                                  >
                                    <Clipboard className="w-3.5 h-3.5 me-1.5" />
                                    {isRTL ? 'העתק לפתקים שלי' : 'Copy to Notes'}
                                  </Button>
                                </CardContent>
                              </Card>
                            )}

                            {payload.kind === 'file' && (
                              <Card className="border-l-4 border-l-blue-500 border-border bg-white shadow-sm overflow-hidden w-64 md:w-72">
                                <CardContent className="p-3 space-y-3">
                                  <div className="flex gap-2.5 items-start">
                                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                      <Paperclip className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <h4 className="text-xs font-bold text-foreground truncate">{payload.fileName || 'קובץ שותף'}</h4>
                                      <p className="text-[10px] text-muted-foreground mt-0.5">{(payload.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                                    </div>
                                  </div>
                                  <Button 
                                    size="sm" 
                                    className="w-full text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white"
                                    onClick={() => window.open(payload.fileUrl, '_blank')}
                                  >
                                    <FileDown className="w-3.5 h-3.5 me-1.5" />
                                    {isRTL ? 'הורד קובץ' : 'Download'}
                                  </Button>
                                </CardContent>
                              </Card>
                            )}

                            {payload.kind === 'course' && (
                              <Card className="border-l-4 border-l-indigo-500 border-border bg-indigo-50/50 shadow-sm overflow-hidden w-64 md:w-72">
                                <CardContent className="p-3 space-y-3">
                                  <div className="flex gap-2.5 items-start">
                                    <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                                      <BookMarked className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <h4 className="text-xs font-bold text-indigo-900 truncate">{payload.courseName || 'קורס אקדמי'}</h4>
                                      <p className="text-[10px] text-indigo-700 mt-0.5">{isRTL ? 'לחץ לייבוא מבנה הקורס אליך' : 'Click to import course layout'}</p>
                                    </div>
                                  </div>
                                  <Button 
                                    size="sm" 
                                    className="w-full text-xs h-8 bg-indigo-600 hover:bg-indigo-700 text-white"
                                    onClick={() => handleImportCourse(payload.shareCode)}
                                  >
                                    <Plus className="w-3.5 h-3.5 me-1.5" />
                                    {isRTL ? 'ייבא קורס' : 'Import Course'}
                                  </Button>
                                </CardContent>
                              </Card>
                            )}

                            {/* WORKOUT SHARED CARD */}
                            {(itemKind === 'workout' || itemKind === 'shared_workout') && (
                              <Card className="border-l-4 border-l-orange-500 border-border bg-white shadow-sm overflow-hidden w-64 md:w-72">
                                <CardContent className="p-3 space-y-2.5">
                                  <div className="flex gap-2.5 items-start">
                                    <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0 border border-orange-100">
                                      <Award className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <h4 className="text-xs font-bold text-[#2A1A0A] truncate">
                                        {update.workout_name || (isRTL ? 'אימון כושר משותף 🏋️‍♂️' : 'Shared Workout 🏋️‍♂️')}
                                      </h4>
                                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                                        {update.message || update.summary}
                                      </p>
                                      
                                      {(update.duration_minutes || update.calories_burned) && (
                                        <div className="flex flex-wrap gap-1.5 mt-1.5 text-[9px] font-bold text-orange-700 bg-orange-50/50 px-2 py-1 rounded-lg border border-orange-100/50 w-fit">
                                          {update.duration_minutes && <span>{update.duration_minutes} {isRTL ? 'דקות' : 'min'}</span>}
                                          {update.duration_minutes && update.calories_burned && <span>•</span>}
                                          {update.calories_burned && <span>{update.calories_burned} {isRTL ? 'קק"ל' : 'kcal'}</span>}
                                          {update.completed_sets && <span>• {update.completed_sets}/{update.total_sets} {isRTL ? 'סטים' : 'sets'}</span>}
                                        </div>
                                      )}
                                      
                                      {update.ai_summary && (
                                        <p className="text-[9px] italic text-[#8A7A6A] mt-1.5 border-t border-dashed pt-1 line-clamp-2">
                                          {update.ai_summary}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                                    <Button 
                                      size="sm" 
                                      className="text-[10px] h-7.5 bg-orange-600 hover:bg-orange-700 text-white font-bold"
                                      onClick={() => setSelectedWorkoutDetail(update)}
                                    >
                                      {isRTL ? 'פרטי האימון' : 'View Workout'}
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      className="text-[10px] h-7.5 border-orange-200 hover:bg-orange-50/50 text-orange-700 font-bold"
                                      onClick={() => {
                                        window.open('calorifitness://open', '_blank');
                                        toast.info(isRTL 
                                          ? 'מנווט לקלורי פיטנס. אם האפליקציה לא מותקנת, תוכל להוריד אותה בחנות.' 
                                          : 'Navigating to Calori Fitness. Please download if not installed.'
                                        );
                                      }}
                                    >
                                      {isRTL ? 'פתח פיטנס' : 'Open Fitness'}
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            )}

                            {/* MEAL / RECIPE SHARED CARD */}
                            {(itemKind === 'meal' || itemKind === 'shared_meal' || itemKind === 'new_recipe') && (
                              <Card className="border-l-4 border-l-emerald-500 border-border bg-white shadow-sm overflow-hidden w-64 md:w-72">
                                <CardContent className="p-3 space-y-2.5">
                                  {update.imageUrl && (
                                    <img 
                                      src={update.imageUrl} 
                                      alt="Recipe" 
                                      className="w-full h-24 object-cover rounded-lg border border-border/40 mb-1"
                                    />
                                  )}
                                  <div className="flex gap-2.5 items-start">
                                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                                      <ShoppingCart className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <h4 className="text-xs font-bold text-[#2A1A0A] truncate">
                                        {update.recipe_title || (isRTL ? 'שיתף/ה ארוחה 🍽️' : 'Shared a Meal 🍽️')}
                                      </h4>
                                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                                        {update.message || update.summary}
                                      </p>

                                      {(update.calories || update.protein || update.carbs || update.fats) && (
                                        <div className="grid grid-cols-4 gap-1 mt-2 text-[9px] font-bold text-center text-emerald-800 bg-[#FAF8F5] p-1.5 rounded-lg border border-emerald-100/50">
                                          <div>
                                            <span className="block text-emerald-950 font-black">{update.calories || 0}</span>
                                            <span>קק"ל</span>
                                          </div>
                                          <div>
                                            <span className="block text-emerald-950 font-black">{update.protein || 0}ג</span>
                                            <span>חלבון</span>
                                          </div>
                                          <div>
                                            <span className="block text-emerald-950 font-black">{update.carbs || 0}ג</span>
                                            <span>פחממה</span>
                                          </div>
                                          <div>
                                            <span className="block text-emerald-950 font-black">{update.fats || 0}ג</span>
                                            <span>שומן</span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                                    <Button 
                                      size="sm" 
                                      className="text-[10px] h-7.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                                      onClick={() => setSelectedMealDetail(update)}
                                    >
                                      {isRTL ? 'ערכים תזונתיים' : 'View Recipe'}
                                    </Button>
                                    <Button 
                                      size="sm" 
                                      variant="outline"
                                      className="text-[10px] h-7.5 border-emerald-200 hover:bg-emerald-50/50 text-emerald-700 font-bold"
                                      onClick={() => {
                                        window.open('calorinutrition://open', '_blank');
                                        toast.info(isRTL 
                                          ? 'מנווט לקלורי נוטרישן. אם האפליקציה לא מותקנת, תוכל להוריד אותה בחנות.' 
                                          : 'Navigating to Calori Nutrition. Please download if not installed.'
                                        );
                                      }}
                                    >
                                      {isRTL ? 'פתח נוטרישן' : 'Open Nutrition'}
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            )}

                            {/* CELEBRATION / MILESTONE CARD */}
                            {['badge_earned', 'weight_milestone', 'champion_crowned'].includes(itemKind) && (
                              <Card className="border-l-4 border-l-yellow-500 border-border bg-yellow-50/20 shadow-sm overflow-hidden w-64 md:w-72">
                                <CardContent className="p-3">
                                  <div className="flex gap-2.5 items-start">
                                    <div className="w-8 h-8 rounded-xl bg-yellow-100 text-yellow-600 flex items-center justify-center shrink-0 border border-yellow-200">
                                      <Sparkles className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <h4 className="text-xs font-bold text-yellow-950 truncate">
                                        {itemKind === 'champion_crowned' && (isRTL ? 'כתר האליפות השבועי! 👑' : 'Weekly Champion! 👑')}
                                        {itemKind === 'badge_earned' && (isRTL ? 'הישג חדש נפתח! 🏆' : 'New Achievement! 🏆')}
                                        {itemKind === 'weight_milestone' && (isRTL ? 'יעד משקל חדש! 🎉' : 'Weight Milestone! 🎉')}
                                      </h4>
                                      <p className="text-[10px] text-yellow-900 mt-1 font-semibold leading-relaxed">
                                        {update.message || update.summary}
                                      </p>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            )}
                          </div>
                        ) : (
                          <div 
                            className={cn(
                              "p-3 rounded-2xl text-sm shadow-sm inline-block max-w-full text-start",
                              isMe ? "bg-primary text-white rounded-te-none" : "bg-white border border-[rgba(180,140,80,.12)] text-[#2A1A0A] rounded-ts-none"
                            )}
                          >
                            <p className="whitespace-pre-line leading-relaxed">{update.message || update.summary}</p>
                          </div>
                        )}

                        <div className={cn("flex gap-1 mt-1", isMe ? "justify-end" : "justify-start")}>
                          {['👍', '🔥', '💪', '🎓'].map((emoji) => {
                            const list = update.reactions?.[emoji] || [];
                            const active = list.includes(uid);
                            return (
                              <button
                                key={emoji}
                                onClick={() => reactToGroupUpdate(selectedGroupId, update.id, emoji)}
                                className={cn(
                                  "px-2 py-0.5 rounded-full text-xs border transition-all active:scale-90",
                                  active 
                                    ? "bg-primary/10 border-primary/20 text-primary font-bold" 
                                    : "bg-white/60 border-border/40 text-muted-foreground hover:bg-white"
                                )}
                              >
                                <span>{emoji}</span>
                                {list.length > 0 && <span className="ms-1 font-bold">{list.length}</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      </div>
                    </React.Fragment>
                  );
                })
              )}
            </div>

            <div className="bg-white border-t border-[rgba(180,140,80,.12)] p-3 shrink-0 flex items-center gap-2.5">
              <div className="relative">
                <button 
                  onClick={() => setShowShareMenu(!showShareMenu)}
                  className="p-2.5 bg-[#FAF8F5] border border-[rgba(180,140,80,.16)] rounded-xl text-[#8A7A6A] hover:bg-white hover:text-primary active:scale-95 transition-all shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>

                {showShareMenu && (
                  <div className={cn(
                    "absolute bottom-12 bg-white rounded-2xl border border-[rgba(180,140,80,.16)] shadow-xl p-2.5 w-48 space-y-1.5 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200",
                    isRTL ? "right-0" : "left-0"
                  )}>
                    <button 
                      onClick={() => { setShowShareMenu(false); setShareType('note'); }}
                      className="w-full text-start px-3 py-2 text-xs font-bold hover:bg-[#FAF8F5] rounded-xl flex items-center gap-2"
                    >
                      <FileText className="w-4 h-4 text-amber-500" />
                      <span>{isRTL ? 'שתף פתק' : 'Share Note'}</span>
                    </button>
                    <button 
                      onClick={() => { setShowShareMenu(false); setShareType('list'); }}
                      className="w-full text-start px-3 py-2 text-xs font-bold hover:bg-[#FAF8F5] rounded-xl flex items-center gap-2"
                    >
                      <ShoppingCart className="w-4 h-4 text-emerald-500" />
                      <span>{isRTL ? 'שתף רשימת קניות' : 'Share Shopping List'}</span>
                    </button>
                    <button 
                      onClick={() => { setShowShareMenu(false); setShareType('course'); }}
                      className="w-full text-start px-3 py-2 text-xs font-bold hover:bg-[#FAF8F5] rounded-xl flex items-center gap-2"
                    >
                      <BookOpen className="w-4 h-4 text-indigo-500" />
                      <span>{isRTL ? 'שתף קורס' : 'Share Course Layout'}</span>
                    </button>
                    <hr className="border-[rgba(180,140,80,.08)]" />
                    <button 
                      onClick={() => { setShowShareMenu(false); fileInputRef.current?.click(); }}
                      className="w-full text-start px-3 py-2 text-xs font-bold hover:bg-[#FAF8F5] rounded-xl flex items-center gap-2"
                      disabled={isUploading}
                    >
                      <Paperclip className="w-4 h-4 text-blue-500" />
                      <span>{isUploading ? 'מעלה...' : (isRTL ? 'שתף קובץ / PDF' : 'Upload File')}</span>
                    </button>
                  </div>
                )}
              </div>

              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
              />

              <Input 
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSendChatMessage(); }}
                placeholder={isRTL ? 'הקלד הודעה לקבוצה...' : 'Type group updates...'}
                className="flex-1 bg-[#FAF8F5]"
              />

              <Button onClick={handleSendChatMessage} className="shrink-0">
                <Send className="w-4 h-4" />
              </Button>
            </div>

            {shareType && (
              <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                <Card className="w-full max-w-md border-[rgba(180,140,80,.16)] shadow-xl bg-white max-h-[80vh] flex flex-col">
                  <CardHeader className="shrink-0 flex flex-row items-center justify-between border-b pb-3">
                    <CardTitle className="text-base font-bold">
                      {shareType === 'note' && (isRTL ? 'בחר פתק לשיתוף' : 'Select Note')}
                      {shareType === 'list' && (isRTL ? 'בחר רשימת קניות לשיתוף' : 'Select Shopping List')}
                      {shareType === 'course' && (isRTL ? 'בחר קורס לשיתוף' : 'Select Course')}
                    </CardTitle>
                    <button onClick={() => setShareType(null)} className="p-1 hover:bg-slate-100 rounded-lg">
                      <X className="w-4 h-4" />
                    </button>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto p-4 space-y-2">
                    {shareType === 'note' && data.quickNotes.length === 0 && (
                      <p className="text-center py-6 text-muted-foreground text-sm">{isRTL ? 'אין פתקים זמינים' : 'No notes available'}</p>
                    )}
                    {shareType === 'note' && data.quickNotes.map((note) => (
                      <button
                        key={note.id}
                        onClick={async () => {
                          await shareNoteToGroup(note.id, selectedGroupId);
                          setShareType(null);
                          toast.success(isRTL ? 'הפתק שותף!' : 'Note shared!');
                        }}
                        className="w-full text-start p-3 border border-border/80 hover:bg-[#FAF8F5] rounded-xl flex items-center justify-between transition-all"
                      >
                        <span className="font-bold text-xs">{note.title || (isRTL ? 'פתק ללא כותרת' : 'Untitled Note')}</span>
                        <FileText className="w-4 h-4 text-amber-500" />
                      </button>
                    ))}

                    {shareType === 'list' && data.shoppingLists.length === 0 && (
                      <p className="text-center py-6 text-muted-foreground text-sm">{isRTL ? 'אין רשימות קניות זמינות' : 'No shopping lists'}</p>
                    )}
                    {shareType === 'list' && data.shoppingLists.map((list) => (
                      <button
                        key={list.id}
                        onClick={async () => {
                          await shareShoppingListToGroup(list.id, selectedGroupId);
                          setShareType(null);
                          toast.success(isRTL ? 'רשימת קניות שותפה בהצלחה!' : 'List shared!');
                        }}
                        className="w-full text-start p-3 border border-border/80 hover:bg-[#FAF8F5] rounded-xl flex items-center justify-between transition-all"
                      >
                        <span className="font-bold text-xs">{list.name}</span>
                        <ShoppingCart className="w-4 h-4 text-emerald-500" />
                      </button>
                    ))}

                    {shareType === 'course' && data.courses.length === 0 && (
                      <p className="text-center py-6 text-muted-foreground text-sm">{isRTL ? 'אין קורסים זמינים' : 'No courses'}</p>
                    )}
                    {shareType === 'course' && data.courses.map((course) => (
                      <button
                        key={course.id}
                        onClick={async () => {
                          const code = await shareCourse(course.id);
                          if (code) {
                            await postGroupMessage(selectedGroupId, {
                              kind: 'chat',
                              app_origin: 'life',
                              author_uid: uid,
                              author_name: data.profile?.displayName || 'סטודנט/ית',
                              summary: `שיתפתי את מבנה הקורס "${course.name}" 🎓`,
                              payload: { kind: 'course', courseId: course.id, courseName: course.name, shareCode: code },
                              type: 'message',
                              user_uid: uid,
                              user_name: data.profile?.displayName || 'סטודנט/ית',
                              message: `שיתפתי את מבנה הקורס "${course.name}" 🎓`
                            });
                          }
                          setShareType(null);
                          toast.success(isRTL ? 'קוד שיתוף נוצר ונשלח!' : 'Course shared!');
                        }}
                        className="w-full text-start p-3 border border-border/80 hover:bg-[#FAF8F5] rounded-xl flex items-center justify-between transition-all"
                      >
                        <span className="font-bold text-xs">{course.name}</span>
                        <BookOpen className="w-4 h-4 text-indigo-500" />
                      </button>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* 2. EXAM BOARD TAB */}
        {activeTab === 'exams' && (
          <div className="min-[900px]:hidden flex-1 overflow-y-auto">
            {(() => {
              const matchResult = verifyAcademicMatch();
              if (!matchResult.success) {
                return (
                  <div className="p-6 max-w-md mx-auto mt-10 text-center space-y-4">
                    <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto border border-amber-200">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground">
                      {isRTL ? 'לוח הבחינות המשותף נעול' : 'Shared Exam Board Locked'}
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {matchResult.reason === 'missing_profile_data' && (
                        isRTL 
                          ? 'על כל חברי הקבוצה להשלים את מילוי מוסד הלימודים והתואר בדף ההגדרות האישיות כדי לסנכרן לוח בחינות.'
                          : 'All members must set their institution and degree in Settings to sync the exam board.'
                      )}
                      {matchResult.reason === 'mismatch_profile' && (
                        isRTL 
                          ? 'נמצאה אי-התאמה במוסד הלימודים או בתואר בין חברי הקבוצה. לוח הבחינות המשותף מופעל רק עבור סטודנטים מאותו מסלול.'
                          : 'Institution or degree mismatch detected. Shared calendar is gated to peers in the same track.'
                      )}
                      {matchResult.reason === 'mismatch_courses' && (
                        isRTL 
                          ? 'חברי הקבוצה אינם רשומים לאותם הקורסים. יש לוודא שלכולכם מוגדרים בדיוק אותם קורסים פעילים.'
                          : 'Course lists do not match. Make sure all active courses in your profiles are identical.'
                      )}
                    </p>
                    <div className="pt-2">
                      <Button variant="outline" size="sm" onClick={() => { setActiveTab('members'); }}>
                        {isRTL ? 'בדוק פרטי חברים' : 'Check Member Profiles'}
                      </Button>
                    </div>
                  </div>
                );
              }

              const allExams = [];
              const matchedCourses = data.courses || [];
              matchedCourses.forEach(c => {
                if (c.exams?.moedA) allExams.push({ course: c.name, type: 'מועד א\'', date: new Date(c.exams.moedA) });
                if (c.exams?.moedB) allExams.push({ course: c.name, type: 'מועד ב\'', date: new Date(c.exams.moedB) });
                if (c.exams?.moedC) allExams.push({ course: c.name, type: 'מועד ג\'', date: new Date(c.exams.moedC) });
              });

              const upcomingExams = allExams
                .filter(e => e.date >= new Date())
                .sort((a, b) => a.date - b.date);

              return (
                <div className="p-4 max-w-md mx-auto space-y-4">
                  <h3 className="text-base font-bold text-foreground pb-2 border-b">
                    {isRTL ? 'ספירה לאחור למבחני הקבוצה 🎓' : 'Shared Exam Countdown Board'}
                  </h3>
                  
                  {upcomingExams.length === 0 ? (
                    <p className="text-center py-10 text-muted-foreground text-sm">
                      {isRTL ? 'אין מבחנים קרובים משובצים במערכת.' : 'No upcoming exams found.'}
                    </p>
                  ) : (
                    upcomingExams.map((exam, idx) => {
                      const diffTime = Math.abs(exam.date - new Date());
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      return (
                        <Card key={idx} className="bg-white border-[rgba(180,140,80,.12)] shadow-sm">
                          <CardContent className="p-3.5 flex justify-between items-center gap-3">
                            <div>
                              <h4 className="font-bold text-sm text-[#2A1A0A]">{exam.course}</h4>
                              <span className="text-[10px] text-muted-foreground font-semibold px-2 py-0.5 bg-slate-100 rounded-full border mt-1 inline-block">
                                {exam.type}
                              </span>
                            </div>
                            <div className="text-end">
                              <span className="text-lg font-black text-primary block leading-none">{diffDays}</span>
                              <span className="text-[9px] text-[#8A7A6A] font-bold">{isRTL ? 'ימים נותרו' : 'days left'}</span>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* 3. EXPENSES SPLITTER TAB */}
        {activeTab === 'expenses' && (
          <div className="min-[900px]:hidden flex-1 overflow-y-auto">
            {(() => {
          const membersList = data.groupMembers[selectedGroupId] || [];
          const expensesList = data.groupExpenses[selectedGroupId] || [];
          
          // Calculations
          const totalGroupSpent = expensesList.filter(e => !e.isSettleUp).reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
          
          // Get user's current net balance
          const balances = {};
          membersList.forEach((m) => { balances[m.uid] = 0; });
          expensesList.forEach((e) => {
            const amount = parseFloat(e.amount) || 0;
            if (amount <= 0) return;
            if (e.isSettleUp) {
              if (balances[e.paidBy] !== undefined) balances[e.paidBy] += amount;
              if (balances[e.receivedBy] !== undefined) balances[e.receivedBy] -= amount;
            } else {
              if (balances[e.paidBy] !== undefined) balances[e.paidBy] += amount;
              const mode = e.splitMode || 'equal';
              const splits = e.splits || {};
              if (mode === 'equal') {
                let participants = membersList.filter(m => splits[m.uid] !== false);
                if (participants.length === 0) participants = membersList;
                const share = amount / participants.length;
                participants.forEach(m => {
                  if (balances[m.uid] !== undefined) balances[m.uid] -= share;
                });
              } else if (mode === 'exact') {
                membersList.forEach(m => {
                  const share = parseFloat(splits[m.uid]) || 0;
                  if (balances[m.uid] !== undefined) balances[m.uid] -= share;
                });
              } else if (mode === 'percentage') {
                membersList.forEach(m => {
                  const pct = parseFloat(splits[m.uid]) || 0;
                  const share = (pct / 100) * amount;
                  if (balances[m.uid] !== undefined) {
                    balances[m.uid] -= share;
                  }
                });
              }
            }
          });
          const myBalance = balances[uid] || 0;
          const debts = calculateSplitDebts();

          // Validation state for current input forms
          const currentTotalInput = parseFloat(expenseAmount) || 0;
          let splitDiff = 0;
          if (expenseSplitMode === 'exact') {
            let sum = 0;
            membersList.forEach(m => { sum += parseFloat(expenseSplits[m.uid] || 0); });
            splitDiff = currentTotalInput - sum;
          } else if (expenseSplitMode === 'percentage') {
            let sum = 0;
            membersList.forEach(m => { sum += parseFloat(expenseSplits[m.uid] || 0); });
            splitDiff = 100 - sum;
          }

          const isSubmitDisabled = 
            (!isSettleUpMode && (!expenseTitle.trim() || currentTotalInput <= 0 || (expenseSplitMode !== 'equal' && Math.abs(splitDiff) > 0.1))) ||
            (isSettleUpMode && (!settleUpAmount || parseFloat(settleUpAmount) <= 0 || !settleUpTo));

          return (
            <div className="p-4 max-w-md mx-auto space-y-4">
              {/* Header Stats */}
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-white border-[rgba(180,140,80,.12)] shadow-sm">
                  <CardContent className="p-3 text-center">
                    <span className="text-[10px] text-[#8A7A6A] font-bold block">{isRTL ? 'סך הכל הוצאות' : 'Group Spent'}</span>
                    <span className="text-base font-black text-[#2A1A0A] mt-0.5 block">{totalGroupSpent.toFixed(0)} ₪</span>
                  </CardContent>
                </Card>
                <Card className={cn(
                  "border shadow-sm",
                  myBalance > 0.5 ? "bg-emerald-50/50 border-emerald-100" : myBalance < -0.5 ? "bg-red-50/40 border-red-100" : "bg-white border-[rgba(180,140,80,.12)]"
                )}>
                  <CardContent className="p-3 text-center">
                    <span className="text-[10px] text-[#8A7A6A] font-bold block">{isRTL ? 'המאזן שלך' : 'Your Balance'}</span>
                    <span className={cn(
                      "text-base font-black mt-0.5 block",
                      myBalance > 0.5 ? "text-emerald-600" : myBalance < -0.5 ? "text-red-500" : "text-[#2A1A0A]"
                    )}>
                      {myBalance > 0.5 ? `+${myBalance.toFixed(0)}` : myBalance.toFixed(0)} ₪
                    </span>
                  </CardContent>
                </Card>
              </div>

              {/* Settlement guide ledger */}
              {debts.length > 0 && (
                <Card className="border-amber-100 bg-amber-50/40 shadow-sm animate-in fade-in duration-300">
                  <CardHeader className="p-3 pb-0">
                    <CardTitle className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" />
                      {isRTL ? 'הנחיות לקיזוז חובות:' : 'Settle Up Instructions:'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-1.5 space-y-1">
                    {debts.map((d, idx) => (
                      <div key={idx} className="text-xs text-amber-900 flex justify-between items-center bg-white/40 p-1.5 rounded-lg">
                        <span>{d.from} 👈 {isRTL ? 'צריך להעביר ל' : 'owes'} {d.to}</span>
                        <span className="font-bold text-amber-950">{d.amount} ₪</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Form Mode Selector Switcher */}
              <div className="flex bg-[#F5F0E8] p-1 rounded-xl gap-1 border border-[rgba(180,140,80,.12)]">
                <button
                  onClick={() => setIsSettleUpMode(false)}
                  className={cn(
                    "flex-1 py-1.5 text-center text-xs font-semibold rounded-lg transition-all cursor-pointer",
                    !isSettleUpMode ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:bg-white/40"
                  )}
                >
                  {isRTL ? 'הוצאה חדשה 💸' : 'Add Expense'}
                </button>
                <button
                  onClick={() => setIsSettleUpMode(true)}
                  className={cn(
                    "flex-1 py-1.5 text-center text-xs font-semibold rounded-lg transition-all cursor-pointer",
                    isSettleUpMode ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:bg-white/40"
                  )}
                >
                  {isRTL ? 'החזר חוב 🤝' : 'Settle Up'}
                </button>
              </div>

              {/* MAIN EXPENSE FORM CARD */}
              <Card className="bg-white border-[rgba(180,140,80,.12)] shadow-sm">
                <CardContent className="p-4 space-y-4">
                  {!isSettleUpMode ? (
                    // 💸 ADD EXPENSE MODE
                    <>
                      {/* Title & Amount */}
                      <div className="flex gap-2">
                        <Input 
                          value={expenseTitle}
                          onChange={(e) => setExpenseTitle(e.target.value)}
                          placeholder={isRTL ? 'תיאור (למשל: קניות לסמסטר)' : 'Title (e.g. groceries)'}
                          className="flex-1"
                        />
                        <Input 
                          type="number"
                          value={expenseAmount}
                          onChange={(e) => setExpenseAmount(e.target.value)}
                          placeholder={isRTL ? 'סכום ₪' : 'Amount'}
                          className="w-24 text-center font-bold"
                        />
                      </div>

                      {/* Category Selector */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground block">{isRTL ? 'קטגוריה:' : 'Category:'}</label>
                        <div className="flex gap-2 overflow-x-auto pb-1 shrink-0 select-none">
                          {Object.keys(EXPENSE_CATEGORIES).map((catId) => {
                            const cat = EXPENSE_CATEGORIES[catId];
                            const CatIcon = cat.icon;
                            const isSelected = expenseCategory === catId;
                            return (
                              <button
                                key={catId}
                                onClick={() => setExpenseCategory(catId)}
                                className={cn(
                                  "px-3 py-1.5 rounded-full border text-xs font-semibold flex items-center gap-1 shrink-0 cursor-pointer active:scale-95 transition-all",
                                  isSelected 
                                    ? "text-white shadow-sm" 
                                    : "bg-white text-muted-foreground hover:bg-[#FAF8F5]"
                                )}
                                style={{
                                  backgroundColor: isSelected ? cat.color : '',
                                  borderColor: isSelected ? cat.color : 'rgba(180,140,80,.12)'
                                }}
                              >
                                <CatIcon className="w-3.5 h-3.5" />
                                <span>{isRTL ? cat.label.split(' ')[0] : catId}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Payer Selector */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground block">{isRTL ? 'מי שילם?' : 'Paid By:'}</label>
                        <select
                          value={expensePayer}
                          onChange={(e) => setExpensePayer(e.target.value)}
                          className="w-full text-xs font-semibold border border-input rounded-xl p-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          {membersList.map(m => (
                            <option key={m.uid} value={m.uid}>{m.uid === uid ? (isRTL ? 'אני (שילמתי)' : 'Me') : m.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Split Mode Selector */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground block">{isRTL ? 'אופן החלוקה:' : 'Split Mode:'}</label>
                        <div className="flex bg-[#F5F0E8] p-0.5 rounded-lg gap-1 border border-border/40">
                          {[
                            { id: 'equal', label: isRTL ? 'שווה' : 'Equally' },
                            { id: 'exact', label: isRTL ? 'סכום' : 'Amounts' },
                            { id: 'percentage', label: isRTL ? 'אחוזים' : 'Percent' }
                          ].map(mode => (
                            <button
                              key={mode.id}
                              type="button"
                              onClick={() => {
                                setExpenseSplitMode(mode.id);
                                // Reset splits depending on mode
                                const resetSplits = {};
                                membersList.forEach(m => {
                                  resetSplits[m.uid] = mode.id === 'equal' ? true : '';
                                });
                                setExpenseSplits(resetSplits);
                              }}
                              className={cn(
                                "flex-1 py-1 text-center text-[10px] font-bold rounded-md transition-all cursor-pointer",
                                expenseSplitMode === mode.id ? "bg-white shadow-sm text-foreground" : "text-muted-foreground hover:bg-white/30"
                              )}
                            >
                              {mode.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Splits Input List */}
                      <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                        {membersList.map(m => {
                          const val = expenseSplits[m.uid];
                          return (
                            <div key={m.uid} className="flex items-center justify-between gap-3 bg-[#FAF8F5] p-2 rounded-xl border border-border/40 text-xs">
                              <span className="font-bold text-muted-foreground">{m.uid === uid ? (isRTL ? 'אני' : 'Me') : m.name}</span>
                              
                              {expenseSplitMode === 'equal' && (
                                <input 
                                  type="checkbox"
                                  checked={val !== false}
                                  onChange={(e) => {
                                    setExpenseSplits({ ...expenseSplits, [m.uid]: e.target.checked });
                                  }}
                                  className="w-4 h-4 text-primary focus:ring-primary border-gray-300 rounded cursor-pointer"
                                />
                              )}

                              {expenseSplitMode === 'exact' && (
                                <div className="flex items-center gap-1 w-20">
                                  <Input 
                                    type="number"
                                    value={val || ''}
                                    onChange={(e) => {
                                      setExpenseSplits({ ...expenseSplits, [m.uid]: e.target.value });
                                    }}
                                    placeholder="0"
                                    className="h-7 text-center font-bold px-1"
                                  />
                                  <span>₪</span>
                                </div>
                              )}

                              {expenseSplitMode === 'percentage' && (
                                <div className="flex items-center gap-1 w-20">
                                  <Input 
                                    type="number"
                                    value={val || ''}
                                    onChange={(e) => {
                                      setExpenseSplits({ ...expenseSplits, [m.uid]: e.target.value });
                                    }}
                                    placeholder="0"
                                    className="h-7 text-center font-bold px-1"
                                  />
                                  <span>%</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Form Validation Feedback */}
                      {expenseSplitMode !== 'equal' && currentTotalInput > 0 && (
                        <div className={cn(
                          "text-[10px] font-bold text-center py-1 rounded-lg border",
                          Math.abs(splitDiff) < 0.1 
                            ? "bg-emerald-50 border-emerald-100 text-emerald-600" 
                            : "bg-red-50 border-red-100 text-red-500 animate-pulse"
                        )}>
                          {expenseSplitMode === 'exact' && (
                            Math.abs(splitDiff) < 0.1 
                              ? (isRTL ? 'הסכומים מתאימים בדיוק!' : 'Sums match perfectly!')
                              : (isRTL 
                                  ? `הסכום הנוכחי הוא ${currentTotalInput} ₪, הפרש חלוקה: ${splitDiff.toFixed(1)} ₪`
                                  : `Total: ${currentTotalInput}, Diff: ${splitDiff.toFixed(1)}`
                                )
                          )}
                          {expenseSplitMode === 'percentage' && (
                            Math.abs(splitDiff) < 0.1 
                              ? (isRTL ? 'האחוזים מסתכמים בדיוק ל-100%!' : 'Percentages match 100%!')
                              : (isRTL 
                                  ? `סך האחוזים הנוכחי: ${(100 - splitDiff).toFixed(0)}%, הפרש: ${splitDiff.toFixed(0)}%`
                                  : `Sum: ${(100 - splitDiff).toFixed(0)}%, Diff: ${splitDiff.toFixed(0)}%`
                                )
                          )}
                        </div>
                      )}

                      <Button 
                        onClick={handleAddExpense} 
                        className="w-full text-xs h-9"
                        disabled={isSubmitDisabled}
                      >
                        {isRTL ? 'רשום הוצאה' : 'Record Expense'}
                      </Button>
                    </>
                  ) : (
                    // 🤝 SETTLE UP / REPAYMENT MODE
                    <>
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground block">{isRTL ? 'מי העביר כסף?' : 'Who Paid?'}</label>
                          <select
                            value={settleUpFrom}
                            onChange={(e) => setSettleUpFrom(e.target.value)}
                            className="w-full text-xs font-semibold border border-input rounded-xl p-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            {membersList.map(m => (
                              <option key={m.uid} value={m.uid}>{m.uid === uid ? (isRTL ? 'אני' : 'Me') : m.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground block">{isRTL ? 'מי קיבל כסף?' : 'Who Received?'}</label>
                          <select
                            value={settleUpTo}
                            onChange={(e) => setSettleUpTo(e.target.value)}
                            className="w-full text-xs font-semibold border border-input rounded-xl p-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="">{isRTL ? 'בחר מקבל...' : 'Select recipient...'}</option>
                            {membersList.map(m => (
                              <option key={m.uid} value={m.uid}>{m.uid === uid ? (isRTL ? 'אני' : 'Me') : m.name}</option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground block">{isRTL ? 'סכום החזר ₪:' : 'Repayment Amount:'}</label>
                          <Input 
                            type="number"
                            value={settleUpAmount}
                            onChange={(e) => setSettleUpAmount(e.target.value)}
                            placeholder="0"
                            className="text-center font-bold text-lg h-10"
                          />
                        </div>
                      </div>

                      <Button 
                        onClick={handleSettleUp} 
                        className="w-full text-xs h-9 bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={isSubmitDisabled}
                      >
                        {isRTL ? 'רשום החזר חוב' : 'Record Repayment'}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* LIST OF EXPENSES */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-muted-foreground">{isRTL ? 'יומן הוצאות:' : 'Expense Log:'}</h4>
                {expensesList.length === 0 ? (
                  <p className="text-center py-6 text-muted-foreground text-xs">{isRTL ? 'אין הוצאות רשומות' : 'No expenses recorded'}</p>
                ) : (
                  [...expensesList].map((exp) => {
                    const isRepayment = !!exp.isSettleUp;
                    const cat = !isRepayment ? (EXPENSE_CATEGORIES[exp.category || 'misc'] || EXPENSE_CATEGORIES.misc) : null;
                    const CatIcon = !isRepayment ? cat.icon : null;

                    return (
                      <div key={exp.id} className="bg-white border border-[rgba(180,140,80,.1)] p-3 rounded-2xl flex justify-between items-center shadow-sm">
                        <div className="flex gap-2.5 items-center min-w-0">
                          {/* Category badge icon */}
                          <div 
                            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border"
                            style={{
                              backgroundColor: isRepayment ? '#ECFDF5' : cat.bg,
                              borderColor: isRepayment ? '#A7F3D0' : 'rgba(180,140,80,.1)',
                              color: isRepayment ? '#059669' : cat.color
                            }}
                          >
                            {isRepayment ? '🤝' : <CatIcon className="w-4 h-4" />}
                          </div>

                          <div className="min-w-0">
                            <h5 className="font-bold text-xs text-[#2A1A0A] truncate">{exp.title}</h5>
                            <span className="text-[9px] text-muted-foreground mt-0.5 inline-block">
                              {isRepayment 
                                ? (isRTL ? `${exp.paidByName} 👈 ${exp.receivedByName}` : `${exp.paidByName} to ${exp.receivedByName}`)
                                : (isRTL 
                                    ? `שולם ע"י: ${exp.paidByName} (${exp.splitMode === 'exact' ? 'חלוקה סכום' : exp.splitMode === 'percentage' ? 'חלוקה אחוז' : 'שווה'})`
                                    : `Paid by: ${exp.paidByName}`
                                  )
                              }
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            "font-black text-sm",
                            isRepayment ? "text-emerald-600" : "text-[#2A1A0A]"
                          )}>
                            {isRepayment ? `+${exp.amount}` : exp.amount} ₪
                          </span>
                          <button 
                            onClick={() => deleteSharedExpense(selectedGroupId, exp.id)}
                            className="text-muted-foreground hover:text-red-500 active:scale-90 transition-all p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })()}
          </div>
        )}

        {/* 4. MEMBERS LIST TAB */}
        {activeTab === 'members' && (
          <div className="p-4 max-w-md mx-auto space-y-4 min-[900px]:hidden">
            <Card className="border-emerald-100 bg-emerald-50/40 shadow-sm">
              <CardContent className="p-3.5 flex items-center justify-between gap-4">
                <div className="flex gap-2.5 items-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <BookOpen className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-emerald-900">{isRTL ? 'מצב למידה (Study Buddy)' : 'Study Buddy Status'}</h4>
                    <p className="text-[9px] text-emerald-700 mt-0.5">{isRTL ? 'הפעל כדי להודיע שאתה לומד כרגע' : 'Toggle to show you are studying'}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <select 
                    value={studyingCourse}
                    onChange={(e) => setStudyingCourse(e.target.value)}
                    className="text-[11px] font-semibold border rounded-lg p-1 bg-white focus:outline-none"
                    disabled={isStudying}
                  >
                    <option value="">{isRTL ? 'בחר קורס...' : 'Select Course...'}</option>
                    {(data.courses || []).map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                  <button 
                    onClick={toggleStudyStatus}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95",
                      isStudying ? "bg-red-500 text-white" : "bg-emerald-600 text-white"
                    )}
                    disabled={!studyingCourse}
                  >
                    {isStudying ? (isRTL ? 'כבה' : 'Stop') : (isRTL ? 'למד!' : 'Study')}
                  </button>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3.5">
              <h3 className="text-xs font-black text-muted-foreground">{isRTL ? 'חברי הקבוצה:' : 'Group Members:'}</h3>
              {members.length === 0 ? (
                <p className="text-center py-6 text-muted-foreground text-xs">{isRTL ? 'טוען חברי קבוצה...' : 'Loading members...'}</p>
              ) : (
                members.map((member) => (
                  <Card key={member.uid} className="bg-white border-[rgba(180,140,80,.12)] shadow-sm">
                    <CardContent className="p-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm shrink-0 overflow-hidden">
                          {member.photoUrl
                            ? <img src={member.photoUrl} alt={member.name} className="w-full h-full object-cover" />
                            : (member.name ? member.name.slice(0, 2) : 'ח׳')}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-xs text-[#2A1A0A]">{member.name}</h4>
                            {member.isCreator && (
                              <span className="text-[8px] font-semibold bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-200">
                                {isRTL ? 'מנהל/ת' : 'Owner'}
                              </span>
                            )}
                          </div>
                          
                          <div className="text-[9px] text-[#8A7A6A] mt-1 space-y-0.5">
                            {member.academicInstitution && (
                              <p>🏛️ {member.academicInstitution}</p>
                            )}
                            {member.degree && (
                              <p>🎓 {member.degree}</p>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-end">
                        <span className="text-[8px] font-bold block text-muted-foreground">
                          {isRTL ? `${member.courses?.length || 0} קורסים` : `${member.courses?.length || 0} courses`}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        )}

        {/* 5. INFO PANEL (Desktop only) */}
        {showInfoPanel && (
          <div className="hidden min-[900px]:flex flex-col w-[360px] xl:w-[400px] h-full bg-white border-s border-[rgba(180,140,80,.12)] overflow-y-auto shrink-0 animate-in slide-in-from-left duration-200">
            {/* Header */}
            <div className="p-4 border-b border-[rgba(180,140,80,.08)] flex items-center justify-between shrink-0 h-[65px] bg-[#FAF8F5]">
              <h3 className="font-bold text-xs text-[#2A1A0A]">{isRTL ? 'פרטי קבוצה' : 'Group Details'}</h3>
              <button 
                onClick={() => setShowInfoPanel(false)}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-muted-foreground hover:text-foreground animate-pulse"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Section 1: Group code & Quick Actions */}
              <div className="space-y-3 bg-[#FAF8F5] p-3.5 rounded-2xl border border-[rgba(180,140,80,.08)]">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-[10px] text-muted-foreground font-bold block">{isRTL ? 'קוד הצטרפות' : 'Join Code'}</span>
                    <code className="text-sm font-black text-primary select-all tracking-wider">{activeGroup.join_code}</code>
                  </div>
                  <button 
                    onClick={copyJoinCode}
                    className="p-2 bg-white border rounded-xl hover:bg-slate-50 text-[#8A7A6A] hover:text-primary active:scale-95 transition-all cursor-pointer"
                    title={isRTL ? 'העתק קוד' : 'Copy Code'}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                <hr className="border-[rgba(180,140,80,.06)]" />
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-[#2A1A0A] block">{isRTL ? 'השתקת עדכונים' : 'Silent Updates'}</span>
                    <span className="text-[10px] text-muted-foreground block">{isRTL ? 'השתקת עדכוני הישגים ואימונים אוטומטיים לכל חברי הקבוצה' : 'Mutes automated milestone/workout updates for everyone'}</span>
                  </div>
                  <button
                    role="switch"
                    aria-checked={!!activeGroup.silentUpdates}
                    aria-label={isRTL ? 'השתקת עדכונים' : 'Silent Updates'}
                    onClick={() => toggleGroupMute(selectedGroupId, !activeGroup.silentUpdates)}
                    className={cn(
                      'w-11 h-6 rounded-full transition-colors flex items-center px-0.5 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 cursor-pointer',
                      activeGroup.silentUpdates ? 'bg-primary' : 'bg-muted-foreground/30',
                    )}
                  >
                    <div
                      className={cn(
                        'w-5 h-5 rounded-full bg-white shadow transition-transform',
                        activeGroup.silentUpdates ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0',
                      )}
                    />
                  </button>
                </div>
                <hr className="border-[rgba(180,140,80,.06)]" />
                <button
                  onClick={() => {
                    if (window.confirm(isRTL ? 'האם אתה בטוח שברצונך לעזוב את הקבוצה?' : 'Are you sure you want to leave the group?')) {
                      leaveGroup(selectedGroupId);
                      setSelectedGroupId('');
                    }
                  }}
                  className="w-full py-2 bg-red-50 hover:bg-red-100/70 text-red-600 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-red-100"
                >
                  <LogOut className="w-4 h-4" />
                  <span>{isRTL ? 'עזוב קבוצה' : 'Leave Group'}</span>
                </button>
              </div>

              {/* Section 2: Exams Board */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 border-b pb-1.5 border-[rgba(180,140,80,.08)]">
                  <Clock className="w-4 h-4 text-[#8A7A6A]" />
                  <h4 className="font-bold text-xs text-[#2A1A0A]">{isRTL ? 'לוח בחינות קרוב' : 'Upcoming Exams'}</h4>
                </div>
                {(() => {
                  const matchResult = verifyAcademicMatch();
                  if (!matchResult.success) {
                    return (
                      <p className="text-[11px] text-muted-foreground bg-amber-50/50 p-2.5 rounded-xl border border-amber-100 leading-relaxed">
                        ⚠️ {matchResult.reason === 'missing_profile_data' && (isRTL ? 'לוח הבחינות נעול: חסר מידע לימודים בפרופילי החברים.' : 'Exam board locked: profile info missing.')}
                        {matchResult.reason === 'mismatch_profile' && (isRTL ? 'לוח הבחינות נעול: אי-התאמה בתואר או מוסד הלימודים.' : 'Exam board locked: institution mismatch.')}
                        {matchResult.reason === 'mismatch_courses' && (isRTL ? 'לוח הבחינות נעול: קורסים שונים בין חברי הקבוצה.' : 'Exam board locked: course mismatch.')}
                      </p>
                    );
                  }
                  const allExams = [];
                  (data.courses || []).forEach(c => {
                    if (c.exams?.moedA) allExams.push({ course: c.name, type: 'מועד א\'', date: new Date(c.exams.moedA) });
                    if (c.exams?.moedB) allExams.push({ course: c.name, type: 'מועד ב\'', date: new Date(c.exams.moedB) });
                  });
                  const upcomingExams = allExams.filter(e => e.date >= new Date()).sort((a, b) => a.date - b.date);
                  if (upcomingExams.length === 0) {
                    return <p className="text-xs text-muted-foreground">{isRTL ? 'אין בחינות קרובות' : 'No upcoming exams'}</p>;
                  }
                  return (
                    <div className="space-y-1.5">
                      {upcomingExams.slice(0, 3).map((exam, idx) => {
                        const diffDays = Math.ceil(Math.abs(exam.date - new Date()) / (1000 * 60 * 60 * 24));
                        return (
                          <div key={idx} className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-[rgba(180,140,80,.08)] text-xs shadow-sm">
                            <div>
                              <span className="font-bold text-[#2A1A0A] block truncate">{exam.course}</span>
                              <span className="text-[9px] text-muted-foreground">{exam.type}</span>
                            </div>
                            <span className="font-black text-primary bg-primary/5 px-2 py-1 rounded-lg shrink-0">{diffDays} {isRTL ? 'ימים' : 'd'}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Section 3: Expenses Splitter */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 border-b pb-1.5 border-[rgba(180,140,80,.08)]">
                  <DollarSign className="w-4 h-4 text-[#8A7A6A]" />
                  <h4 className="font-bold text-xs text-[#2A1A0A]">{isRTL ? 'חלוקת הוצאות קבוצתית' : 'Shared Expenses'}</h4>
                </div>
                {(() => {
                  const membersList = data.groupMembers[selectedGroupId] || [];
                  const expensesList = data.groupExpenses[selectedGroupId] || [];
                  const totalGroupSpent = expensesList.filter(e => !e.isSettleUp).reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
                  const balances = {};
                  membersList.forEach((m) => { balances[m.uid] = 0; });
                  expensesList.forEach((e) => {
                    const amount = parseFloat(e.amount) || 0;
                    if (amount <= 0) return;
                    if (e.isSettleUp) {
                      if (balances[e.paidBy] !== undefined) balances[e.paidBy] += amount;
                      if (balances[e.receivedBy] !== undefined) balances[e.receivedBy] -= amount;
                    } else {
                      if (balances[e.paidBy] !== undefined) balances[e.paidBy] += amount;
                      const mode = e.splitMode || 'equal';
                      const splits = e.splits || {};
                      if (mode === 'equal') {
                        let participants = membersList.filter(m => splits[m.uid] !== false);
                        if (participants.length === 0) participants = membersList;
                        const share = amount / participants.length;
                        participants.forEach(m => {
                          if (balances[m.uid] !== undefined) balances[m.uid] -= share;
                        });
                      } else if (mode === 'exact') {
                        membersList.forEach(m => {
                          const share = parseFloat(splits[m.uid]) || 0;
                          if (balances[m.uid] !== undefined) balances[m.uid] -= share;
                        });
                      } else if (mode === 'percentage') {
                        membersList.forEach(m => {
                          const pct = parseFloat(splits[m.uid]) || 0;
                          const share = (pct / 100) * amount;
                          if (balances[m.uid] !== undefined) balances[m.uid] -= share;
                        });
                      }
                    }
                  });
                  const myBalance = balances[uid] || 0;
                  const debts = calculateSplitDebts();
                  return (
                    <div className="space-y-3 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-[#FAF8F5] p-2.5 rounded-xl border text-center">
                          <span className="text-[9px] text-[#8A7A6A] font-bold block">{isRTL ? 'סך הכל' : 'Total Spent'}</span>
                          <span className="font-extrabold text-[#2A1A0A]">{totalGroupSpent.toFixed(0)} ₪</span>
                        </div>
                        <div className={cn(
                          "p-2.5 rounded-xl border text-center",
                          myBalance > 0.5 ? "bg-emerald-50/50 border-emerald-100 text-emerald-700" : myBalance < -0.5 ? "bg-red-50/40 border-red-100 text-red-600" : "bg-[#FAF8F5]"
                        )}>
                          <span className="text-[9px] text-[#8A7A6A] font-bold block">{isRTL ? 'המאזן שלך' : 'Your Balance'}</span>
                          <span className="font-extrabold">{myBalance > 0.5 ? `+${myBalance.toFixed(0)}` : myBalance.toFixed(0)} ₪</span>
                        </div>
                      </div>
                      {debts.length > 0 && (
                        <div className="bg-amber-50/50 border border-amber-100 p-2.5 rounded-xl space-y-1">
                          <span className="text-[9px] font-bold text-amber-800 block mb-1">👈 {isRTL ? 'קיזוז חובות פעיל:' : 'Active Debts:'}</span>
                          {debts.slice(0, 3).map((d, idx) => (
                            <div key={idx} className="flex justify-between items-center text-[10px] text-amber-900 bg-white/50 px-2 py-1 rounded">
                              <span>{d.from} ➔ {d.to}</span>
                              <span className="font-bold">{d.amount} ₪</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full text-[11px] h-8 font-bold border-[rgba(180,140,80,.12)] text-[#8A7A6A] hover:bg-[#FAF8F5] hover:text-primary"
                        onClick={() => {
                          setActiveTab('expenses');
                        }}
                      >
                        <DollarSign className="w-3.5 h-3.5 me-1.5" />
                        {isRTL ? 'נהל הוצאות והחזרים' : 'Manage Expenses'}
                      </Button>
                    </div>
                  );
                })()}
              </div>

              {/* Section 4: Members List */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 border-b pb-1.5 border-[rgba(180,140,80,.08)]">
                  <Users className="w-4 h-4 text-[#8A7A6A]" />
                  <h4 className="font-bold text-xs text-[#2A1A0A]">{isRTL ? 'חברי הקבוצה' : 'Group Members'} ({members.length})</h4>
                </div>
                <div className="space-y-2">
                  {members.slice(0, 5).map(member => (
                    <div key={member.uid} className="flex items-center justify-between bg-[#FAF8F5] p-2 rounded-xl border border-[rgba(180,140,80,.06)] text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px] shrink-0 border border-primary/5 overflow-hidden">
                          {member.photoUrl
                            ? <img src={member.photoUrl} alt={member.name} className="w-full h-full object-cover" />
                            : (member.name ? member.name.slice(0, 2) : 'ח׳')}
                        </div>
                        <div className="truncate">
                          <span className="font-bold text-[#2A1A0A] block truncate">{member.name}</span>
                          {member.degree && <span className="text-[9px] text-muted-foreground block truncate">{member.degree}</span>}
                        </div>
                      </div>
                      {member.isCreator && (
                        <span className="text-[8px] font-semibold bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full border border-amber-200 shrink-0">
                          {isRTL ? 'מנהל/ת' : 'Owner'}
                        </span>
                      )}
                    </div>
                  ))}
                  {members.length > 5 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="w-full text-[10px] h-7 text-muted-foreground hover:text-primary font-bold"
                      onClick={() => setActiveTab('members')}
                    >
                      {isRTL ? `הצג עוד ${members.length - 5} חברים...` : `Show ${members.length - 5} more members...`}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : (
    /* Desktop Empty State (WhatsApp Web Style) */
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#FAF8F5] text-center border-s border-[rgba(180,140,80,.04)]">
      <div className="w-20 h-20 bg-primary/5 rounded-full flex items-center justify-center mb-5 border border-primary/10">
        <Users className="w-10 h-10 text-primary" />
      </div>
      <h3 style={{ fontFamily: serifFont, fontSize: '26px', color: '#2A1A0A' }} className="font-medium">
        {isRTL ? 'קלורי לייף - קבוצות למידה' : 'Calori Life - Study Groups'}
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm mt-2 leading-relaxed">
        {isRTL 
          ? 'בחר קבוצה מהרשימה בצד כדי לצפות בצ\'אט, לשתף קבצים, לעקוב אחר מועדי הבחינות ולנהל את ההוצאות המשותפות שלכם.'
          : 'Select a group from the list to view chat, share files, track exam dates, and manage shared expenses.'}
      </p>
    </div>
  )}
</div>

      {/* Workout Detail Modal */}
      {selectedWorkoutDetail && (() => {
        const wData = selectedWorkoutDetail.workout_data || {};
        const exercises = wData.exercises || wData.dayPlan?.exercises || [];
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-[rgba(180,140,80,.12)]" dir={isRTL ? 'rtl' : 'ltr'}>
              {/* Header */}
              <div className="p-5 border-b border-[rgba(180,140,80,.08)] flex items-center justify-between bg-orange-50/50">
                <div>
                  <h3 className="text-base font-black text-[#2A1A0A] flex items-center gap-2">
                    <Award className="w-5 h-5 text-orange-600" />
                    {selectedWorkoutDetail.workout_name || wData.title || (isRTL ? 'פרטי אימון' : 'Workout Details')}
                  </h3>
                  <div className="flex gap-2.5 mt-1.5 text-xs text-orange-800 font-bold">
                    {selectedWorkoutDetail.duration_minutes && <span>{selectedWorkoutDetail.duration_minutes} {isRTL ? 'דקות' : 'min'}</span>}
                    {selectedWorkoutDetail.calories_burned && <span>• {selectedWorkoutDetail.calories_burned} {isRTL ? 'קק"ל' : 'kcal'}</span>}
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedWorkoutDetail(null)} 
                  className="w-8 h-8 rounded-full bg-white border flex items-center justify-center text-muted-foreground hover:text-foreground hover:scale-105 active:scale-95 transition-all text-xs font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Exercises List */}
              <div className="p-5 overflow-y-auto space-y-4 flex-1">
                {selectedWorkoutDetail.ai_summary && (
                  <div className="bg-orange-50/30 p-3 rounded-2xl border border-orange-100 text-xs leading-relaxed text-[#5A4A3A]">
                    <span className="font-bold text-orange-900 block mb-1">💡 {isRTL ? 'סיכום אימון AI:' : 'AI Workout Summary:'}</span>
                    {selectedWorkoutDetail.ai_summary}
                  </div>
                )}

                {selectedWorkoutDetail.feeling && (
                  <div className="text-xs text-[#8A7A6A] font-semibold bg-[#FAF8F5] px-3 py-2 rounded-xl border border-[rgba(180,140,80,.06)]">
                    😊 {isRTL ? 'הרגשה:' : 'Feeling:'} <span className="font-bold text-foreground">{selectedWorkoutDetail.feeling}</span>
                  </div>
                )}

                <div className="space-y-2.5">
                  <h4 className="text-xs font-black text-muted-foreground">{isRTL ? 'תרגילים באימון:' : 'Exercises:'}</h4>
                  {exercises.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground text-xs">{isRTL ? 'אין פירוט תרגילים זמין' : 'No exercises details available'}</p>
                  ) : (
                    exercises.map((ex, idx) => (
                      <div key={idx} className="bg-[#FAF8F5] border border-[rgba(180,140,80,.08)] rounded-2xl p-3.5 space-y-2">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-black flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-xs text-[#2A1A0A]">{ex.name || ex.nameEn || ex.title}</span>
                          </div>
                          <span className="text-[10px] bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-bold border border-orange-100">
                            {ex.muscleGroup || ex.category}
                          </span>
                        </div>

                        {/* Sets details list */}
                        {ex.setsDetails && ex.setsDetails.length > 0 ? (
                          <div className="space-y-1 pl-7 rtl:pr-7 rtl:pl-0 pt-1">
                            {ex.setsDetails.map((set, sIdx) => (
                              <div key={sIdx} className="text-[10px] text-[#5A4A3A] flex justify-between border-b border-orange-100/30 pb-0.5 last:border-0">
                                <span>
                                  {isRTL ? `סט ${set.setNumber || sIdx + 1}:` : `Set ${set.setNumber || sIdx + 1}:`}
                                  {set.isWarmupSet && <span className="text-[8px] bg-amber-50 text-amber-700 px-1 rounded-full border border-amber-200/50 ms-1">{isRTL ? 'חימום' : 'Warmup'}</span>}
                                </span>
                                <span className="font-bold">
                                  {set.targetReps && `${set.targetReps} ${isRTL ? 'חזרות' : 'reps'}`}
                                  {set.targetWeightKg && ` @ ${set.targetWeightKg} ${isRTL ? 'ק"ג' : 'kg'}`}
                                  {set.targetDurationSeconds && `${set.targetDurationSeconds} ${isRTL ? 'שניות' : 'sec'}`}
                                  {set.targetDistanceKm && `${set.targetDistanceKm} ${isRTL ? 'ק"מ' : 'km'}`}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[10px] text-muted-foreground pl-7 rtl:pr-7 rtl:pl-0 font-medium">
                            {ex.sets && <span>{ex.sets} {isRTL ? 'סטים' : 'sets'}</span>}
                            {ex.reps && <span> • {ex.reps} {isRTL ? 'חזרות' : 'reps'}</span>}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Actions Footer */}
              <div className="p-4 border-t border-[rgba(180,140,80,.08)] flex gap-2.5 bg-orange-50/10">
                <Button 
                  onClick={() => setSelectedWorkoutDetail(null)} 
                  variant="outline" 
                  className="flex-1 text-xs"
                >
                  {isRTL ? 'סגור' : 'Close'}
                </Button>
                <Button 
                  onClick={() => {
                    window.open('calorifitness://open', '_blank');
                    toast.info(isRTL 
                      ? 'מנווט לקלורי פיטנס. אם האפליקציה לא מותקנת, ניתן להוריד אותה מחנות האפליקציות.' 
                      : 'Opening Calori Fitness. If not installed, please download it from the app store.'
                    );
                  }}
                  className="flex-1 text-xs bg-orange-600 hover:bg-orange-700 text-white font-bold"
                >
                  {isRTL ? 'התחל אימון בפיטנס' : 'Start Workout'}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Meal Detail Modal */}
      {selectedMealDetail && (() => {
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-[rgba(180,140,80,.12)]" dir={isRTL ? 'rtl' : 'ltr'}>
              {/* Image if available */}
              {selectedMealDetail.imageUrl && (
                <div className="relative h-44 shrink-0 bg-emerald-50">
                  <img 
                    src={selectedMealDetail.imageUrl} 
                    alt="Recipe Detail" 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent flex items-end p-5">
                    <h3 className="text-white text-base font-black truncate leading-tight drop-shadow-md">
                      {selectedMealDetail.recipe_title || (isRTL ? 'פרטי ארוחה תזונתית' : 'Meal Details')}
                    </h3>
                  </div>
                  <button 
                    onClick={() => setSelectedMealDetail(null)} 
                    className="absolute top-4 right-4 rtl:left-4 rtl:right-auto w-8 h-8 rounded-full bg-white/80 backdrop-blur-sm border flex items-center justify-center text-muted-foreground hover:text-foreground hover:scale-105 active:scale-95 transition-all shadow-md text-xs font-bold"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Header without Image */}
              {!selectedMealDetail.imageUrl && (
                <div className="p-5 border-b border-[rgba(180,140,80,.08)] flex items-center justify-between bg-emerald-50/50">
                  <h3 className="text-base font-black text-[#2A1A0A] flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-emerald-600" />
                    {selectedMealDetail.recipe_title || (isRTL ? 'פרטי ארוחה תזונתית' : 'Meal Details')}
                  </h3>
                  <button 
                    onClick={() => setSelectedMealDetail(null)} 
                    className="w-8 h-8 rounded-full bg-white border flex items-center justify-center text-muted-foreground hover:text-foreground hover:scale-105 active:scale-95 transition-all text-xs font-bold"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Nutritional Values */}
              <div className="p-5 overflow-y-auto space-y-4 flex-1">
                <div className="bg-[#FAF8F5] border border-[rgba(180,140,80,.08)] rounded-2xl p-4">
                  <h4 className="text-xs font-black text-muted-foreground mb-3">{isRTL ? 'ערכים תזונתיים לארוחה:' : 'Nutritional Targets:'}</h4>
                  
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="bg-emerald-50/50 border border-emerald-100 p-2.5 rounded-2xl">
                      <span className="block text-emerald-950 font-black text-sm">{selectedMealDetail.calories || 0}</span>
                      <span className="text-[9px] text-emerald-800 font-bold block mt-0.5">{isRTL ? 'קלוריות' : 'Calories'}</span>
                    </div>
                    <div className="bg-orange-50/50 border border-orange-100 p-2.5 rounded-2xl">
                      <span className="block text-orange-950 font-black text-sm">{selectedMealDetail.protein || 0}ג</span>
                      <span className="text-[9px] text-orange-800 font-bold block mt-0.5">{isRTL ? 'חלבון' : 'Protein'}</span>
                    </div>
                    <div className="bg-indigo-50/50 border border-indigo-100 p-2.5 rounded-2xl">
                      <span className="block text-indigo-950 font-black text-sm">{selectedMealDetail.carbs || 0}ג</span>
                      <span className="text-[9px] text-indigo-800 font-bold block mt-0.5">{isRTL ? 'פחמימות' : 'Carbs'}</span>
                    </div>
                    <div className="bg-amber-50/50 border border-amber-100 p-2.5 rounded-2xl">
                      <span className="block text-amber-950 font-black text-sm">{selectedMealDetail.fats || 0}ג</span>
                      <span className="text-[9px] text-amber-800 font-bold block mt-0.5">{isRTL ? 'שומנים' : 'Fats'}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-[rgba(180,140,80,.08)] p-3.5 rounded-2xl text-xs leading-relaxed text-[#5A4A3A]">
                  <span className="font-black text-emerald-950 block mb-1">📝 {isRTL ? 'תיאור הארוחה/מתכון:' : 'Meal/Recipe Description:'}</span>
                  <p className="whitespace-pre-line">{selectedMealDetail.message || selectedMealDetail.summary || (isRTL ? 'ארוחה ששותפה עם חברי הקבוצה.' : 'Shared meal.')}</p>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="p-4 border-t border-[rgba(180,140,80,.08)] flex gap-2.5 bg-emerald-50/10">
                <Button 
                  onClick={() => setSelectedMealDetail(null)} 
                  variant="outline" 
                  className="flex-1 text-xs"
                >
                  {isRTL ? 'סגור' : 'Close'}
                </Button>
                <Button 
                  onClick={() => {
                    window.open('calorinutrition://open', '_blank');
                    toast.info(isRTL 
                      ? 'מנווט לקלורי נוטרישן. אם האפליקציה לא מותקנת, ניתן להוריד אותה מחנות האפליקציות.' 
                      : 'Opening Calori Nutrition. If not installed, please download it from the app store.'
                    );
                  }}
                  className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  {isRTL ? 'פתח בנוטרישן' : 'Open Nutrition'}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};
