/** All date handling is local-time only — UTC conversion silently shifts
 *  a trade into the wrong session. */
export function keyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const todayKey = () => keyOf(new Date());

export function dateFromKey(k: string): Date {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}
export function hhmmToMin(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(s || '');
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
export function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
/** The 5 most recent business days, newest first — the PDT window. */
export function businessWindow(n = 5): string[] {
  const out: string[] = [];
  const d = new Date();
  while (out.length < n) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) out.push(keyOf(d));
    d.setDate(d.getDate() - 1);
  }
  return out;
}
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
