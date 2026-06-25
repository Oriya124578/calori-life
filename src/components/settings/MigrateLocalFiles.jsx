import React, { useState } from 'react';
import { getUserId, uploadFile } from '../../lib/courseFilesStorage';
import { useStore } from '../../store/useStore';
import { Button } from '../ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/card';
import { CloudUpload, AlertTriangle, CheckCircle } from 'lucide-react';
import { useTranslation } from '../../hooks/useTranslation';

export const MigrateLocalFiles = () => {
  const { data, setData } = useStore();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, currentFile: '' });
  const [status, setStatus] = useState('idle'); // idle, running, complete, error
  const [errorMsg, setErrorMsg] = useState('');

  const migrateFiles = async () => {
    setLoading(true);
    setStatus('running');
    setProgress({ current: 0, total: 0, currentFile: t('migrateScanning') });

    try {
      // 1. Scan all courses to find what to upload
      const uploadQueue = []; // { courseId, week/category, taskId, localPath, fileName }

      for (const course of data.courses) {
        // Fetch local folder contents using the old /api/scan route
        try {
          const res = await fetch(`/api/scan?folder=${encodeURIComponent(course.name)}`);
          if (res.ok) {
            const folderData = await res.json();
            
            // folderData looks like: { "הרצאות": { "1": "/files/...", "2": "/files/..." }, "תרגולים": ... }
            // We need to map these back to the new tasks structure and queue them for upload
            const categoriesMap = {
              "הרצאות": "lecture",
              "תרגולים": "tutorial",
              "שיעורי בית": "homework",
              "סיכומים": "summaries",
              "מבחנים": "past_exams",
              "בחנים": "quizzes"
            };

            Object.entries(folderData).forEach(([localFolder, filesObj]) => {
              const taskType = categoriesMap[localFolder];
              if (!taskType) return;

              Object.entries(filesObj).forEach(([weekNum, localPath]) => {
                const fileName = localPath.split('/').pop();
                
                // If it's a weekly task
                if (['lecture', 'tutorial', 'homework'].includes(taskType)) {
                  const week = parseInt(weekNum, 10);
                  if (data.tasks[course.id] && data.tasks[course.id][week]) {
                    const task = data.tasks[course.id][week].find(t => t.type === taskType);
                    if (task) {
                      uploadQueue.push({
                        courseId: course.id,
                        week: week,
                        taskId: task.id,
                        localPath,
                        fileName,
                        isGlobal: false
                      });
                    }
                  }
                } 
                // If it's a global task
                else {
                  // Global tasks didn't have strict week numbers mapped in the old system easily, 
                  // but we'll queue them to the first global task of that category or create a new one.
                  uploadQueue.push({
                    courseId: course.id,
                    category: taskType,
                    localPath,
                    fileName,
                    isGlobal: true,
                    label: `${localFolder} ${weekNum}`
                  });
                }
              });
            });
          }
        } catch {
          console.warn(`No local folder found for course ${course.name} or API error.`);
        }
      }

      setProgress(prev => ({ ...prev, total: uploadQueue.length }));

      if (uploadQueue.length === 0) {
        setStatus('complete');
        setProgress(prev => ({ ...prev, currentFile: t('migrateNoFiles') }));
        setLoading(false);
        return;
      }

      // Clone store data to update it
      let newData = JSON.parse(JSON.stringify(data));

      // 2. Upload files one by one to Supabase
      for (let i = 0; i < uploadQueue.length; i++) {
        const item = uploadQueue[i];
        setProgress(prev => ({ ...prev, current: i + 1, currentFile: item.fileName }));

        // Fetch local blob
        const blobRes = await fetch(item.localPath);
        if (!blobRes.ok) continue;
        const blob = await blobRes.blob();
        const blobFile = new File([blob], item.fileName, { type: blob.type });

        // Upload to the single private `course_files` bucket.
        let fileObj;
        try {
          const userId = await getUserId();
          const folder = item.isGlobal ? item.category : `week_${item.week}`;
          fileObj = await uploadFile({ userId, courseId: item.courseId, folder, file: blobFile });
        } catch (err) {
          console.error('Upload error:', err);
          continue; // Skip this file and continue
        }

        // Attach to store
        if (item.isGlobal) {
          if (!newData.globalTasks) newData.globalTasks = {};
          if (!newData.globalTasks[item.courseId]) newData.globalTasks[item.courseId] = {};
          if (!newData.globalTasks[item.courseId][item.category]) {
            newData.globalTasks[item.courseId][item.category] = [];
          }
          // Add as a new global task with the file attached
          newData.globalTasks[item.courseId][item.category].push({
            id: `${Date.now()}-${i}`,
            label: item.label,
            checked: false,
            files: [fileObj]
          });
        } else {
          if (!newData.tasks) newData.tasks = {};
          if (!newData.tasks[item.courseId]) newData.tasks[item.courseId] = {};
          if (!newData.tasks[item.courseId][item.week]) newData.tasks[item.courseId][item.week] = [];
          
          const weekTasks = newData.tasks[item.courseId][item.week];
          const tIndex = weekTasks.findIndex(t => t.id === item.taskId);
          if (tIndex !== -1) {
            weekTasks[tIndex].files = weekTasks[tIndex].files || [];
            weekTasks[tIndex].files.push(fileObj);
          }
        }
      }

      // Save updated data back to store
      setData(newData);
      setStatus('complete');
    } catch (error) {
      console.error(error);
      setErrorMsg(error.message);
      setStatus('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2 text-primary">
          <CloudUpload className="w-5 h-5" />
          {t('migrateTitle')}
        </CardTitle>
        <CardDescription>
          {t('migrateDesc')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        
        <div className="bg-background border rounded-lg p-3 text-sm flex gap-3 text-muted-foreground">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            {t('migrateWarning')}
          </div>
        </div>

        {status === 'running' && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{t('migrateUploading')}</span>
              <span>{progress.current} / {progress.total}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-300" 
                style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground truncate" dir="ltr">{progress.currentFile}</p>
          </div>
        )}

        {status === 'complete' && (
          <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg border border-green-200">
            <CheckCircle className="w-5 h-5" />
            {t('migrateComplete')}
          </div>
        )}

        {status === 'error' && (
          <div className="text-destructive text-sm bg-destructive/10 p-3 rounded-lg">
            {t('migrateError')} {errorMsg}
          </div>
        )}

        <Button 
          onClick={migrateFiles} 
          disabled={loading || status === 'complete'}
          className="w-full"
        >
          {loading ? t('migrateUploadingToCloud') : t('migrateStartBtn')}
        </Button>
      </CardContent>
    </Card>
  );
};
