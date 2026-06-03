'use client';

import * as pdfjsLib from 'pdfjs-dist';

// jsdelivr is faster and more reliable on mobile than unpkg.
// Version is read from the installed package so it always matches.
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export async function extractPdfText(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

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
