import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { HelpService, HelpReportPayload } from './help.service';

describe('HelpService', () => {
  let service: HelpService;
  let httpMock: HttpTestingController;

  const webhookUrl =
    'https://integrador-n8n.grupo4u.com.br/webhook-test/c43002e5-a4de-4e52-9b93-1ae39e0d38b6';

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [HelpService]
    });

    service = TestBed.inject(HelpService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('submitReport', () => {
    it('should POST to the correct webhook URL with the given payload', () => {
      const payload: HelpReportPayload = {
        nome: 'João Silva',
        email: 'joao@example.com',
        descricao: 'Botão não funciona na página de login',
        pagina: 'http://localhost:4200/login',
        timestamp: '2024-01-15T10:30:00.000Z'
      };

      service.submitReport(payload).subscribe(response => {
        expect(response).toBeTruthy();
      });

      const req = httpMock.expectOne(webhookUrl);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      expect(req.request.headers.get('Content-Type')).toBe('application/json');
      req.flush({ success: true });
    });
  });

  describe('buildPayload', () => {
    it('should include nome, email and descricao from the form input', () => {
      const formValue = {
        nome: 'Maria Souza',
        email: 'maria@example.com',
        descricao: 'Erro ao carregar dashboard de gamificação'
      };

      const payload = service.buildPayload(formValue);

      expect(payload.nome).toBe(formValue.nome);
      expect(payload.email).toBe(formValue.email);
      expect(payload.descricao).toBe(formValue.descricao);
    });

    it('should add pagina field with the current URL', () => {
      const formValue = {
        nome: 'Carlos',
        email: 'carlos@example.com',
        descricao: 'Problema com a tabela de empresas'
      };

      const payload = service.buildPayload(formValue);

      expect(payload.pagina).toBe(window.location.href);
    });

    it('should generate timestamp in ISO 8601 format', () => {
      const formValue = {
        nome: 'Ana',
        email: 'ana@example.com',
        descricao: 'Gráfico não renderiza corretamente'
      };

      const before = new Date().toISOString();
      const payload = service.buildPayload(formValue);
      const after = new Date().toISOString();

      // Verify ISO 8601 format (e.g. 2024-01-15T10:30:00.000Z)
      const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
      expect(payload.timestamp).toMatch(iso8601Regex);

      // Verify the timestamp is between before and after
      expect(payload.timestamp >= before).toBeTrue();
      expect(payload.timestamp <= after).toBeTrue();
    });
  });
});
