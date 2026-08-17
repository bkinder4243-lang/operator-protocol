import { describe, it, expect } from 'vitest';
import { netPnl, grossPnl, rMultiple, feesFor, holdMinutes } from './pnl';
import { stats } from './stats';
import { emptyTrade } from './pair';
import { DEFAULT_SETTINGS } from './constants';
import type { Trade } from '../types';

const S = { ...DEFAULT_SETTINGS, accountSize: 10000, riskPctPerTrade: 1, commPerContract: 0.65 };
const closed = (o: Partial<Trade>) => emptyTrade({ status: 'closed', date: '2026-08-12', exitDate: '2026-08-12', ...o });

describe('option P&L', () => {
  it('applies the 100x multiplier and both commission legs', () => {
    const t = closed({ strategy: 'long_call', qty: 2, entry: 2.35, exit: 3.10 });
    expect(grossPnl(t)).toBeCloseTo(150, 6);        // (3.10-2.35)*2*100
    expect(feesFor(t, S)).toBeCloseTo(2.60, 6);     // 0.65 * 2 contracts * 2 legs
    expect(netPnl(t, S)).toBeCloseTo(147.40, 6);
  });
  it('inverts direction for short premium', () => {
    const t = closed({ strategy: 'csp', qty: 1, entry: 3.00, exit: 1.00 });
    expect(grossPnl(t)).toBeCloseTo(200, 6);        // sold at 3, bought back at 1
  });
  it('a long put profits when the price falls', () => {
    const t = closed({ strategy: 'long_put', qty: 1, entry: 4.20, exit: 2.90 });
    expect(netPnl(t, S)).toBeCloseTo(-131.30, 6);
  });
});

describe('stock P&L', () => {
  it('uses a 1x multiplier and no commission', () => {
    const t = closed({ strategy: 'shares_long', qty: 100, entry: 178.50, exit: 180.375, fees: 0.06 });
    expect(netPnl(t, S)).toBeCloseTo(187.44, 6);
  });
  it('shorts profit on a decline', () => {
    const t = closed({ strategy: 'shares_short', qty: 50, entry: 20, exit: 18, fees: 0 });
    expect(netPnl(t, S)).toBeCloseTo(100, 6);
  });
});

describe('R multiple', () => {
  it('measures against the stop distance when a stop exists', () => {
    const t = closed({ strategy: 'long_call', qty: 2, entry: 2.00, exit: 2.80, stop: 1.60, fees: 0 });
    // risk = 0.40 * 2 * 100 = $80, profit = $160 -> 2R
    expect(rMultiple(t, S)!).toBeCloseTo(2, 6);
  });
  it('falls back to the account risk budget without a stop', () => {
    const t = closed({ strategy: 'long_call', qty: 1, entry: 1, exit: 2, fees: 0 });
    // budget = 1% of 10k = $100, profit = $100 -> 1R
    expect(rMultiple(t, S)!).toBeCloseTo(1, 6);
  });
  it('is null while the position is open', () => {
    expect(rMultiple(emptyTrade({ status: 'open' }), S)).toBeNull();
  });
});

describe('aggregate stats', () => {
  const list = [
    closed({ symbol: 'A', strategy: 'shares_long', qty: 1, entry: 10, exit: 20, fees: 0 }),  // +10
    closed({ symbol: 'B', strategy: 'shares_long', qty: 1, entry: 10, exit: 5,  fees: 0 }),  // -5
    closed({ symbol: 'C', strategy: 'shares_long', qty: 1, entry: 10, exit: 30, fees: 0 }),  // +20
  ];
  const s = stats(list, S);
  it('nets, counts and rates correctly', () => {
    expect(s.net).toBeCloseTo(25, 6);
    expect(s.n).toBe(3);
    expect(s.winRate).toBeCloseTo(66.667, 2);
  });
  it('computes profit factor as gross win over gross loss', () => {
    expect(s.profitFactor).toBeCloseTo(30 / 5, 6);
  });
  it('tracks peak-to-trough drawdown, not just the worst trade', () => {
    expect(s.maxDD).toBeCloseTo(5, 6);
  });
  it('derives the breakeven win rate from the payoff ratio', () => {
    // avg win 15, avg loss 5 -> payoff 3 -> need 25%
    expect(s.payoff).toBeCloseTo(3, 6);
    expect(s.breakevenWR).toBeCloseTo(25, 6);
  });
  it('reports an infinite profit factor when nothing lost', () => {
    expect(stats([list[0]!], S).profitFactor).toBe(Infinity);
  });
});

describe('hold time', () => {
  it('spans a same-day trade in minutes', () => {
    expect(holdMinutes(closed({ time: '09:35', exitTime: '10:05' }))).toBe(30);
  });
  it('adds a session per overnight day', () => {
    expect(holdMinutes(closed({ date: '2026-08-12', exitDate: '2026-08-13', time: '15:00', exitTime: '10:00' }))).toBe(90);
  });
});
