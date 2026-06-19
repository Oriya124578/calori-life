import React, { useState, useMemo, useEffect } from 'react';
import { useStore, isTaskIncludedInProgress } from '../../store/useStore';
import { WeeklyTasks } from './WeeklyTasks';
import { AllTasksByType } from './AllTasksByType';
import { CategorySection } from './GlobalTasks';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { ChevronDown, GraduationCap, Check, Pencil, Trash2 } from 'lucide-react';
import { Settings, FileText, ListTodo, Book, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { useTranslation } from '../../hooks/useTranslation';
import { toast } from '../../store/useToast';

export const CourseView = () => {
  const { activeCourse, data, updateCourse, saveLinks, setActiveCourse, saveNote } = useStore();
  const { t, language } = useTranslation();
  const [activeTab, setActiveTab] = useState('weekly');
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [isCourseSelectOpen, setIsCourseSelectOpen] = useState(false);
  const [isExamDialogOpen, setIsExamDialogOpen] = useState(false);
  const [editingMoedKey, setEditingMoedKey] = useState(null);
  const [examFormDate, setExamFormDate] = useState('');
  const [examFormTime, setExamFormTime] = useState('');
  
  // Expand/collapse state for general notes (remembered in localStorage)
  const [isNotesExpanded, setIsNotesExpanded] = useState(() => {
    return localStorage.getItem(`course_notes_expanded_${activeCourse?.id}`) === 'true';
  });

  useEffect(() => {
    if (activeCourse?.id) {
      setIsNotesExpanded(localStorage.getItem(`course_notes_expanded_${activeCourse.id}`) === 'true');
    }
  }, [activeCourse?.id]);

  const toggleNotesExpanded = () => {
    const nextVal = !isNotesExpanded;
    setIsNotesExpanded(nextVal);
    localStorage.setItem(`course_notes_expanded_${activeCourse.id}`, String(nextVal));
  };

  // Local state for the settings modal
  const [editData, setEditData] = useState({});

  useEffect(() => {
    if (activeCourse) {
      setEditData({
        name: activeCourse.name || "",
        weeksCount: activeCourse.weeksCount || 14,
        credits: activeCourse.credits || 0,
        semester: activeCourse.semester || "א'",
        geminiLink: data.links?.[activeCourse.id]?.gemini || "",
        notebookLmLink: data.links?.[activeCourse.id]?.notebookLm || "",
        progressSettings: activeCourse.progressSettings || {
          lecture: true,
          tutorial: true,
          homework: false,
          custom: true
        }
      });
    }
  }, [activeCourse, activeTab, data.links]);

  const isRTL = language === 'he';

  const nextExam = useMemo(() => {
    if (!activeCourse) return null;
    const exams = [];
    
    // 1. Standard Moeds
    ['moedA', 'moedB', 'moedC'].forEach((moedKey) => {
      const rawDate = activeCourse[moedKey] || activeCourse.exams?.[moedKey];
      const dt = rawDate ? new Date(rawDate) : null;
      if (dt && !Number.isNaN(dt.getTime())) {
        const diff = dt.getTime() - new Date().getTime();
        const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
        if (daysLeft >= 0) {
          exams.push({
            name: moedKey === 'moedA' ? 'מועד א׳' : moedKey === 'moedB' ? 'מועד ב׳' : 'מועד ג׳',
            date: dt,
            daysLeft,
            hasTime: typeof rawDate === 'string' && rawDate.includes('T')
          });
        }
      }
    });

    // 2. Custom Exams
    activeCourse.customExams?.forEach((exam) => {
      const dt = exam.date ? new Date(exam.date) : null;
      if (dt && !Number.isNaN(dt.getTime())) {
        const diff = dt.getTime() - new Date().getTime();
        const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
        if (daysLeft >= 0) {
          exams.push({
            name: exam.name,
            date: dt,
            daysLeft,
            hasTime: typeof exam.date === 'string' && exam.date.includes('T')
          });
        }
      }
    });

    if (exams.length === 0) return null;
    exams.sort((a, b) => a.date.getTime() - b.date.getTime());
    return exams[0];
  }, [activeCourse]);

  // Hooks above run unconditionally; the early bail-out goes after them.
  if (!activeCourse) return null;

  const handleOpenSettings = () => {
    setActiveTab('settings');
  };

  const handleOpenExamDialog = (moedKey) => {
    setEditingMoedKey(moedKey);
    const rawDate = activeCourse[moedKey] || activeCourse.exams?.[moedKey];
    if (rawDate) {
      const dt = new Date(rawDate);
      if (!Number.isNaN(dt.getTime())) {
        setExamFormDate(`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`);
        const hasTime = typeof rawDate === 'string' && rawDate.includes('T');
        setExamFormTime(hasTime ? `${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}` : '');
        setIsExamDialogOpen(true);
        return;
      }
    }
    setExamFormDate('');
    setExamFormTime('');
    setIsExamDialogOpen(true);
  };

  const handleSaveExamMoed = () => {
    if (!examFormDate) {
      toast.error(isRTL ? 'אנא בחר תאריך' : 'Please select a date');
      return;
    }
    const dateStr = examFormTime ? `${examFormDate}T${examFormTime}:00` : examFormDate;
    const currentExams = {
      moedA: activeCourse.exams?.moedA || activeCourse.moedA || null,
      moedB: activeCourse.exams?.moedB || activeCourse.moedB || null,
      moedC: activeCourse.exams?.moedC || activeCourse.moedC || null,
    };
    updateCourse(activeCourse.id, {
      exams: { ...currentExams, [editingMoedKey]: dateStr },
      [editingMoedKey]: dateStr,
    });
    setIsExamDialogOpen(false);
    toast.success(isRTL ? 'תאריך המועד עודכן' : 'Exam date updated');
  };

  const handleDeleteExamMoed = (moedKey) => {
    const label = moedKey === 'moedA' ? 'מועד א׳' : moedKey === 'moedB' ? 'מועד ב׳' : 'מועד ג׳';
    if (!window.confirm(isRTL ? `למחוק את ${label}?` : `Delete ${label}?`)) return;
    const currentExams = {
      moedA: activeCourse.exams?.moedA || activeCourse.moedA || null,
      moedB: activeCourse.exams?.moedB || activeCourse.moedB || null,
      moedC: activeCourse.exams?.moedC || activeCourse.moedC || null,
    };
    updateCourse(activeCourse.id, {
      exams: { ...currentExams, [moedKey]: null },
      [moedKey]: null,
    });
    toast.success(isRTL ? 'המועד נמחק' : 'Exam date deleted');
  };

  const handleSaveSettings = () => {
    const name = (editData.name || '').trim();
    if (!name) {
      toast.error(t('courseNameRequired'));
      return;
    }
    // Clamp weeks to a sane range; fall back to current value on bad input.
    let weeksCount = parseInt(editData.weeksCount, 10);
    if (Number.isNaN(weeksCount)) weeksCount = activeCourse.weeksCount || 14;
    weeksCount = Math.min(20, Math.max(1, weeksCount));

    let credits = parseFloat(editData.credits);
    if (Number.isNaN(credits) || credits < 0) credits = 0;

    try {
      updateCourse(activeCourse.id, {
        name,
        weeksCount,
        credits,
        semester: editData.semester,
        progressSettings: editData.progressSettings || {
          lecture: true,
          tutorial: true,
          homework: false,
          custom: true
        }
      });
      saveLinks(activeCourse.id, {
        ...data.links?.[activeCourse.id],
        gemini: (editData.geminiLink || '').trim(),
        notebookLm: (editData.notebookLmLink || '').trim(),
      });
      setActiveTab('weekly');
      toast.success(t('courseUpdated', 'הקורס עודכן בהצלחה'));
    } catch (err) {
      console.error('Failed to save course settings', err);
      toast.error(t('saveError'));
    }
  };

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto w-full pt-4 md:pt-8 px-4 md:px-8">
      {/* Click-outside overlay for course selector */}
      {isCourseSelectOpen && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setIsCourseSelectOpen(false)} 
        />
      )}

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b pb-4 relative z-50">
        <div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative">
              <button 
                onClick={() => setIsCourseSelectOpen(!isCourseSelectOpen)}
                className="flex items-center gap-2 group hover:opacity-80 transition-opacity"
              >
                <h1 className="text-3xl font-bold text-foreground">{activeCourse.name}</h1>
                <ChevronDown className={cn(
                  "w-6 h-6 text-muted-foreground transition-transform duration-200",
                  isCourseSelectOpen ? "rotate-180" : ""
                )} />
              </button>

              {/* Course Selector Dropdown */}
              {isCourseSelectOpen && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-xl shadow-lg overflow-hidden py-1 z-50 animate-in fade-in slide-in-from-top-2">
                  {data.courses.map((course) => (
                    <button
                      key={course.id}
                      onClick={() => {
                        setActiveCourse(course);
                        setIsCourseSelectOpen(false);
                      }}
                      className={cn(
                        "w-full text-right px-4 py-3 text-sm transition-colors hover:bg-secondary/50",
                        course.id === activeCourse.id ? "bg-primary/5 text-primary font-medium" : "text-foreground"
                      )}
                    >
                      {course.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {nextExam && (
              <div 
                className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-emerald-200/80 bg-emerald-50/50 text-emerald-800 text-xs font-semibold shadow-sm select-none animate-in fade-in zoom-in duration-300"
                style={{ direction: isRTL ? 'rtl' : 'ltr' }}
              >
                <GraduationCap className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  {isRTL ? 'מבחן קרוב: ' : 'Next Exam: '}
                  {nextExam.name}
                  {isRTL ? ' בעוד ' : ' in '}
                  {nextExam.daysLeft}
                  {isRTL ? ' ימים' : ' days'}
                  {nextExam.hasTime && ` (${String(nextExam.date.getHours()).padStart(2, '0')}:${String(nextExam.date.getMinutes()).padStart(2, '0')})`}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2">
              {data.links?.[activeCourse.id]?.gemini ? (
                <a href={data.links[activeCourse.id].gemini} target="_blank" rel="noopener noreferrer" 
                   className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border border-border bg-background hover:bg-secondary/50 h-8 px-3 gap-1.5 shadow-sm">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Gemini
                </a>
              ) : (
                <button onClick={handleOpenSettings} className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border border-dashed border-border bg-background hover:bg-secondary/50 h-8 px-3 gap-1.5 text-muted-foreground shadow-sm">
                  <Sparkles className="w-3.5 h-3.5" />
                  {t('addGeminiLink')}
                </button>
              )}
              {data.links?.[activeCourse.id]?.notebookLm ? (
                <a href={data.links[activeCourse.id].notebookLm} target="_blank" rel="noopener noreferrer"
                   className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border border-border bg-background hover:bg-secondary/50 h-8 px-3 gap-1.5 shadow-sm">
                  <Book className="w-3.5 h-3.5 text-primary" />
                  NotebookLM
                </a>
              ) : (
                <button onClick={handleOpenSettings} className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border border-dashed border-border bg-background hover:bg-secondary/50 h-8 px-3 gap-1.5 text-muted-foreground shadow-sm">
                  <Book className="w-3.5 h-3.5" />
                  {t('addNotebookLmLink')}
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
            {activeCourse.credits > 0 && <span>{activeCourse.credits} {t('credits')}</span>}
            {activeCourse.semester && <span>{t('semester')} {activeCourse.semester}</span>}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleOpenSettings} className="gap-2">
          <Settings className="w-4 h-4" />
          {t('courseSettings')}
        </Button>
      </div>

      {/* General Course Notes Box */}
      <div className="mb-6 bg-card border border-border rounded-2xl shadow-sm overflow-hidden transition-all duration-300">
        <button
          onClick={toggleNotesExpanded}
          className="w-full flex items-center justify-between p-4 hover:bg-secondary/20 transition-colors text-right cursor-pointer"
          dir={isRTL ? 'rtl' : 'ltr'}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary shrink-0" />
            <span className="font-semibold text-sm text-foreground">
              {t('generalNotesTitle')}
            </span>
            {/* Indicator badge if note has content and is collapsed */}
            {!isNotesExpanded && (data.notes[activeCourse.id]?.general || '').trim() && (
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            )}
          </div>
          <ChevronDown
            className={cn(
              "w-4 h-4 text-muted-foreground transition-transform duration-200",
              isNotesExpanded ? "rotate-180" : ""
            )}
          />
        </button>

        {isNotesExpanded && (
          <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
            <textarea
              value={data.notes[activeCourse.id]?.general || ''}
              onChange={(e) => saveNote(activeCourse.id, 'general', e.target.value)}
              placeholder={t('generalNotesPlaceholder')}
              className="w-full h-32 p-3 rounded-xl border border-border bg-background text-foreground focus:ring-2 focus:ring-primary focus:outline-none resize-none text-start text-sm shadow-inner"
              dir="auto"
            />
            <div className="flex justify-between items-center text-[10px] text-muted-foreground px-1">
              <span>{t('generalNotesAutoSaved')}</span>
              <span>
                {((data.notes[activeCourse.id]?.general || '').length)} {isRTL ? 'תווים' : 'chars'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap border-b border-border mb-6 gap-2 pb-1 w-full">
        {[
          { id: 'weekly', label: t('weeklyTasksTab') },
          { id: 'lectures', label: t('allLecturesTab') },
          { id: 'practices', label: t('allPracticesTab') },
          { id: 'general_tasks', label: t('generalTasksTab') },
          { id: 'past_exams', label: t('pastExams') },
          { id: 'quizzes', label: t('quizzes') },
          { id: 'summaries', label: t('summaries') },
          { id: 'all_notes', label: isRTL ? 'כל ההערות' : 'All Notes' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "pb-2 px-3 text-sm font-medium transition-colors relative whitespace-nowrap",
              activeTab === tab.id ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 inset-x-0 h-0.5 bg-primary rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1">
        {activeTab === 'weekly' && (
          <div className="space-y-6">
            {/* Week Selector */}
            <div className="flex flex-wrap gap-2 mb-6">
              {Array.from({ length: activeCourse.weeksCount || 14 }, (_, i) => i + 1).map((week) => {
                const weekTasks = data.tasks[activeCourse.id]?.[week];
                const relevantTasks = weekTasks ? weekTasks.filter(t => isTaskIncludedInProgress(t, activeCourse)) : [];
                const isCompleted = relevantTasks.length > 0 && relevantTasks.every(t => t.checked);
                
                return (
                  <button
                    key={week}
                    onClick={() => setSelectedWeek(week)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2",
                      selectedWeek === week
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "bg-card border border-border text-foreground hover:bg-secondary/50",
                      isCompleted && selectedWeek !== week ? "border-primary/50 text-primary" : ""
                    )}
                  >
                    {t('week')} {week}
                    {isCompleted && (
                      <span className={cn(
                        "w-2 h-2 rounded-full",
                        selectedWeek === week ? "bg-primary-foreground" : "bg-primary"
                      )} />
                    )}
                  </button>
                );
              })}
            </div>
            
            <WeeklyTasks courseId={activeCourse.id} selectedWeek={selectedWeek} />
          </div>
        )}
        
        {activeTab === 'lectures' && <AllTasksByType courseId={activeCourse.id} type="lecture" />}
        {activeTab === 'practices' && <AllTasksByType courseId={activeCourse.id} type="tutorial" />}
        
        {['general_tasks', 'past_exams', 'quizzes', 'summaries'].includes(activeTab) && (
          <div className="max-w-2xl mx-auto">
            <CategorySection 
              courseId={activeCourse.id} 
              category={activeTab} 
              title={
                activeTab === 'general_tasks' ? t('generalTasksTab') :
                activeTab === 'past_exams' ? t('pastExams') :
                activeTab === 'quizzes' ? t('quizzes') :
                t('summaries')
              } 
              icon={activeTab === 'general_tasks' ? ListTodo : FileText} 
            />
          </div>
        )}

        {activeTab === 'all_notes' && (() => {
          const weeksWithNotes = Array.from(
            { length: activeCourse.weeksCount || 14 }, (_, i) => i + 1
          ).filter(w => (data.notes[activeCourse.id]?.[w] || '').trim());
          return (
            <div className="space-y-4 max-w-2xl mx-auto">
              {weeksWithNotes.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm">
                  {isRTL ? 'אין הערות שבועיות עדיין' : 'No weekly notes yet'}
                </div>
              ) : weeksWithNotes.map(week => (
                <div key={week} className="bg-card border border-border rounded-2xl p-5 shadow-sm space-y-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <span className="text-sm font-semibold text-primary">
                      {t('week')} {week}
                    </span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed ps-6">
                    {data.notes[activeCourse.id][week]}
                  </p>
                </div>
              ))}
            </div>
          );
        })()}

        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto bg-card border border-border rounded-2xl p-6 shadow-sm space-y-6 text-start">
            <h3 className="text-xl font-bold text-foreground border-b border-border pb-3 flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              {t('courseSettings')}: {activeCourse.name}
            </h3>
            
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">{t('courseName')}</label>
                <Input 
                  value={editData.name || ''} 
                  onChange={(e) => setEditData({...editData, name: e.target.value})} 
                  className="text-start"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">{t('learningWeeks')}</label>
                  <Input 
                    type="number" 
                    min="1" 
                    max="20" 
                    value={editData.weeksCount || 14} 
                    onChange={(e) => setEditData({...editData, weeksCount: e.target.value})} 
                    className="text-start"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-foreground">{t('credits')}</label>
                  <Input 
                    type="number" 
                    step="0.5" 
                    min="0"
                    value={editData.credits || 0} 
                    onChange={(e) => setEditData({...editData, credits: e.target.value})} 
                    className="text-start"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">{t('semester')}</label>
                <Input 
                  placeholder={t('semesterPlaceholder')}
                  value={editData.semester || ''} 
                  onChange={(e) => setEditData({...editData, semester: e.target.value})} 
                  className="text-start"
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">{t('geminiLink')}</label>
                <Input 
                  placeholder="https://gemini.google.com/..."
                  value={editData.geminiLink || ''} 
                  onChange={(e) => setEditData({...editData, geminiLink: e.target.value})} 
                  className="text-start"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">{t('notebookLmLink')}</label>
                <Input 
                  placeholder="https://notebooklm.google.com/..."
                  value={editData.notebookLmLink || ''} 
                  onChange={(e) => setEditData({...editData, notebookLmLink: e.target.value})} 
                  className="text-start"
                  dir="ltr"
                />
              </div>

              <div className="space-y-3 pt-4 border-t border-border">
                <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-primary" />
                  {t('progressCalculationSettings')}
                </h4>
                
                <div className="flex flex-col gap-2.5 bg-secondary/20 p-4 rounded-xl border">
                  <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!editData.progressSettings?.lecture}
                      onChange={(e) => setEditData({
                        ...editData,
                        progressSettings: {
                          ...editData.progressSettings,
                          lecture: e.target.checked
                        }
                      })}
                      className="rounded border-input text-primary focus:ring-primary w-4 h-4"
                    />
                    {language === 'he' ? 'הרצאות נכללות בהתקדמות' : 'Lectures count in progress'}
                  </label>
                  
                  <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!editData.progressSettings?.tutorial}
                      onChange={(e) => setEditData({
                        ...editData,
                        progressSettings: {
                          ...editData.progressSettings,
                          tutorial: e.target.checked
                        }
                      })}
                      className="rounded border-input text-primary focus:ring-primary w-4 h-4"
                    />
                    {language === 'he' ? 'תרגולים נכללים בהתקדמות' : 'Tutorials count in progress'}
                  </label>
                  
                  <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!editData.progressSettings?.homework}
                      onChange={(e) => setEditData({
                        ...editData,
                        progressSettings: {
                          ...editData.progressSettings,
                          homework: e.target.checked
                        }
                      })}
                      className="rounded border-input text-primary focus:ring-primary w-4 h-4"
                    />
                    {language === 'he' ? 'שיעורי בית נכללים בהתקדמות' : 'Homework counts in progress'}
                  </label>
                </div>
              </div>

              {/* Exam Dates Section */}
              <div className="space-y-3 pt-4 border-t border-border">
                <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-primary" />
                  {isRTL ? 'מועדי בחינות' : 'Exam Dates'}
                </h4>
                <div className="flex flex-col gap-2 bg-secondary/20 p-4 rounded-xl border">
                  {['moedA', 'moedB', 'moedC'].map((moedKey) => {
                    const rawDate = activeCourse[moedKey] || activeCourse.exams?.[moedKey];
                    const dt = rawDate ? new Date(rawDate) : null;
                    const valid = dt && !Number.isNaN(dt.getTime());
                    const hasTime = typeof rawDate === 'string' && rawDate.includes('T');
                    const moedLabel = moedKey === 'moedA' ? 'מועד א׳' : moedKey === 'moedB' ? 'מועד ב׳' : 'מועד ג׳';
                    return (
                      <div key={moedKey} className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-foreground w-16 shrink-0">{moedLabel}</span>
                        {valid ? (
                          <span className="flex-1 text-muted-foreground text-xs">
                            {dt.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            {hasTime && ` ${String(dt.getHours()).padStart(2,'0')}:${String(dt.getMinutes()).padStart(2,'0')}`}
                          </span>
                        ) : (
                          <span className="flex-1 text-xs italic text-muted-foreground/60">{isRTL ? 'לא נקבע' : 'Not set'}</span>
                        )}
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => handleOpenExamDialog(moedKey)}
                            className="p-1.5 text-muted-foreground hover:text-primary transition-colors rounded-md hover:bg-primary/10"
                            title={isRTL ? 'ערוך תאריך' : 'Edit date'}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {valid && (
                            <button
                              onClick={() => handleDeleteExamMoed(moedKey)}
                              className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded-md hover:bg-destructive/10"
                              title={isRTL ? 'מחק מועד' : 'Delete exam'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-border">
              <Button 
                variant="outline" 
                onClick={() => {
                  setEditData({
                    name: activeCourse.name,
                    weeksCount: activeCourse.weeksCount || 14,
                    credits: activeCourse.credits || 0,
                    semester: activeCourse.semester || "א'",
                    geminiLink: data.links?.[activeCourse.id]?.gemini || "",
                    notebookLmLink: data.links?.[activeCourse.id]?.notebookLm || "",
                    progressSettings: activeCourse.progressSettings || {
                      lecture: true,
                      tutorial: true,
                      homework: false,
                      custom: true
                    }
                  });
                  toast.success(isRTL ? 'השינויים בוטלו' : 'Changes reverted');
                }}
              >
                {language === 'he' ? 'בטל שינויים' : 'Cancel'}
              </Button>
              <Button onClick={handleSaveSettings}>
                {t('saveChanges')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Exam Moed Edit Dialog */}
      <Dialog open={isExamDialogOpen} onOpenChange={setIsExamDialogOpen}>
        <DialogContent dir={language === 'he' ? 'rtl' : 'ltr'} className={language === 'he' ? 'text-right' : 'text-left'}>
          <DialogHeader>
            <DialogTitle>
              {editingMoedKey === 'moedA' ? 'מועד א׳' : editingMoedKey === 'moedB' ? 'מועד ב׳' : 'מועד ג׳'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 text-start">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{isRTL ? 'תאריך' : 'Date'}</label>
              <Input type="date" value={examFormDate} onChange={(e) => setExamFormDate(e.target.value)} className="text-start" dir="ltr" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{isRTL ? 'שעה (אופציונלי)' : 'Time (optional)'}</label>
              <Input type="time" value={examFormTime} onChange={(e) => setExamFormTime(e.target.value)} className="text-start" dir="ltr" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button variant="outline" onClick={() => setIsExamDialogOpen(false)}>{t('cancel')}</Button>
            <Button onClick={handleSaveExamMoed}>{t('saveChanges')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



    </div>
  );
};
