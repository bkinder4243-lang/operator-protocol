import type { Execution } from '../types';

/* ============================================================
   Fidelity mobile screenshot -> executions.

   OCR gives us text with no reliable layout, so this parser keys off
   Fidelity's VOCABULARY ("Bought to Open", "contracts", "Filled"),
   not pixel positions. That survives app redesigns and cropping.

   Every field carries a confidence contribution; a block that cannot
   produce symbol + qty + price is rejected rather than guessed, and
   whatever survives still goes to a human review card.
   ============================================================ */

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12,
};

/** Words that look like tickers but are not. */
const NOT_TICKERS = new Set([
  'BUY', 'SELL', 'CALL', 'PUT', 'OPEN', 'CLOSE', 'FILLED', 'ORDER', 'TOTAL',
  'CASH', 'NET', 'QTY', 'AM', 'PM', 'EST', 'EDT', 'USD', 'AVG', 'PRICE',
  'SHARES', 'SHARE', 'CONTRACT', 'CONTRACTS', 'ACCOUNT', 'ACTIVITY', 'TRADE',
  'BOUGHT', 'SOLD', 'LIMIT', 'MARKET', 'STOP', 'DAY', 'GTC', 'EXP', 'STRIKE',
  'ROTH', 'IRA', 'INDIVIDUAL', 'BROKERAGE', 'PENDING', 'EXECUTED', 'SETTLED',
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
]);

/** OCR confuses letters and digits. Fix only inside number-shaped tokens,
 *  so tickers are never corrupted. */
export function normalizeOcr(raw: string): string {
  // A token is "number-shaped" when it holds at least one digit and every
  // character is either numeric punctuation or a known digit-lookalike.
  // "$l.8O" qualifies and becomes "$1.80"; "AUG" and "NVDA" never do.
  const NUMERIC_SHAPE = /^[$@(]*[0-9OolIi|SsBbZz.,:/-]+[)%$]*$/;
  return raw
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u2019\u2018]/g, "'")
    .split('\n')
    .map(line => line
      .split(/(\s+)/)
      .map(tok => {
        if (!/\d/.test(tok) || !NUMERIC_SHAPE.test(tok)) return tok;
        return tok
          .replace(/[Oo]/g, '0')
          .replace(/[lIi|]/g, '1')
          .replace(/[Ss]/g, '5')
          .replace(/[Bb]/g, '8')
          .replace(/[Zz]/g, '2');
      })
      .join(''))
    .join('\n');
}

const cleanLines = (t: string): string[] =>
  t.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

function toNum(s: string | undefined): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** 'Aug 14, 2026' | '08/14/2026' | '8/14/26' | 'Aug 14' -> YYYY-MM-DD */
export function parseAnyDate(text: string, fallbackYear = new Date().getFullYear()): string | null {
  const t = text.toUpperCase();
  let m = /\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT|SEP|OCT|NOV|DEC)[A-Z]*\.?\s+(\d{1,2})(?:\s*,)?(?:\s+(\d{2,4}))?/.exec(t);
  if (m) {
    const mo = MONTHS[m[1]!]!;
    const day = Number(m[2]);
    let yr = m[3] ? Number(m[3]) : fallbackYear;
    if (yr < 100) yr += 2000;
    return `${yr}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t);
  if (m) {
    let yr = m[3] ? Number(m[3]) : fallbackYear;
    if (yr < 100) yr += 2000;
    return `${yr}-${String(Number(m[1])).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
  }
  return null;
}

/** '10:32 AM' -> '10:32' (24h) */
export function parseTime(text: string): string {
  const m = /\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?\b/i.exec(text);
  if (!m) return '';
  let h = Number(m[1]);
  const mer = m[3]?.toUpperCase();
  if (mer === 'PM' && h < 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

function findTicker(block: string): string | null {
  const cands = block.toUpperCase().match(/\b[A-Z]{1,5}\b/g) ?? [];
  for (const c of cands) if (!NOT_TICKERS.has(c)) return c;
  return null;
}

interface OptionInfo { strike: number; right: 'C' | 'P'; expiry: string }

/** 'NVDA AUG 21 2026 $175 CALL' / 'NVDA 8/21/26 175C' */
function findOption(block: string): OptionInfo | null {
  const t = block.toUpperCase();
  let right: 'C' | 'P' | null = null;
  if (/\bCALLS?\b/.test(t)) right = 'C';
  else if (/\bPUTS?\b/.test(t)) right = 'P';
  else {
    const m = /\b\d+(?:\.\d+)?\s*([CP])\b/.exec(t);
    if (m) right = m[1] as 'C' | 'P';
  }
  if (!right) return null;

  // Strike: prefer a $-prefixed number, else the number next to CALL/PUT
  let strike = toNum((/\$\s*(\d{1,5}(?:\.\d{1,2})?)/.exec(t) ?? [])[1]);
  if (strike === null) {
    const m = /(\d{1,5}(?:\.\d{1,2})?)\s*(?:C\b|P\b|CALL|PUT)/.exec(t);
    strike = toNum(m?.[1]);
  }
  if (strike === null) return null;
  // Expiry belongs to the contract line only — the fill date sits elsewhere
  // in the block and would otherwise be swallowed here.
  const contractLine = block.split('\n').find(l => /\bCALLS?\b|\bPUTS?\b|\d\s*[CP]\b/i.test(l)) ?? '';
  return { strike, right, expiry: parseAnyDate(contractLine) ?? '' };
}

/** The date the order FILLED — not the option's expiry, which also
 *  appears in the block and sorts earlier in the text. */
function findFillDate(lines: string[]): string | null {
  const dated = lines.filter(l => /FILLED|EXECUTED|COMPLETED|PLACED|TRADE DATE|SETTLED/i.test(l));
  for (const l of dated) { const d = parseAnyDate(l); if (d) return d; }
  // otherwise any line that is not the contract description
  for (const l of lines) {
    if (/\bCALLS?\b|\bPUTS?\b/i.test(l)) continue;
    const d = parseAnyDate(l);
    if (d) return d;
  }
  return null;
}

interface Block { lines: string[]; text: string; anchorIdx: number }

/** Split the page into one block per fill, anchored on the action verb. */
function blocksFrom(lines: string[]): Block[] {
  const ACTION = /\b(bought|sold|buy|sell)\b/i;
  const idx: number[] = [];
  lines.forEach((l, i) => { if (ACTION.test(l)) idx.push(i); });
  if (!idx.length) return lines.length ? [{ lines, text: lines.join(' \n '), anchorIdx: 0 }] : [];

  return idx.map((anchor, n) => {
    const prev = n === 0 ? 0 : idx[n - 1]! + 1;
    const next = n === idx.length - 1 ? lines.length : idx[n + 1]!;
    // reach back to the ticker/contract header, forward to fill details
    const from = Math.max(prev, anchor - 3);
    const to = Math.min(next, anchor + 4);
    const slice = lines.slice(from, to);
    return { lines: slice, text: slice.join(' \n '), anchorIdx: anchor - from };
  });
}

export interface ParseResult { execs: Execution[]; warnings: string[] }

export function parseFidelityText(raw: string): ParseResult {
  const text = normalizeOcr(raw);
  const lines = cleanLines(text);
  const warnings: string[] = [];
  const execs: Execution[] = [];
  const pageDate = findFillDate(lines);

  for (const block of blocksFrom(lines)) {
    const t = block.text;
    const upper = t.toUpperCase();
    // Detail lines (qty, price, time, fill date) sit BELOW the action verb;
    // the ticker and contract sit above it. Reading details from the
    // anchor down stops one card inheriting the card before it.
    const below = block.lines.slice(block.anchorIdx);
    const belowText = below.join(' \n ');
    const belowUpper = belowText.toUpperCase();
    const pick = <T,>(a: T | null, b: T | null): T | null => (a !== null && a !== undefined ? a : b);

    const isBuy = /\bBOUGHT\b|\bBUY\b/.test(upper);
    const isSell = /\bSOLD\b|\bSELL\b/.test(upper);
    if (!isBuy && !isSell) continue;

    const symbol = findTicker(t);
    if (!symbol) { warnings.push(`No ticker found near "${block.lines[0] ?? ''}"`); continue; }

    const opt = findOption(t);
    const isOption = !!opt;

    // Quantity: "2 contracts" / "100 shares" / "Qty 2" / "x2"
    const readQty = (src: string): number | null => {
      let q = toNum((/(\d[\d,]*(?:\.\d+)?)\s*(?:CONTRACTS?|SHARES?|SHS)\b/.exec(src) ?? [])[1]);
      if (q === null) q = toNum((/\bQTY\.?\s*:?\s*(\d[\d,]*(?:\.\d+)?)/.exec(src) ?? [])[1]);
      if (q === null) q = toNum((/\b(?:BOUGHT|SOLD|BUY|SELL)(?:\s+TO\s+\w+)?\s+(\d[\d,]*(?:\.\d+)?)\b/.exec(src) ?? [])[1]);
      if (q === null) q = toNum((/\bX\s*(\d[\d,]*)\b/.exec(src) ?? [])[1]);
      return q;
    };
    const qty = pick(readQty(belowUpper), readQty(upper));

    // Price: after @ or "at", else a $ amount that is not the order total
    const readPrice = (src: string): number | null => {
      const at = toNum((/(?:@|\bAT\b)\s*\$?\s*(\d[\d,]*(?:\.\d+)?)/.exec(src) ?? [])[1]);
      if (at !== null) return at;
      const money = [...src.matchAll(/\$\s*(\d[\d,]*(?:\.\d{1,4})?)/g)]
        .map(m => toNum(m[1]))
        .filter((n): n is number => n !== null);
      // the strike is also $-prefixed — drop it before guessing
      const pool = opt ? money.filter(v => v !== opt.strike) : money;
      if (!pool.length) return null;
      return isOption ? Math.min(...pool) : pool[0]!;
    };
    const price = pick(readPrice(belowUpper), readPrice(upper));

    // Name every unreadable field, not just the first — the review card
    // highlights exactly what needs a human.
    const missing: string[] = [];
    if (qty === null) missing.push('quantity');
    if (price === null) missing.push('price');
    if (missing.length) {
      warnings.push(`Could not read ${missing.join(' or ')} for ${symbol} — add ${missing.length > 1 ? 'them' : 'it'} on the review card.`);
    }

    const date = findFillDate(below) ?? findFillDate(block.lines) ?? pageDate ??
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

    // Confidence: each field we read cleanly earns its share.
    let confidence = 0.25;
    if (symbol) confidence += 0.2;
    if (qty !== null) confidence += 0.2;
    if (price !== null) confidence += 0.2;
    if (isOption && opt?.expiry) confidence += 0.1;
    if (findFillDate(below) ?? findFillDate(block.lines)) confidence += 0.05;

    execs.push({
      date,
      time: parseTime(belowText) || parseTime(t),
      symbol,
      key: isOption && opt ? `${symbol}|${opt.expiry}|${opt.right}|${opt.strike}` : symbol,
      side: isBuy ? 'buy' : 'sell',
      qty: qty ?? 0,
      price: price ?? 0,
      isOption,
      strike: opt?.strike ?? null,
      expiry: opt?.expiry ?? '',
      right: opt?.right ?? '',
      explicitOpen: /TO\s+OPEN|OPENING/.test(upper),
      explicitClose: /TO\s+CLOSE|CLOSING/.test(upper),
      confidence: Math.min(1, confidence),
      raw: block.lines.join('\n'),
    });
  }

  if (!execs.length && lines.length)
    warnings.push('No buy or sell lines recognised. Crop the screenshot to the order details and try again.');

  return { execs, warnings };
}
