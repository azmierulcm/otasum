import pdf from 'pdf-parse';

const MAX_PDF_BYTES = 20 * 1024 * 1024;

export async function extractPdfTextFromUrl(fileUrl: string): Promise<string> {
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Could not download uploaded PDF (${response.status}).`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_PDF_BYTES) {
    throw new Error('PDF exceeds the 20 MB processing limit.');
  }

  const data = await pdf(Buffer.from(arrayBuffer));
  return data.text;
}
