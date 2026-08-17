import { createWorker, type Worker } from 'tesseract.js';

const BASE = import.meta.env.BASE_URL;

let workerPromise: Promise<Worker> | null = null;

/** One worker, created lazily and reused. Recognition runs off the main
 *  thread, so the UI keeps responding while a screenshot is read. */
function getWorker(onProgress?: (p: number) => void): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      workerPath: `${BASE}tess/worker.min.js`,
      corePath: `${BASE}tess/`,
      langPath: `${BASE}tess/`,
      gzip: true,
      logger: m => {
        if (m.status === 'recognizing text' && onProgress) onProgress(m.progress);
      },
    });
  }
  return workerPromise;
}

export interface OcrResult { text: string; confidence: number; thumb: string }

/** Upscale and boost contrast before recognition. A 640px-wide phone
 *  screenshot recognises poorly; the same image at ~1600px does not. */
export function preprocess(img: HTMLImageElement): { canvas: HTMLCanvasElement; thumb: string } {
  const targetW = Math.min(2400, Math.max(1600, img.naturalWidth));
  const scale = targetW / img.naturalWidth;
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);

  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  // Grayscale, then stretch contrast around mid-grey. Deliberately not a
  // hard threshold — binarising anti-aliased screen text loses strokes.
  for (let i = 0; i < px.length; i += 4) {
    const g = 0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!;
    const c = Math.max(0, Math.min(255, (g - 128) * 1.45 + 128));
    px[i] = px[i + 1] = px[i + 2] = c;
  }
  ctx.putImageData(data, 0, 0);

  // small preview for the review card
  const tc = document.createElement('canvas');
  const tw = 300, th = Math.round(h * (tw / w));
  tc.width = tw; tc.height = th;
  tc.getContext('2d')!.drawImage(canvas, 0, 0, tw, th);

  return { canvas, thumb: tc.toDataURL('image/jpeg', 0.7) };
}

export function loadImage(src: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file could not be opened as an image.'));
    img.src = typeof src === 'string' ? src : URL.createObjectURL(src);
  });
}

export async function readScreenshot(
  file: Blob,
  onProgress?: (p: number) => void,
): Promise<OcrResult> {
  const img = await loadImage(file);
  const { canvas, thumb } = preprocess(img);
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(canvas);
  return { text: data.text, confidence: (data.confidence ?? 0) / 100, thumb };
}

/** Warm the model up so the first real capture is not the slow one. */
export function prewarm() { void getWorker(); }
