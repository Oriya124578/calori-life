import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { useStore, isTaskIncludedInProgress } from '../../store/useStore';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Clock, Calendar as CalendarIcon, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { differenceInDays } from 'date-fns';
import { useTranslation } from '../../hooks/useTranslation';
import { Button } from '../ui/button';

// Academic stats that used to live on the home dashboard. Moved to the Studies
// tab in Phase 4 so the home screen can be a clean "command center".
export const StudiesStats = () => {
  const { data, setActiveCategory } = useStore();
  const { t, language } = useTranslation();

  // Overall semester progress
  const progressStats = useMemo(() => {
    let totalTasks = 0;
    let completedTasks = 0;
    (data?.courses || []).forEach((course) => {
      Object.values(data?.tasks?.[course.id] || {}).forEach((weekTasks) => {
        (weekTasks || []).forEach((task) => {
          if (isTaskIncludedInProgress(task, course)) {
            totalTasks++;
            if (task.checked) completedTasks++;
          }
        });
      });
    });
    const percentage = totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
    return { totalTasks, completedTasks, percentage };
  }, [data]);

  // Upcoming exams (sorted)
  const upcomingExams = useMemo(() => {
    const exams = [];
    (data?.courses || []).forEach((course) => {
      // 1. Standard moeds
      ['moedA', 'moedB', 'moedC'].forEach((moed) => {
        const examDate = course[moed] || course.exams?.[moed];
        if (examDate) {
          try {
            const date = new Date(examDate);
            if (Number.isNaN(date.getTime())) return;
            const daysLeft = differenceInDays(date, new Date());
            if (daysLeft >= 0) {
              exams.push({ 
                course, 
                moed, 
                date, 
                daysLeft,
                hasTime: typeof examDate === 'string' && examDate.includes('T')
              });
            }
          } catch { /* skip */ }
        }
      });

      // 2. Custom exams
      course.customExams?.forEach((exam) => {
        if (exam.date) {
          try {
            const date = new Date(exam.date);
            if (Number.isNaN(date.getTime())) return;
            const daysLeft = differenceInDays(date, new Date());
            if (daysLeft >= 0) {
              exams.push({ 
                course, 
                moed: exam.name, 
                date, 
                daysLeft,
                hasTime: typeof exam.date === 'string' && exam.date.includes('T')
              });
            }
          } catch { /* skip */ }
        }
      });
    });
    return exams.sort((a, b) => a.daysLeft - b.daysLeft);
  }, [data?.courses]);

  // Pomodoro chart data
  const chartData = useMemo(() => {
    const agg = {};
    (data?.pomodoroSessions || []).forEach((session) => {
      const c = (data?.courses || []).find((c) => c.id === session.courseId);
      if (c) agg[c.name] = (agg[c.name] || 0) + (session.duration / 60);
    });
    return Object.keys(agg).map((name) => ({ name, minutes: Math.round(agg[name]) }));
  }, [data]);

  return (
    <div className="space-y-5">
      {/* Progress ring */}
      <Card className="shadow-sm border-primary/20 bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-primary" />
            {t('semesterProgress')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-2">
            <div className="relative w-28 h-28 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-muted" />
                <circle
                  cx="50" cy="50" r="40" fill="transparent"
                  stroke="currentColor" strokeWidth="8"
                  strokeDasharray="251.2"
                  strokeDashoffset={251.2 - (251.2 * progressStats.percentage) / 100}
                  className="text-primary transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-bold">{progressStats.percentage}%</span>
                <span className="text-[11px] text-muted-foreground">
                  {progressStats.completedTasks}/{progressStats.totalTasks} {t('tasks')}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Exam board */}
      <Card className="shadow-sm border-border bg-card flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-primary" />
            {t('fullExamBoard')}
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setActiveCategory('exams')}
            className="text-xs text-primary hover:text-primary-hover font-semibold gap-1 px-2 h-8"
          >
            {language === 'he' ? 'נהל מועדים' : 'Manage Exams'}
            {language === 'he' ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto overscroll-contain max-h-[320px] pe-2 custom-scrollbar" dir={language === 'he' ? 'rtl' : 'ltr'}>
          {upcomingExams.length > 0 ? (
            <div className="space-y-3">
              {upcomingExams.map((exam, i) => (
                <div key={i} className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                  exam.daysLeft <= 14 ? 'border-destructive/30 bg-destructive/5' :
                  exam.daysLeft <= 30 ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/40'
                }`}>
                  <div className="min-w-0">
                    <h4 className="font-bold text-foreground truncate">{exam.course?.name || t('unknownCourse')}</h4>
                    <p className="text-sm text-muted-foreground">
                      {['moedA', 'moedB', 'moedC'].includes(exam.moed) 
                        ? `${t('moed')} ${exam.moed.replace('moed', '')}` 
                        : exam.moed} • {exam.date.toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US')}
                      {exam.hasTime && ` בשעה ${exam.date.toLocaleTimeString(language === 'he' ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' })}`}
                    </p>
                  </div>
                  <div className={`text-center shrink-0 px-4 py-2 rounded-lg ${
                    exam.daysLeft <= 14 ? 'bg-destructive/10 text-destructive font-bold' :
                    exam.daysLeft <= 30 ? 'bg-primary/10 text-primary font-semibold' : 'bg-secondary text-secondary-foreground'
                  }`}>
                    <div className="text-xl">{exam.daysLeft}</div>
                    <div className="text-xs">{t('days')}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground py-8">
              <CalendarIcon className="w-12 h-12 mb-2 opacity-20" />
              <p>{t('noUpcomingExams')}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pomodoro chart */}
      <Card className="shadow-sm border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            {t('learningHoursPomodoro')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <div className="h-[280px] w-full mt-4" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <XAxis dataKey="name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} angle={-45} textAnchor="end" height={60} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--secondary))' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Bar dataKey="minutes" name={t('learningMinutes')} radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={`hsl(${94 + (index * 15)} 21% 62%)`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[280px] flex flex-col items-center justify-center text-muted-foreground text-center">
              <Clock className="w-12 h-12 mb-2 opacity-20" />
              <p>{t('noPomodoroYet')}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
