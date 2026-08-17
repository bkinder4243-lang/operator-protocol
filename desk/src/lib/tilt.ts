import type { Trade, Settings, DayRecord } from '../types';
import { netPnl, num, cmpOpen, cmpClose, isDayTrade } from './pnl';
import { hhmmToMin, todayKey, businessWindow } from './date';

export interface TiltFlag { sev: 'red' | 'warn'; msg: string }
export interface TiltReport {
  level: 'green' | 'amber' | 'red';
  flags: TiltFlag[];
  dayPnl: number;
  count: number;
  lossLimit: number;
  streak: number;
}

/** Pure read of state. The desk never blocks a trade — it refuses to let
 *  you pretend you did not know. */
export function tiltReport(trades: Trade[], s: Settings, day: DayRecord | undefined): TiltReport {
  const k = todayKey();
  const today = trades.filter(t => (t.exitDate ?? t.date) === k);
  const closedToday = today.filter(t => t.status === 'closed').sort(cmpClose);
  const dayPnl = closedToday.reduce((a, t) => a + netPnl(t, s), 0);
  const lossLimit = num(s.accountSize) * num(s.dailyLossLimit) / 100;
  const flags: TiltFlag[] = [];

  let streak = 0;
  for (let i = closedToday.length - 1; i >= 0; i--) {
    if (netPnl(closedToday[i]!, s) < 0) streak++; else break;
  }
  if (streak >= 3) flags.push({ sev: 'red', msg: `${streak} losses in a row. That is your signal to stand down, not to size up.` });
  else if (streak === 2) flags.push({ sev: 'warn', msg: 'Two straight losses. The next one is the tilt trade.' });

  if (lossLimit > 0 && dayPnl <= -lossLimit)
    flags.push({ sev: 'red', msg: `Daily stop hit. The desk is closed — log it and walk.` });
  else if (lossLimit > 0 && dayPnl <= -lossLimit * 0.6)
    flags.push({ sev: 'warn', msg: `${Math.round(Math.abs(dayPnl) / lossLimit * 100)}% of your daily stop is gone.` });

  const maxT = num(s.maxTradesPerDay);
  if (maxT > 0 && today.length > maxT)
    flags.push({ sev: 'red', msg: `${today.length} trades today, limit is ${maxT}. Volume is not edge.` });
  else if (maxT > 0 && today.length === maxT)
    flags.push({ sev: 'warn', msg: `At your ${maxT}-trade limit for today.` });

  const revenge = revengeTrades(today, s);
  if (revenge.length)
    flags.push({ sev: 'red', msg: `${revenge.length} revenge entr${revenge.length > 1 ? 'ies' : 'y'} — you re-entered within 5 minutes of a loss.` });

  if (sizeEscalation(closedToday, s))
    flags.push({ sev: 'warn', msg: 'You doubled size right after a loss. That is the most expensive trade you take.' });

  const checks = day?.checks ?? {};
  const undone = s.checklist.filter((_, i) => !checks[i]).length;
  if (today.length > 0 && undone > 0)
    flags.push({ sev: 'warn', msg: `Traded with ${undone} checklist item${undone > 1 ? 's' : ''} unticked.` });

  const level = flags.some(f => f.sev === 'red') ? 'red' : flags.length ? 'amber' : 'green';
  return { level, flags, dayPnl, count: today.length, lossLimit, streak };
}

export function revengeTrades(today: Trade[], _s: Settings): Trade[] {
  const seq = [...today].sort(cmpOpen);
  const out: Trade[] = [];
  for (let i = 1; i < seq.length; i++) {
    const prev = seq[i - 1]!, cur = seq[i]!;
    if (prev.status !== 'closed' || netPnl(prev, _s) >= 0) continue;
    const a = hhmmToMin(prev.exitTime), b = hhmmToMin(cur.time);
    if (a === null || b === null) continue;
    if (b - a >= 0 && b - a <= 5) out.push(cur);
  }
  return out;
}
export function sizeEscalation(closedToday: Trade[], s: Settings): boolean {
  for (let i = 1; i < closedToday.length; i++) {
    const prev = closedToday[i - 1]!, cur = closedToday[i]!;
    if (netPnl(prev, s) < 0 && num(prev.qty) > 0 && num(cur.qty) >= num(prev.qty) * 2) return true;
  }
  return false;
}
/** FINRA counts 4+ day trades in 5 rolling business days on a margin
 *  account under $25k. Fidelity enforces it, so we count it. */
export function pdtCount(trades: Trade[]): number {
  const win = new Set(businessWindow(5));
  return trades.filter(t => isDayTrade(t) && win.has(t.date)).length;
}
