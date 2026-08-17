# operator-protocol

## trade-desk

A trading journal for options and short-term momentum trading. Built to make
recording a trade take seconds, and to keep emotional trading visible.

Live at `/desk/` once GitHub Pages is enabled. Local-first: trades are stored
in the browser (IndexedDB) and never leave the device.

### Capture from a screenshot

Fidelity has no retail trading API, so the input is a screenshot of the mobile
app. Tap the capture zone (or drag a file in, or paste with ⌘V), and the app
reads it on-device with Tesseract, pairs opening and closing fills into
round-trip trades, and shows a review card for one-tap confirmation.

Nothing is auto-saved without review — OCR is weakest on exactly the tabular
text brokers use, and a misread digit is a wrong P&L.

### What it tracks

- **P&L calendar** with weekly totals, month summary and a daily-P&L chart
- **Equity curve** with drag-to-read tooltips, plus a 30-session sparkline
- **Tilt guards** — loss streaks, daily stop, overtrading, revenge re-entries
  (a re-entry within 5 minutes of a loss), size escalation after a loss
- **PDT counter** — day trades in the rolling 5 business days, because Fidelity
  restricts margin accounts under $25k at 4
- **Edge analytics** — R-multiple, expectancy, profit factor, breakeven win
  rate, max drawdown, process-vs-outcome, mistake ledger, and breakdowns by
  setup, time of day, day of week, mood, hold time and symbol

### Stack

React + TypeScript + Vite, Zustand for state, Dexie over IndexedDB,
Tesseract.js for OCR. No backend.

```bash
cd desk
npm install
npm run dev     # http://localhost:5173/operator-protocol/desk/
npm test        # money math + screenshot parser
npm run build
```

The OCR worker, WASM cores and English model (~22 MB) are build outputs, not
source. `npm run ocr:assets` fetches them into `public/tess`; `predev` and
`prebuild` run it automatically.

### Earlier version

`journal.html` is the original single-file version with CSV import. It still
works standalone and needs no build step.
