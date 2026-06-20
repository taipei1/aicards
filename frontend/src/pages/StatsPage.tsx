import { useState, useEffect } from 'react';
import { getDailyStats, getSummaryStats } from '../services/api';

interface DailyStats {
  date: string;
  total_minutes: number;
  by_category: Record<string, number>;
}

interface SummaryStats {
  period_days: number;
  total_minutes: number;
  avg_per_day: number;
  by_module: Record<string, number>;
  by_category: Record<string, number>;
}

export function StatsPage() {
  const [dailyStats, setDailyStats] = useState<DailyStats | null>(null);
  const [summaryStats, setSummaryStats] = useState<SummaryStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const [daily, summary] = await Promise.all([
        getDailyStats(),
        getSummaryStats(30),
      ]);
      setDailyStats(daily);
      setSummaryStats(summary);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
    setLoading(false);
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading...</div>;
  }

  return (
    <div>
      <h2 style={{ marginBottom: '24px', color: 'var(--text-primary)' }}>Statistics</h2>

      {dailyStats && (
        <div style={{
          border: '2px solid var(--border-primary)',
          padding: '20px',
          marginBottom: '24px',
          background: 'var(--bg-primary)',
        }}>
          <h3 style={{ marginBottom: '16px', color: 'var(--text-primary)' }}>Today</h3>
          <div style={{
            fontSize: '2rem',
            fontWeight: 'bold',
            marginBottom: '12px',
            color: 'var(--text-primary)',
          }}>
            {dailyStats.total_minutes} min
          </div>
          {Object.keys(dailyStats.by_category).length > 0 && (
            <div>
              <div style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>By category:</div>
              {Object.entries(dailyStats.by_category).map(([cat, mins]) => (
                <div key={cat} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '4px 0',
                  color: 'var(--text-primary)',
                }}>
                  <span style={{ textTransform: 'capitalize' }}>{cat}</span>
                  <span>{mins} min</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {summaryStats && (
        <div style={{
          border: '2px solid var(--border-primary)',
          padding: '20px',
          background: 'var(--bg-primary)',
        }}>
          <h3 style={{ marginBottom: '16px', color: 'var(--text-primary)' }}>
            Last {summaryStats.period_days} Days
          </h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '20px',
            marginBottom: '20px',
          }}>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Total</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                {summaryStats.total_minutes} min
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Daily avg</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                {summaryStats.avg_per_day.toFixed(1)} min
              </div>
            </div>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Days tracked</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                {summaryStats.period_days}
              </div>
            </div>
          </div>

          {Object.keys(summaryStats.by_module).length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>By module:</div>
              {Object.entries(summaryStats.by_module).map(([mod, mins]) => (
                <div key={mod} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '4px 0',
                  color: 'var(--text-primary)',
                }}>
                  <span style={{ textTransform: 'capitalize' }}>{mod}</span>
                  <span>{mins} min</span>
                </div>
              ))}
            </div>
          )}

          {Object.keys(summaryStats.by_category).length > 0 && (
            <div>
              <div style={{ color: 'var(--text-secondary)', marginBottom: '8px' }}>By category:</div>
              {Object.entries(summaryStats.by_category)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 10)
                .map(([cat, mins]) => (
                  <div key={cat} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '4px 0',
                    color: 'var(--text-primary)',
                  }}>
                    <span>{cat}</span>
                    <span>{mins} min</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      <button onClick={loadStats} style={{
        border: '2px solid var(--border-primary)',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
        padding: '8px 16px',
        fontSize: '0.9rem',
        cursor: 'pointer',
        marginTop: '20px',
        borderRadius: '4px',
        fontWeight: 'bold',
        minHeight: '44px',
      }}>
        Refresh
      </button>
    </div>
  );
}
