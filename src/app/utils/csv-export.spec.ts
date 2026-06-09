import { buildCsvContent, escapeCsvCell, downloadCsvFile } from './csv-export';

describe('csv-export', () => {
  describe('escapeCsvCell', () => {
    it('returns empty for null/undefined', () => {
      expect(escapeCsvCell(null)).toBe('');
      expect(escapeCsvCell(undefined)).toBe('');
    });

    it('quotes values with comma or newline', () => {
      expect(escapeCsvCell('a,b')).toBe('"a,b"');
      expect(escapeCsvCell('line\nbreak')).toBe('"line\nbreak"');
    });

    it('doubles internal quotes', () => {
      expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    });
  });

  describe('buildCsvContent', () => {
    it('builds header and rows with BOM', () => {
      const csv = buildCsvContent([
        { Nome: 'Empresa A', CNPJ: '123' },
        { Nome: 'Empresa B', CNPJ: '456' }
      ]);
      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv).toContain('Nome,CNPJ');
      expect(csv).toContain('Empresa A,123');
      expect(csv).toContain('Empresa B,456');
    });

    it('returns empty string for no rows', () => {
      expect(buildCsvContent([])).toBe('');
    });
  });

  describe('downloadCsvFile', () => {
    it('creates and clicks a temporary anchor', () => {
      const clickSpy = jasmine.createSpy('click');
      const anchor = { click: clickSpy, href: '', download: '', style: { display: '' } } as unknown as HTMLAnchorElement;
      spyOn(document, 'createElement').and.returnValue(anchor);
      spyOn(document.body, 'appendChild');
      spyOn(document.body, 'removeChild');
      spyOn(URL, 'createObjectURL').and.returnValue('blob:mock');
      spyOn(URL, 'revokeObjectURL');

      downloadCsvFile('test.csv', 'a,b');

      expect(anchor.download).toBe('test.csv');
      expect(clickSpy).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    });
  });
});
