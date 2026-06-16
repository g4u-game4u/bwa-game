import { HttpErrorResponse } from '@angular/common/http';
import { OrganizationHierarchyInsightItem } from '@model/game4u-api.model';

export type OrgHierarchyInsightsErrorKind = 'not_found' | 'credits' | 'generic';

export interface OrgHierarchyInsightsErrorInfo {
  kind: OrgHierarchyInsightsErrorKind;
  message: string;
}

const CREDITS_PATTERN =
  /credit|quota|billing|insufficient|insuficiente|saldo|cota|rate.?limit/i;

export function parseOrgHierarchyInsightsError(err: unknown): OrgHierarchyInsightsErrorInfo {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 404) {
      return {
        kind: 'not_found',
        message: 'Ainda não há análise salva para este mês.'
      };
    }
    const bodyMsg = extractHttpErrorMessage(err);
    if (err.status === 402 || err.status === 429 || CREDITS_PATTERN.test(bodyMsg)) {
      return {
        kind: 'credits',
        message:
          bodyMsg ||
          'Créditos ou cota da API de IA esgotados. Recarregue o saldo e tente novamente.'
      };
    }
    return {
      kind: 'generic',
      message: bodyMsg || 'Não foi possível carregar a análise executiva.'
    };
  }
  if (err instanceof Error && err.message) {
    if (CREDITS_PATTERN.test(err.message)) {
      return { kind: 'credits', message: err.message };
    }
    return { kind: 'generic', message: err.message };
  }
  return { kind: 'generic', message: 'Não foi possível carregar a análise executiva.' };
}

function extractHttpErrorMessage(err: HttpErrorResponse): string {
  const body = err.error;
  if (typeof body === 'string' && body.trim()) {
    return body.trim();
  }
  if (body && typeof body === 'object') {
    const msg = (body as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) {
      return msg.trim();
    }
    if (Array.isArray(msg)) {
      return msg.map(String).join(' ');
    }
  }
  return '';
}

export function orgHierarchyInsightPriorityClass(
  priority: OrganizationHierarchyInsightItem['priority'] | undefined
): string {
  const raw = String(priority ?? 'medium').trim().toLowerCase();
  if (raw === 'high' || raw === 'alta') {
    return 'org-ai-insight--critical';
  }
  if (raw === 'low' || raw === 'baixa') {
    return 'org-ai-insight--info';
  }
  return 'org-ai-insight--warning';
}

export function orgHierarchyInsightCategoryLabel(category: string | undefined): string {
  const raw = String(category ?? '').trim().toLowerCase();
  switch (raw) {
    case 'risk':
    case 'risco':
      return 'Risco';
    case 'performance':
    case 'desempenho':
      return 'Desempenho';
    case 'opportunity':
    case 'oportunidade':
      return 'Oportunidade';
    case 'people':
    case 'pessoas':
      return 'Pessoas';
    default:
      return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Destaque';
  }
}

export function orgHierarchyInsightPriorityLabel(
  priority: OrganizationHierarchyInsightItem['priority'] | undefined
): string {
  const raw = String(priority ?? 'medium').trim().toLowerCase();
  if (raw === 'high' || raw === 'alta') return 'Alta';
  if (raw === 'low' || raw === 'baixa') return 'Baixa';
  return 'Média';
}

export function orgHierarchyInsightsSourceLabel(fromCache: boolean | undefined): string {
  if (fromCache === true) {
    return 'Salva';
  }
  if (fromCache === false) {
    return 'Gerada agora';
  }
  return '';
}
