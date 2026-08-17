import { useMemo, useState } from 'react';
import { useDesk } from '../state/store';
import { stats, groupBy, inRange } from '../lib/stats';
import { holdMinutes } from '../lib/pnl';
import { hhmmToMin, dateFromKey, DOW } from '../lib/date';
import { TIME_BUCKETS, MOODS } from '../lib/constants';
import { Stat, BarRow, money, cls, pct, pf, rStr } from './ui';
import type { Trade, Settings } from '../types';

const timeBucket = (t: Trade) => {
  const m = hhmmToMin(t.time);
  if (m === null) return 'no time';
  const b = TIME_BUCKETS.find(b => m >= b.from && m < b.to);
  return b ? b.label : m < 570 ? 'pre 09:30' : 'after 16:00';
};
const holdBucket = (t: Trade) => {
  const h = holdMinutes(t);
  if (h === null) return 'unknown';
  if (h < 5) return '< 5 min';
  if (h < 15) return '5–15 min';
  if (h < 60) return '15–60 min';
  if (h < 390) return '1h – 1 session';
  return 'multi-day';
};

function Breakdown({ map, settings, order, limit }:
  { map: Map<string, Trade[]>; settings: Settings; order?: string[]; limit?: number }) {
  let rows = [...map.entries()].map(([label, list]) => ({ label, st: stats(list, settings), n: list.length }));
  if (!rows.length) return <div className="empty">NO DATA</div>;
  rows = order
    ? rows.sort((a, b) => (order.indexOf(a.label) < 0 ? 99 : order.indexOf(a.label)) - (order.indexOf(b.label) < 0 ? 99 : order.indexOf(b.label)))
    : rows.sort((a, b) => b.st.net - a.st.net);
  if (limit) rows = rows.slice(0, limit);
  const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.st.net)));
  return (
    <>
      {rows.map(r => (
        <BarRow key={r.label} label={r.label} value={r.st.net} maxAbs={maxAbs}
          sub={`${r.n} trade${r.n === 1 ? '' : 's'} · ${pct(r.st.winRate)} win · PF ${pf(r.st.profitFactor)} · avg ${money(r.st.expectancy)}`} />
      ))}
    </>
  );
}

export function EdgeView() {
  const { trades, settings } = useDesk();
  const [range, setRange] = useState<'30d' | '90d' | 'all'>('all');
  const all = useMemo(() => inRange(trades.filter(t => t.status === 'closed'), range), [trades, range]);
  const st = useMemo(() => stats(all, settings), [all, settings]);

  if (!st.n) return (
    <section>
      <div className="sec-head"><h2>Edge</h2></div>
      <div className="empty">NO CLOSED TRADES YET<br />CAPTURE A FEW AND THIS FILLS IN</div>
    </section>
  );

  // process vs outcome — reviewed trades only, so the score is honest
  const rev = all.filter(t => t.reviewed);
  const unrev = all.length - rev.length;
  const kept = rev.filter(t => t.followedPlan && !t.mistakes.length);
  const broke = rev.filter(t => !t.followedPlan || t.mistakes.length);
  const ks = stats(kept, settings), bs = stats(broke, settings);
  const score = rev.length ? kept.length / rev.length * 100 : 0;

  const mistakeRows = (() => {
    const m = new Map<string, Trade[]>();
    for (const t of all) for (const k of t.mistakes) {
      const arr = m.get(k); if (arr) arr.push(t); else m.set(k, [t]);
    }
    return [...m.entries()].map(([label, list]) => ({ label, net: stats(list, settings).net, n: list.length }))
      .sort((a, b) => a.net - b.net);
  })();
  // A trade tagged with two mistakes appears in two bars — correct for
  // attribution, but summing the bars would count that trade twice. The
  // headline counts each trade once.
  const tagged = all.filter(t => t.mistakes.length);
  const leak = stats(tagged, settings).net;

  const verdict = !rev.length
    ? 'Nothing reviewed yet. Tag your captured trades and this becomes the most useful number here.'
    : !kept.length || !broke.length
      ? 'Log both clean and off-plan trades to see the gap.'
      : ks.expectancy - bs.expectancy > 0
        ? `Your clean trades earn ${money(ks.expectancy - bs.expectancy, { noSign: true })} more per trade than your off-plan ones. The plan is not the problem — sticking to it is.`
        : 'Off-plan trades are outperforming. That usually means the plan needs work, not your discipline. Look at what the rule-breaks had in common.';

  return (
    <>
      <section>
        <div className="sec-head"><h2>Core Metrics</h2><span className="hint">{st.n} closed trades</span></div>
        <div className="chips">
          {(['30d', '90d', 'all'] as const).map(r => (
            <button key={r} className={`chip${range === r ? ' on' : ''}`} onClick={() => setRange(r)}>
              {r === 'all' ? 'ALL' : r.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="stat-grid" style={{ marginTop: 8 }}>
          <Stat k="Net P&L" v={money(st.net)} m={`${st.n} trades`} tone={cls(st.net)} />
          <Stat k="Win Rate" v={pct(st.winRate)} m={`${st.wins}W / ${st.losses}L`} />
          <Stat k="Profit Factor" v={pf(st.profitFactor)}
            m={st.profitFactor >= 1.5 ? 'healthy' : st.profitFactor >= 1 ? 'thin' : 'bleeding'}
            tone={st.profitFactor >= 1 ? 'pos' : 'neg'} />
          <Stat k="Expectancy" v={money(st.expectancy)} m="avg per trade" tone={cls(st.expectancy)} />
          <Stat k="Avg R" v={rStr(st.avgR)} m="per trade" tone={cls(st.avgR)} />
          <Stat k="Total R" v={rStr(st.totalR)} m="risk units" tone={cls(st.totalR)} />
          <Stat k="Avg Win" v={money(st.avgWin)} tone="pos" />
          <Stat k="Avg Loss" v={money(-st.avgLoss)} tone="neg" />
          <Stat k="Payoff" v={`${st.payoff.toFixed(2)}x`} m="win / loss size" />
          <Stat k="Breakeven WR" v={pct(st.breakevenWR)} m="needed at this payoff" />
          <Stat k="Max Drawdown" v={money(-st.maxDD)} m="peak to trough" tone="neg" />
          <Stat k="Streak" v={st.streak > 0 ? `${st.streak}W` : st.streak < 0 ? `${Math.abs(st.streak)}L` : '—'}
            m={`best ${st.bestWinStreak}W / ${Math.abs(st.worstLossStreak)}L`}
            tone={st.streak > 0 ? 'pos' : st.streak < 0 ? 'neg' : ''} />
          <Stat k="Best Trade" v={money(st.best)} tone={cls(st.best)} />
          <Stat k="Worst Trade" v={money(st.worst)} tone={cls(st.worst)} />
        </div>
      </section>

      <section>
        <div className="sec-head"><h2>Process vs Outcome</h2><span className="hint">the one that changes behaviour</span></div>
        <div className="panel">
          <div className="stat-grid" style={{ marginBottom: 10 }}>
            <Stat k="Process Score" v={rev.length ? pct(score) : '—'}
              m={rev.length ? `${kept.length}/${rev.length} clean` : 'nothing reviewed'}
              tone={!rev.length ? '' : score >= 80 ? 'pos' : score >= 60 ? '' : 'neg'} />
            <Stat k="Discipline Cost" v={money(bs.net)} m="from rule-breaks" tone={cls(bs.net)} />
          </div>
          <BarRow label="FOLLOWED PLAN" value={ks.net} maxAbs={Math.max(1, Math.abs(ks.net), Math.abs(bs.net))}
            sub={`${kept.length} trades · ${pct(ks.winRate)} win · avg ${money(ks.expectancy)}`} />
          <BarRow label="BROKE PLAN" value={bs.net} maxAbs={Math.max(1, Math.abs(ks.net), Math.abs(bs.net))}
            sub={`${broke.length} trades · ${pct(bs.winRate)} win · avg ${money(bs.expectancy)}`} />
          {unrev > 0 && <div className="alert warn">{unrev} captured trade{unrev > 1 ? 's are' : ' is'} unreviewed and excluded from this score.</div>}
          <div className="alert info">{verdict}</div>
        </div>
      </section>

      <section>
        <div className="sec-head"><h2>Mistake Ledger</h2><span className="hint">what each leak costs</span></div>
        <div className="panel">
          {mistakeRows.length ? (
            <>
              <div className="stat-grid" style={{ marginBottom: 10 }}>
                <Stat k="Total Leak" v={money(leak)} m={`${tagged.length} trade${tagged.length === 1 ? '' : 's'} with a tag`} tone={cls(leak)} />
                <Stat k="Top Leak" v={mistakeRows[0]!.label} m={money(mistakeRows[0]!.net)} tone="neg" />
              </div>
              <div className="bar-sub" style={{ marginBottom: 8 }}>
                Attribution below — a trade with two tags counts in both bars.
              </div>
              {mistakeRows.map(r => (
                <BarRow key={r.label} label={r.label} value={r.net} fromZero
                  maxAbs={Math.max(1, ...mistakeRows.map(x => Math.abs(x.net)))}
                  sub={`${r.n} trade${r.n === 1 ? '' : 's'} · ${money(r.net / r.n)} each`} />
              ))}
            </>
          ) : <div className="empty">NO MISTAKES TAGGED<br />TAG THEM HONESTLY OR THIS PAGE LIES TO YOU</div>}
        </div>
      </section>

      {([
        ['By Setup', groupBy(all, t => t.setup || 'untagged'), undefined, undefined],
        ['Time of Day', groupBy(all, timeBucket), TIME_BUCKETS.map(b => b.label).concat('no time'), undefined],
        ['Day of Week', groupBy(all, t => DOW[dateFromKey(t.date).getDay()]!), [...DOW], undefined],
        ['Mood at Entry', groupBy(all, t => { const m = MOODS.find(x => x.v === t.emoEntry) ?? MOODS[2]!; return `${m.e} ${m.l}`; }), MOODS.map(m => `${m.e} ${m.l}`), undefined],
        ['Hold Time', groupBy(all, holdBucket), ['< 5 min', '5–15 min', '15–60 min', '1h – 1 session', 'multi-day', 'unknown'], undefined],
        ['By Symbol', groupBy(all, t => t.symbol || '—'), undefined, 8],
      ] as const).map(([title, map, order, limit]) => (
        <section key={title}>
          <div className="sec-head"><h2>{title}</h2></div>
          <div className="panel">
            <Breakdown map={map} settings={settings} order={order ? [...order] : undefined} limit={limit} />
          </div>
        </section>
      ))}
    </>
  );
}
