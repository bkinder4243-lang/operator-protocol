# operator-protocol

## trade-desk

`journal.html` — an options / short-term momentum trading journal. Same
single-file, localStorage, no-server architecture as the main app.

- **P&L calendar** with weekly totals, month summary and a daily-P&L bar chart
- **Equity curve** with drag-to-read tooltips, plus a 30-session sparkline
- **Tilt guards** — loss streaks, daily stop, overtrading, revenge re-entries,
  size escalation after a loss
- **PDT counter** — day trades in the rolling 5 business days, because Fidelity
  restricts margin accounts under $25k at 4
- **Fidelity CSV import** — Activity & Orders → History → Download, paired into
  round-trip trades
- **Edge analytics** — R-multiples, expectancy, profit factor, process-vs-outcome,
  mistake ledger, time-of-day, hold time

Open `journal.html`. Data stays on the device; use Export Backup to move it.
