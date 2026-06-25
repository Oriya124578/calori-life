import React, { useEffect } from 'react';
import { ChevronLeft, ChevronRight, UtensilsCrossed, Dumbbell } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useTranslation } from '../../hooks/useTranslation';
import { dateKey } from '../../lib/caloriRepo';
import { format, parseISO, isToday, isYesterday, isValid, addDays, subDays } from 'date-fns';

// Nutrition = green (#059669) · Fitness = purple (#7C3AED) — per DESIGN_SYSTEM.

const creamCard = {
  background: '#fff',
  border: '1px solid rgba(180,140,80,.14)',
  borderRadius: 14,
  boxShadow: '0 2px 10px rgba(40,20,0,.05)',
};

// ── Meal row (green lineage) ─────────────────────────────────────────────────

const MealRow = ({ meal, t }) => {
  let time = '';
  if (meal.timestamp) {
    const dt = parseISO(meal.timestamp);
    if (isValid(dt)) time = format(dt, 'HH:mm');
  }
  const catLabel = t(`mealCat_${meal.category}`, meal.category);

  return (
    <div style={{
      background: '#059669',
      borderRadius: 14,
      padding: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 11,
      marginBottom: 6,
      color: '#fff',
      overflow: 'hidden',
    }}>
      {meal.imageUrl ? (
        <img
          src={meal.imageUrl}
          alt=""
          style={{
            width: 60, height: 60, borderRadius: 10,
            objectFit: 'cover', flexShrink: 0,
            border: '1px solid rgba(255,255,255,.15)',
          }}
        />
      ) : (
        <div style={{
          width: 60, height: 60, borderRadius: 10,
          background: 'linear-gradient(135deg, #10B981, #059669)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, border: '1px solid rgba(255,255,255,.15)',
          fontSize: 30,
        }}>
          <UtensilsCrossed className="w-6 h-6" />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex justify-between items-baseline gap-2">
          <div>
            <p style={{ fontSize: 14, fontWeight: 600 }} className="truncate">{meal.name}</p>
            <p style={{
              fontFamily: "'Instrument Serif', serif",
              fontStyle: 'italic',
              fontSize: 12,
              color: 'rgba(255,255,255,.7)',
            }}>
              {catLabel}{time && ` · ${time}`}
            </p>
          </div>
          <span style={{
            fontFamily: "'Fraunces', serif",
            fontWeight: 600,
            fontStyle: 'italic',
            fontSize: 18,
            letterSpacing: '-.02em',
            flexShrink: 0,
          }}>
            {meal.calories}
          </span>
        </div>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', marginTop: 3 }}>
          {t('caloriProtein')} {meal.protein || 0}g · {t('caloriCarbs')} {meal.carbs || 0}g · {t('caloriFats')} {meal.fats || 0}g
          {meal.weightGrams ? ` · ${meal.weightGrams}g` : ''}
        </p>
      </div>
    </div>
  );
};

// ── Workout row (purple lineage) ─────────────────────────────────────────────

const WorkoutRow = ({ workout, t }) => {
  let time = '';
  if (workout.timestamp) {
    const dt = parseISO(workout.timestamp);
    if (isValid(dt)) time = format(dt, 'HH:mm');
  }

  return (
    <div style={{
      background: '#7C3AED',
      borderRadius: 14,
      padding: 10,
      display: 'flex',
      alignItems: 'center',
      gap: 11,
      marginBottom: 6,
      color: '#fff',
    }}>
      <div style={{
        width: 60, height: 60, borderRadius: 10,
        background: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, border: '1px solid rgba(255,255,255,.15)',
        fontSize: 28,
      }}>
        <Dumbbell className="w-6 h-6" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex justify-between items-baseline">
          <div>
            <p style={{ fontSize: 14, fontWeight: 600 }} className="truncate">{workout.name}</p>
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', marginTop: 3 }}>
              {workout.durationMinutes} {t('caloriMinutes')}
              {time && ` · ${time}`}
              {workout.exercisesCount > 0 && ` · ${workout.exercisesCount} ${t('exercises', 'exercises')}`}
            </p>
          </div>
          <span style={{
            fontFamily: "'Fraunces', serif",
            fontWeight: 600,
            fontStyle: 'italic',
            fontSize: 18,
            letterSpacing: '-.02em',
            flexShrink: 0,
          }}>
            {workout.caloriesBurned}
          </span>
        </div>
      </div>
    </div>
  );
};

// ── Main view ────────────────────────────────────────────────────────────────

export const CaloriView = () => {
  const { data, caloriDate, setCaloriDate } = useStore();
  const { t, language } = useTranslation();
  const isRTL = language === 'he';

  const { meals = [], workouts = [], dayHistory } = data?.calori || {};

  useEffect(() => {
    if (!caloriDate) setCaloriDate(dateKey());
  }, [caloriDate, setCaloriDate]);

  if (!caloriDate) return null;

  const parsed = parseISO(caloriDate);
  const selected = isValid(parsed) ? parsed : new Date();
  const dayName = isToday(selected)
    ? (isRTL ? 'היום' : 'Today')
    : isYesterday(selected)
    ? (isRTL ? 'אתמול' : 'Yesterday')
    : format(selected, 'EEEE');
  const fullDate = format(selected, 'd MMMM yyyy');

  const goPrev = () => setCaloriDate(dateKey(subDays(selected, 1)));
  const goNext = () => {
    const next = addDays(selected, 1);
    if (next <= new Date()) setCaloriDate(dateKey(next));
  };
  const atToday = isToday(selected);

  const hasMeals    = meals.length > 0;
  const hasWorkouts = workouts.length > 0;

  const totalCalories = hasMeals ? meals.reduce((s, m) => s + (m.calories || 0), 0) : (dayHistory?.calories ?? 0);
  const totalProtein  = hasMeals ? meals.reduce((s, m) => s + (m.protein  || 0), 0) : (dayHistory?.protein  ?? 0);
  const totalCarbs    = hasMeals ? meals.reduce((s, m) => s + (m.carbs    || 0), 0) : (dayHistory?.carbs    ?? 0);
  const totalFats     = hasMeals ? meals.reduce((s, m) => s + (m.fats     || 0), 0) : (dayHistory?.fats     ?? 0);
  const burned        = hasWorkouts ? workouts.reduce((s, w) => s + (w.caloriesBurned  || 0), 0) : (dayHistory?.workout_calories ?? 0);
  const workoutMin    = hasWorkouts ? workouts.reduce((s, w) => s + (w.durationMinutes || 0), 0) : (dayHistory?.workout_minutes  ?? 0);
  // Calorie goal (rough estimate)
  const goal = 2000;
  const pct = goal > 0 ? Math.min(100, Math.round((totalCalories / goal) * 100)) : 0;

  const PrevIcon = isRTL ? ChevronRight : ChevronLeft;
  const NextIcon = isRTL ? ChevronLeft : ChevronRight;

  const hasData = meals.length > 0 || workouts.length > 0 || dayHistory;

  return (
    <div
      className="max-w-2xl mx-auto w-full px-4 py-5 sm:px-6 space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-400"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* ── Date navigator ── */}
      <div style={{
        ...creamCard,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <button
          onClick={goPrev}
          aria-label={t('caloriPrevDay', isRTL ? 'יום קודם' : 'Previous day')}
          style={{
            width: 30, height: 30, borderRadius: '50%',
            background: '#F5F0E8', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: '#8A7A6A', border: 'none', cursor: 'pointer',
          }}
        >
          <PrevIcon className="w-4 h-4" />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: 17,
            fontWeight: 400,
            color: '#2A1A0A',
            lineHeight: 1,
            letterSpacing: '-.02em',
          }}>
            {dayName} · <em style={{ fontStyle: 'italic', color: '#059669' }}>
              {format(selected, 'EEEE').split(' ')[0]}
            </em>
          </div>
          <div style={{ fontSize: 11, color: '#8A7A6A', marginTop: 2 }}>{fullDate}</div>
        </div>
        <button
          onClick={goNext}
          disabled={atToday}
          aria-label={t('caloriNextDay', isRTL ? 'יום הבא' : 'Next day')}
          style={{
            width: 30, height: 30, borderRadius: '50%',
            background: '#F5F0E8', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: '#8A7A6A', border: 'none', cursor: 'pointer',
            opacity: atToday ? 0.3 : 1,
            pointerEvents: atToday ? 'none' : 'auto',
          }}
        >
          <NextIcon className="w-4 h-4" />
        </button>
      </div>

      {/* ── Hero summary card ── */}
      <div style={{
        background: '#fff',
        borderRadius: 22,
        padding: '22px 20px',
        border: '1px solid rgba(180,140,80,.14)',
        boxShadow: '0 4px 24px rgba(40,20,0,.07)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Gradient bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, #10B981, #059669, #7C3AED)',
        }} />

        <div style={{
          fontSize: 10, fontWeight: 600, color: '#8A7A6A',
          letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 6,
        }}>
          {isRTL ? `סיכום יומי · ${pct}% מהיעד` : `Daily summary · ${pct}% of goal`}
        </div>

        <div className="flex items-center gap-4">
          <div style={{ flex: 1 }}>
            <div>
              <span style={{
                fontFamily: "'Fraunces', serif",
                fontWeight: 600,
                fontStyle: 'italic',
                fontSize: 60,
                color: '#059669',
                letterSpacing: '-.05em',
                lineHeight: .85,
              }}>
                {totalCalories}
              </span>
              <span style={{
                fontFamily: "'Instrument Serif', serif",
                fontSize: 16,
                color: '#8A7A6A',
                fontStyle: 'italic',
                marginInlineStart: 6,
              }}>
                {isRTL ? 'קק"ל' : 'kcal'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#8A7A6A', marginTop: 6 }}>
              {isRTL ? `מתוך ${goal.toLocaleString()}` : `of ${goal.toLocaleString()}`}
              {burned > 0 && ` · ${isRTL ? 'נשרפו' : 'burned'} +${burned}`}
            </div>
          </div>

          {/* Progress ring */}
          <div style={{ flexShrink: 0, position: 'relative' }}>
            <svg width="84" height="84" viewBox="0 0 84 84" fill="none">
              <circle cx="42" cy="42" r="35" stroke="rgba(5,150,105,.1)" strokeWidth="10" />
              <circle cx="42" cy="42" r="35" stroke="#059669" strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray="220"
                strokeDashoffset={220 - (220 * pct / 100)}
                transform="rotate(-90 42 42)" />
              <circle cx="42" cy="42" r="24" stroke="rgba(124,58,237,.08)" strokeWidth="8" />
            </svg>
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)', textAlign: 'center',
            }}>
              <div style={{
                fontFamily: "'Fraunces', serif",
                fontWeight: 600, fontStyle: 'italic',
                fontSize: 20, color: '#2A1A0A', letterSpacing: '-.03em',
              }}>
                {pct}%
              </div>
              <div style={{ fontSize: 9, color: '#8A7A6A' }}>
                {isRTL ? 'הושלם' : 'complete'}
              </div>
            </div>
          </div>
        </div>

        {/* Macro pills */}
        <div className="flex gap-2" style={{
          marginTop: 16, paddingTop: 14,
          borderTop: '1px solid rgba(180,140,80,.1)',
        }}>
          {[
            { label: t('caloriProtein'), value: totalProtein, unit: 'g', color: '#059669' },
            { label: t('caloriCarbs'), value: totalCarbs, unit: 'g', color: '#D97706' },
            { label: t('caloriFats'), value: totalFats, unit: 'g', color: '#DC2626' },
            ...(workoutMin > 0 ? [{ label: t('caloriMinutes'), value: workoutMin, unit: '', color: '#7C3AED' }] : []),
          ].map((mac, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{
                fontFamily: "'Fraunces', serif",
                fontWeight: 600, fontStyle: 'italic',
                fontSize: 22, letterSpacing: '-.02em', lineHeight: 1,
                color: mac.color,
              }}>
                {mac.value}{mac.unit}
              </div>
              <div style={{ fontSize: 9, color: '#8A7A6A', marginTop: 3 }}>{mac.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Empty state ── */}
      {!hasData && (
        <div style={{
          background: 'rgba(180,140,80,.05)',
          border: '1.5px dashed rgba(180,140,80,.2)',
          borderRadius: 14,
          padding: 14,
          textAlign: 'center',
          color: '#8A7A6A',
          fontFamily: "'Instrument Serif', serif",
          fontStyle: 'italic',
          fontSize: 13,
        }}>
          {t('caloriNoData')}
        </div>
      )}

      {/* ── Meals (green) ── */}
      {meals.length > 0 && (
        <section>
          <div className="flex items-center justify-between px-0.5 mb-2" style={{ padding: '4px 2px' }}>
            <div style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: 20, fontWeight: 400,
              color: '#2A1A0A', letterSpacing: '-.02em',
            }}>
              {isRTL ? 'ארוחות ' : 'Meals '}
              <em style={{ fontStyle: 'italic', color: '#059669' }}>
                {isRTL ? 'היום' : 'today'}
              </em>
            </div>
            <span style={{
              fontFamily: "'Instrument Serif', serif",
              fontStyle: 'italic', fontSize: 13, color: '#8A7A6A',
            }}>
              {meals.length} {isRTL ? 'פריטים' : 'items'} · {totalCalories} {isRTL ? 'קק"ל' : 'kcal'}
            </span>
          </div>
          {meals.map((m) => <MealRow key={m.id} meal={m} t={t} />)}
        </section>
      )}

      {/* ── Workouts (purple) ── */}
      {workouts.length > 0 && (
        <section>
          <div className="flex items-center justify-between px-0.5 mb-2" style={{ padding: '4px 2px' }}>
            <div style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: 20, fontWeight: 400,
              color: '#2A1A0A', letterSpacing: '-.02em',
            }}>
              {isRTL ? 'אימונים ' : 'Workouts '}
              <em style={{ fontStyle: 'italic', color: '#7C3AED' }}>
                {isRTL ? 'היום' : 'today'}
              </em>
            </div>
            <span style={{
              fontFamily: "'Instrument Serif', serif",
              fontStyle: 'italic', fontSize: 13, color: '#8A7A6A',
            }}>
              {workouts.length} {isRTL ? 'פריטים' : 'items'}
            </span>
          </div>
          {workouts.map((w) => <WorkoutRow key={w.id} workout={w} t={t} />)}
        </section>
      )}

      {/* Read-only hint */}
      {hasData && (
        <p style={{
          textAlign: 'center',
          fontSize: 11,
          color: '#8A7A6A',
          paddingTop: 8,
          paddingBottom: 16,
        }}>
          {t('caloriOpenApp')}
        </p>
      )}
    </div>
  );
};
