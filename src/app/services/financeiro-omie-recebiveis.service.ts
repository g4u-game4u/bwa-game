import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, from, of, firstValueFrom } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import dayjs from 'dayjs';
import { environment } from 'src/environments/environment';
import { SystemParams } from '@model/system-params.model';
import { SystemParamsService } from './system-params.service';
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
 * Cada chamada adiciona `_cb` (timestamp) para evitar cache e refletir todo carregamento de tela.
 */
@Injectable({ providedIn: 'root' })
export class FinanceiroOmieRecebiveisService {
  private readonly plainHttp: HttpClient;

  constructor(
    handler: HttpBackend,
    private readonly systemParamsService: SystemParamsService
  ) {
    this.plainHttp = new HttpClient(handler);
  }

  /**
   * Valor para o KPI "Valor concedido" somente via Omie (URLs configuradas).
   * Sem URL ou em falha → 0 (sem fallback Funifier/action_log).
   */
  getValorConcedidoFinanceiro(_teamId: string, month: Date): Observable<number> {
    void _teamId;
    return from(this.tryOmieValor(month)).pipe(
      map((omie) => {
        if (omie != null && Number.isFinite(omie.valor)) {
          if (omie.dadosIncompletos && omie.avisoDados) {
            console.warn('[Financeiro OMIE]', omie.avisoDados);
          }
          return omie.valor;
        }
        return 0;
      })
    );
  }

  private appendReferenceMonthAndNoCache(url: string, month: Date): string {
    const ym = dayjs(month).format('YYYY-MM');
    let u = url;
    const sep1 = u.includes('?') ? '&' : '?';
    u = `${u}${sep1}referenceMonth=${encodeURIComponent(ym)}`;
    const sep2 = u.includes('?') ? '&' : '?';
    u = `${u}${sep2}_cb=${Date.now()}`;
    return u;
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
      const url = this.appendReferenceMonthAndNoCache(cfg.painelUrl, month);
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
      const url = this.appendReferenceMonthAndNoCache(cfg.caixaUrl, month);
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
  ): Observable<{ valor: number; origem: 'omie' | 'indisponivel'; meta?: FinanceiroOmieFetchMeta }> {
    void teamId;
    return from(this.tryOmieValor(month)).pipe(
      map((omie) => {
        if (omie != null && Number.isFinite(omie.valor)) {
          return {
            valor: omie.valor,
            origem: 'omie' as const,
            meta: {
              dadosIncompletos: omie.dadosIncompletos,
              avisoDados: omie.avisoDados
            }
          };
        }
        return { valor: 0, origem: 'indisponivel' as const };
      }),
      catchError(() => of({ valor: 0, origem: 'indisponivel' as const }))
    );
  }
}
