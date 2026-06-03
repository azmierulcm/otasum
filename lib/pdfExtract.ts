'use client';

/**
 * Extracts all text from a PDF File using pdfjs-dist running entirely in the browser.
 * This means the binary PDF never crosses the network — only the extracted text (~467 KB
 * for a 215-page Lido OFP) is sent to the API, well under any platform payload limit.
 */
export async function extractPdfText(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');

  // Use CDN worker — avoids Next.js webpack config for the worker file
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
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

    const lines = new Map<number, typeof textItems>();
    for (const item of textItems) {
      const yKey = Math.round(item.y / 2) * 2;
      lines.set(yKey, [...(lines.get(yKey) ?? []), item]);
    }

    const pageText = Array.from(lines.entries())
      .sort(([a], [b]) => b - a)
      .map(([, line]) => line
        .sort((a, b) => a.x - b.x)
        .map((item) => item.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim())
      .filter(Boolean)
      .join('\n');

    pages.push(pageText);
    onProgress?.(i, pdf.numPages);
  }

  return pages.join('\n');
}
