import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import { toast } from '../../store/useToast';
import { cn } from '../../lib/utils';
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  showLocalNotification,
} from '../../lib/notifications';
import { enablePush, disablePush } from '../../lib/push';

// A single toggle row.
const ToggleRow = ({ label, desc, checked, onChange, disabled }) => {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-3', disabled && 'opacity-50')}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'w-11 h-6 rounded-full transition-colors flex items-center px-0.5 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed',
          checked ? 'bg-primary' : 'bg-muted-foreground/30',
        )}
      >
        <div
          className={cn(
            'w-5 h-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0',
          )}
        />
      </button>
    </div>
  );
};

export const NotificationSettings = () => {
  const { notificationSettings: s, setNotificationSettings, uid } = useStore();
  const { t } = useTranslation();
  const [permission, setPermission] = useState(getNotificationPermission());
  const [pushReady, setPushReady] = useState(false);
  const supported = isNotificationSupported();

  const enableMaster = async (val) => {
    if (val) {
      const perm = await requestNotificationPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        toast.error(t('notifPermissionDenied'));
        setNotificationSettings({ enabled: false });
        return;
      }
      setNotificationSettings({ enabled: true });
      // Register an FCM token so reminders arrive even when the app is closed.
      const token = await enablePush(uid);
      setPushReady(!!token);
      toast.success(t('notifEnabled'));
    } else {
      setNotificationSettings({ enabled: false });
      await disablePush(uid);
      setPushReady(false);
    }
  };

  const sendTest = async () => {
    const perm = await requestNotificationPermission();
    setPermission(perm);
    if (perm !== 'granted') { toast.error(t('notifPermissionDenied')); return; }
    const ok = await showLocalNotification(t('notifTestTitle'), {
      body: t('notifTestBody'),
      requireInteraction: true, // keep it on screen until dismissed (diagnostic)
    });
    if (ok) toast.success(t('notifTestSent'));
    else toast.error(t('notifPermissionDenied'));
  };

  const active = s.enabled && permission === 'granted';

  // Refresh the FCM token on mount when notifications are already active (tokens
  // rotate; this keeps Firestore current so background pushes keep working).
  useEffect(() => {
    if (active && uid) {
      enablePush(uid).then((tok) => setPushReady(!!tok));
    }
  }, [active, uid]);

  const LEAD_OPTIONS = [
    { v: 0, label: t('notifLeadAtTime') },
    { v: 10, label: `10 ${t('caloriMinutes')}` },
    { v: 30, label: `30 ${t('caloriMinutes')}` },
    { v: 60, label: `60 ${t('caloriMinutes')}` },
    { v: 120, label: `120 ${t('caloriMinutes')}` },
  ];

  return (
    <Card className="shadow-sm border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          {t('notifTitle')}
        </CardTitle>
        <CardDescription>{t('notifDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {!supported && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-500/10 text-amber-600 text-sm mb-2">
            <BellOff className="w-4 h-4 shrink-0" />
            {t('notifUnsupported')}
          </div>
        )}

        {/* Permission denied banner */}
        {supported && permission === 'denied' && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-sm mb-2">
            <BellOff className="w-4 h-4 shrink-0" />
            {t('notifBlocked')}
          </div>
        )}

        {/* Master toggle */}
        <div className="p-4 rounded-xl border bg-card">
          <ToggleRow
            label={t('notifMaster')}
            desc={t('notifMasterDesc')}
            checked={active}
            onChange={enableMaster}
            disabled={!supported || permission === 'denied'}
          />
          {active && (
            <div className="flex items-center gap-2 mt-1 text-xs">
              <span className={cn('w-1.5 h-1.5 rounded-full', pushReady ? 'bg-emerald-500' : 'bg-amber-500')} />
              <span className="text-muted-foreground">
                {pushReady ? t('notifPushActive') : t('notifPushPending')}
              </span>
            </div>
          )}
        </div>

        {/* Category toggles — only meaningful when active */}
        <div className={cn('p-4 rounded-xl border bg-card divide-y divide-border', !active && 'opacity-50 pointer-events-none')}>
          {/* Daily digest */}
          <ToggleRow
            label={t('notifDailyDigest')}
            desc={t('notifDailyDigestDesc')}
            checked={s.dailyDigest}
            onChange={(v) => setNotificationSettings({ dailyDigest: v })}
          />
          {s.dailyDigest && (
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-muted-foreground">{t('notifDigestTime')}</span>
              <input
                type="time"
                value={s.dailyDigestTime}
                onChange={(e) => setNotificationSettings({ dailyDigestTime: e.target.value })}
                className="text-sm bg-transparent border border-border rounded-lg px-2 py-1 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
          )}

          {/* Exams */}
          <ToggleRow
            label={t('notifExams')}
            desc={t('notifExamsDesc')}
            checked={s.exams}
            onChange={(v) => setNotificationSettings({ exams: v })}
          />

          {/* Tasks */}
          <ToggleRow
            label={t('notifTasks')}
            desc={t('notifTasksDesc')}
            checked={s.tasks}
            onChange={(v) => setNotificationSettings({ tasks: v })}
          />

          {/* Events */}
          <ToggleRow
            label={t('notifEvents')}
            desc={t('notifEventsDesc')}
            checked={s.events}
            onChange={(v) => setNotificationSettings({ events: v })}
          />
          {s.events && (
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-muted-foreground">{t('notifEventLead')}</span>
              <select
                value={s.eventLeadMinutes}
                onChange={(e) => setNotificationSettings({ eventLeadMinutes: Number(e.target.value) })}
                className="text-sm bg-transparent border border-border rounded-lg px-2 py-1 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {LEAD_OPTIONS.map((o) => (
                  <option key={o.v} value={o.v}>{o.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Weekly tasks */}
          <ToggleRow
            label={t('notifWeeklyTasks')}
            desc={t('notifWeeklyTasksDesc')}
            checked={s.weeklyTasks}
            onChange={(v) => setNotificationSettings({ weeklyTasks: v })}
          />
        </div>

        {/* Test button */}
        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={sendTest} className="flex items-center gap-2" disabled={!supported}>
            <BellRing className="w-4 h-4" />
            {t('notifSendTest')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
