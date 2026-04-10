import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, from, of, firstValueFrom } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import dayjs from 'dayjs';
import { environment } from 'src/environments/environment';
import { SystemParams } from '@model/system-params.model';
import { SystemParamsService } from './system-params.service';
import { ActionLogService } from './action-log.service';
import {
  extrairValorAcumuladoDoPainelProcessado,
  isPainelProcessadoShape,
  processarExportCaixaParaPainel
} from '@utils/omie-painel-recebiveis.util';

export interface FinanceiroOmieFetchMeta {
  /** Indica uso de amostra_recebidos em alguma conta (subamostragem). */
  dadosIncompletos?: boolean;
  avisoDados?: string | null;
}

type OmieEnv = {
  painelJsonUrl?: string;
  caixaJsonUrl?: string;
  categoriasCodigos?: string;
  categoriasDesc?: string;
};

function readOmieEnv(): OmieEnv {
  const e = environment as typeof environment & { financeiroOmieRecebiveis?: OmieEnv };
  return e.financeiroOmieRecebiveis ?? {};
}

/**
 * Busca valor acumulado (R$) conforme regras Omie do painel de recebíveis.
 * Usa HttpClient sem interceptors para URLs absolutas de integrador/webhook.
 */
@Injectable({ providedIn: 'root' })
export class FinanceiroOmieRecebiveisService {
  private readonly plainHttp: HttpClient;

  constructor(
    handler: HttpBackend,
    private readonly systemParamsService: SystemParamsService,
    private readonly actionLogService: ActionLogService
  ) {
    this.plainHttp = new HttpClient(handler);
  }

  /**
   * Valor para o KPI "Valor concedido": Omie (se configurado) ou soma no action_log (Funifier).
   */
  getValorConcedidoFinanceiro(teamId: string, month: Date): Observable<number> {
    return from(this.tryOmieValor(month)).pipe(
      switchMap((omie) => {
        if (omie != null && Number.isFinite(omie.valor)) {
          if (omie.dadosIncompletos && omie.avisoDados) {
            console.warn('[Financeiro OMIE]', omie.avisoDados);
          }
          return of(omie.valor);
        }
        return this.actionLogService.getTeamBillingForMonth(teamId, month);
      })
    );
  }

  private appendReferenceMonth(url: string, month: Date): string {
    const ym = dayjs(month).format('YYYY-MM');
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}referenceMonth=${encodeURIComponent(ym)}`;
  }

  private async resolveOmieSources(): Promise<{
    painelUrl: string;
    caixaUrl: string;
    categoriasCodigos: string;
    categoriasDesc: string;
    metaPainel: number;
  }> {
    await this.systemParamsService.initializeSystemParams();
    const env = readOmieEnv();

    const str = async (k: keyof SystemParams): Promise<string> => {
      const v = await this.systemParamsService.getParam<string>(k);
      return (v != null ? String(v) : '').trim();
    };

    const painelUrl =
      (await str('financeiro_omie_painel_json_url')) || (env.painelJsonUrl || '').trim();
    const caixaUrl =
      (await str('financeiro_omie_caixa_json_url')) || (env.caixaJsonUrl || '').trim();
    const categoriasCodigos =
      (await str('financeiro_omie_categorias_codigos')) || (env.categoriasCodigos || '').trim();
    const categoriasDesc =
      (await str('financeiro_omie_categorias_desc')) || (env.categoriasDesc || '').trim();

    const goalRaw = await this.systemParamsService.getParam<number>('financeiro_monthly_billing_goal');
    const metaPainel =
      typeof goalRaw === 'number' && goalRaw > 0 ? goalRaw : 500_000;

    return { painelUrl, caixaUrl, categoriasCodigos, categoriasDesc, metaPainel };
  }

  private async tryOmieValor(
    month: Date
  ): Promise<{ valor: number; dadosIncompletos?: boolean; avisoDados?: string | null } | null> {
    const cfg = await this.resolveOmieSources();
    if (cfg.painelUrl) {
      const url = this.appendReferenceMonth(cfg.painelUrl, month);
      try {
        const body = await firstValueFrom(this.plainHttp.get<unknown>(url));
        if (isPainelProcessadoShape(body)) {
          const valor = extrairValorAcumuladoDoPainelProcessado(body);
          if (valor != null) {
            const aviso = typeof (body as { aviso_dados?: unknown }).aviso_dados === 'string'
              ? String((body as { aviso_dados: string }).aviso_dados)
              : null;
            return {
              valor,
              dadosIncompletos: Boolean(aviso),
              avisoDados: aviso
            };
          }
        }
      } catch {
        return null;
      }
      return null;
    }

    if (cfg.caixaUrl) {
      const url = this.appendReferenceMonth(cfg.caixaUrl, month);
      try {
        const body = await firstValueFrom(this.plainHttp.get<unknown>(url));
        const painel = processarExportCaixaParaPainel(body, {
          meta: cfg.metaPainel,
          categoriasCodigosCsv: cfg.categoriasCodigos,
          categoriasDescSeparadasPorPontoEVirgula: cfg.categoriasDesc
        });
        return {
          valor: painel.progresso_meta_recebimento.valor_acumulado_recebido,
          dadosIncompletos: Boolean(painel.aviso_dados),
          avisoDados: painel.aviso_dados ?? null
        };
      } catch {
        return null;
      }
    }

    return null;
  }

  /**
   * Observable com metadados (para telemetria ou UI futura).
   */
  getValorConcedidoFinanceiroComMeta(
    teamId: string,
    month: Date
  ): Observable<{ valor: number; origem: 'omie' | 'action_log'; meta?: FinanceiroOmieFetchMeta }> {
    return from(this.tryOmieValor(month)).pipe(
      switchMap((omie) => {
        if (omie != null && Number.isFinite(omie.valor)) {
          return of({
            valor: omie.valor,
            origem: 'omie' as const,
            meta: {
              dadosIncompletos: omie.dadosIncompletos,
              avisoDados: omie.avisoDados
            }
          });
        }
        return this.actionLogService.getTeamBillingForMonth(teamId, month).pipe(
          map((v) => ({
            valor: typeof v === 'number' && Number.isFinite(v) ? v : 0,
            origem: 'action_log' as const
          })),
          catchError(() => of({ valor: 0, origem: 'action_log' as const }))
        );
      })
    );
  }
}
