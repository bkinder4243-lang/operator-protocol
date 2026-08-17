import { describe, it, expect } from 'vitest';
import { parseFidelityText, normalizeOcr, parseAnyDate, parseTime } from './parseFidelity';
import { pairExecutions } from '../lib/pair';
import { netPnl } from '../lib/pnl';
import { DEFAULT_SETTINGS } from '../lib/constants';

const S = DEFAULT_SETTINGS;

describe('OCR normalisation', () => {
  it('repairs digit lookalikes inside numbers', () => {
    expect(normalizeOcr('$l.8O')).toBe('$1.80');
    expect(normalizeOcr('l7S.SO')).toBe('175.50');
    expect(normalizeOcr('lO:32')).toBe('10:32');
  });
  it('never touches tickers or words', () => {
    expect(normalizeOcr('NVDA SOLD CALL AUG')).toBe('NVDA SOLD CALL AUG');
    expect(normalizeOcr('Bought to Open')).toBe('Bought to Open');
  });
});

describe('date and time parsing', () => {
  it('reads Fidelity mobile date styles', () => {
    expect(parseAnyDate('Filled Aug 14, 2026')).toBe('2026-08-14');
    expect(parseAnyDate('08/14/2026')).toBe('2026-08-14');
    expect(parseAnyDate('8/14/26')).toBe('2026-08-14');
  });
  it('converts 12-hour times', () => {
    expect(parseTime('10:32 AM')).toBe('10:32');
    expect(parseTime('3:47 PM')).toBe('15:47');
    expect(parseTime('12:05 AM')).toBe('00:05');
  });
});

describe('option order screenshot', () => {
  const text = `NVDA
NVDA AUG 21 2026 $175 CALL
Bought to Open
2 contracts at $1.80
Filled Aug 17, 2026 10:32 AM`;

  it('extracts the contract, not the fill price, as the strike', () => {
    const { execs } = parseFidelityText(text);
    expect(execs).toHaveLength(1);
    const e = execs[0]!;
    expect(e.symbol).toBe('NVDA');
    expect(e.strike).toBe(175);
    expect(e.right).toBe('C');
    expect(e.expiry).toBe('2026-08-21');
  });
  it('uses the fill date, not the expiry, as the trade date', () => {
    const e = parseFidelityText(text).execs[0]!;
    expect(e.date).toBe('2026-08-17');
    expect(e.time).toBe('10:32');
  });
  it('reads quantity and price', () => {
    const e = parseFidelityText(text).execs[0]!;
    expect(e.qty).toBe(2);
    expect(e.price).toBe(1.80);
    expect(e.side).toBe('buy');
    expect(e.explicitOpen).toBe(true);
    expect(e.confidence).toBeGreaterThan(0.8);
  });
});

describe('stock order screenshot', () => {
  it('parses a share fill', () => {
    const { execs } = parseFidelityText(`NVDA
NVIDIA CORP
Bought 100 shares at $178.50
Filled Aug 14, 2026 9:47 AM`);
    const e = execs[0]!;
    expect(e.symbol).toBe('NVDA');
    expect(e.isOption).toBe(false);
    expect(e.qty).toBe(100);
    expect(e.price).toBe(178.50);
  });
});

describe('activity list with several fills', () => {
  const text = `Activity
SPY
SPY AUG 15 2026 $560 CALL
Bought to Open
2 contracts at $2.35
Filled Aug 12, 2026 9:41 AM
SPY
SPY AUG 15 2026 $560 CALL
Sold to Close
2 contracts at $3.10
Filled Aug 12, 2026 10:15 AM`;

  it('finds both fills', () => {
    expect(parseFidelityText(text).execs).toHaveLength(2);
  });
  it('keeps each fill on its own clock', () => {
    const execs = parseFidelityText(text).execs;
    expect(execs[0]!.time).toBe('09:41');
    expect(execs[1]!.time).toBe('10:15');   // must not inherit the first fill's time
  });
  it('pairs them into one closed round trip with correct P&L', () => {
    const trades = pairExecutions(parseFidelityText(text).execs);
    expect(trades).toHaveLength(1);
    const t = trades[0]!;
    expect(t.status).toBe('closed');
    expect(t.entry).toBe(2.35);
    expect(t.exit).toBe(3.10);
    expect(t.strategy).toBe('long_call');
    expect(netPnl(t, S)).toBeCloseTo(147.40, 6);   // 150 gross - 2.60 commission
    expect(t.exitTime).toBe('10:15');
    expect(t.reviewed).toBe(false);                 // never trusted silently
  });
});

describe('scale-out', () => {
  it('averages partial exits without losing cents', () => {
    const text = `NVDA
Bought 100 shares at $178.50
Filled Aug 14, 2026 9:47 AM
NVDA
Sold 50 shares at $181.00
Filled Aug 14, 2026 10:20 AM
NVDA
Sold 50 shares at $179.75
Filled Aug 14, 2026 11:05 AM`;
    const t = pairExecutions(parseFidelityText(text).execs)[0]!;
    expect(t.entry).toBe(178.50);
    expect(t.exit).toBe(180.375);           // not rounded to 180.38
    expect(netPnl(t, S)).toBeCloseTo(187.50, 6);
  });
});

describe('an unclosed position', () => {
  it('stays open', () => {
    const t = pairExecutions(parseFidelityText(`AMD
AMD AUG 21 2026 $175 CALL
Bought to Open
3 contracts at $1.80
Filled Aug 17, 2026 9:35 AM`).execs)[0]!;
    expect(t.status).toBe('open');
    expect(t.exit).toBeNull();
  });
});

describe('refusing to guess', () => {
  it('warns instead of inventing a price', () => {
    const { warnings } = parseFidelityText('NVDA\nBought to Open\nFilled Aug 17, 2026');
    expect(warnings.join(' ')).toMatch(/price/i);
  });
  it('warns when nothing looks like a trade', () => {
    const { execs, warnings } = parseFidelityText('Account Balance\n$12,345.67\nToday');
    expect(execs).toHaveLength(0);
    expect(warnings.join(' ')).toMatch(/crop/i);
  });
});
