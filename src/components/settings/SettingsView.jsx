import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { useStore } from '../../store/useStore';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { Settings, RefreshCcw, LogOut, BookOpen, Plus, Edit2, Trash2, Globe, Archive, ArchiveRestore, User, Clock, Palette, Bot, ExternalLink, Lock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { useTranslation } from '../../hooks/useTranslation';
import { toast } from '../../store/useToast';
import { cn } from '../../lib/utils';
import { NotificationSettings } from './NotificationSettings';
import { CITIES_LIST } from '../../lib/shabbatService';
import { Bell, Shield, Database, Info, ChevronLeft, ChevronRight, Tags } from 'lucide-react';

/* ── cream v3 shared inline styles ── */
const creamCard = {
  background: '#fff',
  borderRadius: '22px',
  border: '1px solid rgba(180,140,80,.14)',
  boxShadow: '0 4px 24px rgba(40,20,0,.07)',
  overflow: 'hidden',
  position: 'relative',
};
const creamGroupCard = {
  background: '#fff',
  borderRadius: '16px',
  border: '1px solid rgba(180,140,80,.12)',
  boxShadow: '0 1px 6px rgba(40,20,0,.04)',
  overflow: 'hidden',
};
const creamRow = (isFirst) => ({
  padding: '13px 16px',
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  borderTop: isFirst ? 'none' : '1px solid rgba(180,140,80,.08)',
  cursor: 'pointer',
});
const creamIcon = (bg, color) => ({
  width: 32, height: 32, borderRadius: 10,
  background: bg, color,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
});
const creamGroupLabel = {
  fontSize: '10px', fontWeight: 700, color: '#8A7A6A',
  letterSpacing: '.16em', textTransform: 'uppercase',
  padding: '0 4px 6px',
};
const creamGroupLabelEm = {
  fontFamily: "'Instrument Serif', serif", fontStyle: 'italic',
  fontSize: '13px', color: '#2A1A0A', textTransform: 'none', letterSpacing: 0,
};
const creamHeading = {
  fontFamily: "'Instrument Serif', serif", fontWeight: 400, color: '#2A1A0A',
};
const creamMuted = { fontSize: '11px', color: '#8A7A6A', marginTop: 2 };
const creamTitle = { fontSize: '14px', fontWeight: 600, color: '#2A1A0A' };
const creamChevron = { color: '#C7BCAA', fontSize: '18px', flexShrink: 0 };
const creamGradientBar = {
  position: 'absolute', top: 0, left: 0, right: 0, height: 3,
  background: 'linear-gradient(90deg,#065F46,#059669,#047857)',
};
const creamVal = {
  fontFamily: "'Instrument Serif', serif", fontStyle: 'italic',
  fontSize: '13px', color: '#059669', flexShrink: 0,
};

const BackButton = ({ onClick, language }) => (
  <button
    onClick={onClick}
    style={{
      width: 36, height: 36, borderRadius: '50%', background: '#F5F0E8',
      color: '#2A1A0A', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 18, border: 'none', cursor: 'pointer', marginBottom: 8, flexShrink: 0,
    }}
    aria-label={language === 'he' ? 'חזור' : 'Back'}
  >
    {language === 'he' ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
  </button>
);

export const SettingsView = () => {
  const { data, resetSemester, addCourse, updateCourse, archiveCourse, deleteCourseFully, language, setLanguage, theme, setTheme, setProfile, pomoSettings, setPomoSettings, setCategory, deleteCategory } = useStore();
  const { t } = useTranslation();
  // Local section navigation (the app navigates via Zustand activeCategory, NOT
  // react-router — so settings sub-screens are plain local state). null = index.
  const [section, setSection] = useState(null);
  // Google Calendar integration status (lifted out of the render fn so the hook
  // isn't called conditionally).
  const [integrationStatus, setIntegrationStatus] = useState(() =>
    new URLSearchParams(window.location.search).get('success') === 'true'
      ? 'Calendar Connected'
      : 'Calendar Disconnected'
  );
  const [editingCourse, setEditingCourse] = useState(null); // The course object being edited/added
  const [isAddMode, setIsAddMode] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [generateLecture, setGenerateLecture] = useState(true);
  const [generateTutorial, setGenerateTutorial] = useState(true);
  const [generateHomework, setGenerateHomework] = useState(true);

  const [editingCategory, setEditingCategory] = useState(null);
  const [isCategoryAddMode, setIsCategoryAddMode] = useState(false);

  // Profile local state
  const [displayName, setDisplayName] = useState(data?.profile?.displayName || "");
  const [academicYear, setAcademicYear] = useState(data?.profile?.academicYear || "שנה א'");
  const [semester, setSemester] = useState(data?.profile?.semester || "סמסטר א'");

  // AI & CommandCenter settings state
  const [wakeTime, setWakeTime] = useState(data?.profile?.wakeTime || "07:00");
  const [sleepTime, setSleepTime] = useState(data?.profile?.sleepTime || "23:00");
  const [studyBlockDuration, setStudyBlockDuration] = useState(data?.profile?.studyBlockDuration || 90);
  const [shabbatMode, setShabbatMode] = useState(data?.profile?.shabbatMode ?? false);
  const [useGPS, setUseGPS] = useState(data?.profile?.useGPS ?? true);
  const [selectedCity, setSelectedCity] = useState(data?.profile?.selectedCity || "tel_aviv");
  const [studyPreferences, setStudyPreferences] = useState(
    data?.profile?.studyPreferences || { morning: true, afternoon: true, evening: false }
  );

  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState(() => localStorage.getItem('google_maps_api_key') || '');

  // Pomodoro local state
  const [pomoWork, setPomoWork] = useState(pomoSettings?.work || 25);
  const [pomoBreak, setPomoBreak] = useState(pomoSettings?.break || 5);

  const handleSaveAISettings = () => {
    // Preferences are saved in the user profile doc
    setProfile({
      wakeTime,
      sleepTime,
      studyBlockDuration,
      shabbatMode,
      useGPS,
      selectedCity,
      studyPreferences,
    });

    // Save keys to localStorage
    localStorage.setItem('gemini_api_key', geminiApiKey.trim());
    localStorage.setItem('google_maps_api_key', googleMapsApiKey.trim());

    toast.success(t('aiSettingsSaved', 'הגדרות ה-Command Center נשמרו בהצלחה'));
  };

  // Convert a possibly-ISO date string to YYYY-MM-DD for <input type="date">.
  const toDateInput = (val) => {
    if (!val) return '';
    try {
      const d = new Date(val);
      if (Number.isNaN(d.getTime())) return '';
      return d.toISOString().split('T')[0];
    } catch { return ''; }
  };

  const handleExportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calori-life-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleReset = () => {
    if (window.confirm(t('confirmResetSemester'))) {
      resetSemester();
      toast.success(t('resetSemesterSuccess'));
    }
  };

  const handleSaveProfile = () => {
    setProfile({ displayName, academicYear, semester });
    toast.success(t('profileSaved', 'פרופיל עודכן בהצלחה'));
  };

  const handleSavePomodoro = () => {
    setPomoSettings({ work: parseInt(pomoWork) || 25, break: parseInt(pomoBreak) || 5 });
    toast.success(t('pomodoroSaved', 'הגדרות פומודורו עודכנו'));
  };

  const openEditModal = (course) => {
    setIsAddMode(false);
    setEditingCourse({
      ...course,
      moedA: toDateInput(course.moedA || course.exams?.moedA),
      moedB: toDateInput(course.moedB || course.exams?.moedB),
      moedC: toDateInput(course.moedC || course.exams?.moedC),
      notebookLm: course.links?.notebookLm || course.defaultNotebookLmLink || "",
      gemini: course.links?.gemini || course.defaultGeminiLink || ""
    });
  };

  const openAddModal = () => {
    setIsAddMode(true);
    setGenerateLecture(true);
    setGenerateTutorial(true);
    setGenerateHomework(true);
    setEditingCourse({
      name: '',
      weeksCount: 13,
      moedA: '',
      moedB: '',
      moedC: '',
      notebookLm: '',
      gemini: ''
    });
  };

  const saveCourse = async () => {
    if (!editingCourse.name || !editingCourse.name.trim()) {
      toast.error(t('courseNameRequired', 'שם הקורס הוא שדה חובה'));
      return;
    }

    try {
      if (isAddMode) {
        const seeds = [];
        if (generateLecture) seeds.push({ type: 'lecture', label: language === 'he' ? 'הרצאה' : 'Lecture' });
        if (generateTutorial) seeds.push({ type: 'tutorial', label: language === 'he' ? 'תרגול' : 'Tutorial' });
        if (generateHomework) seeds.push({ type: 'homework', label: language === 'he' ? 'שיעורי בית' : 'Homework' });

        await addCourse({
          name: editingCourse.name,
          weeksCount: parseInt(editingCourse.weeksCount) || 13,
          moedA: editingCourse.moedA || null,
          moedB: editingCourse.moedB || null,
          moedC: editingCourse.moedC || null,
          defaultNotebookLmLink: editingCourse.notebookLm || '',
          defaultGeminiLink: editingCourse.gemini || '',
        }, seeds);
        toast.success(t('courseAdded', 'הקורס נוסף בהצלחה'));
      } else {
        await updateCourse(editingCourse.id, {
          name: editingCourse.name,
          weeksCount: parseInt(editingCourse.weeksCount) || 13,
          exams: {
            moedA: editingCourse.moedA || null,
            moedB: editingCourse.moedB || null,
            moedC: editingCourse.moedC || null,
          },
          links: {
            notebookLm: editingCourse.notebookLm || '',
            gemini: editingCourse.gemini || '',
          }
        });
        toast.success(t('courseUpdated', 'הקורס עודכן בהצלחה'));
      }
      setEditingCourse(null);
    } catch (e) {
      console.error(e);
      toast.error(t('courseSaveFailed', 'שמירת הקורס נכשלה'));
    }
  };

  const handleDeleteCourse = async (courseId) => {
    if (window.confirm(t('confirmDeleteCourse', 'האם אתה בטוח שברצונך למחוק קורס זה לצמיתות? פעולה זו תמחק את כל המטלות, הקבצים וההיסטוריה שלו.'))) {
      try {
        await deleteCourseFully(courseId);
        toast.success(t('courseDeleted', 'הקורס נמחק בהצלחה'));
      } catch (e) {
        console.error(e);
        toast.error(t('courseDeleteFailed', 'מחיקת הקורס נכשלה'));
      }
    }
  };

  const handleArchiveToggle = (courseId, currentStatus) => {
    const msg = currentStatus 
      ? t('confirmRestoreCourse', 'האם לשחזר קורס זה מהארכיון?')
      : t('confirmArchiveCourse', 'האם להעביר קורס זה לארכיון? הקורס יוסתר מהתפריט.');
    
    if (window.confirm(msg)) {
      archiveCourse(courseId, !currentStatus);
      toast.success(currentStatus ? t('courseRestored', 'הקורס שוחזר') : t('courseArchived', 'הקורס הועבר לארכיון'));
    }
  };

  const activeCourses = data?.courses?.filter(c => !c.isArchived) || [];
  const archivedCourses = data?.courses?.filter(c => c.isArchived) || [];
  const categories = data?.categories || [];

  const openEditCategoryModal = (cat) => {
    setIsCategoryAddMode(false);
    setEditingCategory(cat);
  };

  const openAddCategoryModal = () => {
    setIsCategoryAddMode(true);
    setEditingCategory({
      id: `cat-${Date.now()}`,
      name: "",
      color: "#059669",
    });
  };

  const saveCategory = () => {
    if (!editingCategory.name) return toast.error(t('titleRequired', 'שם חובה'));
    
    setCategory(editingCategory.id, {
      id: editingCategory.id,
      name: editingCategory.name,
      color: editingCategory.color
    });
    setEditingCategory(null);
  };

  const handleDeleteCategory = (catId) => {
    if (window.confirm(t('confirmDelete', 'האם אתה בטוח?'))) {
      deleteCategory(catId);
    }
  };

  const renderSettingsIndex = () => {
    const iconColors = {
      g: { bg: '#F0FDF4', color: '#065F46' },
      b: { bg: '#EFF6FF', color: '#1E40AF' },
      r: { bg: '#FEF2F2', color: '#991B1B' },
      p: { bg: '#F5F3FF', color: '#6D28D9' },
      a: { bg: '#FFFBEB', color: '#B45309' },
      gr: { bg: '#F5F0E8', color: '#6A5A4A' },
    };

    const groups = [
      {
        title: t('account', 'חשבון'),
        items: [
          { id: 'profile', iconEl: <User className="w-4 h-4" />, ic: 'g', title: t('profileTitle', 'פרופיל'), sub: 'שם, תמונה, אימייל' },
          { id: 'notifications', iconEl: <Bell className="w-4 h-4" />, ic: 'b', title: t('notificationsTitle', 'התראות'), sub: 'יומי, פר-קטגוריה, שקט בלילה', val: t('active', 'פעיל') },
        ]
      },
      {
        title: t('content', 'תכנים'),
        items: [
          { id: 'studies', iconEl: <BookOpen className="w-4 h-4" />, ic: 'r', title: t('courseManagerTitle', 'לימודים'), sub: 'סמסטר, יעדים, AI Links', val: `${activeCourses.length} ${t('courses', 'קורסים')}` },
          { id: 'manager', iconEl: <Bot className="w-4 h-4" />, ic: 'p', title: t('aiSettingsTitle', 'המנהל האישי'), sub: 'שעות, מיקום, שבת, מפתחות AI' },
          { id: 'calori', iconEl: <Shield className="w-4 h-4" />, ic: 'g', title: t('caloriTitle', 'קלורי'), sub: 'סנכרון תזונה ואימונים', val: t('linked', 'מקושר') },
          { id: 'categories', iconEl: <Tags className="w-4 h-4" />, ic: 'p', title: 'קטגוריות תיוג', sub: 'ניהול תגיות וקטגוריות' },
        ]
      },
      {
        title: t('preferences', 'העדפות'),
        items: [
          { id: 'general', iconEl: <Palette className="w-4 h-4" />, ic: 'a', title: t('preferencesTitle', 'כללי'), sub: 'שפה, ערכת נושא, פומודורו' },
          { id: 'integrations', iconEl: <Globe className="w-4 h-4" />, ic: 'b', title: 'אינטגרציות', sub: 'חיבור לשירותים חיצוניים' },
        ]
      },
      {
        title: t('data', 'נתונים'),
        items: [
          { id: 'data', iconEl: <Database className="w-4 h-4" />, ic: 'gr', title: t('exportData', 'ייצוא וגיבוי'), sub: 'קובץ JSON, איפוס סמסטר' },
          { id: 'about', iconEl: <Info className="w-4 h-4" />, ic: 'gr', title: t('aboutTitle', 'אודות'), sub: 'גרסה, רישיון, פרטיות', val: 'v6.16.0' },
        ]
      }
    ];

    return (
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px 96px', display: 'flex', flexDirection: 'column', gap: 14 }} dir={language === 'he' ? 'rtl' : 'ltr'}>
        {/* Profile hero card */}
        <div
          onClick={() => setSection('profile')}
          style={{ ...creamCard, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }}
        >
          <div style={creamGradientBar} />
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'linear-gradient(135deg,#065F46,#059669)',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 28,
            flexShrink: 0, boxShadow: '0 4px 14px rgba(6,95,70,.25)', overflow: 'hidden',
          }}>
            {data?.profile?.photoURL ? (
              <img src={data.profile.photoURL} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (data?.profile?.displayName?.charAt(0) || 'א')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...creamHeading, fontSize: 20, letterSpacing: '-.02em', lineHeight: 1.1 }}>
              <em style={{ fontStyle: 'italic', color: '#059669' }}>{data?.profile?.displayName?.split(' ')[0] || ''}</em>{' '}
              {data?.profile?.displayName?.split(' ').slice(1).join(' ') || ''}
            </div>
            <div style={{ fontSize: 12, color: '#8A7A6A', marginTop: 3 }}>{auth?.currentUser?.email}</div>
          </div>
          <div style={{
            background: '#F0FDF4', border: '1px solid rgba(5,150,105,.2)',
            color: '#065F46', fontSize: 11, fontWeight: 700,
            padding: '6px 11px', borderRadius: 999, flexShrink: 0,
          }}>
            {t('edit', 'ערוך')}
          </div>
        </div>

        {/* Setting groups */}
        {groups.map((group, i) => (
          <div key={i}>
            <div style={creamGroupLabel}>
              <em style={creamGroupLabelEm}>{group.title}</em>
            </div>
            <div style={creamGroupCard}>
              {group.items.map((item, j) => {
                const ic = iconColors[item.ic] || iconColors.gr;
                return (
                  <div
                    key={j}
                    onClick={() => setSection(item.id)}
                    style={creamRow(j === 0)}
                  >
                    <div style={creamIcon(ic.bg, ic.color)}>{item.iconEl}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={creamTitle}>{item.title}</div>
                      <div style={creamMuted}>{item.sub}</div>
                    </div>
                    {item.val && <span style={creamVal}>{item.val}</span>}
                    <span style={creamChevron}>
                      {language === 'he' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Logout button */}
        <button
          onClick={handleLogout}
          style={{
            padding: '14px 16px', textAlign: 'center',
            fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 15,
            color: '#DC2626', background: '#fff', borderRadius: 16,
            border: '1px solid rgba(220,38,38,.15)', boxShadow: '0 1px 4px rgba(40,20,0,.04)',
            cursor: 'pointer',
          }}
        >
          <em>{t('logoutBtn', 'התנתק')}</em>
        </button>

        {/* Version */}
        <div style={{
          textAlign: 'center', fontFamily: "'Instrument Serif', serif",
          fontStyle: 'italic', fontSize: 13, color: 'rgba(138,122,106,.5)', padding: '14px 0 4px',
        }}>
          Calori Life &middot; <em style={{ color: '#059669' }}>v6.16.0</em>
        </div>
      </div>
    );
  };

  const renderProfile = () => (
        <>
      {/* 1. Profile Card */}
      <Card className="shadow-sm border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            {t('profileTitle', 'פרופיל אישי')}
          </CardTitle>
          <CardDescription>{t('profileDesc', 'הגדר את השם שלך שיוצג באפליקציה')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="space-y-2 flex-1 w-full">
                <label className="text-sm font-medium text-foreground">{t('displayName', 'שם תצוגה')}</label>
                <Input 
                  value={displayName} 
                  onChange={(e) => setDisplayName(e.target.value)} 
                  placeholder={t('displayNamePlaceholder', 'לדוגמה: אוריה')}
                />
              </div>
              <div className="space-y-2 flex-1 w-full">
                <label className="text-sm font-medium text-foreground">{t('academicYear', 'שנת לימודים')}</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={academicYear} 
                  onChange={(e) => setAcademicYear(e.target.value)}
                >
                  {(language === 'en' ? ['Year 1','Year 2','Year 3','Year 4'] : ['שנה א\'', 'שנה ב\'', 'שנה ג\'', 'שנה ד\'']).map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2 flex-1 w-full">
                <label className="text-sm font-medium text-foreground">{t('semester', 'סמסטר')}</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={semester} 
                  onChange={(e) => setSemester(e.target.value)}
                >
                  {(language === 'en' ? ['Semester A','Semester B','Summer'] : ['סמסטר א\'', 'סמסטר ב\'', 'סמסטר קיץ']).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSaveProfile} className="w-full sm:w-auto">{t('saveChanges')}</Button>
            </div>
          </div>
        </CardContent>
      </Card>
        </>
  );

  const renderStudies = () => (
        <>
      {/* 2. Course Manager Card */}
      <Card className="shadow-sm border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              {t('courseManagerTitle')}
            </CardTitle>
            <CardDescription>{t('courseManagerDesc')}</CardDescription>
          </div>
          <Button onClick={openAddModal} className="flex items-center gap-1 bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-4 h-4" />
            {t('newCourse')}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeCourses.map(course => (
              <div key={course.id} className="border border-border p-4 rounded-xl flex flex-col justify-between bg-card gap-4">
                <div>
                  <h3 className="font-bold text-foreground">{course.name}</h3>
                  <p className="text-sm text-muted-foreground">{t('moedA')}: {(course.moedA || course.exams?.moedA) ? new Date(course.moedA || course.exams.moedA).toLocaleDateString('he-IL') : t('notSet')}</p>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteCourse(course.id)} className="text-muted-foreground hover:text-red-500">
                    <Trash2 className="w-4 h-4 ml-1" />
                    {t('delete', 'מחק')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleArchiveToggle(course.id, course.isArchived)} className="text-muted-foreground hover:text-amber-500">
                    <Archive className="w-4 h-4 ml-1" />
                    {t('archive', 'ארכיון')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEditModal(course)} className="text-muted-foreground hover:text-primary">
                    <Edit2 className="w-4 h-4 ml-1" />
                    {t('edit')}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {archivedCourses.length > 0 && (
            <div className="mt-8 pt-6 border-t">
              <Button 
                variant="ghost" 
                onClick={() => setShowArchived(!showArchived)}
                className="w-full flex items-center justify-between text-muted-foreground"
              >
                <span>{t('archivedCourses', 'קורסים בארכיון')} ({archivedCourses.length})</span>
                <ArchiveRestore className="w-4 h-4" />
              </Button>
              
              {showArchived && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 opacity-70">
                  {archivedCourses.map(course => (
                    <div key={course.id} className="border border-border p-4 rounded-xl flex flex-col justify-between bg-secondary/50 gap-4">
                      <div>
                        <h3 className="font-bold text-foreground">{course.name}</h3>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => handleDeleteCourse(course.id)} className="text-muted-foreground hover:text-red-500">
                          <Trash2 className="w-4 h-4 ml-1" />
                          {t('delete', 'מחק')}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleArchiveToggle(course.id, course.isArchived)} className="text-primary hover:text-primary">
                          <ArchiveRestore className="w-4 h-4 ml-1" />
                          {t('restore', 'שחזר')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
        </>
  );

  const renderCategories = () => (
        <>
      {/* Category Manager Card */}
      <Card className="shadow-sm border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Tags className="w-5 h-5 text-primary" />
              קטגוריות תיוג
            </CardTitle>
            <CardDescription>ניהול תגיות שיוצמדו למשימות ולפתקים</CardDescription>
          </div>
          <Button onClick={openAddCategoryModal} className="flex items-center gap-1 bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-4 h-4" />
            קטגוריה חדשה
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categories.map(cat => (
              <div key={cat.id} className="border border-border p-4 rounded-xl flex items-center justify-between bg-card gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color || '#ccc' }} />
                  <h3 className="font-bold text-foreground">{cat.name}</h3>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteCategory(cat.id)} className="text-muted-foreground hover:text-red-500 p-2">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openEditCategoryModal(cat)} className="text-muted-foreground hover:text-primary">
                    <Edit2 className="w-4 h-4 ml-1" />
                    {t('edit')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
        </>
  );

  const renderNotifications = () => (
        <>
      {/* 3. Notifications Card (Phase 5) */}
      <NotificationSettings />
        </>
  );

  const renderManager = () => (
        <>
      {/* AI & Command Center Settings Card */}
      <Card className="shadow-sm border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            {t('aiSettingsTitle', 'הגדרות ה-Command Center ו-AI')}
          </CardTitle>
          <CardDescription>
            {t('aiSettingsDesc', 'הגדר את שעות הפעילות והעדפות המיקום שלך לשילוב ה-AI')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Preferences */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-foreground border-b pb-1">אילוצי זמן ותכנון</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">שעת יקיצה</label>
                <Input
                  type="time"
                  value={wakeTime}
                  onChange={(e) => setWakeTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">שעת שינה</label>
                <Input
                  type="time"
                  value={sleepTime}
                  onChange={(e) => setSleepTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">בלוק למידה מועדף (דקות)</label>
                <Input
                  type="number"
                  min="30"
                  max="240"
                  value={studyBlockDuration}
                  onChange={(e) => setStudyBlockDuration(parseInt(e.target.value) || 90)}
                />
              </div>
            </div>
            
            {/* Preferred study periods */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground block">שעות פרודוקטיביות מועדפות ללמידה</label>
              <div className="flex gap-4">
                {['morning', 'afternoon', 'evening'].map((period) => {
                  const labels = { morning: 'בוקר', afternoon: 'צהריים', evening: 'ערב' };
                  return (
                    <label key={period} className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={studyPreferences[period]}
                        onChange={(e) => setStudyPreferences({
                          ...studyPreferences,
                          [period]: e.target.checked
                        })}
                        className="rounded border-input text-primary focus:ring-primary w-4 h-4"
                      />
                      {labels[period]}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Location & Shabbat */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-foreground border-b pb-1">שבת ומיקום</h3>
            
            <div className="flex flex-col sm:flex-row gap-6">
              {/* Shabbat Mode Toggle */}
              <div className="flex items-center justify-between p-3 border rounded-xl bg-card flex-1">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">מצב שבת</h4>
                  <p className="text-xs text-muted-foreground">הפסקת שיבוץ משימות שעה לפני כניסה ועד שעה אחרי יציאה</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShabbatMode(!shabbatMode)}
                  className={cn(
                    "w-9 h-5 rounded-full border border-border transition-colors cursor-pointer relative",
                    shabbatMode ? "bg-primary" : "bg-secondary"
                  )}
                >
                  <span className={cn(
                    "absolute top-[2px] left-[2px] w-4 h-4 rounded-full bg-white shadow transition-transform",
                    shabbatMode ? "translate-x-4" : "translate-x-0"
                  )} />
                </button>
              </div>

              {/* Location configuration */}
              <div className="flex flex-col gap-3 flex-1">
                <div className="flex items-center justify-between p-3 border rounded-xl bg-card">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">שימוש ב-GPS</h4>
                    <p className="text-xs text-muted-foreground">שליפת זמני שבת ונסיעות לפי מיקום המכשיר</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUseGPS(!useGPS)}
                    className={cn(
                      "w-9 h-5 rounded-full border border-border transition-colors cursor-pointer relative",
                      useGPS ? "bg-primary" : "bg-secondary"
                    )}
                  >
                    <span className={cn(
                      "absolute top-[2px] left-[2px] w-4 h-4 rounded-full bg-white shadow transition-transform",
                      useGPS ? "translate-x-4" : "translate-x-0"
                    )} />
                  </button>
                </div>

                {!useGPS && (
                  <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                    <label className="text-sm font-medium text-foreground">בחר עיר מגורים (לזמני שבת)</label>
                    <select
                      value={selectedCity}
                      onChange={(e) => setSelectedCity(e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {CITIES_LIST.map((city) => (
                        <option key={city.value} value={city.value}>
                          {city.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* API Keys Configuration */}
          <div className="space-y-4 pt-4 border-t border-border">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <span>🔑</span>
              {t('apiKeysSectionTitle')}
            </h3>
            <p className="text-xs text-muted-foreground">{t('apiKeysSectionDesc')}</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground block">{t('geminiApiKeyLabel')}</label>
                <Input
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder={t('apiKeysPlaceholder')}
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground block">{t('mapsApiKeyLabel')}</label>
                <Input
                  type="password"
                  value={googleMapsApiKey}
                  onChange={(e) => setGoogleMapsApiKey(e.target.value)}
                  placeholder={t('apiKeysPlaceholder')}
                  className="font-mono text-xs"
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-2">
            <Button onClick={handleSaveAISettings} className="w-full sm:w-auto">
              {t('saveCommandCenterSettings')}
            </Button>
          </div>
        </CardContent>
      </Card>
        </>
  );

  const renderPreferences = () => (
        <>
      {/* 4. Preferences Card */}
      <Card className="shadow-sm border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            {t('preferencesTitle', 'העדפות')}
          </CardTitle>
          <CardDescription>{t('preferencesDesc', 'הגדרות שפה, עיצוב ופומודורו')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          
          {/* Theme */}
          <div className="flex items-center justify-between p-4 rounded-xl border bg-card">
            <div>
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Palette className="w-4 h-4" />
                {t('themeTitle', 'עיצוב (Theme)')}
              </h3>
              <p className="text-sm text-muted-foreground">{t('themeDesc', 'בחר בין מצב בהיר לכהה')}</p>
            </div>
            <div className="flex items-center gap-2 bg-secondary p-1 rounded-lg">
              <Button variant={theme === 'light' ? 'default' : 'ghost'} size="sm" onClick={() => setTheme('light')}>
                {t('light', 'בהיר')}
              </Button>
              <Button variant={theme === 'dark' ? 'default' : 'ghost'} size="sm" onClick={() => setTheme('dark')}>
                {t('dark', 'כהה')}
              </Button>
            </div>
          </div>

          {/* Language */}
          <div className="flex items-center justify-between p-4 rounded-xl border bg-card">
            <div>
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Globe className="w-4 h-4" />
                {t('languageTitle')}
              </h3>
              <p className="text-sm text-muted-foreground">{t('languageDesc')}</p>
            </div>
            <div className="flex items-center gap-2 bg-secondary p-1 rounded-lg">
              <Button variant={language === 'he' ? 'default' : 'ghost'} size="sm" onClick={() => setLanguage('he')}>
                {t('hebrew')}
              </Button>
              <Button variant={language === 'en' ? 'default' : 'ghost'} size="sm" onClick={() => setLanguage('en')}>
                {t('english')}
              </Button>
            </div>
          </div>

          {/* Pomodoro */}
          <div className="p-4 rounded-xl border bg-card space-y-4">
            <div>
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4" />
                {t('pomodoroSettings', 'הגדרות פומודורו')}
              </h3>
              <p className="text-sm text-muted-foreground">{t('pomodoroDesc', 'קבע את משך הזמן למיקוד ולהפסקה')}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="space-y-2 flex-1">
                <label className="text-sm font-medium text-foreground">{t('workTime', 'זמן מיקוד (דקות)')}</label>
                <Input type="number" min="1" max="120" value={pomoWork} onChange={(e) => setPomoWork(e.target.value)} />
              </div>
              <div className="space-y-2 flex-1">
                <label className="text-sm font-medium text-foreground">{t('breakTime', 'זמן הפסקה (דקות)')}</label>
                <Input type="number" min="1" max="60" value={pomoBreak} onChange={(e) => setPomoBreak(e.target.value)} />
              </div>
              <Button onClick={handleSavePomodoro} className="w-full sm:w-auto">{t('save')}</Button>
            </div>
          </div>

        </CardContent>
      </Card>
        </>
  );

  // ── Data & backup ──
  const renderData = () => (
    <Card className="shadow-sm border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          {t('exportData', 'ייצוא וגיבוי')}
        </CardTitle>
        <CardDescription>{t('exportDataDesc', 'הורד עותק של כל המידע שלך')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Export */}
        <div className="p-4 rounded-xl border bg-card flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-foreground">{t('exportData', 'ייצוא וגיבוי')}</h3>
            <p className="text-sm text-muted-foreground">{t('exportDataDesc', 'קובץ JSON של כל המידע')}</p>
          </div>
          <Button variant="outline" onClick={handleExportData}>{t('exportDataBtn', 'הורד גיבוי')}</Button>
        </div>

        {/* Danger Zone */}
        <div className="mt-4 pt-4 border-t">
          <h3 className="text-sm font-bold text-destructive uppercase tracking-wider mb-4 px-2">{t('dangerZone', 'אזור סכנה')}</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-xl bg-destructive/5 border border-destructive/20 gap-4">
              <div>
                <h3 className="font-semibold text-destructive flex items-center gap-2">
                  <RefreshCcw className="w-4 h-4" />
                  {t('resetSemesterTitle')}
                </h3>
                <p className="text-sm text-destructive/80">{t('resetSemesterDesc')}</p>
              </div>
              <Button variant="destructive" onClick={handleReset}>{t('resetNow')}</Button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border bg-card gap-4">
              <div>
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <LogOut className="w-4 h-4" />
                  {t('logoutTitle')}
                </h3>
                <p className="text-sm text-muted-foreground">{t('logoutDesc')}</p>
              </div>
              <Button variant="outline" onClick={handleLogout}>{t('logoutBtn')}</Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // ── Calori bridge (read-only sync info) ──
  const renderCalori = () => {
    const cal = data?.calori || {};
    const rows = [
      { label: 'ארוחות היום', value: (cal.meals || []).length },
      { label: 'אימונים היום', value: (cal.workouts || []).length },
      { label: 'יעד קלורי יומי', value: cal.dailyGoal ? `${cal.dailyGoal} קק"ל` : '—' },
    ];
    return (
      <Card className="shadow-sm border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            {t('caloriTitle', 'קלורי')}
          </CardTitle>
          <CardDescription>סנכרון לקריאה בלבד מאפליקציית קלורי (תזונה ואימונים)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 p-4 rounded-xl border bg-card">
            <div className="w-2.5 h-2.5 rounded-full bg-[#059669]" />
            <div className="flex-1">
              <h3 className="font-semibold text-foreground">{t('linked', 'מקושר')}</h3>
              <p className="text-sm text-muted-foreground">{auth?.currentUser?.email}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {rows.map((r) => (
              <div key={r.label} className="p-4 rounded-xl border bg-card text-center">
                <div className="text-2xl font-bold text-foreground">{r.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{r.label}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            הנתונים נמשכים אוטומטית מאפליקציית קלורי. Calori Life לעולם לא כותב לנתוני התזונה/אימונים — קריאה בלבד.
          </p>
        </CardContent>
      </Card>
    );
  };

  // ── About ──
  const renderAbout = () => (
    <Card className="shadow-sm border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="w-5 h-5 text-primary" />
          {t('aboutTitle', 'אודות')}
        </CardTitle>
        <CardDescription>גרסה, רישיון ופרטיות</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between p-4 rounded-xl border bg-card">
          <span className="font-semibold text-foreground">Calori Life</span>
          <span className="text-sm font-mono text-primary">v6.16.0</span>
        </div>
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 rounded-xl border bg-card hover:bg-muted/40 transition-colors">
          <span className="font-semibold text-foreground flex items-center gap-2"><Lock className="w-4 h-4" /> מדיניות פרטיות</span>
          <ExternalLink className="w-4 h-4 text-muted-foreground" />
        </a>
        <div className="p-4 rounded-xl border bg-card text-sm text-muted-foreground leading-relaxed">
          מנהל אישי ומעקב לימודים, חלק ממערכת Calori. נבנה עם React + Firebase.
        </div>
      </CardContent>
    </Card>
  );

  const renderIntegrations = () => {
    const status = integrationStatus;
    const setStatus = setIntegrationStatus;

    const handleConnect = async () => {
      try {
        const { connectGoogleCalendar } = await import('../../lib/googleCalendar.js');
        await connectGoogleCalendar();
      } catch (e) {
        console.error(e);
      }
    };

    const handleDisconnect = async () => {
      setStatus('Calendar Disconnected');
      const store = useStore.getState();
      if (store.uid && store.data.events) {
        const googleEvents = store.data.events.filter(e => e.source === 'google');
        const { deleteEvent } = await import('../../lib/firestoreRepo.js');
        for (const ev of googleEvents) {
          try {
            await deleteEvent(store.uid, ev.id);
          } catch { /* best-effort cleanup; ignore per-event failures */ }
        }
      }
    };

    const handleSync = async () => {
      try {
        const { fetchGoogleEvents } = await import('../../lib/googleCalendar.js');
        const events = await fetchGoogleEvents(new Date().toISOString());
        const store = useStore.getState();
        const { setEvent } = await import('../../lib/firestoreRepo.js');
        for (const ev of events) {
          await setEvent(store.uid, ev.id, ev);
        }
        setStatus('Calendar Connected');
        toast.success("Sync successful");
      } catch (e) {
        setStatus('Failed to sync events');
      }
    };

    return (
      <Card className="shadow-sm border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            אינטגרציות
          </CardTitle>
          <CardDescription>חיבור שירותים חיצוניים למערכת</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row items-center justify-between p-4 rounded-xl border bg-card gap-4">
            <div>
              <h3 className="font-semibold text-foreground">Google Calendar</h3>
              <p className="text-sm text-muted-foreground">{status}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={handleConnect}>Connect Google Calendar</Button>
              <Button variant="outline" onClick={handleDisconnect}>Disconnect Google Calendar</Button>
              <Button variant="secondary" onClick={handleSync}>Sync Now</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4 sm:p-6 md:p-8 animate-in fade-in duration-500 pb-24" dir={language === 'he' ? 'rtl' : 'ltr'}>
      {section === null ? (
        renderSettingsIndex()
      ) : (
        <>
          <BackButton onClick={() => setSection(null)} language={language} />
          {section === 'profile' && renderProfile()}
          {section === 'studies' && renderStudies()}
          {section === 'categories' && renderCategories()}
          {section === 'notifications' && renderNotifications()}
          {section === 'manager' && renderManager()}
          {section === 'calori' && renderCalori()}
          {section === 'general' && renderPreferences()}
          {section === 'integrations' && renderIntegrations()}
          {section === 'data' && renderData()}
          {section === 'about' && renderAbout()}
        </>
      )}

      {/* Course Edit/Add Modal */}
      {editingCourse && (
        <Dialog open={true} onOpenChange={() => setEditingCourse(null)}>
          <DialogContent className="sm:max-w-[425px]" dir={language === 'en' ? 'ltr' : 'rtl'}>
            <DialogHeader>
              <DialogTitle>{isAddMode ? t('addNewCourse') : `${t('editCourse')}: ${editingCourse.name}`}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto px-1">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('courseName')}</label>
                <Input value={editingCourse.name} onChange={e => setEditingCourse({...editingCourse, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('weeksCountLabel')}</label>
                <Input type="number" min="1" max="20" value={editingCourse.weeksCount} onChange={e => setEditingCourse({...editingCourse, weeksCount: parseInt(e.target.value)})} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('examDateA')}</label>
                  <Input type="date" value={editingCourse.moedA} onChange={e => setEditingCourse({...editingCourse, moedA: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t('examDateB')}</label>
                  <Input type="date" value={editingCourse.moedB} onChange={e => setEditingCourse({...editingCourse, moedB: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('notebookLmLink')}</label>
                <Input value={editingCourse.notebookLm} onChange={e => setEditingCourse({...editingCourse, notebookLm: e.target.value})} placeholder="https://notebooklm.google.com/..." dir="ltr" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t('geminiLink')}</label>
                <Input value={editingCourse.gemini} onChange={e => setEditingCourse({...editingCourse, gemini: e.target.value})} placeholder="https://gemini.google.com/..." dir="ltr" />
              </div>
              {isAddMode && (
                <div className="space-y-2 border-t pt-3">
                  <label className="text-sm font-bold block mb-1">
                    {language === 'he' ? 'מטלות שבועיות לייצור ראשוני:' : 'Weekly tasks to generate:'}
                  </label>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={generateLecture}
                        onChange={(e) => setGenerateLecture(e.target.checked)}
                        className="rounded border-input text-primary focus:ring-primary w-4 h-4"
                      />
                      {language === 'he' ? 'הרצאות' : 'Lectures'}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={generateTutorial}
                        onChange={(e) => setGenerateTutorial(e.target.checked)}
                        className="rounded border-input text-primary focus:ring-primary w-4 h-4"
                      />
                      {language === 'he' ? 'תרגולים' : 'Tutorials'}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={generateHomework}
                        onChange={(e) => setGenerateHomework(e.target.checked)}
                        className="rounded border-input text-primary focus:ring-primary w-4 h-4"
                      />
                      {language === 'he' ? 'שיעורי בית' : 'Homework'}
                    </label>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingCourse(null)}>{t('cancel')}</Button>
              <Button onClick={saveCourse}>{t('saveCourse')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Category Edit/Add Modal */}
      {editingCategory && (
        <Dialog open={true} onOpenChange={() => setEditingCategory(null)}>
          <DialogContent className="sm:max-w-[425px]" dir={language === 'en' ? 'ltr' : 'rtl'}>
            <DialogHeader>
              <DialogTitle>{isCategoryAddMode ? 'קטגוריה חדשה' : `ערוך קטגוריה: ${editingCategory.name}`}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4 px-1">
              <div className="space-y-2">
                <label className="text-sm font-medium">שם קטגוריה</label>
                <Input value={editingCategory.name} onChange={e => setEditingCategory({...editingCategory, name: e.target.value})} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">צבע</label>
                <div className="flex gap-2">
                  <Input type="color" value={editingCategory.color || '#059669'} onChange={e => setEditingCategory({...editingCategory, color: e.target.value})} className="w-12 h-10 p-1" />
                  <Input type="text" value={editingCategory.color || '#059669'} onChange={e => setEditingCategory({...editingCategory, color: e.target.value})} className="flex-1 font-mono" dir="ltr" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingCategory(null)}>{t('cancel')}</Button>
              <Button onClick={saveCategory}>{t('save')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Version Indicator */}
    </div>
  );
};
