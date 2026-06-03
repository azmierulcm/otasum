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
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ');
    pages.push(pageText);
    onProgress?.(i, pdf.numPages);
  }

  return pages.join('\n');
}
