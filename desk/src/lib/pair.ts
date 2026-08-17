import type { Execution, Trade, StrategyId } from '../types';
import { round4, round2 } from './pnl';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function emptyTrade(over: Partial<Trade> = {}): Trade {
  return {
    id: uid(), date: '', time: '', exitTime: '', symbol: '', strategy: 'long_call',
    qty: 1, entry: 0, exit: null, stop: null, target: null, fees: null,
    strike: null, expiry: '', right: '', setup: '', mistakes: [], notes: '',
    emoEntry: 3, emoExit: 3, followedPlan: true, reviewed: true,
    status: 'open', src: 'manual', ...over,
  };
}

/** Walk the position per contract: 0 -> non-zero opens, back to 0 closes.
 *  Scale-ins and scale-outs collapse into one weighted-average round trip. */
export function pairExecutions(execs: Execution[]): Trade[] {
  const byKey = new Map<string, Execution[]>();
  for (const e of execs) {
    const arr = byKey.get(e.key);
    if (arr) arr.push(e); else byKey.set(e.key, [e]);
  }
  const trades: Trade[] = [];

  for (const seq of byKey.values()) {
    seq.sort((a, b) => `${a.date} ${a.time}` < `${b.date} ${b.time}` ? -1 : 1);
    let pos = 0;
    let open: {
      dir: 1 | -1; qty: number; notional: number; exitQty: number; exitNotional: number;
      date: string; time: string; exitDate: string; exitTime: string;
      first: Execution; conf: number; raws: string[];
    } | null = null;

    for (const e of seq) {
      const signed = e.side === 'buy' ? e.qty : -e.qty;
      if (pos === 0) {
        open = {
          dir: signed > 0 ? 1 : -1, qty: 0, notional: 0, exitQty: 0, exitNotional: 0,
          date: e.date, time: e.time, exitDate: e.date, exitTime: e.time,
          first: e, conf: 1, raws: [],
        };
      }
      if (!open) continue;
      const isOpening = (signed > 0 && open.dir === 1) || (signed < 0 && open.dir === -1);
      if (isOpening) { open.qty += e.qty; open.notional += e.qty * e.price; }
      else { open.exitQty += e.qty; open.exitNotional += e.qty * e.price; open.exitDate = e.date; open.exitTime = e.time; }
      open.conf = Math.min(open.conf, e.confidence);
      open.raws.push(e.raw);
      pos += signed;

      if (pos === 0 && open.qty > 0) { trades.push(build(open, false)); open = null; }
    }
    if (open && open.qty > 0 && pos !== 0) trades.push(build(open, true));
  }
  return trades.sort((a, b) => `${a.date} ${a.time}` < `${b.date} ${b.time}` ? -1 : 1);
}

function build(o: {
  dir: 1 | -1; qty: number; notional: number; exitQty: number; exitNotional: number;
  date: string; time: string; exitDate: string; exitTime: string;
  first: Execution; conf: number; raws: string[];
}, stillOpen: boolean): Trade {
  const e = o.first;
  // 4dp: rounding an averaged scale-out to cents moves real P&L.
  const entry = round4(o.notional / o.qty);
  const exit = o.exitQty ? round4(o.exitNotional / o.exitQty) : null;
  const right = e.right;
  const strategy: StrategyId = e.isOption
    ? (o.dir === 1 ? (right === 'P' ? 'long_put' : 'long_call')
                   : (right === 'P' ? 'csp' : 'covered_call'))
    : (o.dir === 1 ? 'shares_long' : 'shares_short');

  return emptyTrade({
    date: o.date, time: o.time,
    exitDate: stillOpen ? undefined : o.exitDate,
    exitTime: stillOpen ? '' : o.exitTime,
    symbol: e.symbol, strategy, qty: o.qty,
    entry, exit: stillOpen ? null : exit,
    strike: e.strike, expiry: e.expiry, right,
    status: stillOpen ? 'open' : 'closed',
    src: 'screenshot', reviewed: false,
    capture: { confidence: round2(o.conf), raw: o.raws.join('\n---\n') },
  });
}

export const fingerprint = (t: Trade) =>
  [t.date, t.symbol, t.strategy, t.qty, round2(t.entry), t.exitDate ?? '', t.exit === null ? '' : round2(t.exit)].join('|');
