export type StrategyId =
  | 'long_call' | 'long_put' | 'debit_spread' | 'credit_spread'
  | 'covered_call' | 'csp' | 'shares_long' | 'shares_short';

export interface Strategy {
  id: StrategyId;
  label: string;
  kind: 'option' | 'stock';
  side: 'long' | 'short';
}

/** A round-trip position. Prices are per share / per contract. */
export interface Trade {
  id: string;
  date: string;            // YYYY-MM-DD, entry
  time: string;            // HH:MM, entry
  exitDate?: string;
  exitTime: string;
  symbol: string;
  strategy: StrategyId;
  qty: number;             // contracts or shares
  entry: number;
  exit: number | null;
  stop: number | null;
  target: number | null;
  fees: number | null;     // null = model it from settings
  strike: number | null;
  expiry: string;
  right: 'C' | 'P' | '';
  setup: string;
  mistakes: string[];
  notes: string;
  emoEntry: number;        // 1..5
  emoExit: number;
  followedPlan: boolean;
  reviewed: boolean;
  status: 'open' | 'closed';
  src: 'manual' | 'screenshot';
  /** OCR provenance, kept so a suspect number stays traceable. */
  capture?: { confidence: number; raw: string; thumb?: string };
}

export interface Settings {
  accountSize: number;
  accountType: 'margin' | 'cash';
  riskPctPerTrade: number;
  dailyLossLimit: number;   // % of account
  maxTradesPerDay: number;
  commPerContract: number;
  commPerStock: number;
  trackPDT: boolean;
  setups: string[];
  mistakes: string[];
  checklist: string[];
}

export interface DayRecord {
  note?: string;
  mood?: number;
  checks?: Record<number, boolean>;
}

/** One parsed fill, before pairing into a Trade. */
export interface Execution {
  date: string;
  symbol: string;
  key: string;             // contract identity for pairing
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  isOption: boolean;
  strike: number | null;
  expiry: string;
  right: 'C' | 'P' | '';
  time: string;
  explicitOpen: boolean;
  explicitClose: boolean;
  confidence: number;      // 0..1, how sure the parser is
  raw: string;             // the source lines, for the review card
}
