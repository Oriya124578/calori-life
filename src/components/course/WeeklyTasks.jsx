import React, { useState, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Check, GripVertical, FileText, Paperclip, Trash2, Plus } from 'lucide-react';
import { useStore, isTaskIncludedInProgress } from '../../store/useStore';
import { useCourseFiles } from '../../hooks/useCourseFiles';
import { useTranslation } from '../../hooks/useTranslation';
import { toast } from '../../store/useToast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';

export const WeeklyTasks = ({ courseId, selectedWeek }) => {
  const { data, toggleTask, reorderTasks, moveTaskBetweenWeeks, saveNote, attachFileToTask, removeFileFromTask, setIsUploading, addWeeklyTask, deleteWeeklyTask, language } = useStore();
  const { t } = useTranslation();
  const { upload, remove, openSigned } = useCourseFiles(courseId);
  const [uploadingTask, setUploadingTask] = useState(null);
  
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [newTaskName, setNewTaskName] = useState('');
  const [newTaskIncludeProgress, setNewTaskIncludeProgress] = useState(true);
  
  const fileInputRef = useRef(null);
  const tasks = data.tasks[courseId] || {};
  const currentTasks = tasks[selectedWeek] || [];
  const note = (data.notes[courseId] && data.notes[courseId][selectedWeek]) || "";
  const currentCourse = data.courses.find(c => c.id === courseId);

  const onDragEnd = (result) => {
    if (!result.destination) return;
    const { source, destination } = result;

    if (source.droppableId === destination.droppableId) {
      // Reorder within same week
      const week = parseInt(source.droppableId.split('-')[1]);
      const newItems = Array.from(tasks[week]);
      const [removed] = newItems.splice(source.index, 1);
      newItems.splice(destination.index, 0, removed);
      reorderTasks(courseId, week, newItems);
    } else {
      // Move between weeks
      const sourceWeek = parseInt(source.droppableId.split('-')[1]);
      const destWeek = parseInt(destination.droppableId.split('-')[1]);
      moveTaskBetweenWeeks(courseId, sourceWeek, destWeek, result.draggableId, source.index, destination.index);
    }
  };

  const handleFileUpload = async (e, taskId) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;

    setUploadingTask(taskId);
    setIsUploading(true);
    try {
      const uploaded = await upload(`week_${selectedWeek}`, selected);
      const existing = currentTasks.find((tk) => tk.id === taskId)?.files || [];
      for (const file of uploaded) {
        // Skip files already attached (dedupe by path/name).
        if (existing.some((f) => f.path === file.path || f.name === file.name)) continue;
        attachFileToTask(courseId, selectedWeek, taskId, file);
      }
    } catch (err) {
      console.error('Upload failed', err);
      toast.error(t('fileUploadError'));
    } finally {
      setUploadingTask(null);
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteFile = async (taskId, file) => {
    if (!window.confirm(t('confirmDeleteFile'))) return;
    const ok = await remove(file.path);
    if (ok) removeFileFromTask(courseId, selectedWeek, taskId, file.path);
  };

  const triggerUpload = (taskId) => {
    setUploadingTask(taskId); // Temporary mark to know which task requested upload
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleAddTask = () => {
    const label = newTaskName.trim();
    if (!label) {
      toast.error(t('taskNameRequired', 'שם המשימה הוא שדה חובה'));
      return;
    }
    addWeeklyTask(courseId, selectedWeek, label, newTaskIncludeProgress);
    setNewTaskName('');
    setNewTaskIncludeProgress(true);
    setIsAddTaskOpen(false);
    toast.success(t('taskAdded', 'המשימה נוספה בהצלחה'));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
      
      {/* Hidden File Input */}
      <input
        type="file"
        multiple
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={(e) => handleFileUpload(e, uploadingTask)}
      />

      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2 text-foreground">
            <Check className="w-5 h-5 text-primary" />
            {t('weeklyTasksTab')}
          </h3>
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => setIsAddTaskOpen(true)}
            className="h-8 gap-1 rounded-xl"
          >
            <Plus className="w-4 h-4" />
            {t('newTask')}
          </Button>
        </div>
        
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId={`week-${selectedWeek}`}>
            {(provided, snapshot) => (
              <div 
                {...provided.droppableProps} 
                ref={provided.innerRef}
                className={`space-y-3 min-h-[200px] p-2 rounded-xl transition-colors ${
                  snapshot.isDraggingOver ? 'bg-secondary/20 border-2 border-dashed border-secondary' : ''
                }`}
              >
                {currentTasks.length === 0 && !snapshot.isDraggingOver && (
                  <p className="text-sm text-muted-foreground text-center py-8">{t('noTasksThisWeek')}</p>
                )}
                {currentTasks.map((task, index) => (
                  <Draggable key={task.id} draggableId={task.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={`bg-card border rounded-xl p-4 flex flex-col gap-3 transition-all ${
                          snapshot.isDragging ? 'shadow-lg border-primary ring-2 ring-primary/20 scale-102' : 'shadow-sm border-border'
                        } ${task.checked ? 'bg-muted/30 opacity-70' : ''}`}
                      >
                        {/* Task Header */}
                        <div className="flex items-center gap-3">
                          <div {...provided.dragHandleProps} className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing p-2 md:p-1 -ml-1">
                            <GripVertical className="w-5 h-5" />
                          </div>
                          
                          <button
                            onClick={() => toggleTask(courseId, selectedWeek, task.id)}
                            role="checkbox"
                            aria-checked={task.checked}
                            aria-label={task.label}
                            className="p-2 -mx-2 shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-primary/50"
                          >
                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                              task.checked ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground hover:border-primary'
                            }`}>
                              {task.checked && <Check className="w-4 h-4" />}
                            </div>
                          </button>
                          
                          <span className={`font-medium flex-1 flex flex-wrap items-center gap-2 ${task.checked ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                            {task.label}
                            {!isTaskIncludedInProgress(task, currentCourse) && (
                              <span className="text-[10px] bg-secondary/80 text-muted-foreground px-2 py-0.5 rounded-full select-none font-medium normal-case">
                                {t('notIncludedInProgress')}
                              </span>
                            )}
                          </span>
                          
                          <button
                            onClick={() => {
                              if (window.confirm(t('confirmDeleteTask'))) {
                                deleteWeeklyTask(courseId, selectedWeek, task.id);
                                toast.success(t('taskDeleted', 'המשימה נמחקה'));
                              }
                            }}
                            className="p-1.5 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                            title={t('delete')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Task Files */}
                        <div className="ps-14 flex flex-wrap gap-2">
                          {task.files && task.files.map((file, i) => (
                            <div key={i} className="flex items-center group">
                              <button
                                type="button"
                                onClick={() => openSigned(file)}
                                title={file.name}
                                className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-1 rounded-e-none rounded-s-md hover:bg-primary/20 transition-colors"
                              >
                                <FileText className="w-3 h-3" />
                                <span className="truncate max-w-[150px]" dir="ltr">{file.name}</span>
                              </button>
                              <button
                                onClick={() => handleDeleteFile(task.id, file)}
                                className="bg-destructive/10 hover:bg-destructive text-destructive hover:text-destructive-foreground px-2.5 py-1.5 md:px-1.5 md:py-1 rounded-e-md rounded-s-none transition-colors"
                                title={t('deleteFileTitle')}
                                aria-label={`${t('deleteFileTitle')}: ${file.name}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                          
                          {uploadingTask === task.id ? (
                            <span className="text-xs text-muted-foreground flex items-center gap-1 px-2 py-1 animate-pulse">
                              {t('uploading')}
                            </span>
                          ) : (
                            <button 
                              onClick={() => triggerUpload(task.id)}
                              className="flex items-center gap-1 text-xs text-muted-foreground bg-muted hover:bg-secondary hover:text-secondary-foreground px-2 py-1 rounded-md transition-colors"
                            >
                              <Paperclip className="w-3 h-3" />
                              {t('addFile')}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      {/* Notes Section */}
      <div className="space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2 text-foreground">
          <FileText className="w-5 h-5 text-primary" />
          {t('notesForWeek')} {selectedWeek}
        </h3>
        <textarea
          value={note}
          onChange={(e) => saveNote(courseId, selectedWeek, e.target.value)}
          placeholder={t('notesPlaceholder')}
          className="w-full h-64 p-4 rounded-xl border border-border bg-card text-foreground focus:ring-2 focus:ring-primary focus:outline-none resize-none shadow-sm text-start"
          dir="auto"
        />
        <p className="text-xs text-muted-foreground mt-2">
          {t('notesAutoSaved')}
        </p>
      </div>

      {/* Add Task Dialog */}
      <Dialog open={isAddTaskOpen} onOpenChange={setIsAddTaskOpen}>
        <DialogContent dir={language === 'he' ? 'rtl' : 'ltr'} className={language === 'he' ? 'text-right' : 'text-left'}>
          <DialogHeader>
            <DialogTitle>{t('newTask')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 text-start">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{t('taskName')}</label>
              <Input 
                value={newTaskName} 
                onChange={(e) => setNewTaskName(e.target.value)} 
                placeholder={t('taskNamePlaceholder')}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddTask(); }}
                className="text-start"
              />
            </div>
            
            <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer select-none py-1">
              <input
                type="checkbox"
                checked={newTaskIncludeProgress}
                onChange={(e) => setNewTaskIncludeProgress(e.target.checked)}
                className="rounded border-input text-primary focus:ring-primary w-4 h-4"
              />
              {t('calculateInProgress')}
            </label>
          </div>
          <DialogFooter className="gap-2 sm:justify-start">
            <Button variant="outline" onClick={() => setIsAddTaskOpen(false)}>{language === 'he' ? 'ביטול' : 'Cancel'}</Button>
            <Button onClick={handleAddTask}>{t('addTask')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

