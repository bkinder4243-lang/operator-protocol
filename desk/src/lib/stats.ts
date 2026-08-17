import type { Trade, Settings } from '../types';
import { netPnl, rMultiple, cmpClose } from './pnl';

export interface Stats {
  n: number; net: number; curve: number[];
  wins: number; losses: number; winRate: number;
  profitFactor: number; expectancy: number;
  avgWin: number; avgLoss: number; payoff: number;
  avgR: number; totalR: number;
  maxDD: number; best: number; worst: number;
  streak: number; bestWinStreak: number; worstLossStreak: number;
  breakevenWR: number;
}

export function stats(list: Trade[], s: Settings): Stats {
  const closed = list.filter(t => t.status === 'closed');
  const n = closed.length;
  const pnls = closed.map(t => netPnl(t, s));
  const wins = pnls.filter(p => p > 0);
  const losses = pnls.filter(p => p < 0);
  const sumWin = wins.reduce((a, b) => a + b, 0);
  const sumLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const net = pnls.reduce((a, b) => a + b, 0);
  const rs = closed.map(t => rMultiple(t, s)).filter((r): r is number => r !== null);

  const seq = [...closed].sort(cmpClose);
  let cum = 0, peak = 0, maxDD = 0;
  const curve: number[] = [];
  for (const t of seq) {
    cum += netPnl(t, s);
    curve.push(cum);
    if (cum > peak) peak = cum;
    if (peak - cum > maxDD) maxDD = peak - cum;
  }
  let streak = 0, bestWin = 0, worstLoss = 0;
  for (const t of seq) {
    const p = netPnl(t, s);
    if (p > 0) streak = streak > 0 ? streak + 1 : 1;
    else if (p < 0) streak = streak < 0 ? streak - 1 : -1;
    bestWin = Math.max(bestWin, streak);
    worstLoss = Math.min(worstLoss, streak);
  }
  const avgWin = wins.length ? sumWin / wins.length : 0;
  const avgLoss = losses.length ? sumLoss / losses.length : 0;
  const payoff = avgLoss > 0 && avgWin > 0 ? avgWin / avgLoss : 0;

  return {
    n, net, curve,
    wins: wins.length, losses: losses.length,
    winRate: n ? wins.length / n * 100 : 0,
    profitFactor: sumLoss > 0 ? sumWin / sumLoss : (sumWin > 0 ? Infinity : 0),
    expectancy: n ? net / n : 0,
    avgWin, avgLoss, payoff,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0,
    totalR: rs.reduce((a, b) => a + b, 0),
    maxDD,
    best: n ? Math.max(...pnls) : 0,
    worst: n ? Math.min(...pnls) : 0,
    streak, bestWinStreak: bestWin, worstLossStreak: worstLoss,
    breakevenWR: payoff > 0 ? 100 / (1 + payoff) : 0,
  };
}

/** Net P&L per calendar day, keyed by the day the position CLOSED. */
export function dailyPnl(list: Trade[], s: Settings): Record<string, number> {
  const m: Record<string, number> = {};
  for (const t of list) {
    if (t.status !== 'closed') continue;
    const k = t.exitDate ?? t.date;
    m[k] = (m[k] ?? 0) + netPnl(t, s);
  }
  return m;
}
export function groupBy<T>(list: T[], fn: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const t of list) {
    const k = fn(t);
    const arr = m.get(k);
    if (arr) arr.push(t); else m.set(k, [t]);
  }
  return m;
}
export function inRange(list: Trade[], range: '7d' | '30d' | '90d' | 'all'): Trade[] {
  if (range === 'all') return list;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const cut = new Date();
  cut.setDate(cut.getDate() - days);
  const cutKey = `${cut.getFullYear()}-${String(cut.getMonth() + 1).padStart(2, '0')}-${String(cut.getDate()).padStart(2, '0')}`;
  return list.filter(t => (t.exitDate ?? t.date) >= cutKey);
}
