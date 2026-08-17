/**
 * Copies the Tesseract worker + WASM cores out of node_modules and fetches
 * the English model into public/tess.
 *
 * These are ~20 MB of build outputs, so they are generated rather than
 * committed. Runs automatically before dev and build; skips work already done.
 */
import { mkdirSync, existsSync, copyFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'public/tess';
const LANG_URL = 'https://tessdata.projectnaptha.com/4.0.0_fast/eng.traineddata.gz';

mkdirSync(OUT, { recursive: true });

const copy = (from, name) => {
  const dest = join(OUT, name);
  if (existsSync(dest) && statSync(dest).size > 0) return false;
  copyFileSync(from, dest);
  return true;
};

let copied = 0;
if (copy('node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js')) copied++;
for (const f of readdirSync('node_modules/tesseract.js-core')) {
  // LSTM cores only — the app runs the LSTM engine, not the legacy one.
  if (/lstm\.wasm(\.js)?$/.test(f) && copy(join('node_modules/tesseract.js-core', f), f)) copied++;
}

const lang = join(OUT, 'eng.traineddata.gz');
if (!existsSync(lang) || statSync(lang).size < 100_000) {
  process.stdout.write('fetching English OCR model… ');
  const res = await fetch(LANG_URL);
  if (!res.ok) {
    console.error(`\nCould not download ${LANG_URL} (HTTP ${res.status}).`);
    process.exit(1);
  }
  writeFileSync(lang, Buffer.from(await res.arrayBuffer()));
  console.log('done');
  copied++;
}
console.log(copied ? `OCR assets ready (${copied} file${copied === 1 ? '' : 's'} added).` : 'OCR assets already present.');
