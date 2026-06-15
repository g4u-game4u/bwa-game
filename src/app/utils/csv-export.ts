/** Escapa um valor para célula CSV (RFC 4180). */
export function escapeCsvCell(value: unknown): string {
  if (value == null) {
    return '';
  }
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Gera conteúdo CSV a partir de linhas homogéneas (chaves = cabeçalho). */
export function buildCsvContent(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) {
    return '';
  }
  const headers = Object.keys(rows[0]!);
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escapeCsvCell(row[h] ?? '')).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

/** Dispara download de um ficheiro CSV no browser. */
export function downloadCsvFile(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
