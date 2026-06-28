import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { toast } from '../../store/useToast';
import { useStore } from '../../store/useStore';
import {
  listGoogleCalendars,
  getCalendarSettings,
  saveCalendarSettings,
  ensureCaloriWorldCalendar,
} from '../../lib/googleCalendar';

// Calendar selection panel — shown once Google Calendar is connected.
// Lets the user choose which calendars to read, which to write to, and create
// the dedicated "Calori World" calendar.
export default function CalendarManager() {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [calendars, setCalendars] = useState([]);
  const [readIds, setReadIds] = useState(new Set());
  const [writeId, setWriteId] = useState('primary');
  const [caloriWorldId, setCaloriWorldId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const cals = await listGoogleCalendars();
    if (cals === null) {
      setConnected(false);
      setLoading(false);
      return;
    }
    const settings = await getCalendarSettings();
    setConnected(true);
    // If the account is actually linked, make sure auto-sync (schedule + events)
    // is ON — it would otherwise stay off if the user connected in a prior session
    // or only created the Calori World calendar without clicking "Connect".
    useStore.getState().setGoogleSyncEnabled(true);
    setCalendars(cals);
    setReadIds(new Set(settings?.readCalendarIds || ['primary']));
    setWriteId(settings?.writeCalendarId || 'primary');
    setCaloriWorldId(settings?.caloriWorldCalendarId || null);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleRead = (id) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveCalendarSettings({
        readCalendarIds: Array.from(readIds),
        writeCalendarId: writeId,
      });
      toast.success('הגדרות היומן נשמרו');
    } catch {
      toast.error('שמירת ההגדרות נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCaloriWorld = async () => {
    setBusy(true);
    try {
      const id = await ensureCaloriWorldCalendar();
      if (id) {
        toast.success('יומן "Calori World" מוכן — האירועים החדשים ייכתבו אליו');
        await load();
      } else {
        toast.error('צריך לחבר קודם את היומן');
      }
    } catch {
      toast.error('יצירת היומן נכשלה');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">טוען יומנים…</p>;
  }
  if (!connected) {
    return (
      <p className="text-sm text-muted-foreground">
        חבר את Google Calendar כדי לבחור יומנים לקריאה ולכתיבה.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h4 className="font-semibold text-foreground">בחירת יומנים</h4>
          <p className="text-xs text-muted-foreground">
            סמן אילו יומנים להציג באפליקציה, ובחר לאיזה יומן ייכתבו אירועים שתיצור.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCreateCaloriWorld}
          disabled={busy}
        >
          {caloriWorldId ? 'יומן Calori World פעיל' : 'צור יומן "Calori World" ייעודי'}
        </Button>
      </div>

      {/* How it works — explainer */}
      <div className="rounded-xl border bg-muted/30 p-3 space-y-2 text-xs leading-relaxed" dir="rtl">
        <p className="font-semibold text-foreground">איך זה עובד:</p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">📥 הצג (קריאה)</span> — סמן יומנים שאתה רוצה ש-Calori
          יכיר, כמו <span className="text-foreground">חגים</span> או <span className="text-foreground">הרצאות/לימודים</span>.
          כשתבנה לוז יומי, המאמן יראה את האירועים האלה ויתכנן <span className="text-foreground">סביבם</span> (לא יקבע לימוד על גבי הרצאה).
        </p>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">📤 יעד כתיבה</span> — בחר את
          <span className="text-primary"> Calori World</span>. לשם ייכתבו אוטומטית
          <span className="text-foreground"> הלוז שתבנה</span> (לימוד 📚, אימון 💪, נסיעה 🚗, משימות ✅)
          וכל <span className="text-foreground">אירוע שתיצור באפליקציה</span> — כולל עדכון ומחיקה.
        </p>
        <p className="text-muted-foreground">
          הסנכרון <span className="font-semibold text-foreground">אוטומטי לחלוטין</span> — אין צורך ב-"Sync Now" בכל פעם.
          אירועים קבועים שכבר ביומן שלך לא משוכפלים.
        </p>
      </div>

      <div className="rounded-xl border bg-card divide-y">
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>יומן</span>
          <span className="text-center w-16">הצג</span>
          <span className="text-center w-16">יעד כתיבה</span>
        </div>
        {calendars.map((cal) => (
          <div key={cal.id} className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 items-center">
            <span className="flex items-center gap-2 min-w-0">
              <span
                className="inline-block w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: cal.backgroundColor || '#9aa0a6' }}
              />
              <span className="truncate text-sm text-foreground">
                {cal.summary}
                {cal.primary && <span className="text-xs text-muted-foreground"> (ראשי)</span>}
                {cal.id === caloriWorldId && <span className="text-xs text-primary"> · Calori World</span>}
              </span>
            </span>
            <span className="text-center w-16">
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-input text-primary focus:ring-primary"
                checked={readIds.has(cal.id)}
                onChange={() => toggleRead(cal.id)}
              />
            </span>
            <span className="text-center w-16">
              <input
                type="radio"
                name="writeTarget"
                className="w-4 h-4 text-primary focus:ring-primary disabled:opacity-30"
                checked={writeId === cal.id}
                disabled={!cal.writable}
                title={cal.writable ? '' : 'אין הרשאת כתיבה ליומן זה'}
                onChange={() => setWriteId(cal.id)}
              />
            </span>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'שומר…' : 'שמור בחירת יומנים'}
        </Button>
      </div>
    </div>
  );
}
