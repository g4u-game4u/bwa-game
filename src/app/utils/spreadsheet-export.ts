import * as XLSX from 'xlsx';
import { buildCsvContent, downloadCsvFile } from './csv-export';

export type SpreadsheetExportFormat = 'csv' | 'xlsx';

export function downloadXlsxFile(
  filename: string,
  rows: Record<string, string | number>[],
  sheetName = 'Dados'
): void {
  if (rows.length === 0) {
    return;
  }
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  const safeSheetName = sheetName.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Dados';
  XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);
  const safeFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, safeFilename);
}

export function downloadSpreadsheetFile(
  format: SpreadsheetExportFormat,
  filename: string,
  rows: Record<string, string | number>[],
  sheetName = 'Dados'
): void {
  if (rows.length === 0) {
    return;
  }
  if (format === 'csv') {
    const baseName = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    downloadCsvFile(baseName, buildCsvContent(rows));
    return;
  }
  downloadXlsxFile(filename, rows, sheetName);
}

export function parseHttpContentDispositionFilename(
  contentDisposition: string | null | undefined
): string | null {
  if (!contentDisposition) {
    return null;
  }
  const utf8Match = /filename\*=UTF-8''([^;\n]+)/i.exec(contentDisposition);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      return utf8Match[1].trim();
    }
  }
  const quotedMatch = /filename="([^"]+)"/i.exec(contentDisposition);
  if (quotedMatch?.[1]) {
    return quotedMatch[1].trim();
  }
  const plainMatch = /filename=([^;\n]+)/i.exec(contentDisposition);
  return plainMatch?.[1]?.trim().replace(/^["']|["']$/g, '') ?? null;
}

export function downloadBlobFile(blob: Blob, filename: string): void {
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(blobUrl);
}

export function slugifyExportFilenamePart(value: string | undefined | null): string {
  const normalized = (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'escopo';
}
