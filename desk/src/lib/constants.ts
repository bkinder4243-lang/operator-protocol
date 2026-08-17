import type { Strategy, StrategyId, Settings } from '../types';

export const OPT_MULT = 100;

export const STRATEGIES: Strategy[] = [
  { id: 'long_call',     label: 'Long Call',     kind: 'option', side: 'long'  },
  { id: 'long_put',      label: 'Long Put',      kind: 'option', side: 'long'  },
  { id: 'debit_spread',  label: 'Debit Spread',  kind: 'option', side: 'long'  },
  { id: 'credit_spread', label: 'Credit Spread', kind: 'option', side: 'short' },
  { id: 'covered_call',  label: 'Covered Call',  kind: 'option', side: 'short' },
  { id: 'csp',           label: 'Cash-Sec. Put', kind: 'option', side: 'short' },
  { id: 'shares_long',   label: 'Shares Long',   kind: 'stock',  side: 'long'  },
  { id: 'shares_short',  label: 'Shares Short',  kind: 'stock',  side: 'short' },
];
export const STRAT: Record<StrategyId, Strategy> =
  Object.fromEntries(STRATEGIES.map(s => [s.id, s])) as Record<StrategyId, Strategy>;

export const MOODS = [
  { v: 1, e: '\u{1F975}', l: 'Tilted'  },
  { v: 2, e: '\u{1F615}', l: 'Anxious' },
  { v: 3, e: '\u{1F610}', l: 'Neutral' },
  { v: 4, e: '\u{1F642}', l: 'Sharp'   },
  { v: 5, e: '\u{1F60E}', l: 'Locked'  },
];

export const TIME_BUCKETS = [
  { label: '09:30-10:00', from: 570, to: 600 },
  { label: '10:00-11:30', from: 600, to: 690 },
  { label: '11:30-14:00', from: 690, to: 840 },
  { label: '14:00-15:30', from: 840, to: 930 },
  { label: '15:30-16:00', from: 930, to: 960 },
];

export const DEFAULT_SETTINGS: Settings = {
  accountSize: 10000,
  accountType: 'margin',
  riskPctPerTrade: 1,
  dailyLossLimit: 2,
  maxTradesPerDay: 4,
  commPerContract: 0.65,
  commPerStock: 0,
  trackPDT: true,
  setups: ['Gap & Go', 'Opening Drive', 'VWAP Reclaim', 'Bull Flag', 'Bear Flag',
           'Breakout', 'Failed Breakdown', 'News Spike', 'Trend Continuation', 'Mean Reversion'],
  mistakes: ['Chased entry', 'No stop set', 'Moved stop', 'Sized too big', 'FOMO',
             'Revenge trade', 'Cut winner early', 'Held past exit', 'Traded chop',
             'Broke checklist', 'Averaged down'],
  checklist: ['I can name the setup out loud',
              'Stop and target are set BEFORE entry',
              'Risk is inside my per-trade limit',
              'This is not a revenge / boredom trade',
              'Liquidity is fine (tight spread, real volume)',
              'I am not over my trade count for the day'],
};
