import { useMemo, useState } from 'react';
import { useDesk } from '../state/store';
import { stats, dailyPnl, inRange } from '../lib/stats';
import { netPnl, rMultiple, cmpClose, cmpOpen } from '../lib/pnl';
import { tiltReport, pdtCount } from '../lib/tilt';
import { todayKey, keyOf } from '../lib/date';
import { STRAT, MOODS } from '../lib/constants';
import { Capture } from './Capture';
import { EquityCurve, Sparkline, Stat, money, cls, pct, rStr, type CurvePoint } from './ui';
import type { Trade } from '../types';

export function TradeRow({ t, onClick }: { t: Trade; onClick?: () => void }) {
  const { settings } = useDesk();
  const p = netPnl(t, settings);
  const r = rMultiple(t, settings);
  const s = STRAT[t.strategy];
  const state = t.status === 'open' ? 'open' : p > 0 ? 'win' : p < 0 ? 'loss' : '';
  const mood = MOODS.find(m => m.v === t.emoEntry) ?? MOODS[2]!;
  return (
    <button className={`trow ${state}`} onClick={onClick}>
      <span className="mood" title={mood.l}>{mood.e}</span>
      <span>
        <span className="sym">{t.symbol}{t.strike ? ` ${t.strike}${t.right}` : ''}</span>
        <span className="meta" style={{ display: 'block' }}>
          {s.label} · {t.qty}{s.kind === 'option' ? 'c' : 'sh'} · {t.date}{t.time ? ` ${t.time}` : ''}
        </span>
        <span className="badges">
          {t.setup && <span className="mini">{t.setup}</span>}
          {t.mistakes.slice(0, 2).map(m => <span key={m} className="mini bad">{m}</span>)}
          {!t.followedPlan && <span className="mini bad">off-plan</span>}
          {!t.reviewed && <span className="mini warn">needs review</span>}
        </span>
      </span>
      <span>
        <span className={`amt ${t.status === 'open' ? 'flat' : cls(p)}`} style={{ display: 'block' }}>
          {t.status === 'open' ? 'OPEN' : money(p)}
        </span>
        <span className="r" style={{ display: 'block' }}>
          {t.status === 'open' ? `@ ${t.entry}` : r === null ? '' : rStr(r)}
        </span>
      </span>
    </button>
  );
}

export function Dashboard({ onOpenTrade }: { onOpenTrade: (t: Trade) => void }) {
  const { trades, days, settings, toggleCheck } = useDesk();
  const [range, setRange] = useState<'7d' | '30d' | '90d' | 'all'>('all');
  const k = todayKey();

  const closed = useMemo(() => trades.filter(t => t.status === 'closed'), [trades]);
  const ranged = useMemo(() => inRange(closed, range).sort(cmpClose), [closed, range]);
  const st = useMemo(() => stats(ranged, settings), [ranged, settings]);
  const daily = useMemo(() => dailyPnl(trades, settings), [trades, settings]);

  const points: CurvePoint[] = ranged.map((t, i) => ({
    label: t.symbol, note: t.exitDate ?? t.date, value: st.curve[i] ?? 0,
  }));

  const spark = useMemo(() => {
    const out: number[] = [];
    const d = new Date(); d.setDate(d.getDate() - 29);
    let cum = 0;
    for (let i = 0; i < 30; i++) { cum += daily[keyOf(d)] ?? 0; out.push(cum); d.setDate(d.getDate() + 1); }
    return out;
  }, [daily]);

  const tilt = tiltReport(trades, settings, days[k]);
  const pdt = pdtCount(trades);
  const open = trades.filter(t => t.status === 'open').sort(cmpOpen);
  const today = trades.filter(t => (t.exitDate ?? t.date) === k).sort(cmpOpen);
  const unreviewed = trades.filter(t => !t.reviewed).length;
  const checks = days[k]?.checks ?? {};
  const doneChecks = settings.checklist.filter((_, i) => checks[i]).length;

  const tiltColor = tilt.level === 'red' ? 'var(--danger)' : tilt.level === 'amber' ? 'var(--amber)' : 'var(--ok)';
  const tiltLabel = tilt.level === 'red' ? 'Stand Down' : tilt.level === 'amber' ? 'Caution' : 'Clear';
  const used = tilt.lossLimit > 0 ? Math.min(100, Math.abs(Math.min(0, tilt.dayPnl)) / tilt.lossLimit * 100) : 0;

  return (
    <>
      <section style={{ marginTop: 12 }}><Capture /></section>

      <section>
        <div className="sec-head">
          <h2>Equity Curve</h2>
          <span className="hint">{st.n} closed · {rStr(st.totalR)}</span>
        </div>
        <EquityCurve points={points} maxDD={st.maxDD} />
        <div className="chips" style={{ marginTop: 8 }}>
          {(['7d', '30d', '90d', 'all'] as const).map(r => (
            <button key={r} className={`chip${range === r ? ' on' : ''}`} onClick={() => setRange(r)}>
              {r === 'all' ? 'ALL' : r.toUpperCase()}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="sec-head"><h2>30-Session Trend</h2><span className="hint">cumulative</span></div>
        <div className="chart-wrap"><Sparkline vals={spark} /></div>
      </section>

      <section>
        <div className="sec-head"><h2>Head Check</h2><span className="hint">discipline before P&amp;L</span></div>
        <div className="panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className="lamp" style={{ color: tiltColor }} />
            <span className="mono" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', color: tiltColor }}>
              {tiltLabel}
            </span>
            <span className={`mono ${cls(tilt.dayPnl)}`} style={{ marginLeft: 'auto', fontSize: 11 }}>
              {money(tilt.dayPnl)} today
            </span>
          </div>

          {tilt.lossLimit > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="gauge-head"><span>DAILY STOP</span><span>{money(-tilt.lossLimit)}</span></div>
              <div className="gauge"><i style={{
                width: `${used.toFixed(0)}%`,
                background: used >= 100 ? 'var(--danger)' : used >= 60 ? 'var(--amber)' : 'var(--ok-dim)',
              }} /></div>
            </div>
          )}

          {settings.trackPDT && settings.accountType === 'margin' && (
            <div style={{ marginTop: 10 }}>
              <div className="gauge-head">
                <span>DAY TRADES / 5 BUS. DAYS</span>
                <span style={{ color: pdt >= 3 ? 'var(--danger)' : undefined }}>{pdt} · limit 3</span>
              </div>
              <div className="gauge"><i style={{
                width: `${Math.min(100, pdt / 4 * 100)}%`,
                background: pdt >= 3 ? 'var(--danger)' : 'var(--steel-dim)',
              }} /></div>
              {pdt >= 4 && <div className="alert">
                You are at {pdt} day trades in 5 business days — at or past the pattern-day-trader threshold.
                Under $25k equity, Fidelity restricts the account to closing trades only.
              </div>}
              {pdt === 3 && <div className="alert warn">
                One more day trade in this window flags you as a pattern day trader. Under $25k equity, Fidelity restricts the account.
              </div>}
            </div>
          )}

          {tilt.flags.length
            ? tilt.flags.map((f, i) => <div key={i} className={`alert${f.sev === 'warn' ? ' warn' : ''}`}>{f.msg}</div>)
            : <div className="alert info">No tilt signals. {tilt.count ? 'Keep taking only the setups on your list.' : 'Nothing logged today yet.'}</div>}
        </div>
      </section>

      {unreviewed > 0 && (
        <section>
          <div className="alert warn" style={{ marginTop: 0 }}>
            {unreviewed} captured trade{unreviewed > 1 ? 's' : ''} still need your read — open {unreviewed > 1 ? 'them' : 'it'} in the Trades tab to tag setup and mistakes.
          </div>
        </section>
      )}

      <section>
        <div className="sec-head">
          <h2>Pre-Trade Checklist</h2>
          <span className="hint">{doneChecks}/{settings.checklist.length} · resets daily</span>
        </div>
        {settings.checklist.map((c, i) => (
          <button key={i} className={`check${checks[i] ? ' on' : ''}`} onClick={() => void toggleCheck(i)}>
            <span className="box" /><span className="lbl">{c}</span>
          </button>
        ))}
      </section>

      <section>
        <div className="sec-head"><h2>Open Positions</h2><span className="hint">{open.length ? `${open.length} live` : ''}</span></div>
        {open.length ? open.map(t => <TradeRow key={t.id} t={t} onClick={() => onOpenTrade(t)} />)
          : <div className="empty">FLAT — NO OPEN POSITIONS</div>}
      </section>

      <section>
        <div className="sec-head"><h2>Today</h2><span className="hint">{today.length ? `${today.length} logged` : 'nothing yet'}</span></div>
        {today.length ? today.map(t => <TradeRow key={t.id} t={t} onClick={() => onOpenTrade(t)} />)
          : <div className="empty">NO TRADES LOGGED TODAY</div>}
      </section>
    </>
  );
}

export { pct, Stat };
