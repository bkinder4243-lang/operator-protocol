import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useDesk, type Tab } from './state/store';
import { dailyPnl } from './lib/stats';
import { todayKey } from './lib/date';
import { Dashboard } from './components/Dashboard';
import { CalendarView } from './components/CalendarView';
import { TradeList, TradeEditor } from './components/TradeList';
import { EdgeView } from './components/EdgeView';
import { SettingsSheet } from './components/Settings';
import { money, cls } from './components/ui';
import type { Trade } from './types';

const TABS: { id: Tab; label: string }[] = [
  { id: 'desk', label: 'Desk' },
  { id: 'cal', label: 'Calendar' },
  { id: 'trades', label: 'Trades' },
  { id: 'edge', label: 'Edge' },
];

/** Segmented control with a sliding indicator — one control instead of a
 *  row of detached tabs pinned to the bottom of the screen. */
function SegNav({ tab, onPick }: { tab: Tab; onPick: (t: Tab) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ left: 3, width: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      const host = ref.current;
      if (!host) return;
      const i = TABS.findIndex(t => t.id === tab);
      const btn = host.querySelectorAll('button')[i] as HTMLElement | undefined;
      if (btn) setThumb({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [tab]);

  return (
    <div className="seg" ref={ref} role="tablist">
      <span className="thumb" style={{ width: thumb.width, transform: `translateX(${thumb.left - 3}px)` }} />
      {TABS.map(t => (
        <button key={t.id} role="tab" aria-selected={tab === t.id}
          className={tab === t.id ? 'on' : ''} onClick={() => onPick(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const { ready, hydrate, tab, setTab, trades, settings, toast } = useDesk();
  const [editing, setEditing] = useState<Trade | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => { window.scrollTo(0, 0); }, [tab]);

  const today = dailyPnl(trades, settings)[todayKey()] ?? 0;

  return (
    <>
      <header className="appbar">
        <div className="appbar-top">
          <div className="brand">
            <h1>Trade Desk</h1>
            <span className="sub">FIDELITY</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="daychip">
              <div className="k">Today</div>
              <div className={`v ${cls(today)}`}>{money(today)}</div>
            </div>
            <button className="btn sm ghost" onClick={() => setShowSettings(true)} aria-label="Settings">⚙</button>
          </div>
        </div>
        <SegNav tab={tab} onPick={setTab} />
      </header>

      {!ready ? (
        <div className="empty" style={{ paddingTop: 40 }}>LOADING JOURNAL…</div>
      ) : (
        <main>
          {tab === 'desk' && <Dashboard onOpenTrade={setEditing} />}
          {tab === 'cal' && <CalendarView onOpenTrade={setEditing} />}
          {tab === 'trades' && <TradeList onOpenTrade={setEditing} />}
          {tab === 'edge' && <EdgeView />}
        </main>
      )}

      <footer>
        LOCAL SAVE // NO SERVER // YOUR DATA STAYS ON THIS DEVICE<br />
        NOT INVESTMENT ADVICE — YOUR NUMBERS, YOUR CALL
      </footer>

      {editing && <TradeEditor trade={editing} onClose={() => setEditing(null)} />}
      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}

      <div className="toasts">
        {toast && <div className={`toast ${toast.kind}`}>{toast.msg}</div>}
      </div>
    </>
  );
}
