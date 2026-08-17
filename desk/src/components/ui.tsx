import { useRef, useState, type ReactNode } from 'react';

export const money = (n: number, opts: { noSign?: boolean; exact?: boolean } = {}) => {
  const v = Number.isFinite(n) ? n : 0;
  const sign = opts.noSign ? '' : v > 0 ? '+' : v < 0 ? '−' : '';
  const abs = Math.abs(v);
  const s = abs >= 1000 && !opts.exact
    ? `$${abs.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : `$${abs.toFixed(2)}`;
  return sign + s;
};
export const compact = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1000 ? `${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : a.toFixed(0);
  return (v > 0 ? '+' : v < 0 ? '−' : '') + s;
};
export const cls = (n: number) => n > 0 ? 'pos' : n < 0 ? 'neg' : 'flat';
export const pct = (n: number) => `${(Number.isFinite(n) ? n : 0).toFixed(1)}%`;
export const pf = (v: number) => v === Infinity ? '∞' : (Number.isFinite(v) ? v.toFixed(2) : '0.00');
export const rStr = (r: number) => `${r >= 0 ? '+' : '−'}${Math.abs(r).toFixed(2)}R`;

export function Stat({ k, v, m, tone }: { k: string; v: string; m?: string; tone?: string }) {
  return (
    <div className="stat">
      <div className="k">{k}</div>
      <div className={`v ${tone ?? ''}`}>{v}</div>
      {m && <div className="m">{m}</div>}
    </div>
  );
}

export function Modal({ title, sub, onClose, children }:
  { title: string; sub?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}{sub && <span className="sub">{sub}</span>}</h2>
        {children}
      </div>
    </div>
  );
}

/** Diverging bar around a zero centreline. The number is always printed,
 *  so the bar is reinforcement rather than the only encoding. */
export function BarRow({ label, value, sub, maxAbs, fromZero }:
  { label: string; value: number; sub?: string; maxAbs: number; fromZero?: boolean }) {
  const w = Math.abs(value) / (maxAbs || 1) * (fromZero ? 100 : 50);
  const pos = value >= 0;
  return (
    <div className="bar-row">
      <div className="bar-top">
        <span className="lbl">{label}</span>
        <span className={`val ${cls(value)}`}>{money(value)}</span>
      </div>
      {sub && <div className="bar-sub">{sub}</div>}
      <div className="bar-track">
        {!fromZero && <span className="bar-mid" style={{ left: '50%' }} />}
        <span
          className={`bar-fill ${pos ? 'pos' : 'neg'}`}
          style={fromZero
            ? { left: 0, width: `${w}%` }
            : pos ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }}
        />
      </div>
    </div>
  );
}

export function Sparkline({ vals, h = 30 }: { vals: number[]; h?: number }) {
  if (!vals.length || vals.every(v => v === 0))
    return <div className="empty" style={{ padding: '6px' }}>NO DATA YET</div>;
  const W = 300;
  const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
  const span = (max - min) || 1;
  const x = (i: number) => (i / Math.max(1, vals.length - 1)) * W;
  const y = (v: number) => h - ((v - min) / span) * h;
  const end = vals[vals.length - 1]!;
  const color = end > 0 ? 'var(--ok)' : end < 0 ? 'var(--danger)' : 'var(--steel)';
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" style={{ height: h }} aria-hidden="true">
      <line className="zero-line" x1={0} y1={y(0)} x2={W} y2={y(0)} />
      <polyline className="eq-line" points={vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
        stroke={color} vectorEffect="non-scaling-stroke" />
      <circle cx={x(vals.length - 1)} cy={y(end)} r={2.5} fill={color} />
    </svg>
  );
}

export interface CurvePoint { label: string; note: string; value: number }

/** Equity curve with a drag/tap crosshair. An HTML chart should be
 *  interactive; a static line makes you guess at every point. */
export function EquityCurve({ points, maxDD }: { points: CurvePoint[]; maxDD: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ i: number; x: number } | null>(null);

  if (!points.length)
    return <div className="chart-wrap"><div className="empty">NO CLOSED TRADES IN RANGE<br />CAPTURE ONE TO START THE CURVE</div></div>;

  const W = 320, H = 112, PAD = 14;
  const vals = [0, ...points.map(p => p.value)];
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const span = (hi - lo) || 1;
  const x = (i: number) => (i / Math.max(1, vals.length - 1)) * W;
  const y = (v: number) => (H - PAD) - ((v - lo) / span) * (H - PAD);
  const zeroY = y(0);
  const pts = vals.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`);
  const area = `M0,${zeroY.toFixed(2)} L${pts.join(' L')} L${W},${zeroY.toFixed(2)} Z`;
  const net = vals[vals.length - 1]!;

  const onMove = (clientX: number) => {
    const el = svgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setHover({ i: Math.round(frac * (vals.length - 1)), x: frac * rect.width });
  };
  const hp = hover ? (hover.i === 0 ? null : points[hover.i - 1]!) : null;

  return (
    <div className="chart-wrap" ref={wrap}>
      <div className="chart-head">
        <div>
          <div className="lbl">Net P&amp;L</div>
          <div className={`big ${cls(net)}`}>{money(net)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="lbl">Max Drawdown</div>
          <div className="big neg" style={{ fontSize: 14 }}>{money(-maxDD)}</div>
        </div>
      </div>
      <svg ref={svgRef} className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
        style={{ height: 134, touchAction: 'pan-y' }}
        onMouseMove={e => onMove(e.clientX)}
        onMouseLeave={() => setHover(null)}
        onTouchStart={e => onMove(e.touches[0]!.clientX)}
        onTouchMove={e => onMove(e.touches[0]!.clientX)}
        onTouchEnd={() => setHover(null)}
        role="img" aria-label={`Equity curve, net ${money(net)}`}
      >
        <defs><clipPath id="eqclip"><path d={area} /></clipPath></defs>
        <rect x={0} y={0} width={W} height={zeroY} fill="var(--ok)" opacity=".14" clipPath="url(#eqclip)" />
        <rect x={0} y={zeroY} width={W} height={H - zeroY} fill="var(--danger)" opacity=".14" clipPath="url(#eqclip)" />
        <line className="zero-line" x1={0} y1={zeroY} x2={W} y2={zeroY} />
        <polyline className="eq-line" points={pts.join(' ')} stroke="var(--amber)" vectorEffect="non-scaling-stroke" />
        <circle cx={x(vals.length - 1)} cy={y(net)} r={3} fill="var(--amber)" />
        {hover && <line x1={x(hover.i)} y1={0} x2={x(hover.i)} y2={H - PAD}
          stroke="var(--amber)" strokeWidth={1} opacity={.5} vectorEffect="non-scaling-stroke" />}
      </svg>
      {hover && (
        <div className="tip" style={{ left: hover.x, top: 54 }}>
          {hp ? (<>
            <b style={{ color: 'var(--amber)' }}>{hp.label}</b> {hp.note}<br />
            equity <span className={cls(vals[hover.i]!)}>{money(vals[hover.i]!)}</span>
          </>) : <>start<br />equity $0.00</>}
        </div>
      )}
    </div>
  );
}

/** Vertical bars for per-day P&L. */
export function DayBars({ vals }: { vals: number[] }) {
  if (!vals.length || vals.every(v => v === 0))
    return <div className="empty">NO SESSIONS THIS MONTH</div>;
  const W = 320, H = 88, mid = H / 2;
  const maxAbs = Math.max(...vals.map(Math.abs)) || 1;
  const bw = W / vals.length;
  return (
    <>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: 98 }}
        role="img" aria-label="Daily profit and loss">
        {vals.map((v, i) => {
          if (!v) return null;
          const h = Math.max(1.5, Math.abs(v) / maxAbs * (mid - 4));
          return <rect key={i} x={i * bw + 1} y={v > 0 ? mid - h : mid}
            width={Math.max(1, bw - 2)} height={h} rx={1}
            fill={v > 0 ? 'var(--ok)' : 'var(--danger)'} />;
        })}
        <line className="zero-line" x1={0} y1={mid} x2={W} y2={mid} />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 4 }}>
        <span className="hint">1</span>
        <span className="hint">peak ±{money(maxAbs, { noSign: true })}</span>
        <span className="hint">{vals.length}</span>
      </div>
    </>
  );
}
