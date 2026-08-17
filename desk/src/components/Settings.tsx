import { useState } from 'react';
import { useDesk } from '../state/store';
import { Modal } from './ui';
import type { Settings as S } from '../types';

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { settings, saveSettings, trades, days, wipeAll, say } = useDesk();
  const [s, setS] = useState<S>(settings);
  const [armed, setArmed] = useState(false);
  const set = (p: Partial<S>) => setS(x => ({ ...x, ...p }));
  const lines = (v: string) => v.split('\n').map(x => x.trim()).filter(Boolean);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ trades, days, settings }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `trade-desk-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say('BACKUP DOWNLOADED', 'good');
  };

  return (
    <Modal title="Settings" sub="risk rules & lists" onClose={onClose}>
      <div className="row2">
        <div className="field"><label>Account Size ($)</label>
          <input type="number" inputMode="decimal" value={s.accountSize}
            onChange={e => set({ accountSize: Number(e.target.value) })} /></div>
        <div className="field"><label>Account Type</label>
          <select value={s.accountType} onChange={e => set({ accountType: e.target.value as S['accountType'] })}>
            <option value="margin">Margin</option><option value="cash">Cash</option>
          </select></div>
      </div>
      <div className="row3">
        <div className="field"><label>Risk / Trade %</label>
          <input type="number" inputMode="decimal" step="0.1" value={s.riskPctPerTrade}
            onChange={e => set({ riskPctPerTrade: Number(e.target.value) })} /></div>
        <div className="field"><label>Daily Stop %</label>
          <input type="number" inputMode="decimal" step="0.1" value={s.dailyLossLimit}
            onChange={e => set({ dailyLossLimit: Number(e.target.value) })} /></div>
        <div className="field"><label>Max Trades/Day</label>
          <input type="number" inputMode="numeric" value={s.maxTradesPerDay}
            onChange={e => set({ maxTradesPerDay: Number(e.target.value) })} /></div>
      </div>
      <div className="row2">
        <div className="field"><label>Options $/contract</label>
          <input type="number" inputMode="decimal" step="0.01" value={s.commPerContract}
            onChange={e => set({ commPerContract: Number(e.target.value) })} /></div>
        <div className="field"><label>Stock $/trade</label>
          <input type="number" inputMode="decimal" step="0.01" value={s.commPerStock}
            onChange={e => set({ commPerStock: Number(e.target.value) })} /></div>
      </div>
      <div className="field"><label>Pattern day trader counter</label>
        <div className="toggle">
          <button className={s.trackPDT ? 'on' : ''} onClick={() => set({ trackPDT: true })}>Track</button>
          <button className={!s.trackPDT ? 'on' : ''} onClick={() => set({ trackPDT: false })}>Off</button>
        </div>
      </div>
      <div className="alert info" style={{ marginTop: 0 }}>
        Fidelity flags a margin account under $25k that makes 4+ day trades in 5 business days. The desk counts yours so the broker never surprises you.
      </div>

      <h3>My Setups</h3>
      <textarea style={{ minHeight: 110 }} value={s.setups.join('\n')}
        onChange={e => set({ setups: lines(e.target.value) })} />
      <h3>My Mistakes</h3>
      <textarea style={{ minHeight: 110 }} value={s.mistakes.join('\n')}
        onChange={e => set({ mistakes: lines(e.target.value) })} />
      <h3>Pre-Trade Checklist</h3>
      <textarea style={{ minHeight: 110 }} value={s.checklist.join('\n')}
        onChange={e => set({ checklist: lines(e.target.value) })} />

      <h3>Your Data</h3>
      <div className="alert info" style={{ marginTop: 0 }}>
        {trades.length} trades stored in this browser. Nothing leaves the device — take a backup you can restore anywhere.
      </div>
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button className="btn full" onClick={exportJson}>Export Backup</button>
        <button className="btn danger full" onClick={() => {
          if (!armed) { setArmed(true); return; }
          void wipeAll(); onClose(); say('JOURNAL WIPED', 'bad');
        }}>{armed ? 'Tap Again To Wipe Everything' : 'Wipe All Data'}</button>
      </div>

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={() => { void saveSettings(s); onClose(); say('SETTINGS SAVED', 'good'); }}>Save</button>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
