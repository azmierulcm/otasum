'use client';

export async function extractPdfText(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<string> {
  // Dynamic import — only runs in the browser, never during SSR/prerendering.
  const pdfjsLib = await import('pdfjs-dist');

  // Try CDN worker (faster). If it fails on this browser (e.g. older iOS Safari
  // that doesn't support .mjs module workers), fall back to main-thread mode.
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();

  // First attempt — with CDN worker
  let pdfDoc: Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;
  try {
    pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  } catch {
    // Worker failed (common on older iPad/iPhone Safari). Disable worker and
    // run in main-thread mode — slower but universally compatible.
    console.warn('[pdfExtract] worker failed, retrying in main-thread mode');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  }

  const pages: string[] = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();

    const textItems: Array<{ str: string; x: number; y: number }> = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const transform = 'transform' in item ? item.transform : [1, 0, 0, 1, 0, 0];
      textItems.push({
        str: item.str,
        x: Number(transform[4] ?? 0),
        y: Number(transform[5] ?? 0),
      });
    }

    // Reconstruct lines by grouping items with similar y-coordinates
    const lines = new Map<number, typeof textItems>();
    for (const item of textItems) {
      const yKey = Math.round(item.y / 2) * 2;
      lines.set(yKey, [...(lines.get(yKey) ?? []), item]);
    }

    const pageText = Array.from(lines.entries())
      .sort(([a], [b]) => b - a)
      .map(([, line]) =>
        line
          .sort((a, b) => a.x - b.x)
          .map(item => item.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .filter(Boolean)
      .join('\n');

    pages.push(pageText);
    onProgress?.(i, pdfDoc.numPages);
  }

  return pages.join('\n');
}
