import type { Trade, Settings } from '../types';
import { STRAT, OPT_MULT } from './constants';
import { hhmmToMin, dateFromKey } from './date';

export const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const round4 = (n: number) => Math.round(n * 10000) / 10000;
export const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));

export const multOf = (t: Trade) => STRAT[t.strategy].kind === 'option' ? OPT_MULT : 1;
export const dirOf  = (t: Trade) => STRAT[t.strategy].side === 'long' ? 1 : -1;

/** Explicit fees win; otherwise model the broker's schedule.
 *  A closed trade paid commission on both legs. */
export function feesFor(t: Trade, s: Settings): number {
  if (t.fees !== null && t.fees !== undefined) return num(t.fees);
  const legs = t.status === 'closed' ? 2 : 1;
  const per = multOf(t) === OPT_MULT ? s.commPerContract : s.commPerStock;
  return num(per) * num(t.qty) * legs;
}
export function grossPnl(t: Trade): number {
  if (t.status !== 'closed' || t.exit === null) return 0;
  return (num(t.exit) - num(t.entry)) * num(t.qty) * multOf(t) * dirOf(t);
}
export function netPnl(t: Trade, s: Settings): number {
  if (t.status !== 'closed') return 0;
  return grossPnl(t) - feesFor(t, s);
}
/** Dollar risk: distance to stop when there is one, else the account's
 *  per-trade budget so R still means something. */
export function riskAmt(t: Trade, s: Settings): number {
  if (t.stop !== null && Number.isFinite(t.stop)) {
    const d = Math.abs(num(t.entry) - num(t.stop)) * num(t.qty) * multOf(t);
    if (d > 0) return d;
  }
  return num(s.accountSize) * num(s.riskPctPerTrade) / 100;
}
export function rMultiple(t: Trade, s: Settings): number | null {
  const r = riskAmt(t, s);
  if (!r || t.status !== 'closed') return null;
  return netPnl(t, s) / r;
}
export function holdMinutes(t: Trade): number | null {
  if (!t.time || !t.exitTime) return null;
  const a = hhmmToMin(t.time), b = hhmmToMin(t.exitTime);
  if (a === null || b === null) return null;
  const days = t.exitDate && t.exitDate !== t.date
    ? Math.round((dateFromKey(t.exitDate).getTime() - dateFromKey(t.date).getTime()) / 86400000)
    : 0;
  return (b - a) + days * 390; // 390 = one regular session
}
export const isDayTrade = (t: Trade) =>
  t.status === 'closed' && (t.exitDate ?? t.date) === t.date;

export const closeKey = (t: Trade) => `${t.exitDate ?? t.date} ${t.exitTime || '23:59'}`;
export const openKey  = (t: Trade) => `${t.date} ${t.time || '00:00'}`;
export const cmpClose = (a: Trade, b: Trade) => closeKey(a) < closeKey(b) ? -1 : closeKey(a) > closeKey(b) ? 1 : 0;
export const cmpOpen  = (a: Trade, b: Trade) => openKey(a) < openKey(b) ? -1 : openKey(a) > openKey(b) ? 1 : 0;
