import { Fragment, useState, useEffect } from 'react';
import {
  getDailyStats, getSummaryStats, getActivityStats, getStreakStats,
  getMaturityStats, getMaturityTrend,
} from '../services/api';
import type { CSSProperties } from 'react';
import type { ActivityStats, StreakStats, MaturityBucket } from '../services/api';

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
  const [trend, setTrend] = useState<{ days: number; total_cards: number; series: { date: string; repeated: number; new: number }[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const [daily, summary, act, str, mat, tr] = await Promise.all([
        getDailyStats(),
        getSummaryStats(7),
        getActivityStats(365),
        getStreakStats(),
        getMaturityStats(),
        getMaturityTrend(14),
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

  return (
    <div>
      <h2 style={{ marginBottom: '20px', color: 'var(--text-primary)' }}>Statistics</h2>

      {/* ───── KPI tiles (numbers live only here) ───── */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {streak && tile(
          'Стрик',
          String(streak.current_streak),
          `лучший: ${streak.best_streak} · всего дней: ${streak.total_active_days}`,
          streak.current_streak > 0 ? 'var(--text-success)' : 'var(--text-danger)',
        )}
        {dailyStats && tile('Сегодня карточек', String(dailyStats.card_count), `${dailyStats.total_minutes} мин`)}
        {summaryStats && tile(
          'Итог за неделю',
          String(summaryStats.total_cards),
          `Пн ${dayFmt(mondayIso)} – Вс ${dayFmt(sundayIso)} · ${humanDuration(weekSeconds)}`,
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
            По фактическому числу повторений. Полоса — текущий срез, линия ниже — как менялось число
            «повторялось хотя бы раз» за 14 дней.
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
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Динамика за 14 дней: всего {trend?.total_cards} слов, повторялось{' '}
                {trendSeries[0].repeated} → <span style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}>{trendSeries[trendSeries.length - 1].repeated}</span>
                {' '}({trendSeries[trendSeries.length - 1].repeated - trendSeries[0].repeated >= 0 ? '+' : ''}
                {trendSeries[trendSeries.length - 1].repeated - trendSeries[0].repeated})
              </div>
              <TrendChart series={trendSeries} />
            </div>
          )}

          <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Всего повторялось хотя бы раз: {maturity.totals.total - maturity.totals.new} из {maturity.totals.total}
            {' '}({Math.round(((maturity.totals.total - maturity.totals.new) / maturity.totals.total) * 100)}%)
          </div>
        </div>
      )}

      {/* ───── Period summary (no numbers repeated from the tiles) ───── */}
      {summaryStats && (
        <div style={panel}>
          <h3 style={panelTitle}>Итого за неделю (Пн–Вс)</h3>
          <p style={hint}>
            {dayFmt(mondayIso)} – {dayFmt(sundayIso)} · {weekDays.length} дней в неделе
          </p>
          {Object.keys(summaryStats.by_category).length > 0 && (
            <div>
              <div style={{ color: 'var(--text-secondary)', marginBottom: '6px', fontSize: '0.85rem' }}>По колодам (время):</div>
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
          )}
        </div>
      )}

      {/* ───── Today: time breakdown only (card counts are in the tiles above) ───── */}
      {dailyStats && (
        <div style={panel}>
          <h3 style={panelTitle}>Сегодня ({dailyStats.date})</h3>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
      }}>
        Refresh
      </button>
    </div>
  );
}

// Inline SVG line chart: repeated words over the trend window.
function TrendChart({ series }: { series: { date: string; repeated: number; new: number }[] }) {
  const W = 620, H = 90, PAD = 6;
  const vals = series.map((p) => p.repeated);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const stepX = (W - PAD * 2) / Math.max(1, series.length - 1);
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const pts = series.map((p, i) => `${PAD + i * stepX},${y(p.repeated)}`).join(' ');
  const area = `${PAD},${H - PAD} ${pts} ${PAD + (series.length - 1) * stepX},${H - PAD}`;
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={W} height={H} style={{ display: 'block', minWidth: '420px' }}>
        <polygon points={area} fill="var(--accent)" opacity={0.15} />
        <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={2} />
        {series.map((p, i) => (
          <circle key={p.date} cx={PAD + i * stepX} cy={y(p.repeated)} r={2.5} fill="var(--accent)">
            <title>{`${p.date}: повторялось ${p.repeated} · новых ${p.new}`}</title>
          </circle>
        ))}
        <text x={PAD} y={H - 1} fontSize={9} fill="var(--text-secondary)">{series[0]?.date.slice(5)}</text>
        <text x={W - PAD} y={H - 1} fontSize={9} fill="var(--text-secondary)" textAnchor="end">{series[series.length - 1]?.date.slice(5)}</text>
      </svg>
    </div>
  );
}