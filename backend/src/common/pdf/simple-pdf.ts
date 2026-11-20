// A tiny text-only PDF writer (A4, Helvetica), so e-tickets (FLT-23) need no extra library.

export type PdfLine = { text: string; size?: number; bold?: boolean; gapBefore?: number };

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 50;

/** PDF string literal: escapes \ ( ) and replaces characters the standard fonts can't show. */
function pdfText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/[\\()]/g, (char) => `\\${char}`);
}

/** Builds a PDF with one line per entry, starting a new page when the current one is full. */
export function buildTextPdf(lines: PdfLine[]): Buffer {
  const pages: string[] = [];
  let operations: string[] = [];
  let y = PAGE_HEIGHT - MARGIN;
  for (const line of lines) {
    const size = line.size ?? 11;
    const step = size * 1.4 + (line.gapBefore ?? 0);
    if (y - step < MARGIN && operations.length) {
      pages.push(operations.join('\n'));
      operations = [];
      y = PAGE_HEIGHT - MARGIN;
    }
    y -= step;
    operations.push(`BT /${line.bold ? 'F2' : 'F1'} ${size} Tf ${MARGIN} ${y.toFixed(2)} Td (${pdfText(line.text)}) Tj ET`);
  }
  pages.push(operations.join('\n'));

  // Objects: 1 catalog, 2 page tree, 3-4 fonts, then a page and its content stream per page
  const pageIds = pages.map((_, index) => 5 + index * 2);
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  pages.forEach((content, index) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[index] + 1} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    );
  });

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
