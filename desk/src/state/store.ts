import { create } from 'zustand';
import type { Trade, Settings, DayRecord } from '../types';
import { DEFAULT_SETTINGS } from '../lib/constants';
import { todayKey } from '../lib/date';
import * as dbx from './db';

export type Tab = 'desk' | 'cal' | 'trades' | 'edge';

interface DeskState {
  ready: boolean;
  trades: Trade[];
  days: Record<string, DayRecord>;
  settings: Settings;
  tab: Tab;
  toast: { msg: string; kind: 'good' | 'bad' | '' } | null;

  hydrate: () => Promise<void>;
  setTab: (t: Tab) => void;
  say: (msg: string, kind?: 'good' | 'bad' | '') => void;

  addTrades: (t: Trade[]) => Promise<void>;
  saveTrade: (t: Trade) => Promise<void>;
  deleteTrade: (id: string) => Promise<void>;
  setDay: (key: string, patch: Partial<DayRecord>) => Promise<void>;
  toggleCheck: (i: number) => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  wipeAll: () => Promise<void>;
}

export const useDesk = create<DeskState>((set, get) => ({
  ready: false,
  trades: [],
  days: {},
  settings: DEFAULT_SETTINGS,
  tab: 'desk',
  toast: null,

  hydrate: async () => {
    const { trades, days, settings } = await dbx.loadAll();
    set({ trades, days, settings, ready: true });
  },
  setTab: (tab) => set({ tab }),
  say: (msg, kind = '') => {
    set({ toast: { msg, kind } });
    setTimeout(() => { if (get().toast?.msg === msg) set({ toast: null }); }, 2600);
  },

  addTrades: async (incoming) => {
    await dbx.putTrades(incoming);
    set({ trades: [...get().trades, ...incoming] });
  },
  saveTrade: async (t) => {
    await dbx.putTrade(t);
    const list = get().trades;
    const i = list.findIndex(x => x.id === t.id);
    set({ trades: i >= 0 ? [...list.slice(0, i), t, ...list.slice(i + 1)] : [...list, t] });
  },
  deleteTrade: async (id) => {
    await dbx.removeTrade(id);
    set({ trades: get().trades.filter(t => t.id !== id) });
  },
  setDay: async (key, patch) => {
    const next = { ...(get().days[key] ?? {}), ...patch };
    await dbx.putDay(key, next);
    set({ days: { ...get().days, [key]: next } });
  },
  toggleCheck: async (i) => {
    const key = todayKey();
    const day = get().days[key] ?? {};
    const checks = { ...(day.checks ?? {}), [i]: !(day.checks?.[i]) };
    await get().setDay(key, { checks });
  },
  saveSettings: async (s) => {
    await dbx.putSettings(s);
    set({ settings: s });
  },
  wipeAll: async () => {
    await dbx.wipe();
    set({ trades: [], days: {}, settings: DEFAULT_SETTINGS });
  },
}));
