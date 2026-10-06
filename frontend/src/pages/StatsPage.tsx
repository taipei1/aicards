import { Fragment, useState, useEffect } from 'react';
import {
  getDailyStats, getSummaryStats, getActivityStats, getStreakStats,
  getMaturityStats, getMaturityTrend,
} from '../services/api';
import type { CSSProperties } from 'react';
import type { ActivityStats, StreakStats, MaturityBucket, MaturityTrendPoint } from '../services/api';

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

const panel: CSSProperties = {
  border: '2px solid var(--border-primary)',
  padding: '16px',
  marginBottom: '16px',
  background: 'var(--bg-primary)',
};

const panelTitle: CSSProperties = {
  margin: '0 0 4px',
  fontSize: '1rem',
  fontWeight: 'bold',
  color: 'var(--text-primary)',
};

const hint: CSSProperties = {
  margin: '0 0 14px',
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
};

const MATURITY_COLORS: Record<string, string> = {
  new: 'var(--bg-muted)',
  once: '#7fb3d5',
  few: '#5dade2',
  many: 'var(--text-success)',
};

const MATURITY_LABELS: Record<string, string> = {
  new: 'не повторялось',
  once: '1 раз',
  few: '2–3 раза',
  many: '4+ раз',
};

function tile(label: string, value: string, sub?: string, color?: string) {
  return (
    <div style={{
      border: '1px solid var(--border-light)',
      borderRadius: '4px',
      padding: '10px 12px',
      background: 'var(--bg-muted)',
      flex: '1 1 120px',
      minWidth: '110px',
    }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: color || 'var(--text-primary)', lineHeight: '1.2' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{sub}</div>}
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

export function StatsPage() {
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
  const [summaryStats, setSummaryStats] = useState<SummaryStats | null>(null);
  const [activity, setActivity] = useState<ActivityStats | null>(null);
  const [streak, setStreak] = useState<StreakStats | null>(null);
  const [maturity, setMaturity] = useState<{ by_language: Record<string, MaturityBucket>; totals: MaturityBucket } | null>(null);
  const [trend, setTrend] = useState<{ days: number; total_cards: number; from: string; to: string; series: MaturityTrendPoint[] } | null>(null);
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
      const [daily, summary, act, str, mat, tr] = await Promise.all([
        getDailyStats(),
        getSummaryStats(7, { start: monIso, end: sunIso }),
        getActivityStats(365),
        getStreakStats(),
        getMaturityStats(),
        getMaturityTrend(90, 15),
      ]);
      setDailyStats(daily);
      setSummaryStats(summary);
      setActivity(act);
      setStreak(str);
      setMaturity(mat);
      setTrend(tr);
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
  const weekDays = daily.filter((d) => d.date >= mondayIso && d.date <= sundayIso);
  const weekSeconds = weekDays.reduce((s, d) => s + (d.seconds || 0), 0);
  const weekCards = weekDays.reduce((s, d) => s + d.cards, 0);

  // Trend chart scaling
  const trendSeries = trend?.series || [];

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

  const thisWeekSoFar = daily.filter((d) => d.date >= mondayIso && d.date <= today);
  const prevWeekSoFar = daily.filter((d) => d.date >= prevMondayIso && d.date <= prevCutoffIso);
  const thisWeekCards = thisWeekSoFar.reduce((s, d) => s + d.cards, 0);
  const prevWeekCards = prevWeekSoFar.reduce((s, d) => s + d.cards, 0);
  const thisWeekSecs = thisWeekSoFar.reduce((s, d) => s + (d.seconds || 0), 0);
  const prevWeekSecs = prevWeekSoFar.reduce((s, d) => s + (d.seconds || 0), 0);
  const cardsDelta = thisWeekCards - prevWeekCards;
  const cardsDeltaPct = prevWeekCards > 0 ? Math.round((cardsDelta / prevWeekCards) * 100) : null;
  const weekLabel = `Пн ${dayFmt(mondayIso)} – Вс ${dayFmt(sundayIso)}`;

  return (
    <div>
      {/* Header with Refresh in the top-right */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>Statistics</h2>
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
          Refresh
        </button>
      </div>

      {/* ───── Итог за неделю (top) ───── */}
      <div style={panel}>
        <h3 style={panelTitle}>Итог за неделю</h3>
        <p style={hint}>{weekLabel}</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {tile('Карточек', String(thisWeekCards), weekLabel)}
          {tile('Время', humanDuration(weekSeconds), `${weekDays.length} дней в неделе`)}
          {cardsDeltaPct !== null && tile(
            'К прошлой неделе',
            `${cardsDelta >= 0 ? '+' : ''}${cardsDeltaPct}%`,
            `сейчас ${thisWeekCards} · на этот день прошлой недели ${prevWeekCards}`,
            cardsDelta >= 0 ? 'var(--text-success)' : 'var(--text-danger)',
          )}
        </div>
        <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          На этот день прошлой недели: {prevWeekCards} карт. · {humanDuration(prevWeekSecs)}
          {' '}
          <span style={{
            color: cardsDelta >= 0 ? 'var(--text-success)' : 'var(--text-danger)',
            fontWeight: 'bold',
          }}>
            {cardsDelta >= 0 ? 'опережение' : 'отставание'} на {Math.abs(cardsDelta)} карт.
          </span>
        </div>
      </div>

      {/* ───── Итог за день (top) ───── */}
      {dailyStats && (
        <div style={panel}>
          <h3 style={panelTitle}>Итог за день</h3>
          <p style={hint}>{dailyStats.date}</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {tile('Карточек', String(dailyStats.card_count), `${dailyStats.total_minutes} мин`)}
            {tile('Время', `${dailyStats.total_minutes} мин`, `${dailyStats.total_seconds} сек`)}
            {Object.entries(dailyStats.by_category).map(([cat, mins]) => (
              <Fragment key={cat}>
                {tile(cat === 'sk' ? 'Slovak' : cat === 'en' ? 'English' : cat, `${mins} мин`,
                  `${dailyStats.cards_by_category[cat] ?? 0} карточек`)}
              </Fragment>
            ))}
          </div>
        </div>
      )}

      {/* ───── KPI tiles: only values NOT shown in the day/week panels above ───── */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
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
        {maturity && tile(
          'Новых слов',
          String(maturity.totals.new),
          `из ${maturity.totals.total} — ещё не повторялись`,
        )}
      </div>

      {/* ───── Day calendar: exactly a year ───── */}
      <div style={panel}>
        <h3 style={panelTitle}>Календарь активности</h3>
        <p style={hint}>Ровно год — 365 дней. Тёмнее — больше карточек за день. Колонка — неделя (Пн сверху … Вс снизу).</p>
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
      </div>

      {/* ───── Maturity in dynamics ───── */}
      {maturity && (
        <div style={panel}>
          <h3 style={panelTitle}>Зрелость колоды</h3>
          <p style={hint}>
            По фактическому числу повторений. Полосы — текущий срез по колодам,
            линии ниже — как менялась зрелость по уровням.
          </p>
          {Object.entries(maturity.by_language).map(([lang, b]) => (
            <div key={lang} style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '4px' }}>
                <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>
                  {lang === 'en' ? 'English' : lang === 'sk' ? 'Slovak' : lang}
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>{b.total} слов</span>
              </div>
              <div style={{ display: 'flex', height: '22px', borderRadius: '3px', overflow: 'hidden', border: '1px solid var(--border-light)' }}>
                {(['new', 'once', 'few', 'many'] as const).map((k) => (
                  b[k] > 0 ? (
                    <div
                      key={k}
                      title={`${MATURITY_LABELS[k]}: ${b[k]}`}
                      style={{
                        width: `${(b[k] / b.total) * 100}%`,
                        background: MATURITY_COLORS[k],
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.6rem',
                        color: k === 'new' ? 'var(--text-primary)' : '#000',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {(b[k] / b.total) > 0.06 ? b[k] : ''}
                    </div>
                  ) : null
                ))}
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
            {(['new', 'once', 'few', 'many'] as const).map((k) => (
              <span key={k}>
                <span style={{ display: 'inline-block', width: '10px', height: '10px', background: MATURITY_COLORS[k], marginRight: '4px', border: '1px solid var(--border-light)' }} />
                {MATURITY_LABELS[k]}
              </span>
            ))}
          </div>

          {trendSeries.length > 1 && (
            <div style={{ marginTop: '18px' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '2px' }}>
                Динамика зрелости за {trend?.days} дней
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                Три уровня: сколько слов из {trend?.total_cards} повторялось хотя бы раз (≥1), дважды (≥2) и 4+ раза (≥4).
              </div>
              <MaturityChart series={trendSeries} />
              {(() => {
                const last = trendSeries[trendSeries.length - 1];
                return (
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
                    {([
                      ['≥1 повтор', last.touched, last.touched_pct, MATURITY_COLORS.once],
                      ['≥2 повтора', last.few, last.few_pct, MATURITY_COLORS.few],
                      ['≥4 повторов', last.many, last.many_pct, MATURITY_COLORS.many],
                    ] as const).map(([label, n, pct, color]) => (
                      <div key={label} style={{
                        flex: '1 1 120px', minWidth: '110px', border: '1px solid var(--border-light)',
                        borderRadius: '4px', padding: '8px 10px', background: 'var(--bg-muted)',
                        borderLeft: `4px solid ${color}`,
                      }}>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{label}</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                          {pct}% <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--text-secondary)' }}>({n})</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          <div style={{ marginTop: '14px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Всего повторялось хотя бы раз: {maturity.totals.total - maturity.totals.new} из {maturity.totals.total}
            {' '}({Math.round(((maturity.totals.total - maturity.totals.new) / maturity.totals.total) * 100)}%)
          </div>
        </div>
      )}

      {/* ───── Cards per day ───── */}
      {daily.length > 0 && (
        <div style={panel}>
          <h3 style={panelTitle}>Карточек в день</h3>
          <p style={hint}>
            Средняя за период: {barAvg.toFixed(1)} карт/день. Всего {barsTotal} за последние {barDays} дней.
          </p>
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
        </div>
      )}

      {/* ───── Per-deck time breakdown (week) ───── */}
      {summaryStats && Object.keys(summaryStats.by_category).length > 0 && (
        <div style={panel}>
          <h3 style={panelTitle}>Время по колодам (за неделю)</h3>
          <p style={hint}>{weekLabel} · {weekDays.length} дней в неделе</p>
          <div>
            {Object.entries(summaryStats.by_category)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, mins]) => {
                const max = Math.max(...Object.values(summaryStats.by_category));
                return (
                  <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{ width: '60px', fontSize: '0.8rem', color: 'var(--text-primary)', textTransform: 'capitalize' }}>{cat}</span>
                    <div style={{ flex: 1, height: '14px', background: 'var(--bg-muted)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${(mins / max) * 100}%`, height: '100%', background: 'var(--accent)' }} />
                    </div>
                    <span style={{ width: '70px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{mins} мин</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

// Inline SVG multi-line chart: how many words sit at each maturity level over
// time. Three curves share one 0..max scale so their gaps are readable.
function MaturityChart({ series }: { series: MaturityTrendPoint[] }) {
  const W = 620, H = 160, PADL = 34, PADR = 8, PADT = 10, PADB = 16;
  const innerW = W - PADL - PADR;
  const innerH = H - PADT - PADB;
  const maxV = Math.max(1, ...series.map((p) => Math.max(p.touched, p.many)));
  const stepX = innerW / Math.max(1, series.length - 1);
  const x = (i: number) => PADL + i * stepX;
  const y = (v: number) => PADT + innerH - (v / maxV) * innerH;

  const line = (key: 'touched' | 'few' | 'many') =>
    series.map((p, i) => `${x(i)},${y(p[key])}`).join(' ');

  const LINES: { key: 'touched' | 'few' | 'many'; color: string; label: string }[] = [
    { key: 'touched', color: '#7fb3d5', label: '≥1 повтор' },
    { key: 'few', color: '#5dade2', label: '≥2 повтора' },
    { key: 'many', color: 'var(--text-success)', label: '≥4 повторов' },
  ];

  // 3 grid lines with value labels
  const ticks = [0, 0.5, 1].map((f) => Math.round(maxV * f));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block', maxWidth: `${W}px` }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PADL} y1={y(t)} x2={W - PADR} y2={y(t)} stroke="var(--border-light)" strokeDasharray="3 3" />
            <text x={PADL - 4} y={y(t) + 3} fontSize={9} fill="var(--text-secondary)" textAnchor="end">{t}</text>
          </g>
        ))}
        {LINES.map((l) => (
          <g key={l.key}>
            <polyline points={line(l.key)} fill="none" stroke={l.color} strokeWidth={2} />
            {series.map((p, i) => (
              <circle key={p.date} cx={x(i)} cy={y(p[l.key])} r={2.5} fill={l.color}>
                <title>{`${p.date} · ${l.label}: ${p[l.key]} (${p[`${l.key}_pct` as const]}%)`}</title>
              </circle>
            ))}
          </g>
        ))}
        <text x={PADL} y={H - 3} fontSize={9} fill="var(--text-secondary)">{series[0]?.date.slice(5)}</text>
        <text x={W - PADR} y={H - 3} fontSize={9} fill="var(--text-secondary)" textAnchor="end">{series[series.length - 1]?.date.slice(5)}</text>
      </svg>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
        {LINES.map((l) => (
          <span key={l.key}>
            <span style={{ display: 'inline-block', width: '16px', height: '3px', background: l.color, marginRight: '5px', verticalAlign: 'middle' }} />
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}