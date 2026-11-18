import { Fragment, useState, useEffect } from 'react';
import {
  getDailyStats, getSummaryStats, getActivityStats, getStreakStats,
  getMaturityStats, getMaturityTrend, getDeckFlow,
} from '../services/api';
import type { CSSProperties, ReactNode } from 'react';
import type {
  ActivityStats, StreakStats, MaturityBucket, MaturityTrendPoint, DeckFlowDay, DeckFlowStats,
} from '../services/api';

interface DailyStats {
  date: string;
  total_minutes: number;
  total_seconds: number;
  card_count: number;
  by_category: Record<string, number>;
  cards_by_category: Record<string, number>;
}

interface SummaryStats {
  period_days: number;
  total_minutes: number;
  avg_per_day: number;
  active_days: number;
  total_cards: number;
  by_module: Record<string, number>;
  by_category: Record<string, number>;
}

interface MaturityTrend {
  days: number;
  total_cards: number;
  from: string;
  to: string;
  series: MaturityTrendPoint[];
}

const panel: CSSProperties = {
  border: '2px solid var(--border-primary)',
  borderRadius: '6px',
  padding: '18px 20px',
  marginBottom: '16px',
  background: 'var(--bg-primary)',
};

const panelTitle: CSSProperties = {
  margin: 0,
  fontSize: '1rem',
  fontWeight: 'bold',
  color: 'var(--text-primary)',
};

const hint: CSSProperties = {
  margin: '3px 0 14px',
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
};

const tileRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: '10px',
};

const MATURITY_COLORS: Record<string, string> = {
  // A neutral that is visible in both themes: --bg-muted disappears against
  // the panel background in dark mode, making "not repeated yet" look empty.
  new: 'var(--text-secondary)',
  once: '#9cc9e8',
  few: '#3b82f6',
  many: 'var(--text-success)',
};

const MATURITY_LABELS: Record<string, string> = {
  new: 'не повторялось',
  once: '1 раз',
  few: '2–3 раза',
  many: '4+ раз',
};

const LANG_ORDER = ['en', 'sk'];

function langLabel(lang: string): string {
  return lang === 'en' ? 'English' : lang === 'sk' ? 'Slovak' : lang;
}

function tile(label: string, value: string, sub?: string, color?: string) {
  return (
    <div style={{
      border: '1px solid var(--border-light)',
      borderRadius: '4px',
      padding: '12px 14px',
      background: 'var(--bg-muted)',
    }}>
      <div style={{
        fontSize: '0.65rem',
        letterSpacing: '0.06em',
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        fontWeight: 600,
      }}>
        {label}
      </div>
      <div style={{ fontSize: '1.55rem', fontWeight: 'bold', color: color || 'var(--text-primary)', lineHeight: '1.2' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>{sub}</div>}
    </div>
  );
}

function Panel({ title, meta, description, children }: {
  title: string;
  meta?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <h3 style={panelTitle}>{title}</h3>
        {meta && <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{meta}</span>}
      </div>
      {description && <p style={hint}>{description}</p>}
      {children}
    </div>
  );
}

function SectionHeading({ title, hint: subtitle }: { title: string; hint?: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: '12px',
      flexWrap: 'wrap',
      margin: '30px 0 10px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <h3 style={{
          margin: 0,
          fontSize: '0.92rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-primary)',
        }}>
          {title}
        </h3>
      </div>
      {subtitle && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{subtitle}</span>}
    </div>
  );
}

// Monday 00:00 UTC of the week that contains `ref`.
function mondayOf(ref: Date): Date {
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

function mondayOfIso(iso: string): string {
  return mondayOf(new Date(iso + 'T00:00:00Z')).toISOString().slice(0, 10);
}

function sumFlow(rows: DeckFlowDay[], key: 'added' | 'first_touched' | 'reached_four' | 'reviews'): number {
  return rows.reduce((s, d) => s + d[key], 0);
}

function signed(n: number): string {
  return `${n >= 0 ? '+' : ''}${n}`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function words(n: number): string {
  return `${n} ${plural(n, 'слово', 'слова', 'слов')}`;
}

function ppDelta(from: number, to: number): { text: string; value: number } {
  const value = Math.round((to - from) * 10) / 10;
  return { text: `${value >= 0 ? '+' : ''}${value} п.п.`, value };
}

function CompositionBar({ bucket }: { bucket: MaturityBucket }) {
  return (
    <div style={{
      display: 'flex',
      height: '24px',
      borderRadius: '4px',
      overflow: 'hidden',
      border: '1px solid var(--border-light)',
    }}>
      {(['new', 'once', 'few', 'many'] as const).map((k) => (
        bucket[k] > 0 ? (
          <div
            key={k}
            title={`${MATURITY_LABELS[k]}: ${bucket[k]}`}
            style={{
              width: `${(bucket[k] / bucket.total) * 100}%`,
              background: MATURITY_COLORS[k],
            }}
          />
        ) : null
      ))}
    </div>
  );
}

export function StatsPage() {
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
  const [summaryStats, setSummaryStats] = useState<SummaryStats | null>(null);
  const [activity, setActivity] = useState<ActivityStats | null>(null);
  const [streak, setStreak] = useState<StreakStats | null>(null);
  const [maturity, setMaturity] = useState<{ by_language: Record<string, MaturityBucket>; totals: MaturityBucket } | null>(null);
  const [trends, setTrends] = useState<Record<string, MaturityTrend>>({});
  const [flow, setFlow] = useState<DeckFlowStats | null>(null);
  const [barDays, setBarDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const mon = mondayOf(now);
      const sun = new Date(mon);
      sun.setUTCDate(mon.getUTCDate() + 6);
      const monIso = mon.toISOString().slice(0, 10);
      const sunIso = sun.toISOString().slice(0, 10);
      const [daily, summary, act, str, mat, fl] = await Promise.all([
        getDailyStats(),
        getSummaryStats(7, { start: monIso, end: sunIso }),
        getActivityStats(365),
        getStreakStats(),
        getMaturityStats(),
        getDeckFlow(70),
      ]);
      const languages = Object.keys(mat.by_language);
      const languageTrends = await Promise.all(
        languages.map((lang) => getMaturityTrend(90, 15, lang)),
      );
      setDailyStats(daily);
      setSummaryStats(summary);
      setActivity(act);
      setStreak(str);
      setMaturity(mat);
      setTrends(Object.fromEntries(languages.map((lang, i) => [lang, languageTrends[i]])));
      setFlow(fl);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
    setLoading(false);
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>;
  }

  // ---- derived values ----
  const today = new Date().toISOString().slice(0, 10);
  const daily = activity?.daily || [];

  // Day calendar: a full year (365 days, ending today), week-columns
  // (Mon-first) × 7 day-rows. Leading blanks align the first day to Monday.
  const calendar: { date: string; cards: number; seconds: number }[][] = [];
  if (daily.length) {
    const first = daily[0].date;
    const firstDow = (new Date(first + 'T00:00:00Z').getUTCDay() + 6) % 7; // Mon = 0
    const cells: { date: string; cards: number; seconds: number }[] = [];
    for (let i = 0; i < firstDow; i++) cells.push({ date: '', cards: -1, seconds: -1 });
    daily.forEach((d) => cells.push({ date: d.date, cards: d.cards, seconds: d.seconds }));
    while (cells.length % 7 !== 0) cells.push({ date: '', cards: -1, seconds: -1 });
    for (let i = 0; i < cells.length; i += 7) calendar.push(cells.slice(i, i + 7));
  }
  const maxCards = Math.max(1, ...daily.map((d) => d.cards));
  const heatLevel = (cards: number) => {
    if (cards < 0) return 'transparent';
    if (cards === 0) return 'var(--bg-muted)';
    const ratio = cards / maxCards;
    if (ratio > 0.75) return 'var(--text-success)';
    if (ratio > 0.5) return '#7fc47f';
    if (ratio > 0.25) return '#a8d8a8';
    return '#d4ead4';
  };
  const dayFmt = (iso: string) => {
    if (!iso) return '';
    const [, m, d] = iso.split('-');
    return `${d}.${m}`;
  };

  // Duration formatting for the top tiles.
  const humanDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return h > 0 ? `${h}ч ${m}м` : `${m}м`;
  };

  // This week (Monday → Sunday)
  const now = new Date();
  const monday = mondayOf(now);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const mondayIso = monday.toISOString().slice(0, 10);
  const sundayIso = sunday.toISOString().slice(0, 10);

  // Trend chart scaling
  const maturityLanguages = maturity
    ? Object.keys(maturity.by_language).sort((a, b) => {
        const ia = LANG_ORDER.indexOf(a);
        const ib = LANG_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
      })
    : [];

  // Cards-per-day bars (repeats per day)
  const bars = daily.slice(-barDays);
  const barMax = Math.max(1, ...bars.map((b) => b.cards));
  const barAvg = bars.length ? bars.reduce((s, b) => s + b.cards, 0) / bars.length : 0;
  const barsTotal = bars.reduce((s, b) => s + b.cards, 0);

  // ── Week-to-date vs the same span of last week (Mon → today's weekday) ──
  // Compared on the review-derived daily numbers so both sides come from the
  // same source (session_stats card counts can lag behind reviews).
  const todayIdx = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7; // Mon = 0
  const prevMonday = new Date(monday);
  prevMonday.setUTCDate(monday.getUTCDate() - 7);
  const prevMondayIso = prevMonday.toISOString().slice(0, 10);
  const prevCutoff = new Date(prevMonday);
  prevCutoff.setUTCDate(prevMonday.getUTCDate() + todayIdx);
  const prevCutoffIso = prevCutoff.toISOString().slice(0, 10);
  const prevSunday = new Date(prevMonday);
  prevSunday.setUTCDate(prevMonday.getUTCDate() + 6);
  const prevSundayIso = prevSunday.toISOString().slice(0, 10);

  const thisWeekSoFar = daily.filter((d) => d.date >= mondayIso && d.date <= today);
  const prevWeekSoFar = daily.filter((d) => d.date >= prevMondayIso && d.date <= prevCutoffIso);
  const thisWeekCards = thisWeekSoFar.reduce((s, d) => s + d.cards, 0);
  const prevWeekCards = prevWeekSoFar.reduce((s, d) => s + d.cards, 0);
  const thisWeekSecs = thisWeekSoFar.reduce((s, d) => s + (d.seconds || 0), 0);
  const prevWeekSecs = prevWeekSoFar.reduce((s, d) => s + (d.seconds || 0), 0);
  const cardsDelta = thisWeekCards - prevWeekCards;
  const cardsDeltaPct = prevWeekCards > 0 ? Math.round((cardsDelta / prevWeekCards) * 100) : null;
  const weekLabel = `Пн ${dayFmt(mondayIso)} – Вс ${dayFmt(sundayIso)}`;
  const weekDayCount = thisWeekSoFar.length;

  // ── Today's place among the active days of the year ──
  // "Топ N%" = share of active days whose count is at least today's. A day
  // with zero cards therefore lands in the top 100%, the best day in top 1%.
  const activeDays = daily.filter((d) => d.cards > 0);
  const todayCards = daily.find((d) => d.date === today)?.cards ?? 0;
  const daysAtLeast = activeDays.filter((d) => d.cards >= todayCards).length;
  const topPct = activeDays.length ? Math.max(1, Math.round((daysAtLeast / activeDays.length) * 100)) : 0;
  const aheadPct = activeDays.length
    ? Math.round(((activeDays.length - daysAtLeast) / activeDays.length) * 100)
    : 0;

  // ── Deck flow: words added vs words started / drilled ──
  const flowDays = flow?.daily || [];
  const thisFlow = flowDays.filter((d) => d.date >= mondayIso && d.date <= today);
  const prevFlow = flowDays.filter((d) => d.date >= prevMondayIso && d.date <= prevCutoffIso);
  const thisAdded = sumFlow(thisFlow, 'added');
  const prevAdded = sumFlow(prevFlow, 'added');
  const thisFirst = sumFlow(thisFlow, 'first_touched');
  const prevFirst = sumFlow(prevFlow, 'first_touched');
  const thisFour = sumFlow(thisFlow, 'reached_four');
  const prevFour = sumFlow(prevFlow, 'reached_four');
  const thisReviews = sumFlow(thisFlow, 'reviews');
  const prevReviews = sumFlow(prevFlow, 'reviews');
  const prevFullFlow = flowDays.filter((d) => d.date >= prevMondayIso && d.date <= prevSundayIso);
  const prevFullAdded = sumFlow(prevFullFlow, 'added');
  const prevFullFirst = sumFlow(prevFullFlow, 'first_touched');
  const backlogDelta = thisAdded - thisFirst;
  const backlogPct = flow && flow.total_cards > 0
    ? Math.round((flow.untouched_total / flow.total_cards) * 100)
    : 0;

  const flowWeekMap = new Map<string, { start: string; added: number; first: number; four: number; reviews: number }>();
  flowDays.forEach((d) => {
    const start = mondayOfIso(d.date);
    const row = flowWeekMap.get(start) || { start, added: 0, first: 0, four: 0, reviews: 0 };
    row.added += d.added;
    row.first += d.first_touched;
    row.four += d.reached_four;
    row.reviews += d.reviews;
    flowWeekMap.set(start, row);
  });
  const allFlowWeeks = [...flowWeekMap.values()]
    .sort((a, b) => a.start.localeCompare(b.start));
  // The first bucket is partial when the window starts mid-week; drop it so
  // the oldest bar is not compare-by-half with the rest.
  const firstFlowMonday = flow ? mondayOfIso(flow.from) : '';
  const flowWeeks = (flow && flow.from !== firstFlowMonday
    ? allFlowWeeks.slice(1)
    : allFlowWeeks
  ).slice(-8);
  const flowMax = Math.max(1, ...flowWeeks.flatMap((w) => [w.added, w.first]));

  const flowVerdict = thisAdded === 0 && thisFirst === 0
    ? 'На этой неделе пока нет добавленных или начатых слов.'
    : backlogDelta > 0
      ? `Приток быстрее учёбы: добавлено ${thisAdded}, впервые повторено ${thisFirst} — не начатых стало на ${words(backlogDelta)} больше.`
      : backlogDelta < 0
        ? `Учёба опережает приток: впервые повторено на ${words(-backlogDelta)} больше, чем добавлено.`
        : `Приток и учёба сбалансированы: добавлено ${thisAdded}, впервые повторено ${thisFirst}.`;
  const flowTone = backlogDelta > 0
    ? 'var(--text-danger)'
    : backlogDelta < 0
      ? 'var(--text-success)'
      : 'var(--text-secondary)';

  const totalTouched = maturity ? maturity.totals.total - maturity.totals.new : 0;
  const totalTouchedPct = maturity && maturity.totals.total > 0
    ? Math.round((totalTouched / maturity.totals.total) * 100)
    : 0;

  return (
    <div>
      {/* Header with Refresh in the top-right */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>Статистика</h2>
          <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Учёба, темп и состав колод
          </p>
        </div>
        <button onClick={loadStats} style={{
          border: '2px solid var(--border-primary)',
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          padding: '8px 16px',
          fontSize: '0.9rem',
          cursor: 'pointer',
          borderRadius: '4px',
          fontWeight: 'bold',
          minHeight: '44px',
          whiteSpace: 'nowrap',
        }}>
          Обновить
        </button>
      </div>

      {/* ───── Сегодня ───── */}
      <SectionHeading title="Сегодня" hint={dailyStats?.date} />
      {dailyStats && (
        <Panel title="Итог за день" description="Повторения и время за текущий день.">
          <div style={tileRow}>
            {tile('Карточек', String(dailyStats.card_count), `${dailyStats.total_minutes} мин`)}
            {tile(
              'Место дня',
              todayCards > 0 ? `топ ${topPct}%` : '—',
              todayCards > 0
                ? `лучше, чем ${aheadPct}% из ${activeDays.length} активных дней за год`
                : 'сегодня ещё нет повторений',
              todayCards > 0 && topPct <= 25 ? 'var(--text-success)' : undefined,
            )}
            {tile('Время', `${dailyStats.total_minutes} мин`, `${dailyStats.total_seconds} сек`)}
            {Object.entries(dailyStats.by_category).map(([cat, mins]) => (
              <Fragment key={cat}>
                {tile(
                  langLabel(cat),
                  `${mins} мин`,
                  `${dailyStats.cards_by_category[cat] ?? 0} карточек`,
                )}
              </Fragment>
            ))}
          </div>
        </Panel>
      )}

      {/* ───── Неделя ───── */}
      <SectionHeading title="Неделя" hint={weekLabel} />
      <Panel title="Итог за неделю" description="Сравнение с прошлой неделей идёт на тот же день недели.">
        <div style={tileRow}>
          {tile('Карточек', String(thisWeekCards), `сегодня ${todayCards} · ${weekDayCount} ${plural(weekDayCount, 'день', 'дня', 'дней')} с понедельника`)}
          {tile('Время', humanDuration(thisWeekSecs), `на этот день прошлой: ${humanDuration(prevWeekSecs)}`)}
          {cardsDeltaPct !== null && tile(
            'К прошлой неделе',
            `${cardsDelta >= 0 ? '+' : ''}${cardsDeltaPct}%`,
            `сейчас ${thisWeekCards} · тогда ${prevWeekCards}`,
            cardsDelta >= 0 ? 'var(--text-success)' : 'var(--text-danger)',
          )}
        </div>
        <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          На этот день прошлой недели: {prevWeekCards} карт. · {humanDuration(prevWeekSecs)}
          {' '}
          <span style={{ color: cardsDelta >= 0 ? 'var(--text-success)' : 'var(--text-danger)', fontWeight: 'bold' }}>
            {cardsDelta >= 0 ? 'опережение' : 'отставание'} на {Math.abs(cardsDelta)} карт.
          </span>
        </div>

        {summaryStats && Object.keys(summaryStats.by_category).length > 0 && (
          <div style={{ marginTop: '18px' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '8px' }}>
              Время по колодам
            </div>
            {Object.entries(summaryStats.by_category)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, mins]) => {
                const max = Math.max(...Object.values(summaryStats.by_category));
                return (
                  <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                    <span style={{ width: '64px', fontSize: '0.8rem', color: 'var(--text-primary)' }}>{langLabel(cat)}</span>
                    <div style={{ flex: 1, height: '14px', background: 'var(--bg-muted)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${(mins / max) * 100}%`, height: '100%', background: 'var(--accent)' }} />
                    </div>
                    <span style={{ width: '70px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{mins} мин</span>
                  </div>
                );
              })}
          </div>
        )}
      </Panel>

      {/* ───── Активность ───── */}
      <SectionHeading title="Активность" hint="Ритм, серии и календарь" />
      <Panel title="Серия и нагрузка">
        <div style={tileRow}>
          {streak && tile(
            'Стрик',
            String(streak.current_streak),
            `лучший: ${streak.best_streak} · всего дней: ${streak.total_active_days}`,
            streak.current_streak > 0 ? 'var(--text-success)' : 'var(--text-danger)',
          )}
          {activity && tile(
            'Дней >2ч',
            String(activity.hour2_days),
            'из 365 дней',
            activity.hour2_days > 0 ? 'var(--text-success)' : undefined,
          )}
          {activity && tile(
            'Активных дней',
            String(activity.active_days),
            `из ${activity.days} дней окна`,
          )}
          {tile(
            'Средняя нагрузка',
            `${barAvg.toFixed(1)}`,
            `карт/день за ${barDays} дней`,
          )}
        </div>
      </Panel>

      <Panel
        title="Календарь активности"
        description="Ровно год — 365 дней. Тёмнее — больше карточек за день. Колонка — неделя (Пн сверху … Вс снизу)."
      >
        <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
          <div style={{ display: 'flex', gap: '3px', minWidth: 'min-content' }}>
            {calendar.map((week, wi) => (
              <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {week.map((day, di) => (
                  <div
                    key={di}
                    title={day.date ? `${day.date}: ${day.cards} карт.` : ''}
                    style={{
                      width: '13px',
                      height: '13px',
                      borderRadius: '2px',
                      background: heatLevel(day.cards),
                      border: day.date === today ? '1px solid var(--text-primary)' : '1px solid var(--border-light)',
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
          <span>меньше</span>
          {['var(--bg-muted)', '#d4ead4', '#a8d8a8', '#7fc47f', 'var(--text-success)'].map((c) => (
            <span key={c} style={{ width: '11px', height: '11px', borderRadius: '2px', background: c, border: '1px solid var(--border-light)', display: 'inline-block' }} />
          ))}
          <span>больше (максимум {maxCards})</span>
        </div>
      </Panel>

      {daily.length > 0 && (
        <Panel
          title="Карточек в день"
          description={`Средняя за период: ${barAvg.toFixed(1)} карт/день. Всего ${barsTotal} за последние ${barDays} дней.`}
        >
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            {[30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setBarDays(d)}
                style={{
                  padding: '4px 12px',
                  fontSize: '0.8rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  minHeight: '32px',
                  border: '2px solid var(--border-primary)',
                  background: barDays === d ? 'var(--text-primary)' : 'var(--bg-primary)',
                  color: barDays === d ? 'var(--bg-primary)' : 'var(--text-primary)',
                }}
              >
                {d} дней
              </button>
            ))}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: barDays > 60 ? '1px' : '3px',
            height: '110px',
            borderBottom: '1px solid var(--border-primary)',
            overflow: 'hidden',
          }}>
            {bars.map((b) => (
              <div
                key={b.date}
                title={`${b.date}: ${b.cards} карт., ${b.minutes} мин`}
                style={{
                  flex: '1 1 0',
                  minWidth: '2px',
                  height: `${Math.max(b.cards > 0 ? 3 : 0, (b.cards / barMax) * 100)}%`,
                  background: b.cards > 0 ? 'var(--accent)' : 'transparent',
                  borderTop: b.cards > barAvg && b.cards > 0 ? '2px solid var(--text-success)' : 'none',
                  borderBottom: b.cards === 0 ? '2px solid var(--border-light)' : 'none',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            <span>{bars[0]?.date}</span>
            <span>{bars[bars.length - 1]?.date}</span>
          </div>
        </Panel>
      )}

      {/* ───── Приток слов и учёба ───── */}
      {flow && (
        <>
          <SectionHeading title="Слова" hint="Добавление против изучения" />
          <Panel
            title="Приток слов и учёба"
            description="Сколько слов добавлено и сколько впервые повторено. Сравнение с прошлой неделей — на тот же день недели, чтобы неполная текущая неделя не проигрывала целой прошлой."
          >
            <div style={tileRow}>
              {tile(
                'Добавлено',
                String(thisAdded),
                `на этот день прошлой недели: ${prevAdded} (${signed(thisAdded - prevAdded)})`,
              )}
              {tile(
                'Впервые повторено',
                String(thisFirst),
                `на этот день прошлой недели: ${prevFirst} (${signed(thisFirst - prevFirst)})`,
                thisFirst >= prevFirst ? 'var(--text-success)' : undefined,
              )}
              {tile(
                'Закреплено 4+',
                String(thisFour),
                `на этот день прошлой недели: ${prevFour} (${signed(thisFour - prevFour)})`,
              )}
              {tile(
                'Не начато',
                String(flow.untouched_total),
                `${backlogPct}% колоды · за неделю ${signed(backlogDelta)}`,
                backlogDelta > 0
                  ? 'var(--text-danger)'
                  : backlogDelta < 0
                    ? 'var(--text-success)'
                    : undefined,
              )}
            </div>

            <div style={{
              marginTop: '12px',
              padding: '10px 12px',
              borderLeft: `3px solid ${flowTone}`,
              background: 'var(--bg-muted)',
              borderRadius: '4px',
              fontSize: '0.85rem',
              fontWeight: 'bold',
              color: flowTone,
            }}>
              {flowVerdict}
            </div>
            <div style={{ marginTop: '8px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Прошлая неделя целиком: добавлено {words(prevFullAdded)}, впервые
              повторено {words(prevFullFirst)}. Текущая неделя — {thisFlow.length}
              {' '}{plural(thisFlow.length, 'день', 'дня', 'дней')} с понедельника.
            </div>

            <div style={{ marginTop: '20px', fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
              Последние 8 недель
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '3px 0 8px' }}>
              <span>
                <span style={{ display: 'inline-block', width: '10px', height: '10px', background: 'var(--accent)', marginRight: '4px' }} />
                добавлено слов
              </span>
              <span>
                <span style={{ display: 'inline-block', width: '10px', height: '10px', background: 'var(--text-success)', marginRight: '4px' }} />
                впервые повторено
              </span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <div style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-end',
                height: '130px',
                minWidth: '420px',
                borderBottom: '1px solid var(--border-primary)',
                paddingBottom: '2px',
              }}>
                {flowWeeks.map((w) => (
                  <div
                    key={w.start}
                    title={`${w.start}: добавлено ${w.added}, впервые повторено ${w.first}, повторений ${w.reviews}`}
                    style={{ flex: '1 1 0', minWidth: '36px', height: '100%' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '100%' }}>
                      <div style={{
                        flex: 1,
                        height: `${(w.added / flowMax) * 100}%`,
                        minHeight: w.added > 0 ? '2px' : 0,
                        background: 'var(--accent)',
                      }} />
                      <div style={{
                        flex: 1,
                        height: `${(w.first / flowMax) * 100}%`,
                        minHeight: w.first > 0 ? '2px' : 0,
                        background: 'var(--text-success)',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '10px', minWidth: '420px' }}>
                {flowWeeks.map((w) => (
                  <div key={w.start} style={{
                    flex: '1 1 0',
                    minWidth: '36px',
                    textAlign: 'center',
                    fontSize: '0.62rem',
                    color: w.start === mondayIso ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontWeight: w.start === mondayIso ? 'bold' : 'normal',
                  }}>
                    {dayFmt(w.start)}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Текущая неделя неполная и выделена жирным. Всего повторений за неделю: {thisReviews} (на этот день прошлой — {prevReviews}).
            </div>
          </Panel>
        </>
      )}

      {/* ───── Зрелость каждой колоды — внизу страницы ───── */}
      {maturity && maturityLanguages.length > 0 && (
        <>
          <SectionHeading
            title="Зрелость колод"
            hint={`повторялось хотя бы раз: ${totalTouched} из ${maturity.totals.total} (${totalTouchedPct}%)`}
          />
          {maturityLanguages.map((lang) => {
            const bucket = maturity.by_language[lang];
            const trend = trends[lang];
            const first = trend?.series[0];
            const last = trend?.series[trend.series.length - 1];
            return (
              <Panel key={lang} title={langLabel(lang)} meta={`${bucket.total} слов`}>
                <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '6px' }}>
                  Сейчас
                </div>
                <CompositionBar bucket={bucket} />
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
                  gap: '8px',
                  marginTop: '8px',
                }}>
                  {(['new', 'once', 'few', 'many'] as const).map((k) => (
                    <div key={k} style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      <span style={{
                        display: 'inline-block',
                        width: '9px',
                        height: '9px',
                        background: MATURITY_COLORS[k],
                        marginRight: '5px',
                        borderRadius: '2px',
                        border: '1px solid var(--border-light)',
                      }} />
                      {MATURITY_LABELS[k]}: <strong style={{ color: 'var(--text-primary)' }}>{bucket[k]}</strong>
                      {' · '}{Math.round((bucket[k] / Math.max(1, bucket.total)) * 100)}%
                    </div>
                  ))}
                </div>

                {trend && trend.series.length > 1 && first && last && (
                  <div style={{ marginTop: '20px' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '2px' }}>
                      Состав за {trend.days} дней
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      Доля слов на каждом уровне от размера колоды на ту дату. Если
                      серая зона не сужается, добавление слов опережает учёбу.
                    </div>
                    <MaturityChart series={trend.series} />

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                      {([
                        ['не повторялось', first.new_pct, last.new_pct, MATURITY_COLORS.new, true],
                        ['1 раз', first.once_pct, last.once_pct, MATURITY_COLORS.once, false],
                        ['2–3 раза', first.few_band_pct, last.few_band_pct, MATURITY_COLORS.few, false],
                        ['4+ раз', first.many_pct, last.many_pct, MATURITY_COLORS.many, false],
                      ] as const).map(([label, fromPct, toPct, color, goodWhenDown]) => {
                        const delta = ppDelta(fromPct, toPct);
                        const good = goodWhenDown ? delta.value <= 0 : delta.value >= 0;
                        return (
                          <span key={label} style={{
                            fontSize: '0.72rem',
                            padding: '4px 9px',
                            borderRadius: '999px',
                            border: '1px solid var(--border-light)',
                            background: 'var(--bg-muted)',
                            color: 'var(--text-secondary)',
                          }}>
                            <span style={{
                              display: 'inline-block',
                              width: '8px',
                              height: '8px',
                              background: color,
                              borderRadius: '2px',
                              marginRight: '5px',
                            }} />
                            {label}{' '}
                            <strong style={{ color: good ? 'var(--text-success)' : 'var(--text-danger)' }}>
                              {delta.text}
                            </strong>
                          </span>
                        );
                      })}
                    </div>

                    <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Колода: {first.total} → {last.total} слов
                      {' '}({signed(last.total - first.total)}).
                      {' '}Доля хотя бы одного повтора: {first.touched_pct}% → {last.touched_pct}%.
                    </div>
                  </div>
                )}
              </Panel>
            );
          })}
        </>
      )}
    </div>
  );
}

// Inline SVG stacked-area chart: deck composition over time, in percent of the
// deck that existed on each date. Bands sum to 100%.
function MaturityChart({ series }: { series: MaturityTrendPoint[] }) {
  const W = 680, H = 190, PADL = 34, PADR = 8, PADT = 10, PADB = 18;
  const innerW = W - PADL - PADR;
  const innerH = H - PADT - PADB;
  const stepX = innerW / Math.max(1, series.length - 1);
  const x = (i: number) => PADL + i * stepX;
  const y = (pct: number) => PADT + innerH - (pct / 100) * innerH;

  type PctKey = 'new_pct' | 'once_pct' | 'few_band_pct' | 'many_pct';
  const BANDS: { pct: PctKey; color: string; label: string }[] = [
    { pct: 'new_pct', color: MATURITY_COLORS.new, label: 'не повторялось' },
    { pct: 'once_pct', color: MATURITY_COLORS.once, label: '1 раз' },
    { pct: 'few_band_pct', color: MATURITY_COLORS.few, label: '2–3 раза' },
    { pct: 'many_pct', color: MATURITY_COLORS.many, label: '4+ раза' },
  ];

  const stacks: { color: string; label: string; d: string }[] = [];
  let lower = series.map(() => 0);
  for (const band of BANDS) {
    const upper = series.map((p, i) => lower[i] + p[band.pct]);
    const top = series.map((_, i) => `${x(i)},${y(upper[i])}`).join(' L ');
    const bottom = series.map((_, i) => `${x(i)},${y(lower[i])}`).reverse().join(' L ');
    stacks.push({ color: band.color, label: band.label, d: `M ${top} L ${bottom} Z` });
    lower = upper;
  }

  const ticks = [0, 25, 50, 75, 100];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block', maxWidth: `${W}px` }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PADL} y1={y(t)} x2={W - PADR} y2={y(t)} stroke="var(--border-light)" strokeDasharray="3 3" />
            <text x={PADL - 4} y={y(t) + 3} fontSize={9} fill="var(--text-secondary)" textAnchor="end">{t}%</text>
          </g>
        ))}
        {stacks.map((s) => (
          <path key={s.label} d={s.d} fill={s.color}>
            <title>{s.label}</title>
          </path>
        ))}
        {series.map((p, i) => (
          <rect
            key={p.date}
            x={x(i) - stepX / 2}
            y={PADT}
            width={stepX}
            height={innerH}
            fill="transparent"
          >
            <title>
              {`${p.date}\nКолода: ${p.total}\nне повторялось: ${p.new} (${p.new_pct}%)\n1 раз: ${p.once} (${p.once_pct}%)\n2–3 раза: ${p.few_band} (${p.few_band_pct}%)\n4+ раз: ${p.many} (${p.many_pct}%)`}
            </title>
          </rect>
        ))}
        <text x={PADL} y={H - 3} fontSize={9} fill="var(--text-secondary)">{series[0]?.date.slice(5)}</text>
        <text x={W - PADR} y={H - 3} fontSize={9} fill="var(--text-secondary)" textAnchor="end">{series[series.length - 1]?.date.slice(5)}</text>
      </svg>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
        {BANDS.map((b) => (
          <span key={b.label}>
            <span style={{ display: 'inline-block', width: '10px', height: '10px', background: b.color, marginRight: '4px', border: '1px solid var(--border-light)' }} />
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}
