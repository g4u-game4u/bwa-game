import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HelpService } from './help.service';
import * as fc from 'fast-check';

/**
 * Property-Based Tests for HelpService
 *
 * These tests verify universal properties of the buildPayload() method
 * using fast-check to generate random test cases.
 *
 * Focus: Round-trip de construção do payload
 */
describe('HelpService Property-Based Tests', () => {
  let service: HelpService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [HelpService]
    });

    service = TestBed.inject(HelpService);
  });

  /**
   * Property 10: Round-trip de construção do payload
   * **Validates: Requirements 5.2**
   *
   * Para qualquer objeto de formulário válido com nome, email e descrição,
   * buildPayload() deve produzir um HelpReportPayload que contém exatamente
   * os mesmos valores de nome, email e descricao do input, além de campos
   * pagina e timestamp não-vazios.
   */
  describe('Property 10: Round-trip de construção do payload', () => {
    const validFormData = fc.record({
      nome: fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length >= 2),
      email: fc.emailAddress(),
      descricao: fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.trim().length >= 10)
    });

    it('should preserve nome, email and descricao from the form input', () => {
      fc.assert(
        fc.property(
          validFormData,
          (formValue) => {
            const payload = service.buildPayload(formValue);

            expect(payload.nome).toBe(formValue.nome);
            expect(payload.email).toBe(formValue.email);
            expect(payload.descricao).toBe(formValue.descricao);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should add a non-empty pagina field', () => {
      fc.assert(
        fc.property(
          validFormData,
          (formValue) => {
            const payload = service.buildPayload(formValue);

            expect(payload.pagina).toBeTruthy();
            expect(payload.pagina.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should add a non-empty timestamp field in ISO 8601 format', () => {
      const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;

      fc.assert(
        fc.property(
          validFormData,
          (formValue) => {
            const payload = service.buildPayload(formValue);

            expect(payload.timestamp).toBeTruthy();
            expect(payload.timestamp.length).toBeGreaterThan(0);
            expect(payload.timestamp).toMatch(iso8601Regex);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce a payload with exactly 5 fields', () => {
      fc.assert(
        fc.property(
          validFormData,
          (formValue) => {
            const payload = service.buildPayload(formValue);

            expect(Object.keys(payload).length).toBe(5);
            expect(Object.keys(payload).sort()).toEqual(
              ['descricao', 'email', 'nome', 'pagina', 'timestamp']
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 4: Submissão válida envia payload correto
   * **Validates: Requirements 5.1, 5.2**
   *
   * Para qualquer conjunto válido de dados do formulário (nome não-vazio,
   * e-mail válido, descrição não-vazia), ao submeter, o sistema deve enviar
   * um HTTP POST para a webhook URL contendo um payload JSON com os campos:
   * nome, email, descricao, pagina e timestamp com os valores corretos.
   */
  describe('Property 4: Submissão válida envia payload correto', () => {
    let httpMock: HttpTestingController;
    const webhookUrl = 'https://integrador-n8n.grupo4u.com.br/webhook-test/c43002e5-a4de-4e52-9b93-1ae39e0d38b6';

    const validFormData = fc.record({
      nome: fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length >= 2),
      email: fc.emailAddress(),
      descricao: fc.string({ minLength: 10, maxLength: 500 }).filter(s => s.trim().length >= 10)
    });

    beforeEach(() => {
      httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => {
      httpMock.verify();
    });

    it('should send HTTP POST to the webhook URL with all payload fields matching the input', () => {
      fc.assert(
        fc.property(
          validFormData,
          (formValue) => {
            const payload = service.buildPayload(formValue);
            service.submitReport(payload).subscribe();

            const req = httpMock.expectOne(webhookUrl);

            expect(req.request.method).toBe('POST');
            expect(req.request.body.nome).toBe(formValue.nome);
            expect(req.request.body.email).toBe(formValue.email);
            expect(req.request.body.descricao).toBe(formValue.descricao);
            expect(req.request.body.pagina).toBeTruthy();
            expect(req.request.body.timestamp).toBeTruthy();

            req.flush({ success: true });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should send payload with Content-Type application/json header', () => {
      fc.assert(
        fc.property(
          validFormData,
          (formValue) => {
            const payload = service.buildPayload(formValue);
            service.submitReport(payload).subscribe();

            const req = httpMock.expectOne(webhookUrl);

            expect(req.request.headers.get('Content-Type')).toBe('application/json');

            req.flush({ success: true });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should send payload with a valid ISO 8601 timestamp', () => {
      const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;

      fc.assert(
        fc.property(
          validFormData,
          (formValue) => {
            const payload = service.buildPayload(formValue);
            service.submitReport(payload).subscribe();

            const req = httpMock.expectOne(webhookUrl);

            expect(req.request.body.timestamp).toMatch(iso8601Regex);

            req.flush({ success: true });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should send payload with exactly 5 fields: nome, email, descricao, pagina, timestamp', () => {
      fc.assert(
        fc.property(
          validFormData,
          (formValue) => {
            const payload = service.buildPayload(formValue);
            service.submitReport(payload).subscribe();

            const req = httpMock.expectOne(webhookUrl);

            expect(Object.keys(req.request.body).sort()).toEqual(
              ['descricao', 'email', 'nome', 'pagina', 'timestamp']
            );

            req.flush({ success: true });
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
