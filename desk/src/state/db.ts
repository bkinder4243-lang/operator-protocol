import Dexie, { type Table } from 'dexie';
import type { Trade, DayRecord, Settings } from '../types';
import { DEFAULT_SETTINGS } from '../lib/constants';

/** IndexedDB, not localStorage: a journal grows for years and the 5 MB
 *  string cap is not a limit you want to discover mid-session. */
class DeskDB extends Dexie {
  trades!: Table<Trade, string>;
  days!: Table<DayRecord & { key: string }, string>;
  kv!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('trade-desk');
    this.version(1).stores({
      trades: 'id, date, exitDate, symbol, status, reviewed',
      days: 'key',
      kv: 'key',
    });
  }
}
export const db = new DeskDB();

export async function loadAll(): Promise<{ trades: Trade[]; days: Record<string, DayRecord>; settings: Settings }> {
  const [trades, dayRows, settingsRow] = await Promise.all([
    db.trades.toArray(),
    db.days.toArray(),
    db.kv.get('settings'),
  ]);
  const days: Record<string, DayRecord> = {};
  for (const d of dayRows) {
    const { key, ...rest } = d;
    days[key] = rest;
  }
  return {
    trades,
    days,
    settings: { ...DEFAULT_SETTINGS, ...(settingsRow?.value as Partial<Settings> | undefined) },
  };
}
export const putTrades   = (t: Trade[]) => db.trades.bulkPut(t);
export const putTrade    = (t: Trade) => db.trades.put(t);
export const removeTrade = (id: string) => db.trades.delete(id);
export const putDay      = (key: string, d: DayRecord) => db.days.put({ key, ...d });
export const putSettings = (s: Settings) => db.kv.put({ key: 'settings', value: s });
export async function wipe() {
  await Promise.all([db.trades.clear(), db.days.clear(), db.kv.clear()]);
}
