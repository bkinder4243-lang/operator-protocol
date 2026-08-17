import { useMemo, useState } from 'react';
import { useDesk } from '../state/store';
import { dailyPnl, stats } from '../lib/stats';
import { keyOf, dateFromKey, todayKey } from '../lib/date';
import { MOODS } from '../lib/constants';
import { TradeRow } from './Dashboard';
import { Modal, Stat, DayBars, money, compact, cls, pct, pf } from './ui';
import type { Trade } from '../types';

export function CalendarView({ onOpenTrade }: { onOpenTrade: (t: Trade) => void }) {
  const { trades, settings } = useDesk();
  const [ref, setRef] = useState(() => new Date());
  const [dayKey, setDayKey] = useState<string | null>(null);

  const daily = useMemo(() => dailyPnl(trades, settings), [trades, settings]);
  const y = ref.getFullYear(), m = ref.getMonth();
  const first = new Date(y, m, 1);
  const dim = new Date(y, m + 1, 0).getDate();
  const monthKeys = Array.from({ length: dim }, (_, i) => keyOf(new Date(y, m, i + 1)));
  const maxAbs = Math.max(1, ...monthKeys.map(k => Math.abs(daily[k] ?? 0)));
  const tk = todayKey();

  const monthTrades = trades.filter(t =>
    t.status === 'closed' && (t.exitDate ?? t.date).slice(0, 7) === keyOf(first).slice(0, 7));
  const st = stats(monthTrades, settings);
  const greenDays = monthKeys.filter(k => (daily[k] ?? 0) > 0).length;
  const redDays = monthKeys.filter(k => (daily[k] ?? 0) < 0).length;

  // build the grid, injecting a weekly total after each Saturday
  const cells: React.ReactNode[] = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(<div key={`pad${i}`} className="cal-cell void" />);
  let weekSum = 0, weekN = 0;
  for (let d = 1; d <= dim; d++) {
    const key = keyOf(new Date(y, m, d));
    const p = daily[key] ?? 0;
    const dayTrades = trades.filter(t => (t.exitDate ?? t.date) === key);
    const hasMistake = dayTrades.some(t => t.mistakes.length);
    weekSum += p; if (dayTrades.length) weekN++;

    const a = p !== 0 ? (0.16 + 0.5 * Math.abs(p) / maxAbs) : 0;
    const bg = p > 0 ? `rgba(127,201,127,${a.toFixed(2)})`
      : p < 0 ? `rgba(226,87,74,${a.toFixed(2)})` : 'transparent';

    cells.push(
      <button key={key} className={`cal-cell ${p > 0 ? 'win' : p < 0 ? 'loss' : ''} ${key === tk ? 'today' : ''}`}
        style={{ background: bg }} onClick={() => setDayKey(key)}
        aria-label={`${key}, ${dayTrades.length} trades, ${money(p)}`}>
        <span className="d">{d}</span>
        {hasMistake && <span className="flag">●</span>}
        {dayTrades.length > 0 && (
          <span>
            {p !== 0 && <span className={`p ${cls(p)}`} style={{ display: 'block' }}>{compact(p)}</span>}
            <span className="n" style={{ display: 'block' }}>{dayTrades.length}t</span>
          </span>
        )}
      </button>
    );

    const dow = new Date(y, m, d).getDay();
    if (dow === 6 || d === dim) {
      for (let i = 0; i < 6 - dow; i++) cells.push(<div key={`tail${d}-${i}`} className="cal-cell void" />);
      cells.push(
        <div key={`wk${d}`} className="cal-week">
          <span className="wl">{weekN}D</span>
          <span className={`wv ${cls(weekSum)}`}>{weekSum ? compact(weekSum) : '—'}</span>
        </div>
      );
      weekSum = 0; weekN = 0;
    }
  }

  return (
    <>
      <section>
        <div className="sec-head"><h2>P&amp;L Calendar</h2><span className="hint">tap a day for the tape</span></div>
        <div className="cal-nav">
          <button className="btn sm ghost" onClick={() => setRef(new Date(y, m - 1, 1))} aria-label="Previous month">◀</button>
          <span className="mo">{ref.toLocaleString('en-US', { month: 'long' })} {y}</span>
          <button className="btn sm ghost" onClick={() => setRef(new Date(y, m + 1, 1))} aria-label="Next month">▶</button>
        </div>
        <div className="cal-grid">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="cal-dow">{d}</div>)}
          <div className="cal-dow wk">WK</div>
          {cells}
        </div>
        <div className="cal-legend">
          <span>LOSS</span><i style={{ background: 'var(--danger)' }} />
          <i style={{ background: 'var(--panel)' }} /><i style={{ background: 'var(--ok)' }} /><span>PROFIT</span>
        </div>
      </section>

      <section>
        <div className="sec-head"><h2>Month Summary</h2><span className="hint">{greenDays}G / {redDays}R days</span></div>
        <div className="stat-grid">
          <Stat k="Net P&L" v={money(st.net)} m={`${st.n} trades`} tone={cls(st.net)} />
          <Stat k="Win Rate" v={pct(st.winRate)} m={`${st.wins}W / ${st.losses}L`} />
          <Stat k="Best Day" v={money(Math.max(0, ...monthKeys.map(k => daily[k] ?? 0)))} tone="pos" />
          <Stat k="Worst Day" v={money(Math.min(0, ...monthKeys.map(k => daily[k] ?? 0)))} tone="neg" />
          <Stat k="Profit Factor" v={pf(st.profitFactor)} m="gross win / loss" />
          <Stat k="Avg / Trade" v={money(st.expectancy)} m="expectancy" tone={cls(st.expectancy)} />
        </div>
      </section>

      <section>
        <div className="sec-head"><h2>Daily P&amp;L</h2><span className="hint">each bar = one session</span></div>
        <div className="chart-wrap"><DayBars vals={monthKeys.map(k => daily[k] ?? 0)} /></div>
      </section>

      {dayKey && <DaySheet dayKey={dayKey} onClose={() => setDayKey(null)} onOpenTrade={onOpenTrade} />}
    </>
  );
}

function DaySheet({ dayKey, onClose, onOpenTrade }:
  { dayKey: string; onClose: () => void; onOpenTrade: (t: Trade) => void }) {
  const { trades, days, settings, setDay } = useDesk();
  const rec = days[dayKey] ?? {};
  const [note, setNote] = useState(rec.note ?? '');
  const [mood, setMood] = useState(rec.mood ?? 0);

  const list = trades.filter(t => t.date === dayKey || (t.status === 'closed' && (t.exitDate ?? t.date) === dayKey));
  const st = stats(list, settings);
  const label = dateFromKey(dayKey).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <Modal title={label} sub={money(st.net)} onClose={onClose}>
      <div className="stat-grid g3">
        <Stat k="Trades" v={String(list.length)} />
        <Stat k="Win Rate" v={pct(st.winRate)} m={`${st.wins}W/${st.losses}L`} />
        <Stat k="Avg" v={money(st.expectancy)} m="per trade" tone={cls(st.expectancy)} />
      </div>
      <h3>Tape</h3>
      {list.length ? list.map(t => <TradeRow key={t.id} t={t} onClick={() => { onClose(); onOpenTrade(t); }} />)
        : <div className="empty">NO TRADES THIS DAY</div>}
      <h3>How did you trade?</h3>
      <div className="mood-row">
        {MOODS.map(m => (
          <button key={m.v} className={`mood-btn${mood === m.v ? ' on' : ''}`} onClick={() => setMood(m.v)}>
            {m.e}<span className="ml">{m.l}</span>
          </button>
        ))}
      </div>
      <div className="field" style={{ marginTop: 10 }}>
        <label>Session notes</label>
        <textarea value={note} onChange={e => setNote(e.target.value)}
          placeholder="Market tone, what you did well, what to fix tomorrow." />
      </div>
      <div className="btn-row">
        <button className="btn primary" onClick={() => { void setDay(dayKey, { note, mood }); onClose(); }}>Save</button>
        <button className="btn ghost" onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}
