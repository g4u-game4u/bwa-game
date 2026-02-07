import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { shareReplay, catchError, map } from 'rxjs/operators';

interface HelpTexts {
  [key: string]: string;
}

@Injectable({
  providedIn: 'root'
})
export class HelpTextsService {
  private helpTexts$: Observable<HelpTexts> | null = null;
  private defaultTexts: HelpTexts = {
    'clientes-na-carteira': 'Número total de clientes na sua carteira. Este valor representa a quantidade de clientes únicos que você atende. O atingimento desta meta aplica bônus na conversão de pontos desbloqueados em moedas.',
    'empresas-na-carteira': 'Número total de clientes na sua carteira. Este valor representa a quantidade de clientes únicos que você atende. O atingimento desta meta aplica bônus na conversão de pontos desbloqueados em moedas.', // Deprecated: use clientes-na-carteira
    'entregas-no-prazo': 'Porcentagem de entregas realizadas dentro do prazo estabelecido. Valores acima de 80% indicam bom desempenho. O atingimento desta meta aplica bônus na conversão de pontos desbloqueados em moedas.',
    'bloqueados': 'Pontos que ainda não foram desbloqueados e não podem ser utilizados. Eles serão liberados conforme você atinge determinadas metas.',
    'desbloqueados': 'Pontos que foram desbloqueados e estão disponíveis para uso. Estes pontos são concernentes a processos 100% finalizados. Você pode utilizá-los para trocar por recompensas. A conversão destes pontos em moedas é afetada pelo desempenho nos KPIs, podendo receber bônus ou penalidades.',
    'moedas': 'Moedas acumuladas que podem ser trocadas por recompensas. Quanto mais moedas você acumula, mais opções de recompensas você terá. A quantidade de moedas obtidas na conversão de pontos desbloqueados varia conforme o desempenho nos KPIs.',
    'metas': 'Número de metas atingidas em relação ao total de metas disponíveis. Atingir todas as metas garante bônus extras.',
    'clientes': 'Quantidade total de clientes únicos na sua carteira. Este número é calculado com base nos CNPJs únicos dos clientes que você atendeu.',
    'tarefas-finalizadas': 'Número total de tarefas concluídas durante a temporada. Cada tarefa finalizada contribui para o seu progresso geral.',
    'pontos-total': 'Soma total de todos os pontos (bloqueados e desbloqueados) da equipe durante a temporada.',
    'media-pontos': 'Média de pontos por membro da equipe. Calculado dividindo o total de pontos pelo número de membros.',
    'processos-incompletos': 'Número de processos que ainda não foram finalizados pela equipe. Processos incompletos não geram pontos desbloqueados.',
    'processos-finalizados': 'Número de processos que foram completamente finalizados pela equipe. Processos finalizados geram pontos desbloqueados.'
  };

  constructor(private http: HttpClient) {}

  /**
   * Get help texts - loads once and caches the result
   * Uses shareReplay to ensure only one HTTP request is made
   */
  getHelpTexts(): Observable<HelpTexts> {
    if (!this.helpTexts$) {
      this.helpTexts$ = this.http.get<HelpTexts>('assets/help-texts.json').pipe(
        catchError(() => {
          // Fallback to default texts if JSON file is not found
          console.warn('Help texts JSON not found, using default texts');
          return of(this.defaultTexts);
        }),
        shareReplay(1) // Cache and share the result
      );
    }
    return this.helpTexts$;
  }

  /**
   * Get a specific help text by key
   */
  getHelpText(key: string): Observable<string> {
    return this.getHelpTexts().pipe(
      catchError(() => of(this.defaultTexts)),
      map(texts => texts[key] || '')
    );
  }

  /**
   * Clear cache (useful for testing or reloading)
   */
  clearCache(): void {
    this.helpTexts$ = null;
  }
}

