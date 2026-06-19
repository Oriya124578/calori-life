import React, { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  eachDayOfInterval, 
  isSameDay, 
  isToday, 
  addMonths, 
  subMonths, 
  addDays, 
  getDay, 
  parseISO, 
  isValid,
  differenceInCalendarDays,
  startOfDay
} from 'date-fns';
import { he } from 'date-fns/locale';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { 
  Plus, 
  Calendar as CalendarIcon, 
  List as ListIcon, 
  ChevronLeft, 
  ChevronRight, 
  Trash2, 
  Edit, 
  Clock, 
  GraduationCap,
  AlertTriangle
} from 'lucide-react';
import { toast } from '../../store/useToast';
import { formatExamDaysBadge } from '../../lib/examDaysFormat';

const creamCard = {
  background: '#fff',
  border: '1px solid rgba(180,140,80,.14)',
  borderRadius: 18,
  boxShadow: '0 2px 10px rgba(40,20,0,.05)',
};

export const ExamsBoardView = () => {
  const { data, updateCourse } = useStore();
  const { t, language } = useTranslation();
  const isRTL = language === 'he';
  const locale = he;

  // View state: 'list' or 'calendar'
  const [viewMode, setViewMode] = useState('list');
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExam, setEditingExam] = useState(null); // { id, courseId, type, name, date, time }

  // Form states
  const [formCourseId, setFormCourseId] = useState('');
  const [formType, setFormType] = useState('moedA'); // 'moedA', 'moedB', 'moedC', 'custom'
  const [formCustomName, setFormCustomName] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');

  const courses = data?.courses?.filter(c => !c.isArchived) || [];

  // Parse date safely
  const safeParse = (d) => {
    if (!d) return null;
    const dt = typeof d === 'string' ? parseISO(d) : new Date(d);
    return isValid(dt) ? dt : null;
  };

  // Compile all exams from courses
  const allExams = useMemo(() => {
    const exams = [];
    courses.forEach(course => {
      // 1. Standard Moeds
      ['moedA', 'moedB', 'moedC'].forEach(moedKey => {
        const rawDate = course[moedKey] || course.exams?.[moedKey];
        const dt = safeParse(rawDate);
        if (dt) {
          const hasTime = typeof rawDate === 'string' && rawDate.includes('T');
          exams.push({
            id: `${course.id}-${moedKey}`,
            courseId: course.id,
            courseName: course.name,
            type: moedKey, // 'moedA', 'moedB', 'moedC'
            name: moedKey === 'moedA' ? 'מועד א׳' : moedKey === 'moedB' ? 'מועד ב׳' : 'מועד ג׳',
            date: dt,
            hasTime,
            rawDate
          });
        }
      });

      // 2. Custom Exams
      course.customExams?.forEach(customExam => {
        const dt = safeParse(customExam.date);
        if (dt) {
          const hasTime = typeof customExam.date === 'string' && customExam.date.includes('T');
          exams.push({
            id: customExam.id,
            courseId: course.id,
            courseName: course.name,
            type: 'custom',
            name: customExam.name,
            date: dt,
            hasTime,
            rawDate: customExam.date
          });
        }
      });
    });

    // Sort by date ascending
    return exams.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [courses]);

  // Open modal for adding a new exam
  const handleOpenAddDialog = (initialDate = null) => {
    setEditingExam(null);
    setFormCourseId(courses[0]?.id || '');
    setFormType('moedA');
    setFormCustomName('');
    
    let defaultDate = '';
    if (initialDate) {
      const year = initialDate.getFullYear();
      const month = String(initialDate.getMonth() + 1).padStart(2, '0');
      const day = String(initialDate.getDate()).padStart(2, '0');
      defaultDate = `${year}-${month}-${day}`;
    }
    setFormDate(defaultDate);
    setFormTime('');
    setIsDialogOpen(true);
  };

  // Open modal for editing an exam
  const handleOpenEditDialog = (exam) => {
    setEditingExam(exam);
    setFormCourseId(exam.courseId);
    
    const isStandardMoed = ['moedA', 'moedB', 'moedC'].includes(exam.type);
    setFormType(isStandardMoed ? exam.type : 'custom');
    setFormCustomName(isStandardMoed ? '' : exam.name);
    
    // Parse date and time
    const dt = exam.date;
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    setFormDate(`${year}-${month}-${day}`);
    
    if (exam.hasTime) {
      const hours = String(dt.getHours()).padStart(2, '0');
      const minutes = String(dt.getMinutes()).padStart(2, '0');
      setFormTime(`${hours}:${minutes}`);
    } else {
      setFormTime('');
    }
    
    setIsDialogOpen(true);
  };

  // Sync form inputs when course or exam type is changed in the dialog
  React.useEffect(() => {
    if (!isDialogOpen) return;
    
    // Custom type is always added as new unless we are specifically editing an existing custom exam
    if (formType === 'custom') {
      if (editingExam && editingExam.type === 'custom') {
        // Keep editing the current custom exam
        return;
      }
      setFormCustomName('');
      setFormDate('');
      setFormTime('');
      setEditingExam(null);
      return;
    }

    // Standard Moed lookup
    const targetCourse = courses.find(c => c.id === formCourseId);
    if (!targetCourse) return;

    const rawDate = targetCourse[formType] || targetCourse.exams?.[formType];
    
    if (rawDate) {
      const dt = safeParse(rawDate);
      if (dt) {
        // Only set if we aren't already editing this exact exam to avoid loop
        if (editingExam && editingExam.courseId === formCourseId && editingExam.type === formType && editingExam.rawDate === rawDate) {
          return;
        }

        const year = dt.getFullYear();
        const month = String(dt.getMonth() + 1).padStart(2, '0');
        const day = String(dt.getDate()).padStart(2, '0');
        setFormDate(`${year}-${month}-${day}`);
        
        const hasTime = typeof rawDate === 'string' && rawDate.includes('T');
        if (hasTime) {
          const hours = String(dt.getHours()).padStart(2, '0');
          const minutes = String(dt.getMinutes()).padStart(2, '0');
          setFormTime(`${hours}:${minutes}`);
        } else {
          setFormTime('');
        }

        setEditingExam({
          id: `${targetCourse.id}-${formType}`,
          courseId: targetCourse.id,
          courseName: targetCourse.name,
          type: formType,
          name: formType === 'moedA' ? 'מועד א׳' : formType === 'moedB' ? 'מועד ב׳' : 'מועד ג׳',
          date: dt,
          hasTime,
          rawDate
        });
        return;
      }
    }

    // If no raw date exists for the standard moed, clear inputs if we were editing
    if (editingExam) {
      setFormDate('');
      setFormTime('');
      setEditingExam(null);
    }
  }, [formCourseId, formType, isDialogOpen]);

  // Save changes (create/update)
  const handleSaveExam = () => {
    if (!formCourseId) {
      toast.error(isRTL ? 'אנא בחר קורס' : 'Please select a course');
      return;
    }
    if (formType === 'custom' && !formCustomName.trim()) {
      toast.error(isRTL ? 'אנא הזן שם למבחן המותאם אישית' : 'Please enter custom exam name');
      return;
    }
    if (!formDate) {
      toast.error(isRTL ? 'אנא בחר תאריך' : 'Please select a date');
      return;
    }

    // Combine date and time into ISO string
    let dateStr = formDate;
    if (formTime) {
      dateStr = `${formDate}T${formTime}:00`;
    }

    const targetCourse = courses.find(c => c.id === formCourseId);
    if (!targetCourse) return;

    try {
      if (editingExam) {
        // --- EDIT MODE ---
        const isPrevCustom = !['moedA', 'moedB', 'moedC'].includes(editingExam.type);
        const isNewCustom = formType === 'custom';

        // 1. If course changed, delete from old course first
        if (editingExam.courseId !== formCourseId) {
          const oldCourse = courses.find(c => c.id === editingExam.courseId);
          if (oldCourse) {
            if (isPrevCustom) {
              const updatedCustom = (oldCourse.customExams || []).filter(e => e.id !== editingExam.id);
              updateCourse(oldCourse.id, { customExams: updatedCustom });
            } else {
              updateCourse(oldCourse.id, {
                exams: {
                  ...(oldCourse.exams || {}),
                  [editingExam.type]: null
                }
              });
            }
          }
        }

        // 2. Save in target course
        if (isNewCustom) {
          const baseCustomExams = editingExam.courseId === formCourseId
            ? (targetCourse.customExams || []).filter(e => e.id !== editingExam.id)
            : (targetCourse.customExams || []);

          const updatedCustom = [
            ...baseCustomExams,
            {
              id: editingExam.type === 'custom' ? editingExam.id : `custom-${Date.now()}`,
              name: formCustomName.trim(),
              date: dateStr
            }
          ];
          updateCourse(targetCourse.id, { customExams: updatedCustom });
        } else {
          // Standard Moed
          const updatedExams = {
            ...(targetCourse.exams || {}),
            [formType]: dateStr
          };
          
          // Clear standard moed on old course or if type changed
          if (editingExam.courseId === formCourseId && editingExam.type !== formType && !isPrevCustom) {
            updatedExams[editingExam.type] = null;
          }

          updateCourse(targetCourse.id, { exams: updatedExams });
        }

        toast.success(isRTL ? 'המבחן עודכן בהצלחה' : 'Exam updated successfully');
      } else {
        // --- ADD MODE ---
        if (formType === 'custom') {
          const updatedCustom = [
            ...(targetCourse.customExams || []),
            {
              id: `custom-${Date.now()}`,
              name: formCustomName.trim(),
              date: dateStr
            }
          ];
          updateCourse(targetCourse.id, { customExams: updatedCustom });
        } else {
          const updatedExams = {
            ...(targetCourse.exams || {}),
            [formType]: dateStr
          };
          updateCourse(targetCourse.id, { exams: updatedExams });
        }
        toast.success(isRTL ? 'המבחן נוסף בהצלחה' : 'Exam added successfully');
      }

      setIsDialogOpen(false);
    } catch (e) {
      console.error(e);
      toast.error(isRTL ? 'שגיאה בשמירת הנתונים' : 'Error saving data');
    }
  };

  // Delete exam
  const handleDeleteExam = (exam) => {
    const targetCourse = courses.find(c => c.id === exam.courseId);
    if (!targetCourse) return;

    try {
      const isCustom = !['moedA', 'moedB', 'moedC'].includes(exam.type);
      if (isCustom) {
        const updatedCustom = (targetCourse.customExams || []).filter(e => e.id !== exam.id);
        updateCourse(targetCourse.id, { customExams: updatedCustom });
      } else {
        const updatedExams = {
          ...(targetCourse.exams || {}),
          [exam.type]: null
        };
        updateCourse(targetCourse.id, { exams: updatedExams });
      }
      toast.success(isRTL ? 'המבחן הוסר בהצלחה' : 'Exam removed successfully');
      setIsDialogOpen(false);
    } catch (e) {
      console.error(e);
      toast.error(isRTL ? 'שגיאה במחיקת המבחן' : 'Error deleting exam');
    }
  };

  // --- MONTH VIEW RENDERING LOGIC ---
  const handleMonthNavigation = (direction) => {
    setCurrentMonthDate(direction === 'next' ? addMonths(currentMonthDate, 1) : subMonths(currentMonthDate, 1));
  };

  const renderMonthCalendar = () => {
    const monthStart = startOfMonth(currentMonthDate);
    const monthEnd = endOfMonth(currentMonthDate);
    const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
    
    // Day of week padding (0 = Sunday, 1 = Monday...)
    const startPad = getDay(monthStart);

    // Group exams by day string (YYYY-MM-DD)
    const examsByDay = {};
    allExams.forEach(exam => {
      const y = exam.date.getFullYear();
      const m = String(exam.date.getMonth() + 1).padStart(2, '0');
      const d = String(exam.date.getDate()).padStart(2, '0');
      const dayKey = `${y}-${m}-${d}`;
      
      if (!examsByDay[dayKey]) examsByDay[dayKey] = [];
      examsByDay[dayKey].push(exam);
    });

    // Hebrew days of the week headers
    const hebrewDays = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
    const englishDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dows = isRTL ? hebrewDays : englishDays;

    return (
      <div className="w-full space-y-4">
        {/* Month Header Navigation */}
        <div className="flex items-center justify-between px-2">
          <h3 className="text-xl font-bold capitalize" style={{ fontFamily: "'Instrument Serif', serif", color: '#2A1A0A' }}>
            {format(currentMonthDate, 'MMMM yyyy', { locale: isRTL ? he : undefined })}
          </h3>
          <div className="flex items-center gap-1">
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => handleMonthNavigation('prev')}
              className="h-8 w-8 rounded-full border-border bg-card"
            >
              {isRTL ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={() => handleMonthNavigation('next')}
              className="h-8 w-8 rounded-full border-border bg-card"
            >
              {isRTL ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="border border-border/60 rounded-2xl overflow-hidden bg-card" style={{ boxShadow: '0 2px 10px rgba(40,20,0,.03)' }}>
          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 border-b border-border/40 bg-muted/30">
            {dows.map((dow, idx) => (
              <div key={idx} className="text-center py-2 text-xs font-bold text-muted-foreground select-none">
                {dow}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 grid-flow-row">
            {/* Empty days padding */}
            {Array.from({ length: startPad }).map((_, idx) => (
              <div key={`pad-${idx}`} className="border-b border-r border-border/20 min-h-[90px] bg-muted/5" />
            ))}

            {/* Actual days */}
            {monthDays.map(day => {
              const y = day.getFullYear();
              const m = String(day.getMonth() + 1).padStart(2, '0');
              const d = String(day.getDate()).padStart(2, '0');
              const dayStr = `${y}-${m}-${d}`;
              const dayExams = examsByDay[dayStr] || [];
              const isTodayDay = isToday(day);

              return (
                <div 
                  key={dayStr} 
                  onClick={() => handleOpenAddDialog(day)}
                  className={`border-b border-r border-border/30 min-h-[90px] p-1.5 flex flex-col justify-between hover:bg-muted/10 transition-colors cursor-pointer group relative`}
                >
                  {/* Day number */}
                  <span className={`w-6 h-6 flex items-center justify-center text-xs font-semibold rounded-full select-none ${
                    isTodayDay 
                      ? 'bg-primary text-primary-foreground font-bold shadow-sm' 
                      : 'text-foreground/80'
                  }`}>
                    {day.getDate()}
                  </span>

                  {/* Day's exams */}
                  <div className="space-y-1 flex-1 mt-1 overflow-y-auto max-h-[60px] custom-scrollbar">
                    {dayExams.map(exam => (
                      <div 
                        key={exam.id}
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent opening Add dialog
                          handleOpenEditDialog(exam);
                        }}
                        className="text-[10px] leading-tight px-1.5 py-0.5 rounded-md border border-destructive/20 bg-destructive/5 text-destructive truncate font-semibold hover:bg-destructive/10 transition-all select-none"
                        title={`${exam.courseName} - ${exam.name}`}
                      >
                        <span className="font-bold">{exam.courseName.slice(0, 8)}</span>: {exam.name}
                        {exam.hasTime && ` (${format(exam.date, 'HH:mm')})`}
                      </div>
                    ))}
                  </div>

                  {/* Hover Quick Add indicator */}
                  <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Plus className="w-3.5 h-3.5 text-muted-foreground/60" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto w-full px-4 py-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header and Toggle controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl tracking-tight" style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400, color: '#2A1A0A' }}>
            {isRTL ? 'ניהול לוח ' : 'Exams '}
            <em style={{ fontStyle: 'italic', color: '#059669' }}>
              {isRTL ? 'מבחנים ומועדים' : 'Board'}
            </em>
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isRTL ? 'ערוך, הוסף ושלוט בתאריכי ושעות הבחינות שלך בצורה מרוכזת' : 'Manage your exam dates, times, and custom midterms'}
          </p>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          {/* List vs Month View Toggle */}
          <div className="flex items-center border border-border/80 bg-muted/40 p-1 rounded-xl shadow-inner flex-1 sm:flex-initial">
            <button 
              onClick={() => setViewMode('list')}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'list' 
                  ? 'bg-card text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              } flex-1 sm:flex-initial`}
            >
              <ListIcon className="w-4 h-4" />
              {isRTL ? 'רשימה' : 'List'}
            </button>
            <button 
              onClick={() => setViewMode('calendar')}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'calendar' 
                  ? 'bg-card text-foreground shadow-sm' 
                  : 'text-muted-foreground hover:text-foreground'
              } flex-1 sm:flex-initial`}
            >
              <CalendarIcon className="w-4 h-4" />
              {isRTL ? 'יומן' : 'Calendar'}
            </button>
          </div>

          <Button onClick={() => handleOpenAddDialog()} className="gap-1.5 rounded-xl shadow-sm">
            <Plus className="w-4 h-4" />
            {isRTL ? 'הוסף מבחן' : 'Add Exam'}
          </Button>
        </div>
      </div>

      {/* Render Main Content */}
      {viewMode === 'calendar' ? (
        renderMonthCalendar()
      ) : (
        /* LIST VIEW */
        <div className="space-y-4">
          {allExams.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {allExams.map((exam) => {
                // Determine days left
                const today = startOfDay(new Date());
                const daysLeft = differenceInCalendarDays(startOfDay(exam.date), today);
                const badge = formatExamDaysBadge(daysLeft, isRTL);

                return (
                  <div 
                    key={exam.id}
                    style={creamCard}
                    className="p-4 flex items-center justify-between gap-4 hover:shadow-md transition-shadow group"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-primary shrink-0" />
                        <h4 className="font-bold text-foreground truncate">{exam.courseName}</h4>
                      </div>
                      <div className="text-sm font-semibold text-primary">
                        {exam.name}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <CalendarIcon className="w-3.5 h-3.5" />
                        {exam.date.toLocaleDateString(isRTL ? 'he-IL' : 'en-US')}
                        {exam.hasTime && (
                          <span className="flex items-center gap-0.5">
                            • <Clock className="w-3 h-3 inline ms-0.5" />
                            {format(exam.date, 'HH:mm')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Days countdown badge */}
                      <div className={`text-center px-3 py-1.5 rounded-xl ${
                        daysLeft <= 14 ? 'bg-destructive/10 text-destructive font-bold' :
                        daysLeft <= 30 ? 'bg-primary/10 text-primary font-semibold' : 'bg-secondary text-secondary-foreground'
                      }`}>
                        <div className="text-base leading-none">{badge.number}</div>
                        <div className="text-[9px] mt-0.5">{badge.label}</div>
                      </div>

                      {/* Edit Button */}
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleOpenEditDialog(exam)}
                        className="h-8 w-8 rounded-lg opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                        title={isRTL ? 'ערוך מבחן' : 'Edit Exam'}
                      >
                        <Edit className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground bg-card border border-dashed border-border/80 rounded-2xl">
              <CalendarIcon className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p>{isRTL ? 'אין מבחנים פעילים במערכת' : 'No upcoming exams scheduled'}</p>
              <Button onClick={() => handleOpenAddDialog()} variant="outline" className="mt-4 gap-1.5 rounded-xl border-dashed">
                <Plus className="w-4 h-4" />
                {isRTL ? 'הוסף את המבחן הראשון' : 'Add your first exam'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* --- ADD / EDIT EXAM DIALOG --- */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent dir={isRTL ? 'rtl' : 'ltr'} className={isRTL ? 'text-right' : 'text-left'}>
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Instrument Serif', serif", fontSize: 24 }}>
              {editingExam 
                ? (isRTL ? `עריכת מבחן - ${editingExam.courseName}` : `Edit Exam - ${editingExam.courseName}`)
                : (isRTL ? 'הוספת מבחן חדש' : 'Add New Exam')
              }
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4 text-start">
            {/* 1. Course Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{isRTL ? 'בחר קורס' : 'Select Course'}</label>
              <select 
                value={formCourseId} 
                onChange={(e) => setFormCourseId(e.target.value)} 
                className="w-full flex h-10 rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {courses.map(course => (
                  <option key={course.id} value={course.id}>{course.name}</option>
                ))}
              </select>
            </div>

            {/* 2. Exam Type Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{isRTL ? 'סוג המבחן / מועד' : 'Exam Type / Moed'}</label>
              <select 
                value={formType} 
                onChange={(e) => setFormType(e.target.value)} 
                className="w-full flex h-10 rounded-xl border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="moedA">{isRTL ? 'מועד א׳' : 'Moed A'}</option>
                <option value="moedB">{isRTL ? 'מועד ב׳' : 'Moed B'}</option>
                <option value="moedC">{isRTL ? 'מועד ג׳' : 'Moed C'}</option>
                <option value="custom">{isRTL ? 'מותאם אישית...' : 'Custom...'}</option>
              </select>
            </div>

            {/* 3. Custom Name Input */}
            {formType === 'custom' && (
              <div className="space-y-2 animate-in fade-in duration-200">
                <label className="text-sm font-medium text-foreground">{isRTL ? 'שם המבחן המותאם אישית' : 'Custom Exam Name'}</label>
                <Input 
                  placeholder={isRTL ? 'בוחן אמצע, מבחן הדמיה...' : 'e.g. Midterm, Practice Exam'}
                  value={formCustomName} 
                  onChange={(e) => setFormCustomName(e.target.value)}
                  className="rounded-xl text-start"
                />
              </div>
            )}

            {/* 4. Date and Time Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{isRTL ? 'תאריך המבחן' : 'Exam Date'}</label>
                <Input 
                  type="date" 
                  value={formDate} 
                  onChange={(e) => setFormDate(e.target.value)}
                  className="rounded-xl text-start"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{isRTL ? 'שעת המבחן (אופציונלי)' : 'Exam Time (Optional)'}</label>
                <Input 
                  type="time" 
                  value={formTime} 
                  onChange={(e) => setFormTime(e.target.value)}
                  className="rounded-xl text-start animate-in"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-start">
            {/* Delete button only in edit mode */}
            {editingExam && (
              <Button 
                variant="destructive" 
                onClick={() => handleDeleteExam(editingExam)}
                className="gap-1.5 rounded-xl mr-auto sm:mr-0"
              >
                <Trash2 className="w-4 h-4" />
                {isRTL ? 'מחק מבחן' : 'Delete Exam'}
              </Button>
            )}
            
            <div className="flex gap-2 sm:ms-auto">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-xl">
                {isRTL ? 'ביטול' : 'Cancel'}
              </Button>
              <Button onClick={handleSaveExam} className="rounded-xl">
                {isRTL ? 'שמור שינויים' : 'Save Changes'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
