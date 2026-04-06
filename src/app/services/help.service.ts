import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface HelpReportPayload {
  nome: string;
  email: string;
  descricao: string;
  pagina: string;
  timestamp: string;
}

@Injectable({ providedIn: 'root' })
export class HelpService {
  private readonly webhookUrl =
    'https://integrador-n8n.grupo4u.com.br/webhook-test/c43002e5-a4de-4e52-9b93-1ae39e0d38b6';

  constructor(private http: HttpClient) {}

  submitReport(payload: HelpReportPayload): Observable<any> {
    return this.http.post(this.webhookUrl, payload, {
      headers: new HttpHeaders({ 'Content-Type': 'application/json' })
    });
  }

  buildPayload(formValue: { nome: string; email: string; descricao: string }): HelpReportPayload {
    return {
      ...formValue,
      pagina: window.location.href,
      timestamp: new Date().toISOString()
    };
  }
}
