import { useEffect, useRef, useState } from 'react';
import { readScreenshot, prewarm } from '../ocr/runOcr';
import { parseFidelityText } from '../ocr/parseFidelity';
import { pairExecutions, fingerprint } from '../lib/pair';
import { useDesk } from '../state/store';
import { netPnl } from '../lib/pnl';
import { STRATEGIES, MOODS } from '../lib/constants';
import { Modal, money, cls, rStr } from './ui';
import { rMultiple } from '../lib/pnl';
import type { Trade } from '../types';

type Stage = { kind: 'idle' } | { kind: 'busy'; msg: string; pct: number };

/** Screenshot in, trades out. Paste, drop, or pick — then one confirm.
 *  The review step exists because a misread digit is a wrong P&L, and
 *  OCR is weakest on exactly the tabular text brokers use. */
export function Capture() {
  const { trades, settings, addTrades, say } = useDesk();
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [drag, setDrag] = useState(false);
  const [pending, setPending] = useState<Trade[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [thumb, setThumb] = useState<string>('');
  const [rawText, setRawText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { prewarm(); }, []);

  // Paste a screenshot straight from the clipboard — the fastest path on desktop.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find(i => i.type.startsWith('image/'));
      if (item) { const f = item.getAsFile(); if (f) { e.preventDefault(); void handleFiles([f]); } return; }
      const text = e.clipboardData?.getData('text');
      if (text && /bought|sold|buy|sell/i.test(text)) { e.preventDefault(); ingestText(text, ''); }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  });

  function ingestText(text: string, thumbUrl: string) {
    setRawText(text);
    const { execs, warnings: w } = parseFidelityText(text);
    const paired = pairExecutions(execs);
    const seen = new Set(trades.map(fingerprint));
    const fresh = paired.filter(t => !seen.has(fingerprint(t)));
    const dupes = paired.length - fresh.length;

    const notes = [...w];
    if (dupes) notes.push(`${dupes} trade${dupes > 1 ? 's were' : ' was'} already in your journal and skipped.`);
    setWarnings(notes);
    setThumb(thumbUrl);

    if (!fresh.length) {
      setStage({ kind: 'idle' });
      say(dupes ? 'ALREADY LOGGED' : 'NOTHING READABLE FOUND', dupes ? '' : 'bad');
      if (!dupes) setPending([]);       // still open the sheet so the raw text is visible
      return;
    }
    setPending(fresh.map(t => ({ ...t, capture: { ...t.capture!, thumb: thumbUrl } })));
    setStage({ kind: 'idle' });
  }

  async function handleFiles(files: File[]) {
    const images = files.filter(f => f.type.startsWith('image/'));
    if (!images.length) { say('THAT IS NOT AN IMAGE', 'bad'); return; }
    try {
      let allText = '', lastThumb = '';
      for (let i = 0; i < images.length; i++) {
        setStage({ kind: 'busy', msg: images.length > 1 ? `READING ${i + 1}/${images.length}` : 'READING SCREENSHOT', pct: 0 });
        const res = await readScreenshot(images[i]!, p =>
          setStage({ kind: 'busy', msg: images.length > 1 ? `READING ${i + 1}/${images.length}` : 'READING SCREENSHOT', pct: p }));
        allText += res.text + '\n';
        lastThumb = res.thumb;
      }
      ingestText(allText, lastThumb);
    } catch (err) {
      setStage({ kind: 'idle' });
      say(err instanceof Error ? err.message.toUpperCase() : 'COULD NOT READ THAT IMAGE', 'bad');
    }
  }

  async function commit(list: Trade[]) {
    await addTrades(list);
    const net = list.reduce((a, t) => a + netPnl(t, settings), 0);
    setPending(null);
    say(`${list.length} TRADE${list.length > 1 ? 'S' : ''} LOGGED · ${money(net)}`, net >= 0 ? 'good' : 'bad');
  }

  const busy = stage.kind === 'busy';
  return (
    <>
      <div
        className={`capture${drag ? ' drag' : ''}${busy ? ' busy' : ''}`}
        onClick={() => !busy && fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); void handleFiles([...e.dataTransfer.files]); }}
        role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
      >
        <div className="big">{busy ? stage.msg : '\u{1F4F8} Add Trade From Screenshot'}</div>
        <div className="sm">
          {busy
            ? 'Reading on this device — nothing is uploaded'
            : 'Tap to pick from your camera roll · drag a file in · or just paste (⌘V)'}
        </div>
        {busy && <div className="progress"><i style={{ width: `${Math.round(stage.pct * 100)}%` }} /></div>}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden
        onChange={e => { void handleFiles([...(e.target.files ?? [])]); e.target.value = ''; }} />

      {pending && (
        <ReviewSheet
          trades={pending}
          warnings={warnings}
          thumb={thumb}
          rawText={rawText}
          onCancel={() => setPending(null)}
          onSave={commit}
        />
      )}
    </>
  );
}

function ReviewSheet({ trades, warnings, thumb, rawText, onCancel, onSave }: {
  trades: Trade[]; warnings: string[]; thumb: string; rawText: string;
  onCancel: () => void; onSave: (t: Trade[]) => void;
}) {
  const { settings } = useDesk();
  const [list, setList] = useState<Trade[]>(trades);
  const [showRaw, setShowRaw] = useState(false);

  const patch = (i: number, p: Partial<Trade>) =>
    setList(l => l.map((t, n) => n === i ? { ...t, ...p, reviewed: true } : t));

  const net = list.reduce((a, t) => a + netPnl(t, settings), 0);

  return (
    <Modal title={list.length ? 'Confirm' : 'Nothing Found'}
      sub={list.length ? `${list.length} trade${list.length > 1 ? 's' : ''} · ${money(net)}` : undefined}
      onClose={onCancel}>

      {thumb && <img className="shot" src={thumb} alt="The screenshot you captured" />}

      {warnings.map((w, i) => <div key={i} className="alert warn">{w}</div>)}

      {!list.length && (
        <>
          <div className="empty">
            No buy or sell lines were recognised.<br />
            Crop tighter around the order details, or paste the text instead.
          </div>
          <button className="btn ghost wide" onClick={() => setShowRaw(s => !s)}>
            {showRaw ? 'Hide' : 'Show'} What Was Read
          </button>
          {showRaw && <pre className="raw" style={{ marginTop: 8 }}>{rawText || '(nothing)'}</pre>}
        </>
      )}

      {list.map((t, i) => {
        const conf = t.capture?.confidence ?? 1;
        const low = conf < 0.75;
        const p = netPnl(t, settings);
        const r = rMultiple(t, settings);
        return (
          <div key={t.id} className={`review${low ? ' low' : ''}`}>
            <div className="review-head">
              <span className="sym">{t.symbol}{t.strike ? ` ${t.strike}${t.right}` : ''}</span>
              <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {t.status === 'closed' && (
                  <span className={`mono ${cls(p)}`} style={{ fontSize: 13, fontWeight: 600 }}>
                    {money(p)}{r !== null ? ` · ${rStr(r)}` : ''}
                  </span>
                )}
                <span className={`conf ${low ? 'lo' : 'hi'}`}>{Math.round(conf * 100)}%</span>
              </span>
            </div>

            {low && <div className="alert warn" style={{ marginTop: 0, marginBottom: 8 }}>
              Low confidence — check these numbers against the screenshot before saving.
            </div>}

            <div className="row3">
              <div className="field"><label>Symbol</label>
                <input value={t.symbol} onChange={e => patch(i, { symbol: e.target.value.toUpperCase() })} /></div>
              <div className="field"><label>Qty</label>
                <input type="number" inputMode="decimal" value={t.qty}
                  onChange={e => patch(i, { qty: Number(e.target.value) })} /></div>
              <div className="field"><label>Strategy</label>
                <select value={t.strategy} onChange={e => patch(i, { strategy: e.target.value as Trade['strategy'] })}>
                  {STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select></div>
            </div>
            <div className="row3">
              <div className="field"><label>Entry</label>
                <input type="number" inputMode="decimal" step="0.01" value={t.entry}
                  onChange={e => patch(i, { entry: Number(e.target.value) })} /></div>
              <div className="field"><label>Exit</label>
                <input type="number" inputMode="decimal" step="0.01" value={t.exit ?? ''}
                  placeholder="open"
                  onChange={e => patch(i, {
                    exit: e.target.value === '' ? null : Number(e.target.value),
                    status: e.target.value === '' ? 'open' : 'closed',
                    exitDate: e.target.value === '' ? undefined : (t.exitDate ?? t.date),
                  })} /></div>
              <div className="field"><label>Stop</label>
                <input type="number" inputMode="decimal" step="0.01" value={t.stop ?? ''} placeholder="for R"
                  onChange={e => patch(i, { stop: e.target.value === '' ? null : Number(e.target.value) })} /></div>
            </div>
            <div className="field"><label>Date</label>
              <input type="date" value={t.date} onChange={e => patch(i, { date: e.target.value })} /></div>
            <div className="row2">
              <div className="field"><label>Time In</label>
                <input type="time" value={t.time} onChange={e => patch(i, { time: e.target.value })} /></div>
              <div className="field"><label>Time Out</label>
                <input type="time" value={t.exitTime} onChange={e => patch(i, { exitTime: e.target.value })} /></div>
            </div>

            <div className="field" style={{ marginBottom: 6 }}><label>Setup</label>
              <select value={t.setup} onChange={e => patch(i, { setup: e.target.value })}>
                <option value="">— none —</option>
                {settings.setups.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}><label>How did you feel taking it?</label>
              <div className="mood-row">
                {MOODS.map(m => (
                  <button key={m.v} type="button"
                    className={`mood-btn${t.emoEntry === m.v ? ' on' : ''}`}
                    onClick={() => patch(i, { emoEntry: m.v })}>
                    {m.e}<span className="ml">{m.l}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })}

      {list.length > 0 && (
        <>
          <button className="btn ghost wide sm" style={{ marginTop: 4 }} onClick={() => setShowRaw(s => !s)}>
            {showRaw ? 'Hide' : 'Show'} Raw Text
          </button>
          {showRaw && <pre className="raw" style={{ marginTop: 8 }}>{rawText}</pre>}
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn primary full" onClick={() => onSave(list)}>
              Save {list.length} Trade{list.length > 1 ? 's' : ''}
            </button>
            <button className="btn ghost full" onClick={onCancel}>Discard</button>
          </div>
        </>
      )}
      {!list.length && <button className="btn ghost wide" style={{ marginTop: 10 }} onClick={onCancel}>Close</button>}
    </Modal>
  );
}
