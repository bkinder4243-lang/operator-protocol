import { useMemo, useState } from 'react';
import { useDesk } from '../state/store';
import { stats } from '../lib/stats';
import { netPnl, rMultiple, cmpOpen } from '../lib/pnl';
import { STRATEGIES, MOODS } from '../lib/constants';
import { TradeRow } from './Dashboard';
import { Modal, money, cls, rStr } from './ui';
import type { Trade } from '../types';

const FILTERS = [
  ['all', 'All'], ['unreviewed', 'Needs Review'], ['open', 'Open'],
  ['wins', 'Wins'], ['losses', 'Losses'], ['mistakes', 'Mistakes'], ['offplan', 'Off-Plan'],
] as const;
type Filter = typeof FILTERS[number][0];

export function TradeList({ initialFilter = 'all', onOpenTrade }:
  { initialFilter?: Filter; onOpenTrade: (t: Trade) => void }) {
  const { trades, settings } = useDesk();
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    let l = [...trades].sort((a, b) => cmpOpen(b, a));
    if (filter === 'open') l = l.filter(t => t.status === 'open');
    if (filter === 'unreviewed') l = l.filter(t => !t.reviewed);
    if (filter === 'wins') l = l.filter(t => t.status === 'closed' && netPnl(t, settings) > 0);
    if (filter === 'losses') l = l.filter(t => t.status === 'closed' && netPnl(t, settings) < 0);
    if (filter === 'mistakes') l = l.filter(t => t.mistakes.length);
    if (filter === 'offplan') l = l.filter(t => !t.followedPlan);
    const needle = q.trim().toLowerCase();
    if (needle) l = l.filter(t =>
      [t.symbol, t.setup, t.notes, ...t.mistakes].join(' ').toLowerCase().includes(needle));
    return l;
  }, [trades, filter, q, settings]);

  const st = stats(list, settings);

  return (
    <section>
      <div className="sec-head">
        <h2>Trade Log</h2>
        <span className="hint">{list.length} shown · <span className={cls(st.net)}>{money(st.net)}</span></span>
      </div>
      <div className="chips">
        {FILTERS.map(([id, label]) => (
          <button key={id} className={`chip${filter === id ? ' on' : ''}`} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      <div style={{ marginTop: 8 }}>
        <input type="search" value={q} onChange={e => setQ(e.target.value)}
          placeholder="filter by symbol, setup, note…" />
      </div>
      <div style={{ marginTop: 10 }}>
        {list.length ? list.map(t => <TradeRow key={t.id} t={t} onClick={() => onOpenTrade(t)} />)
          : <div className="empty">NOTHING MATCHES</div>}
      </div>
    </section>
  );
}

/** Full editor — the place you turn a captured fill into a reviewed trade. */
export function TradeEditor({ trade, onClose }: { trade: Trade; onClose: () => void }) {
  const { settings, saveTrade, deleteTrade, say } = useDesk();
  const [t, setT] = useState<Trade>(trade);
  const [armed, setArmed] = useState(false);
  const set = (p: Partial<Trade>) => setT(x => ({ ...x, ...p }));

  const p = netPnl(t, settings);
  const r = rMultiple(t, settings);
  const isOpt = STRATEGIES.find(s => s.id === t.strategy)?.kind === 'option';

  const toggleMistake = (m: string) =>
    set({ mistakes: t.mistakes.includes(m) ? t.mistakes.filter(x => x !== m) : [...t.mistakes, m] });

  return (
    <Modal title="Trade"
      sub={t.status === 'closed' ? `${money(p)}${r !== null ? ` · ${rStr(r)}` : ''}` : 'open position'}
      onClose={onClose}>

      {!t.reviewed && <div className="alert warn" style={{ marginTop: 0 }}>
        Captured from a screenshot and not reviewed yet. Tag it and it starts counting toward your process score.
      </div>}

      <div className="row2">
        <div className="field"><label>Symbol</label>
          <input value={t.symbol} onChange={e => set({ symbol: e.target.value.toUpperCase() })} /></div>
        <div className="field"><label>Strategy</label>
          <select value={t.strategy} onChange={e => set({ strategy: e.target.value as Trade['strategy'] })}>
            {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select></div>
      </div>

      {isOpt && (
        <div className="row3">
          <div className="field"><label>Strike</label>
            <input type="number" inputMode="decimal" value={t.strike ?? ''}
              onChange={e => set({ strike: e.target.value === '' ? null : Number(e.target.value) })} /></div>
          <div className="field"><label>C / P</label>
            <select value={t.right} onChange={e => set({ right: e.target.value as Trade['right'] })}>
              <option value="">—</option><option value="C">Call</option><option value="P">Put</option>
            </select></div>
          <div className="field"><label>Expiry</label>
            <input type="date" value={t.expiry} onChange={e => set({ expiry: e.target.value })} /></div>
        </div>
      )}

      <h3>Entry</h3>
      <div className="row2">
        <div className="field"><label>Date</label>
          <input type="date" value={t.date} onChange={e => set({ date: e.target.value })} /></div>
        <div className="field"><label>Time</label>
          <input type="time" value={t.time} onChange={e => set({ time: e.target.value })} /></div>
      </div>
      <div className="field"><label>{isOpt ? 'Contracts' : 'Shares'}</label>
        <input type="number" inputMode="decimal" value={t.qty}
          onChange={e => set({ qty: Number(e.target.value) })} /></div>
      <div className="row3">
        <div className="field"><label>Entry</label>
          <input type="number" inputMode="decimal" step="0.01" value={t.entry}
            onChange={e => set({ entry: Number(e.target.value) })} /></div>
        <div className="field"><label>Stop</label>
          <input type="number" inputMode="decimal" step="0.01" value={t.stop ?? ''} placeholder="req. for R"
            onChange={e => set({ stop: e.target.value === '' ? null : Number(e.target.value) })} /></div>
        <div className="field"><label>Target</label>
          <input type="number" inputMode="decimal" step="0.01" value={t.target ?? ''}
            onChange={e => set({ target: e.target.value === '' ? null : Number(e.target.value) })} /></div>
      </div>

      <h3>Exit</h3>
      <div className="toggle">
        <button className={t.status === 'open' ? 'on' : ''}
          onClick={() => set({ status: 'open', exit: null, exitDate: undefined })}>Still Open</button>
        <button className={t.status === 'closed' ? 'on' : ''}
          onClick={() => set({ status: 'closed', exitDate: t.exitDate ?? t.date })}>Closed</button>
      </div>
      {t.status === 'closed' && (
        <>
          <div className="field" style={{ marginTop: 10 }}><label>Exit Price</label>
            <input type="number" inputMode="decimal" step="0.01" value={t.exit ?? ''}
              onChange={e => set({ exit: e.target.value === '' ? null : Number(e.target.value) })} /></div>
          <div className="row2">
            <div className="field"><label>Exit Date</label>
              <input type="date" value={t.exitDate ?? t.date} onChange={e => set({ exitDate: e.target.value })} /></div>
            <div className="field"><label>Exit Time</label>
              <input type="time" value={t.exitTime} onChange={e => set({ exitTime: e.target.value })} /></div>
          </div>
        </>
      )}
      <div className="field"><label>Fees (blank = modelled from settings)</label>
        <input type="number" inputMode="decimal" step="0.01" value={t.fees ?? ''} placeholder="auto"
          onChange={e => set({ fees: e.target.value === '' ? null : Number(e.target.value) })} /></div>

      <h3>Read &amp; Review</h3>
      <div className="field"><label>Setup</label>
        <select value={t.setup} onChange={e => set({ setup: e.target.value })}>
          <option value="">— none —</option>
          {settings.setups.map(s => <option key={s} value={s}>{s}</option>)}
        </select></div>
      <div className="field"><label>Mood at entry</label>
        <div className="mood-row">
          {MOODS.map(m => <button key={m.v} className={`mood-btn${t.emoEntry === m.v ? ' on' : ''}`}
            onClick={() => set({ emoEntry: m.v })}>{m.e}<span className="ml">{m.l}</span></button>)}
        </div></div>
      <div className="field"><label>Did you follow the plan?</label>
        <div className="toggle">
          <button className={t.followedPlan ? 'on' : ''} onClick={() => set({ followedPlan: true })}>Yes</button>
          <button className={!t.followedPlan ? 'on' : ''} onClick={() => set({ followedPlan: false })}>No</button>
        </div></div>
      <div className="field"><label>Mistakes</label>
        <div className="chips">
          {settings.mistakes.map(m => (
            <button key={m} className={`chip mis tag${t.mistakes.includes(m) ? ' on' : ''}`}
              onClick={() => toggleMistake(m)}>{m}</button>
          ))}
        </div></div>
      <div className="field"><label>Notes — what did you actually see?</label>
        <textarea value={t.notes} onChange={e => set({ notes: e.target.value })}
          placeholder="Why you took it, how it felt, what you'd do again." /></div>

      {t.capture?.raw && (
        <>
          <h3>Captured Text</h3>
          <pre className="raw">{t.capture.raw}</pre>
        </>
      )}

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn primary full" onClick={() => {
          if (!t.symbol) { say('SYMBOL REQUIRED', 'bad'); return; }
          void saveTrade({ ...t, reviewed: true }); onClose(); say('SAVED', 'good');
        }}>Save</button>
        <button className="btn danger" onClick={() => {
          if (!armed) { setArmed(true); return; }
          void deleteTrade(t.id); onClose(); say('TRADE DELETED', 'bad');
        }}>{armed ? 'Tap Again' : 'Delete'}</button>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
