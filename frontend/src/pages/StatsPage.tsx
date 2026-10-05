import { Fragment, useState, useEffect } from 'react';
import {
  getDailyStats, getSummaryStats, getActivityStats, getStreakStats,
  getMaturityStats, getForecast,
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

export function StatsPage() {
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
  const [summaryStats, setSummaryStats] = useState<SummaryStats | null>(null);
  const [activity, setActivity] = useState<ActivityStats | null>(null);
  const [streak, setStreak] = useState<StreakStats | null>(null);
  const [maturity, setMaturity] = useState<{ by_language: Record<string, MaturityBucket>; totals: MaturityBucket } | null>(null);
  const [forecast, setForecast] = useState<Awaited<ReturnType<typeof getForecast>> | null>(null);
  const [barDays, setBarDays] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const [daily, summary, act, str, mat, fc] = await Promise.all([
        getDailyStats(),
        getSummaryStats(30),
        getActivityStats(105),
        getStreakStats(),
        getMaturityStats(),
        getForecast(14),
      ]);
      setDailyStats(daily);
      setSummaryStats(summary);
      setActivity(act);
      setStreak(str);
      setMaturity(mat);
      setForecast(fc);
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

  // Heatmap: pad the window to whole weeks (Mon-first)
  const heatWeeks: { date: string; cards: number }[][] = [];
  if (daily.length) {
    const firstDow = (new Date(daily[0].date + 'T00:00:00').getDay() + 6) % 7; // Mon=0
    let week: { date: string; cards: number }[] = Array(firstDow).fill(null).map(() => ({ date: '', cards: -1 }));
    daily.forEach((d) => {
      week.push({ date: d.date, cards: d.cards });
      if (week.length === 7) { heatWeeks.push(week); week = []; }
    });
    if (week.length) {
      while (week.length < 7) week.push({ date: '', cards: -1 });
      heatWeeks.push(week);
    }
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

  // Cards-per-day bars
  const bars = daily.slice(-barDays);
  const barMax = Math.max(1, ...bars.map((b) => b.cards));
  const barAvg = bars.length ? bars.reduce((s, b) => s + b.cards, 0) / bars.length : 0;

  // Forecast bars
  const fcMax = Math.max(1, ...(forecast?.forecast || []).map((f) => f.total));

  const last14Cards = daily.slice(-14).reduce((s, d) => s + d.cards, 0);

  return (
    <div>
      <h2 style={{ marginBottom: '20px', color: 'var(--text-primary)' }}>Statistics</h2>

      {/* ───── KPI tiles ───── */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {streak && tile(
          'Стрик',
          String(streak.current_streak),
          `лучший: ${streak.best_streak} · всего дней: ${streak.total_active_days}`,
          streak.current_streak > 0 ? 'var(--text-success)' : 'var(--text-danger)',
        )}
        {dailyStats && tile('Сегодня карточек', String(dailyStats.card_count), `${dailyStats.total_minutes} мин`)}
        {streak && tile(
          'Дней без повторения',
          streak.days_since_last_review === 0 ? '0' : String(streak.days_since_last_review),
          streak.last_review_date ? `последний: ${streak.last_review_date}` : 'ещё ни разу',
          (streak.days_since_last_review ?? 99) > 2 ? 'var(--text-danger)' : undefined,
        )}
        {summaryStats && tile('Карточек за 30 дней', String(summaryStats.total_cards), `${summaryStats.active_days} активных дней`)}
      </div>

      {/* ───── Calendar heatmap ───── */}
      <div style={panel}>
        <h3 style={panelTitle}>Календарь активности</h3>
        <p style={hint}>15 недель. Тёмнее — больше карточек за день.</p>
        <div style={{ overflowX: 'auto', paddingBottom: '4px' }}>
          <div style={{ display: 'flex', gap: '3px', minWidth: 'min-content' }}>
            {heatWeeks.map((week, wi) => (
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

      {/* ───── Cards per day ───── */}
      <div style={panel}>
        <h3 style={panelTitle}>Карточек в день</h3>
        <p style={hint}>Средняя за период: {barAvg.toFixed(1)} карт/день. Всего {last14Cards} за последние 14 дней.</p>
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
                border: `2px solid var(--border-primary)`,
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
          <span>сегодня</span>
        </div>
      </div>

      {/* ───── Forecast ───── */}
      {forecast && (
        <div style={panel}>
          <h3 style={panelTitle}>Нагрузка на {forecast.days} дней</h3>
          <p style={hint}>
            Сколько слов «пора повторять» в каждый день. Считаются только уже повторявшиеся слова —
            у новых слов нет даты повторения.
          </p>
          {forecast.overdue_total > 0 && (
            <div style={{
              padding: '8px 10px',
              marginBottom: '12px',
              background: 'var(--bg-danger)',
              color: 'var(--text-danger)',
              borderRadius: '4px',
              fontSize: '0.85rem',
              fontWeight: 'bold',
            }}>
              🔁 Уже просрочено: {forecast.overdue_total} (прямых {forecast.overdue_normal}, обратных {forecast.overdue_reverse})
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '90px', borderBottom: '1px solid var(--border-primary)' }}>
            {forecast.forecast.map((f) => (
              <div
                key={f.date}
                title={`${f.date}: ${f.total} (прямых ${f.normal}, обратных ${f.reverse})`}
                style={{ flex: '1 1 0', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}
              >
                <div style={{ height: `${(f.reverse / fcMax) * 100}%`, background: 'var(--text-danger)', minHeight: f.reverse > 0 ? '2px' : 0 }} />
                <div style={{ height: `${(f.normal / fcMax) * 100}%`, background: 'var(--accent)', minHeight: f.normal > 0 ? '2px' : 0 }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            <span>сегодня</span>
            <span>через {forecast.days} дн.</span>
          </div>
          <div style={{ display: 'flex', gap: '12px', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
            <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: 'var(--accent)', marginRight: '4px' }} />прямые</span>
            <span><span style={{ display: 'inline-block', width: '10px', height: '10px', background: 'var(--text-danger)', marginRight: '4px' }} />обратные</span>
            {forecast.peak_total > 0 && <span>пик: {forecast.peak_total} слов {forecast.peak_day}</span>}
          </div>
        </div>
      )}

      {/* ───── Maturity ───── */}
      {maturity && (
        <div style={panel}>
          <h3 style={panelTitle}>Зрелость колоды</h3>
          <p style={hint}>
            По фактическому числу повторений, а не по FSRS stability — она завышена импортом
            (у слов «стабильность» доходила до 3000+ дней).
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
          <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Всего повторялось хотя бы раз: {maturity.totals.total - maturity.totals.new} из {maturity.totals.total}
            {' '}({Math.round(((maturity.totals.total - maturity.totals.new) / maturity.totals.total) * 100)}%)
          </div>
        </div>
      )}

      {/* ───── Period summary ───── */}
      {summaryStats && (
        <div style={panel}>
          <h3 style={panelTitle}>Итого за {summaryStats.period_days} дней</h3>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
            {tile('Время', `${summaryStats.total_minutes} мин`, `в среднем ${summaryStats.avg_per_day} мин/день`)}
            {tile('Карточек', String(summaryStats.total_cards), `${summaryStats.active_days} активных дней`)}
            {maturity && tile('Новых слов', String(maturity.totals.new), `из ${maturity.totals.total} — ещё не повторялись`)}
          </div>
          {Object.keys(summaryStats.by_category).length > 0 && (
            <div>
              <div style={{ color: 'var(--text-secondary)', marginBottom: '6px', fontSize: '0.85rem' }}>По колодам:</div>
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

      {/* ───── Today ───── */}
      {dailyStats && (
        <div style={panel}>
          <h3 style={panelTitle}>Сегодня ({dailyStats.date})</h3>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {tile('Карточек', String(dailyStats.card_count))}
            {tile('Время', `${dailyStats.total_minutes} мин`, `${dailyStats.total_seconds} сек`)}
            {Object.entries(dailyStats.cards_by_category).map(([cat, n]) => (
              <Fragment key={cat}>
                {tile(cat === 'sk' ? 'Slovak' : cat === 'en' ? 'English' : cat, String(n),
                  `${dailyStats.by_category[cat] ?? 0} мин`)}
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