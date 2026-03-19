import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ApiProvider } from '../providers/api.provider';
import { SeasonDatesService } from './season-dates.service';
import { TIPO_CONSULTA_TIME } from '../pages/dashboard/dashboard.component';
import { environment } from '../../environments/environment';
import { SessaoProvider } from '../providers/sessao/sessao.provider';
import { AuthProvider } from '../providers/auth/auth.provider';

export interface ActionTemplate {
  id: string;
  name: string;
  description?: string;
  points?: number;
  category?: string;
}

export interface ProcessActionPayload {
  status: string;
  user_email: string | null; // Email do executor da atividade (null para tarefas não atribuídas/Unassigned)
  action_id: string;
  delivery_id: string;
  delivery_title: string;
  created_at: string;
  finished_at?: string; // Tornando opcional
  integration_id: string;
  comment?: string; // Comentário opcional para ações
  comments?: Array<{
    id: number;
    message: string;
    created_by: string;
    created_at: string;
    type: string;
  }>; // Array de comentários estruturados
  approved?: boolean | null; // Status de aprovação da atividade
  approved_by?: string | null; // Email do usuário que aprovou (null se não aprovado)
  dismissed?: boolean; // Status de cancelamento da atividade
  updated_by?: string; // Email do usuário que está fazendo a atualização (para logs)
}

export interface AtividadeDetalhe {
  id: string;
  action_title: string;
  user_email: string;
  status: string;
  created_at: string;
  dismissed?: boolean;
  finished_at?: string;
  points?: number;
  integration_id?: string;
  delivery_id?: string;
  delivery_title?: string;
  action_id?: string; // ID da ação/template
  action_template_id?: string; // ID do template da ação
  approved?: boolean | null; // Status de aprovação da atividade
  approved_by?: string | null; // Email do usuário que aprovou (null se não aprovado)
  comments?: Array<{
    id: string;
    message: string;
    created_by: string;
    created_at: string;
    updated_at?: string;
    type: string;
  }>; // Array de comentários da atividade
  attachments?: Array<{
    id: string;
    filename: string;
    original_name: string;
    size: number;
    mime_type: string;
    created_at: string;
    url?: string;
  }>; // Array de anexos da atividade
  created_by?: string;
  updated_at?: string;
  finished_by?: string | null;
  team_id?: number;
  team_name?: string;
  user_id?: string;
  client_id?: string;
  funifier_id?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UserActionSearchResponse {
  items: Array<{
    id: string;
    points: number;
    status: string;
    team_id: number;
    user_id: string;
    approved: boolean;
    comments: Array<{
      id: string;
      type: string;
      message: string;
      created_at: string;
      created_by: string;
      updated_at: string;
    }>;
    client_id: string;
    dismissed: boolean;
    team_name: string;
    created_at: string;
    created_by: string;
    updated_at: string;
    user_email: string;
    approved_by: string | null;
    delivery_id: string;
    finished_at: string | null;
    finished_by: string | null;
    funifier_id: string;
    action_title: string;
    delivery_title: string;
    integration_id: string;
    action_template_id: string;
  }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DownloadUrlResponse {
  download_url: string;
}

@Injectable({
  providedIn: 'root'
})
export class PontosAvulsosService {
  // Cache para o e-mail do usuário atual para evitar múltiplas chamadas à API
  private cachedUserEmail: string | null = null;
  private userEmailPromise: Promise<string | null> | null = null;

  constructor(
    private api: ApiProvider,
    private http: HttpClient,
    private seasonDatesService: SeasonDatesService,
    private sessao: SessaoProvider,
    private auth: AuthProvider
  ) {
    // Limpar cache quando o usuário fizer logout
    // Observar mudanças na sessão para limpar o cache quando necessário
    // Nota: O SessaoProvider não tem eventos observáveis, então vamos confiar
    // que o cache será limpo quando necessário através do método clearUserEmailCache
  }

  /**
   * Limpa o cache do e-mail do usuário
   * Útil quando o usuário faz logout ou quando precisamos forçar uma nova busca
   * Este método é chamado automaticamente quando detectamos mudança de usuário
   */
  public clearUserEmailCache(): void {
    this.cachedUserEmail = null;
    this.userEmailPromise = null;
    console.log('🧹 Cache do e-mail do usuário limpo');
  }

  /**
   * Busca a lista de action templates disponíveis
   * @returns Promise com array de ActionTemplate
   */
  public async getActionTemplates(): Promise<ActionTemplate[]> {
    try {
      const response = await this.api.get<any>('/action');
      
      // Transforma a resposta em um array de ActionTemplate
      if (Array.isArray(response)) {
        return response.map(item => ({
          id: item.id || item.action_id,
          name: item.name || item.title,
          description: item.description,
          points: item.points,
          category: item.category
        }));
      }
      
      return [];
    } catch (error) {
      console.error('Erro ao buscar action templates:', error);
      throw error;
    }
  }

  /**
   * Busca o action template correto baseado no título da atividade
   * @param actionTitle Título da ação
   * @returns Promise com o ActionTemplate ou null
   */
  public async getActionTemplateByTitle(actionTitle: string): Promise<ActionTemplate | null> {
    try {
      
      const templates = await this.getActionTemplates();
      
      // Busca exata primeiro
      let template = templates.find(t => t.name === actionTitle);
      
      // Se não encontrar, busca case-insensitive
      if (!template) {
        template = templates.find(t => 
          t.name?.toLowerCase() === actionTitle?.toLowerCase()
        );
      }
      
      // Se ainda não encontrar, busca parcial
      if (!template) {
        template = templates.find(t => 
          t.name?.toLowerCase().includes(actionTitle?.toLowerCase()) ||
          actionTitle?.toLowerCase().includes(t.name?.toLowerCase())
        );
      }
      
      return template || null;
    } catch (error) {
      console.error('Erro ao buscar action template por título:', error);
      return null;
    }
  }

  /**
   * Busca o action_id para uma atividade baseado no título da ação
   * @param actionTitle Título da ação
   * @returns Promise com o action_id ou null
   */
  public async getActionIdByTitle(actionTitle: string): Promise<string | null> {
    try {
      
      const template = await this.getActionTemplateByTitle(actionTitle);
      
      if (template) {
        return template.id;
      }
      
      return null;
    } catch (error) {
      console.error('Erro ao buscar action_id por título:', error);
      return null;
    }
  }

  /**
   * Busca atividades pendentes e em execução para a temporada atual
   * @param timeId ID do time (para contexto de time)
   * @param userId ID do usuário (para contexto de colaborador)
   * @param isTeamContext Se é contexto de time ou colaborador
   * @returns Promise com array de AtividadeDetalhe
   */
  public async getAtividadesPendentes(
    timeId?: number,
    userId?: string,
    isTeamContext: boolean = true
  ): Promise<AtividadeDetalhe[]> {
    try {
      // Obter datas da temporada
      const startDateISO = await this.seasonDatesService.getSeasonStartDateISO();
      const endDateISO = await this.seasonDatesService.getSeasonEndDateISO();
      
      // Buscar atividades PENDING e DOING
      const [pendingResponse, doingResponse] = await Promise.all([
        this.getGameActions('PENDING', startDateISO, endDateISO, isTeamContext, timeId, userId),
        this.getGameActions('DOING', startDateISO, endDateISO, isTeamContext, timeId, userId)
      ]);

      // Combinar os resultados
      const results = [
        ...(pendingResponse || []),
        ...(doingResponse || [])
      ];

      return results;
    } catch (error) {
      console.error('Erro ao buscar atividades pendentes:', error);
      throw error;
    }
  }

  /**
   * Busca atividades pendentes usando endpoint específico do modal
   * @param timeId ID do time
   * @param userId ID do usuário (para contexto de colaborador)
   * @param isTeamContext Se é contexto de time ou colaborador
   * @returns Promise com array de AtividadeDetalhe
   */
  public async getAtividadesPendentesModal(
    timeId?: number,
    userId?: string,
    isTeamContext: boolean = true,
    page: number = 1,
    limit: number = 10,
    filtros?: {
      busca?: string;
      executor?: string;
      created_at_start?: string;
      created_at_end?: string;
      finished_at_start?: string;
      finished_at_end?: string;
    }
  ): Promise<PaginatedResponse<AtividadeDetalhe>> {
    try {
      // Obter datas da temporada
      const startDateISO = await this.seasonDatesService.getSeasonStartDateISO();
      const endDateISO = await this.seasonDatesService.getSeasonEndDateISO();
      


      if (isTeamContext && timeId) {
        // Contexto de time - usar /user-action/search com team_id
        console.log('👥 Buscando atividades do time:', timeId);
        
        // Buscar PENDING e DOING em uma única requisição (dismissed=false)
        const response = await this.getUserActions(
          ['PENDING', 'DOING'], 
          undefined, // userId não é necessário quando teamId é fornecido
          startDateISO, 
          endDateISO, 
          page, 
          limit, 
          false,
          timeId, // Passar teamId para usar team_id no query param
          filtros
        );

        console.log('📊 Modal - Atividades do time encontradas:', response.items.length, 'de', response.total);
        
        return {
          items: response.items || [],
          total: response.total || 0,
          page: response.page || page,
          limit: response.limit || limit,
          totalPages: response.totalPages || 0
        };
      } else if (!isTeamContext && userId) {
        // Contexto de colaborador - usar /user-action/search com paginação
        // Otimizado: uma única requisição com múltiplos status (status=PENDING&status=DOING)
        console.log('👤 Buscando atividades do colaborador:', userId);
        
        // Buscar PENDING e DOING em uma única requisição (dismissed=false)
        const response = await this.getUserActions(
          ['PENDING', 'DOING'], 
          userId, 
          startDateISO, 
          endDateISO, 
          page, 
          limit, 
          false,
          undefined, // Não passar teamId para contexto de colaborador
          filtros
        );

        console.log('📊 Modal - Atividades encontradas:', response.items.length, 'de', response.total);
        
        return {
          items: response.items || [],
          total: response.total || 0,
          page: response.page || page,
          limit: response.limit || limit,
          totalPages: response.totalPages || 0
        };
      }

      return {
        items: [],
        total: 0,
        page: page,
        limit: limit,
        totalPages: 0
      };
    } catch (error) {
      console.error('Erro ao buscar atividades pendentes no modal:', error);
      throw error;
    }
  }

  /**
   * Busca atividades finalizadas usando endpoint específico do modal
   * @param timeId ID do time
   * @param userId ID do usuário (para contexto de colaborador)
   * @param isTeamContext Se é contexto de time ou colaborador
   * @returns Promise com array de AtividadeDetalhe
   */
  public async getAtividadesFinalizadasModal(
    timeId: number, 
    userId: string, 
    isTeamContext: boolean,
    page: number = 1,
    limit: number = 10,
    filtros?: {
      busca?: string;
      executor?: string;
      created_at_start?: string;
      created_at_end?: string;
      finished_at_start?: string;
      finished_at_end?: string;
    }
  ): Promise<PaginatedResponse<AtividadeDetalhe>> {
    try {
      // Obter datas da temporada atual
      const startDateISO = await this.seasonDatesService.getSeasonStartDateISO();
      const endDateISO = await this.seasonDatesService.getSeasonEndDateISO();
      
      // Buscar atividades com status DONE
      if (isTeamContext && timeId) {
        // Contexto de time - usar /user-action/search com team_id
        console.log('👥 Buscando atividades finalizadas do time:', timeId);
        
        // Buscar todas as atividades DONE para filtrar corretamente por approved=false
        // Usar um limite alto (1000) para buscar a maioria dos casos em uma única chamada
        const allDoneResponse = await this.getUserActions(
          'DONE', 
          undefined, // userId não é necessário quando teamId é fornecido
          startDateISO, 
          endDateISO, 
          1, 
          1000, 
          false, // dismissed=false
          timeId, // Passar teamId para usar team_id no query param
          filtros
        );
        
        // Filtrar apenas atividades com approved: false ou null (aguardando aprovação)
        const allNotApproved = allDoneResponse.items.filter((atividade: any) => {
          const isNotApproved = atividade.approved === false || atividade.approved === null;
          return isNotApproved;
        });
        
        // Se ainda houver mais páginas (mais de 1000 itens), buscar as páginas restantes
        if (allDoneResponse.totalPages > 1) {
          for (let p = 2; p <= allDoneResponse.totalPages; p++) {
            const pageResponse = await this.getUserActions(
              'DONE', 
              undefined, 
              startDateISO, 
              endDateISO, 
              p, 
              1000, 
              false, 
              timeId, 
              filtros
            );
            const pageNotApproved = pageResponse.items.filter((atividade: any) => {
              const isNotApproved = atividade.approved === false || atividade.approved === null;
              return isNotApproved;
            });
            allNotApproved.push(...pageNotApproved);
          }
        }
        
        // Aplicar paginação local nos resultados filtrados
        const totalNotApproved = allNotApproved.length;
        const totalPages = Math.ceil(totalNotApproved / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedResults = allNotApproved.slice(startIndex, endIndex);
        
        return {
          items: paginatedResults,
          total: totalNotApproved,
          page: page,
          limit: limit,
          totalPages: totalPages
        };
      } else if (!isTeamContext && userId) {
        // Buscar todas as atividades DONE para filtrar corretamente por approved=false
        // Usar um limite alto (1000) para buscar a maioria dos casos em uma única chamada
        const allDoneResponse = await this.getUserActions(
          'DONE', 
          userId, 
          startDateISO, 
          endDateISO, 
          1, 
          1000, 
          false, 
          undefined, // Não passar teamId para contexto de colaborador
          filtros
        );
        
        // Filtrar apenas atividades com approved: false ou null (aguardando aprovação)
        const allNotApproved = allDoneResponse.items.filter((atividade: any) => {
          const isNotApproved = atividade.approved === false || atividade.approved === null;
          return isNotApproved;
        });
        
        // Se ainda houver mais páginas (mais de 1000 itens), buscar as páginas restantes
        if (allDoneResponse.totalPages > 1) {
          for (let p = 2; p <= allDoneResponse.totalPages; p++) {
            const pageResponse = await this.getUserActions(
              'DONE', 
              userId, 
              startDateISO, 
              endDateISO, 
              p, 
              1000, 
              false, 
              undefined, // Não passar teamId para contexto de colaborador
              filtros
            );
            const pageNotApproved = pageResponse.items.filter((atividade: any) => {
              const isNotApproved = atividade.approved === false || atividade.approved === null;
              return isNotApproved;
            });
            allNotApproved.push(...pageNotApproved);
          }
        }
        
        // Aplicar paginação local nos resultados filtrados
        const totalNotApproved = allNotApproved.length;
        const totalPages = Math.ceil(totalNotApproved / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedResults = allNotApproved.slice(startIndex, endIndex);
        
        return {
          items: paginatedResults,
          total: totalNotApproved,
          page: page,
          limit: limit,
          totalPages: totalPages
        };
      }

      // Caso nenhum contexto seja fornecido
      return {
        items: [],
        total: 0,
        page: page,
        limit: limit,
        totalPages: 0
      };
    } catch (error) {
      console.error('❌ Service - Erro ao buscar atividades finalizadas:', error);
      return {
        items: [],
        total: 0,
        page: page,
        limit: limit,
        totalPages: 0
      };
    }
  }

  public async getAtividadesAprovadasModal(
    timeId?: number,
    userId?: string,
    isTeamContext: boolean = true,
    page: number = 1,
    limit: number = 10,
    filtros?: {
      busca?: string;
      executor?: string;
      created_at_start?: string;
      created_at_end?: string;
      finished_at_start?: string;
      finished_at_end?: string;
    }
  ): Promise<PaginatedResponse<AtividadeDetalhe>> {
    try {
      const startDateISO = await this.seasonDatesService.getSeasonStartDateISO();
      const endDateISO = await this.seasonDatesService.getSeasonEndDateISO();

      console.log('✅ Modal - Buscando atividades aprovadas:', { 
        timeId, 
        userId, 
        isTeamContext, 
        startDateISO, 
        endDateISO,
        page,
        limit
      });

      if (isTeamContext && timeId) {
        // Contexto de time - usar /user-action/search com team_id
        console.log('👥 Buscando atividades aprovadas do time:', timeId);
        
        // Buscar atividades DELIVERED e DONE aprovadas usando /user-action/search
        const [deliveredResponse, doneResponse] = await Promise.all([
          this.getUserActions(
            'DELIVERED', 
            undefined, 
            startDateISO, 
            endDateISO, 
            1, 
            1000, 
            false, 
            timeId,
            filtros
          ),
          this.getUserActions(
            'DONE', 
            undefined, 
            startDateISO, 
            endDateISO, 
            1, 
            1000, 
            false, 
            timeId,
            filtros
          )
        ]);

        // Incluir todas as atividades DELIVERED
        let deliveredActivities = deliveredResponse.items || [];

        // Filtrar apenas atividades DONE com approved: true
        const allDoneActivities = doneResponse.items || [];
        let approvedDoneActivities = allDoneActivities.filter((atividade: any) => {
          const isApproved = this.isAtividadeAprovada(atividade);
          return isApproved;
        });

        // Aplicar filtros adicionais se fornecidos
        if (filtros?.executor) {
          deliveredActivities = deliveredActivities.filter((atividade: any) => {
            return atividade.user_email === filtros.executor;
          });
          approvedDoneActivities = approvedDoneActivities.filter((atividade: any) => {
            return atividade.user_email === filtros.executor;
          });
        }

        // Filtrar por created_at se fornecido
        if (filtros?.created_at_start || filtros?.created_at_end) {
          deliveredActivities = deliveredActivities.filter((atividade: any) => {
            const createdAt = atividade.created_at;
            if (!createdAt) return false;
            
            const dataAtividade = new Date(createdAt);
            if (filtros.created_at_start) {
              const dataInicio = new Date(filtros.created_at_start);
              if (dataAtividade < dataInicio) return false;
            }
            if (filtros.created_at_end) {
              const dataFim = new Date(filtros.created_at_end);
              dataFim.setHours(23, 59, 59, 999); // Incluir todo o dia
              if (dataAtividade > dataFim) return false;
            }
            return true;
          });

          approvedDoneActivities = approvedDoneActivities.filter((atividade: any) => {
            const createdAt = atividade.created_at;
            if (!createdAt) return false;
            
            const dataAtividade = new Date(createdAt);
            if (filtros.created_at_start) {
              const dataInicio = new Date(filtros.created_at_start);
              if (dataAtividade < dataInicio) return false;
            }
            if (filtros.created_at_end) {
              const dataFim = new Date(filtros.created_at_end);
              dataFim.setHours(23, 59, 59, 999); // Incluir todo o dia
              if (dataAtividade > dataFim) return false;
            }
            return true;
          });
        }
        
        // Filtrar por finished_at se fornecido
        if (filtros?.finished_at_start || filtros?.finished_at_end) {
          deliveredActivities = deliveredActivities.filter((atividade: any) => {
            const finishedAt = atividade.finished_at;
            if (!finishedAt) return false;
            
            const dataAtividade = new Date(finishedAt);
            if (filtros.finished_at_start) {
              const dataInicio = new Date(filtros.finished_at_start);
              if (dataAtividade < dataInicio) return false;
            }
            if (filtros.finished_at_end) {
              const dataFim = new Date(filtros.finished_at_end);
              dataFim.setHours(23, 59, 59, 999); // Incluir todo o dia
              if (dataAtividade > dataFim) return false;
            }
            return true;
          });

          approvedDoneActivities = approvedDoneActivities.filter((atividade: any) => {
            const finishedAt = atividade.finished_at;
            if (!finishedAt) return false;
            
            const dataAtividade = new Date(finishedAt);
            if (filtros.finished_at_start) {
              const dataInicio = new Date(filtros.finished_at_start);
              if (dataAtividade < dataInicio) return false;
            }
            if (filtros.finished_at_end) {
              const dataFim = new Date(filtros.finished_at_end);
              dataFim.setHours(23, 59, 59, 999); // Incluir todo o dia
              if (dataAtividade > dataFim) return false;
            }
            return true;
          });
        }

        const results = [...deliveredActivities, ...approvedDoneActivities];
        const total = results.length;
        const totalPages = Math.ceil(total / limit);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedResults = results.slice(startIndex, endIndex);

        return {
          items: paginatedResults,
          total: total,
          page: page,
          limit: limit,
          totalPages: totalPages
        };
      } else if (!isTeamContext && userId) {
        // Contexto de colaborador - buscar atividades DELIVERED e DONE aprovadas (dismissed=false)
        const [deliveredResponse, doneResponse] = await Promise.all([
          this.getUserActions('DELIVERED', userId, startDateISO, endDateISO, page, limit, false, undefined, filtros),
          this.getUserActions('DONE', userId, startDateISO, endDateISO, page, limit, false, undefined, filtros)
        ]);

        // Incluir todas as atividades DELIVERED
        const deliveredActivities = deliveredResponse.items || [];

        // Filtrar apenas atividades DONE com approved: true
        const allDoneActivities = doneResponse.items || [];
        const approvedDoneActivities = allDoneActivities.filter((atividade: any) => {
          const isApproved = atividade.approved === true;
          return isApproved;
        });

        const results = [...deliveredActivities, ...approvedDoneActivities];
        const total = deliveredResponse.total + (approvedDoneActivities.length); // Aproximação

        return {
          items: results,
          total: total,
          page: page,
          limit: limit,
          totalPages: Math.ceil(total / limit)
        };
      }

      return {
        items: [],
        total: 0,
        page: page,
        limit: limit,
        totalPages: 0
      };
    } catch (error) {
      console.error('Erro ao buscar atividades aprovadas:', error);
      throw error;
    }
  }

  /**
   * Busca atividades canceladas usando endpoint específico do modal
   * @param timeId ID do time
   * @param userId ID do usuário (para contexto de colaborador)
   * @param isTeamContext Se é contexto de time ou colaborador
   * @param page Página atual
   * @param limit Limite de itens por página
   * @returns Promise com resposta paginada
   */
  public async getAtividadesCanceladasModal(
    timeId?: number,
    userId?: string,
    isTeamContext: boolean = true,
    page: number = 1,
    limit: number = 10,
    filtros?: {
      busca?: string;
      executor?: string;
      created_at_start?: string;
      created_at_end?: string;
      finished_at_start?: string;
      finished_at_end?: string;
    }
  ): Promise<PaginatedResponse<AtividadeDetalhe>> {
    try {
      // Obter datas da temporada
      const startDateISO = await this.seasonDatesService.getSeasonStartDateISO();
      const endDateISO = await this.seasonDatesService.getSeasonEndDateISO();

      if (isTeamContext && timeId) {
        // Contexto de time - usar /user-action/search com team_id
        console.log('👥 Buscando atividades canceladas do time:', timeId);
        
        // Para cancelados: dismissed=true e todos os status possíveis
        const allStatuses = ['PENDING', 'DOING', 'DONE', 'DELIVERED', 'CANCELLED', 'INCOMPLETE'];
        return await this.getUserActions(
          allStatuses, 
          undefined, // userId não é necessário quando teamId é fornecido
          startDateISO, 
          endDateISO, 
          page, 
          limit, 
          true, // dismissed=true para cancelados
          timeId, // Passar teamId para usar team_id no query param
          filtros
        );
      } else if (!isTeamContext && userId) {
        // Contexto de colaborador - usar /user-action/search com paginação
        // Para cancelados: dismissed=true e todos os status possíveis
        const allStatuses = ['PENDING', 'DOING', 'DONE', 'DELIVERED', 'CANCELLED', 'INCOMPLETE'];
        return await this.getUserActions(
          allStatuses, 
          userId, 
          startDateISO, 
          endDateISO, 
          page, 
          limit, 
          true, // dismissed=true para cancelados
          undefined, // Não passar teamId para contexto de colaborador
          filtros
        );
      }

      return {
        items: [],
        total: 0,
        page: page,
        limit: limit,
        totalPages: 0
      };
    } catch (error) {
      console.error('Erro ao buscar atividades canceladas no modal:', error);
      throw error;
    }
  }

  // ===== MÉTODOS PARA PROCESSOS (DELIVERIES) =====

  /**
   * Busca processos pendentes usando endpoint /game/team-deliveries
   * @param timeId ID do time
   * @param userId ID do usuário (para contexto de colaborador)
   * @param isTeamContext Se é contexto de time ou colaborador
   * @returns Promise com array de processos
   */
  public async getProcessosPendentes(
    timeId?: number,
    userId?: string,
    isTeamContext: boolean = true
  ): Promise<any[]> {
    try {
      // Obter datas da temporada
      const startDateISO = await this.seasonDatesService.getSeasonStartDateISO();
      const endDateISO = await this.seasonDatesService.getSeasonEndDateISO();
      

      const results = await this.getGameDeliveries('PENDING', startDateISO, endDateISO, isTeamContext, timeId, userId);
      return results;
    } catch (error) {
      console.error('Erro ao buscar processos pendentes:', error);
      throw error;
    }
  }

  /**
   * Busca processos incompletos usando endpoint /game/team-deliveries
   * @param timeId ID do time
   * @param userId ID do usuário (para contexto de colaborador)
   * @param isTeamContext Se é contexto de time ou colaborador
   * @returns Promise com array de processos
   */
  public async getProcessosIncompletos(
    timeId?: number,
    userId?: string,
    isTeamContext: boolean = true
  ): Promise<any[]> {
    try {
      // Obter datas da temporada
      const startDateISO = await this.seasonDatesService.getSeasonStartDateISO();
      const endDateISO = await this.seasonDatesService.getSeasonEndDateISO();
      

      const results = await this.getGameDeliveries('INCOMPLETE', startDateISO, endDateISO, isTeamContext, timeId, userId);
      return results;
    } catch (error) {
      console.error('Erro ao buscar processos incompletos:', error);
      throw error;
    }
  }

  /**
   * Busca processos entregues usando endpoint /game/team-deliveries
   * @param timeId ID do time
   * @param userId ID do usuário (para contexto de colaborador)
   * @param isTeamContext Se é contexto de time ou colaborador
   * @returns Promise com array de processos
   */
  public async getProcessosEntregues(
    timeId?: number,
    userId?: string,
    isTeamContext: boolean = true
  ): Promise<any[]> {
    try {
      // Obter datas da temporada
      const startDateISO = await this.seasonDatesService.getSeasonStartDateISO();
      const endDateISO = await this.seasonDatesService.getSeasonEndDateISO();
      

      const results = await this.getGameDeliveries('DELIVERED', startDateISO, endDateISO, isTeamContext, timeId, userId);
      return results;
    } catch (error) {
      console.error('Erro ao buscar processos entregues:', error);
      throw error;
    }
  }

  /**
   * Busca processos cancelados usando endpoint /game/team-deliveries
   * @param timeId ID do time
   * @param userId ID do usuário (para contexto de colaborador)
   * @param isTeamContext Se é contexto de time ou colaborador
   * @returns Promise com array de processos
   */
  public async getProcessosCancelados(
    timeId?: number,
    userId?: string,
    isTeamContext: boolean = true
  ): Promise<any[]> {
    try {
      // Obter datas da temporada (obrigatório pelo backend)
      const startDateISO = await this.seasonDatesService.getSeasonStartDateISO();
      const endDateISO = await this.seasonDatesService.getSeasonEndDateISO();

      const results = await this.getGameDeliveries('CANCELLED', startDateISO, endDateISO, isTeamContext, timeId, userId);
      
      return results;
    } catch (error) {
      console.error('❌ Erro ao buscar processos cancelados:', error);
      throw error;
    }
  }

  /**
   * Busca atividades por status usando as datas da temporada
   * @param status Status das atividades (PENDING, DOING, DONE, DELIVERED, etc.)
   * @param startDate Data de início
   * @param endDate Data de fim
   * @param isTeamContext Se é contexto de time ou colaborador
   * @param timeId ID do time (para contexto de time)
   * @param userId ID do usuário (para contexto de colaborador)
   * @returns Promise com array de AtividadeDetalhe
   */
  private async getGameActions(
    status: string,
    startDate: string,
    endDate: string,
    isTeamContext: boolean = true,
    timeId?: number,
    userId?: string
  ): Promise<AtividadeDetalhe[]> {
    try {
      const baseUrl = isTeamContext
        ? '/game/team-actions'
        : '/game/actions';

      const params: any = {
        status: status,
        start: startDate,
        end: endDate
      };

      if (isTeamContext && timeId) {
        params.team = timeId;
      } else if (!isTeamContext && userId) {
        params.user = userId;
      }

      const response = await this.api.get<any>(baseUrl, { params });
      
      // Transformar a resposta para o formato AtividadeDetalhe
      if (Array.isArray(response)) {
        return response.map(item => ({
          id: item.id,
          action_title: item.action_title || item.title,
          user_email: item.user_email,
          status: item.status,
          created_at: item.created_at,
          finished_at: item.finished_at,
          points: item.points,
          integration_id: item.integration_id,
          delivery_id: item.delivery_id,
          delivery_title: item.delivery_title,
          action_id: item.action_id,
          dismissed: item.dismissed,
          approved: item.approved,
          approved_by: item.approved_by,
          comments: item.comments || [],
          attachments: item.attachments || []
        }));
      }
      
      return [];
    } catch (error) {
      console.error(`Erro ao buscar atividades com status ${status}:`, error);
      return [];
    }
  }

  /**
   * Busca processos (deliveries) por status usando as datas da temporada
   * @param status Status dos processos (PENDING, INCOMPLETE, DELIVERED, CANCELLED)
   * @param startDate Data de início
   * @param endDate Data de fim
   * @param isTeamContext Se é contexto de time ou colaborador
   * @param timeId ID do time (para contexto de time)
   * @param userId ID do usuário (para contexto de colaborador)
   * @returns Promise com array de processos
   */
  private async getGameDeliveries(
    status: string,
    startDate: string,
    endDate: string,
    isTeamContext: boolean = true,
    timeId?: number,
    userId?: string
  ): Promise<any[]> {
    try {
      const baseUrl = isTeamContext
        ? '/game/team-deliveries'
        : '/game/deliveries';

      const params: any = {
        status: status,
        start: startDate,
        end: endDate
      };

      if (isTeamContext && timeId) {
        params.team = timeId;
      } else if (!isTeamContext && userId) {
        params.user = userId;
      }

      const response = await this.api.get<any>(baseUrl, { params });
      
      // Retornar a resposta como array
      if (Array.isArray(response)) {
        return response;
      }
      
      return [];
    } catch (error) {
      console.error(`❌ Erro ao buscar processos com status ${status}:`, error);
      return [];
    }
  }

  /**
   * Busca atividades do time usando /game/team-actions
   * @param status Status das atividades
   * @param teamId ID do time
   * @param startDate Data de início
   * @param endDate Data de fim
   * @returns Promise com array de AtividadeDetalhe
   */
  private async getTeamActions(
    status: string,
    teamId: number,
    startDate: string,
    endDate: string
  ): Promise<AtividadeDetalhe[]> {
    try {
      const url = '/game/team-actions';
      const params = {
        status: status,
        team: teamId,
        start: startDate,
        end: endDate
      };

      console.log('🔗 Requisição GET /game/team-actions:', { url, params });
      
      const response = await this.api.get<any>(url, { params });
      
      console.log('📥 Resposta /game/team-actions:', response);
      
      // Transformar a resposta para o formato AtividadeDetalhe
      if (Array.isArray(response)) {
        return response.map(item => {
          console.log('🔍 Item da API (Team):', {
            id: item.id,
            action_title: item.action_title,
            title: item.title,
            action_id: item.action_id,
            actionId: item.actionId,
            action_template_id: item.action_template_id
          });
          return {
            id: item.id,
            approved: item.approved,
            action_title: item.action_title || item.title,
            user_email: item.user_email,
            status: item.status,
            created_at: item.created_at,
            finished_at: item.finished_at,
            points: item.points,
            integration_id: item.integration_id,
            delivery_id: item.delivery_id,
            delivery_title: item.delivery_title,
            action_id: item.action_id || item.actionId || item.action_template_id,
            comments: item.comments || [],
            attachments: item.attachments || []
          };
        });
      }
      
      return [];
    } catch (error) {
      console.error(`Erro ao buscar atividades do time com status ${status}:`, error);
      return [];
    }
  }

  /**
   * Busca atividades do usuário usando GET /user-action/search
   * @param status Status das atividades (ou array de status para múltiplos)
   * @param userId ID do usuário (será usado como user_email, opcional se teamId fornecido)
   * @param startDate Data de início (será usado como created_at_start)
   * @param endDate Data de fim (será usado como created_at_end)
   * @param page Página atual (padrão: 1)
   * @param limit Limite de itens por página (padrão: 10)
   * @param dismissed Se deve filtrar por dismissed (padrão: false)
   * @param teamId ID do time (opcional, será usado como team_id no query param)
   * @param filtros Filtros adicionais (busca, executor, created_at_start, created_at_end, finished_at_start, finished_at_end)
   * @returns Promise com resposta paginada contendo items e metadata de paginação
   */
  private async getUserActions(
    status: string | string[],
    userId: string | undefined,
    startDate: string,
    endDate: string,
    page: number = 1,
    limit: number = 10,
    dismissed: boolean = false,
    teamId?: number,
    filtros?: {
      busca?: string;
      executor?: string;
      created_at_start?: string;
      created_at_end?: string;
      finished_at_start?: string;
      finished_at_end?: string;
    }
  ): Promise<PaginatedResponse<AtividadeDetalhe>> {
    try {
      const url = '/user-action/search';
      
      // Usar HttpParams para suportar múltiplos valores no mesmo query param
      let httpParams = new HttpParams()
        .set('created_at_start', startDate)
        .set('created_at_end', endDate)
        .set('dismissed', dismissed.toString())
        .set('page', page.toString())
        .set('limit', limit.toString());

      // Se teamId fornecido, adicionar team_id; caso contrário, usar user_email
      if (teamId) {
        httpParams = httpParams.set('team_id', teamId.toString());
      } else if (userId) {
        httpParams = httpParams.set('user_email', userId);
      }

      // Para múltiplos status, adicionar cada um separadamente: status=PENDING&status=DOING...
      if (Array.isArray(status)) {
        status.forEach(s => {
          httpParams = httpParams.append('status', s);
        });
      } else {
        httpParams = httpParams.set('status', status);
      }

      // Adicionar filtros opcionais de busca
      if (filtros) {
        // Busca por texto (título/ID) agora é feita no frontend, não enviar search para o backend
        
        if (filtros.executor && filtros.executor.trim()) {
          // Filtro específico por executor (sobrescreve o user_email se fornecido)
          httpParams = httpParams.set('executor_email', filtros.executor.trim());
        }
        
        // Datas de criação personalizadas (sobrescrevem as datas da temporada se fornecidas)
        if (filtros.created_at_start && filtros.created_at_start.trim()) {
          httpParams = httpParams.set('created_at_start', filtros.created_at_start.trim());
        }
        
        if (filtros.created_at_end && filtros.created_at_end.trim()) {
          httpParams = httpParams.set('created_at_end', filtros.created_at_end.trim());
        }
        
        // Datas de finalização personalizadas
        if (filtros.finished_at_start && filtros.finished_at_start.trim()) {
          httpParams = httpParams.set('finished_at_start', filtros.finished_at_start.trim());
        }
        
        if (filtros.finished_at_end && filtros.finished_at_end.trim()) {
          httpParams = httpParams.set('finished_at_end', filtros.finished_at_end.trim());
        }
      }

      // Converter HttpParams para objeto simples para compatibilidade com ApiProvider
      const paramsObj: any = {};
      httpParams.keys().forEach(key => {
        const values = httpParams.getAll(key);
        if (values && values.length > 1) {
          paramsObj[key] = values; // Array para múltiplos valores
        } else if (values && values.length === 1) {
          paramsObj[key] = values[0]; // Valor único
        }
      });

      console.log('🔗 Requisição GET /user-action/search:', { url, params: paramsObj });
      
      // Usar ApiProvider.get para fazer GET com query params
      const response: UserActionSearchResponse = await this.api.get<any>(url, { params: paramsObj });
      
      console.log('📥 Resposta /user-action/search:', response);
      
      // Transformar a resposta para o formato AtividadeDetalhe
      if (response && response.items && Array.isArray(response.items)) {
        const items = response.items.map(item => ({
          id: item.id,
          action_title: item.action_title,
          user_email: item.user_email,
          status: item.status,
          created_at: item.created_at,
          finished_at: item.finished_at || undefined,
          points: item.points,
          integration_id: item.integration_id,
          delivery_id: item.delivery_id,
          delivery_title: item.delivery_title,
          action_id: item.action_template_id, // Usar action_template_id como action_id
          action_template_id: item.action_template_id,
          approved: item.approved,
          approved_by: item.approved_by,
          dismissed: item.dismissed,
          comments: item.comments ? item.comments.map(comment => ({
            id: comment.id,
            message: comment.message,
            created_by: comment.created_by,
            created_at: comment.created_at,
            updated_at: comment.updated_at,
            type: comment.type
          })) : [],
          attachments: [], // Será carregado separadamente se necessário
          created_by: item.created_by,
          updated_at: item.updated_at,
          finished_by: item.finished_by,
          team_id: item.team_id,
          team_name: item.team_name,
          user_id: item.user_id,
          client_id: item.client_id,
          funifier_id: item.funifier_id
        }));

        return {
          items,
          total: response.total || 0,
          page: response.page || 1,
          limit: response.limit || limit,
          totalPages: response.totalPages || 1
        };
      }
      
      return {
        items: [],
        total: 0,
        page: page,
        limit: limit,
        totalPages: 0
      };
    } catch (error) {
      console.error(`Erro ao buscar atividades do usuário com status ${status}:`, error);
      return {
        items: [],
        total: 0,
        page: page,
        limit: limit,
        totalPages: 0
      };
    }
  }

  /**
   * Obtém o e-mail do usuário atual com cache
   * Primeiro tenta obter da sessão, se não estiver disponível, busca do endpoint /auth/user
   * @returns Promise com o e-mail do usuário atual ou null se não conseguir obter
   * @note Este método é usado por todas as funções que chamam /game/action/process para garantir
   *       que o campo 'updated_by' seja sempre preenchido corretamente
   * @note O cache é automaticamente limpo quando o usuário faz logout ou quando um novo usuário faz login
   */
  public async getCurrentUserEmail(): Promise<string | null> {
    // Verificar se o usuário da sessão mudou (logout/login de outro usuário)
    const currentSessionEmail = this.sessao.usuario?.email;
    const hasUserInSession = !!this.sessao.usuario;
    
    // Se temos cache mas o usuário da sessão mudou ou foi removido, limpar o cache
    if (this.cachedUserEmail) {
      // Se não há usuário na sessão (logout), limpar cache
      if (!hasUserInSession) {
        console.log('🔄 Usuário fez logout. Limpando cache do e-mail.');
        this.clearUserEmailCache();
      }
      // Se há usuário na sessão mas o e-mail mudou (novo login), limpar cache
      else if (currentSessionEmail && this.cachedUserEmail !== currentSessionEmail) {
        console.log('🔄 Novo usuário fez login. Limpando cache do e-mail anterior.');
        this.clearUserEmailCache();
      }
      // Se o cache ainda é válido, retornar imediatamente
      else if (currentSessionEmail && this.cachedUserEmail === currentSessionEmail) {
        return this.cachedUserEmail;
      }
    }

    // Se já temos uma promise em andamento, aguardar ela
    if (this.userEmailPromise) {
      return this.userEmailPromise;
    }

    // Criar nova promise para buscar o e-mail
    this.userEmailPromise = (async () => {
      try {
        // Primeiro, tentar obter da sessão
        const sessionEmail = this.sessao.usuario?.email;
        if (sessionEmail) {
          this.cachedUserEmail = sessionEmail;
          this.userEmailPromise = null;
          return sessionEmail;
        }

        // Se não estiver na sessão, buscar do endpoint /auth/user
        console.log('📡 Buscando e-mail do usuário do endpoint /auth/user...');
        const userInfo = await firstValueFrom(this.auth.userInfo());
        
        if (userInfo && userInfo.email) {
          this.cachedUserEmail = userInfo.email;
          // Atualizar também a sessão se possível
          if (this.sessao.usuario && !this.sessao.usuario.email) {
            this.sessao.usuario.email = userInfo.email;
          }
          this.userEmailPromise = null;
          console.log('✅ E-mail do usuário obtido do endpoint:', userInfo.email);
          return userInfo.email;
        }

        console.warn('⚠️ E-mail do usuário não encontrado na resposta do endpoint /auth/user');
        this.userEmailPromise = null;
        return null;
      } catch (error) {
        console.error('❌ Erro ao buscar e-mail do usuário:', error);
        this.userEmailPromise = null;
        return null;
      }
    })();

    return this.userEmailPromise;
  }

  /**
   * Processa a atribuição de uma atividade
   * @param payload Dados da atribuição
   * @returns Promise com a resposta da API
   * @note O campo 'updated_by' é removido do payload antes de enviar, pois não existe no schema da tabela user_action
   *       Todas as funções que chamam /game/action/process passam por este método
   */
  public async processAction(payload: ProcessActionPayload): Promise<any> {
    try {
      // Remover updated_by do payload se existir, pois não é aceito pelo backend
      // O campo updated_by não existe no schema da tabela user_action
      const payloadParaEnviar: any = { ...payload };
      if (payloadParaEnviar.updated_by !== undefined) {
        delete payloadParaEnviar.updated_by;
        console.log('⚠️ Campo updated_by removido do payload (não suportado pelo backend)');
      }
      
      console.log('📤 POST /game/action/process com payload:', JSON.stringify(payloadParaEnviar, null, 2));
      const response = await this.api.post<any>('/game/action/process', payloadParaEnviar);
      console.log('✅ Resposta de /game/action/process:', response);
      return response;
    } catch (error) {
      console.error('❌ Erro ao processar ação:', error);
      throw error;
    }
  }

  /**
   * Atualiza o status de uma atividade
   * @param atividadeId ID da atividade
   * @param novoStatus Novo status (DONE, PENDING, CANCELLED)
   * @param userEmail Email do usuário que está fazendo a alteração
   * @returns Promise com a resposta da API
   */
  public async atualizarStatusAtividade(
    atividadeId: string,
    novoStatus: string,
    userEmail: string
  ): Promise<any> {
    try {
      const payload = {
        id: atividadeId,
        status: novoStatus,
        user_email: userEmail,
        updated_at: new Date().toISOString()
      };

      console.log('🔄 Atualizando status da atividade:', { atividadeId, novoStatus, userEmail });
      
      const response = await this.api.put<any>('/game/action/status', payload);
      
      console.log('✅ Status da atividade atualizado:', response);
      return response;
    } catch (error) {
      console.error('Erro ao atualizar status da atividade:', error);
      throw error;
    }
  }

  /**
   * Busca a lista de usuários de um time específico
   * @param timeId ID do time
   * @returns Promise com array de usuários
   */
  public async getUsers(timeId: number): Promise<any[]> {
    try {
      const response = await this.api.get<any>(`/team/${timeId}/users`);
      
      // Transforma a resposta em um array de usuários
      if (Array.isArray(response)) {
        return response;
      }
      
      return [];
    } catch (error) {
      console.error('Erro ao buscar usuários do time:', error);
      throw error;
    }
  }

  /**
   * Cria o payload para processamento de ação
   * @param actionId ID da ação
   * @param userEmail Email do executor da atividade (null para tarefas não atribuídas/Unassigned)
   * @param deliveryId ID da entrega (opcional)
   * @param deliveryTitle Título da entrega (opcional)
   * @param status Status da ação (padrão: PENDING)
   * @param finishedAt Data de finalização (opcional)
   * @param comment Comentário opcional para a ação
   * @param integrationId ID de integração único da atividade (opcional)
   * @returns ProcessActionPayload
   * @note O campo 'updated_by' será preenchido automaticamente pelo método processAction
   *       com o e-mail do usuário atual da sessão quando o payload for processado
   */
  public createProcessPayload(
    actionId: string,
    userEmail: string | null,
    deliveryId?: string,
    deliveryTitle?: string,
    status: string = 'PENDING',
    finishedAt?: string,
    comment?: string,
    integrationId?: string
  ): ProcessActionPayload {
    const now = new Date().toISOString();
    
    const payload: ProcessActionPayload = {
      status: status,
      user_email: userEmail, // Email do executor da atividade (null para tarefas não atribuídas/Unassigned)
      action_id: actionId,
      delivery_id: deliveryId || '',
      delivery_title: deliveryTitle || '',
      created_at: now,
      integration_id: integrationId || deliveryId || actionId,
      comments: [], // Sempre incluir array vazio de comentários
      approved: false, // Nova atividade sempre começa como não aprovada
      approved_by: null, // Ninguém aprovou ainda
      dismissed: false // Nova atividade não é dismissed
      // updated_by será adicionado automaticamente pelo processAction com o e-mail do usuário atual
    };

    // Só inclui finished_at se uma data válida for fornecida
    if (finishedAt) {
      payload.finished_at = finishedAt;
    }

    // Inclui comentário se fornecido
    if (comment) {
      payload.comment = comment;
    }

    return payload;
  }

  /**
   * Aprova uma atividade usando o endpoint /game/action/process
   * @param actionId ID da ação/template
   * @param userEmail Email do executor da atividade (não o usuário que está aprovando)
   * @param finishedAt Data de finalização
   * @param deliveryId ID da entrega (obrigatório)
   * @param deliveryTitle Título da entrega (obrigatório)
   * @param createdAt Data de criação da atividade (obrigatório)
   * @param integrationId ID de integração único da atividade (obrigatório)
   * @returns Promise com a resposta da API
   * @note Esta função chama getCurrentUserEmail() diretamente para preencher 'approved_by' e usa
   *       processAction() que também chama getCurrentUserEmail() para preencher 'updated_by'
   *       O e-mail é obtido da sessão ou do endpoint /auth/user com cache
   */
  public async aprovarAtividade(
    actionId: string,
    userEmail: string,
    finishedAt: string,
    deliveryId: string,
    deliveryTitle: string,
    createdAt: string,
    integrationId: string
  ): Promise<any> {
    try {
      // Obter o email do usuário atual que está aprovando (não o executor)
      const currentUserEmail = await this.getCurrentUserEmail();
      if (!currentUserEmail) {
        console.warn('⚠️ Email do usuário atual não encontrado. Usando userEmail como fallback para approved_by.');
      }

      const payload: ProcessActionPayload = {
        status: 'DONE', // Manter status como DONE (não alterar para DELIVERED)
        user_email: userEmail, // Email do executor da atividade
        action_id: actionId,
        delivery_id: deliveryId,
        delivery_title: deliveryTitle,
        created_at: createdAt,
        finished_at: finishedAt,
        integration_id: integrationId,
        comments: [], // Sempre incluir array vazio de comentários
        approved: true, // Atividade aprovada
        approved_by: currentUserEmail || userEmail // Email do usuário que está aprovando (fallback para userEmail se não houver sessão)
        // updated_by será adicionado automaticamente pelo processAction com o e-mail do usuário atual
      };

      console.log('✅ Aprovando atividade:', payload);
      const response = await this.processAction(payload);
      console.log('✅ Atividade aprovada:', response);
      return response;
    } catch (error) {
      console.error('Erro ao aprovar atividade:', error);
      throw error;
    }
  }

  /**
   * Finaliza uma atividade (marca como DONE com approved: false)
   * @param actionId ID da ação/template
   * @param userEmail Email do executor da atividade (não o usuário que está finalizando)
   * @param finishedAt Data de finalização
   * @param deliveryId ID da entrega
   * @param deliveryTitle Título da entrega
   * @param createdAt Data de criação da atividade
   * @param integrationId ID de integração único da atividade (obrigatório)
   * @returns Promise com a resposta da API
   * @note Esta função usa processAction() que internamente chama getCurrentUserEmail() para preencher
   *       o campo 'updated_by' com o e-mail do usuário atual (obtido da sessão ou do endpoint /auth/user)
   */
  public async finalizarAtividade(
    actionId: string,
    userEmail: string,
    finishedAt: string,
    deliveryId: string,
    deliveryTitle: string,
    createdAt: string,
    integrationId: string
  ): Promise<any> {
    try {
      const payload: ProcessActionPayload = {
        status: 'DONE', // Status finalizado
        user_email: userEmail, // Email do executor da atividade
        action_id: actionId,
        delivery_id: deliveryId,
        delivery_title: deliveryTitle,
        created_at: createdAt,
        finished_at: finishedAt,
        integration_id: integrationId,
        comments: [], // Sempre incluir array vazio de comentários
        approved: false, // Atividade finalizada mas não aprovada
        approved_by: null, // Ninguém aprovou ainda
        dismissed: false // Atividade não é dismissed
        // updated_by será adicionado automaticamente pelo processAction com o e-mail do usuário atual
      };

      console.log('✅ Finalizando atividade:', payload);
      const response = await this.processAction(payload);
      console.log('✅ Atividade finalizada:', response);
      return response;
    } catch (error) {
      console.error('Erro ao finalizar atividade:', error);
      throw error;
    }
  }

  /**
   * Desbloqueia uma atividade (marca como entregue)
   * @param deliveryId ID da entrega
   * @param finishedAt Data de finalização
   * @returns Promise com a resposta da API
   */
  public async desbloquearAtividade(deliveryId: string, finishedAt: string): Promise<any> {
    try {
      const payload = {
        finished_at: finishedAt
      };

      console.log('🔓 Desbloqueando atividade:', { deliveryId, finishedAt });
      
      const response = await this.api.post<any>(`/game/delivery/${deliveryId}/complete`, payload);
      
      console.log('✅ Atividade desbloqueada:', response);
      return response;
    } catch (error) {
      console.error('Erro ao desbloquear atividade:', error);
      throw error;
    }
  }

  public async bloquearAtividade(deliveryId: string, userEmail: string): Promise<any> {
    try {
      const payload = {
        user_email: userEmail
      };

      console.log('🔒 Bloquear atividade:', { deliveryId, userEmail });

      const response = await this.api.post<any>(`/game/delivery/${deliveryId}/restore`, payload);

      console.log('✅ Atividade bloqueada:', response);
      return response;
    } catch (error) {
      console.error('Erro ao bloquear atividade:', error);
      throw error;
    }
  }

  /**
   * Cancela uma atividade usando o endpoint /game/action/process
   * @param actionId ID da ação/template
   * @param userEmail Email do executor da atividade (não o usuário que está cancelando)
   * @param deliveryId ID da entrega
   * @param deliveryTitle Título da entrega
   * @param createdAt Data de criação da atividade
   * @param integrationId ID de integração único da atividade (obrigatório)
   * @returns Promise com a resposta da API
   * @note Esta função usa processAction() que internamente chama getCurrentUserEmail() para preencher
   *       o campo 'updated_by' com o e-mail do usuário atual (obtido da sessão ou do endpoint /auth/user)
   */
  public async cancelarAtividadeComComentario(
    actionId: string,
    userEmail: string,
    deliveryId: string,
    deliveryTitle: string,
    createdAt: string,
    integrationId: string
  ): Promise<any> {
    try {
      const now = new Date().toISOString();
      const payload: ProcessActionPayload = {
        status: 'PENDING', // Manter como PENDING, mas com dismissed: true
        user_email: userEmail, // Email do executor da atividade
        action_id: actionId,
        delivery_id: deliveryId,
        delivery_title: deliveryTitle,
        created_at: createdAt,
        finished_at: now,
        integration_id: integrationId,
        dismissed: true, // Marcar como cancelada usando dismissed
        comments: [], // Array vazio - comentários serão adicionados via endpoint separado
        approved: false, // Atividade cancelada não está aprovada
        approved_by: null // Ninguém aprovou uma atividade cancelada
        // updated_by será adicionado automaticamente pelo processAction com o e-mail do usuário atual
      };

      console.log('❌ Cancelando atividade (dismissed):', payload);
      
      try {
        const response = await this.processAction(payload);
        // Se a resposta for null ou undefined (status 204), tratar como sucesso
        if (response === null || response === undefined) {
          console.log('✅ Atividade cancelada (status 204 - No Content, resposta vazia)');
          return { success: true, status: 204 };
        }
        console.log('✅ Atividade cancelada (dismissed):', response);
        return response;
      } catch (error: any) {
        // Status 204 (No Content) é sucesso - a operação foi concluída
        // Pode ser que o HttpClient lance erro ou retorne null para 204 dependendo da configuração
        if (error?.status === 204 || error?.response?.status === 204 || 
            error === null || error === undefined) {
          console.log('✅ Atividade cancelada (status 204 - No Content)');
          return { success: true, status: 204 };
        }
        // Re-lançar outros erros
        throw error;
      }
    } catch (error) {
      console.error('Erro ao cancelar atividade:', error);
      throw error;
    }
  }

  /**
   * Bloqueia uma atividade usando o endpoint /game/action/process
   * @param actionId ID da ação/template
   * @param userEmail Email do executor da atividade (não o usuário que está bloqueando)
   * @param deliveryId ID da entrega
   * @param deliveryTitle Título da entrega
   * @param createdAt Data de criação da atividade
   * @param integrationId ID de integração único da atividade (obrigatório)
   * @returns Promise com a resposta da API
   * @note Esta função usa processAction() que internamente chama getCurrentUserEmail() para preencher
   *       o campo 'updated_by' com o e-mail do usuário atual (obtido da sessão ou do endpoint /auth/user)
   */
  public async bloquearAtividadeComComentario(
    actionId: string,
    userEmail: string,
    deliveryId: string,
    deliveryTitle: string,
    createdAt: string,
    integrationId: string
  ): Promise<any> {
    try {
      const now = new Date().toISOString();
      const payload: ProcessActionPayload = {
        status: 'DONE',
        user_email: userEmail, // Email do executor da atividade
        action_id: actionId,
        delivery_id: deliveryId,
        delivery_title: deliveryTitle,
        created_at: createdAt,
        finished_at: now,
        integration_id: integrationId,
        comments: [], // Array vazio - comentários serão adicionados via endpoint separado
        approved: false, // Atividade bloqueada aguarda aprovação
        approved_by: null // Ninguém aprovou ainda
        // updated_by será adicionado automaticamente pelo processAction com o e-mail do usuário atual
      };

      console.log('🔒 Bloqueando atividade:', payload);
      const response = await this.processAction(payload);
      console.log('✅ Atividade bloqueada:', response);
      return response;
    } catch (error) {
      console.error('Erro ao bloquear atividade:', error);
      throw error;
    }
  }

  /**
   * Reprova uma atividade usando o endpoint /game/action/process
   * @param actionId ID da ação/template
   * @param userEmail Email do executor da atividade (não o usuário que está reprovando)
   * @param deliveryId ID da entrega
   * @param deliveryTitle Título da entrega
   * @param createdAt Data de criação da atividade
   * @param integrationId ID de integração único da atividade (obrigatório)
   * @returns Promise com a resposta da API
   * @note Esta função usa processAction() que internamente chama getCurrentUserEmail() para preencher
   *       o campo 'updated_by' com o e-mail do usuário atual (obtido da sessão ou do endpoint /auth/user)
   */
  public async reprovarAtividadeComComentario(
    actionId: string,
    userEmail: string,
    deliveryId: string,
    deliveryTitle: string,
    createdAt: string,
    integrationId: string
  ): Promise<any> {
    try {
      const now = new Date().toISOString();
      const payload: ProcessActionPayload = {
        status: 'PENDING',
        user_email: userEmail, // Email do executor da atividade
        action_id: actionId,
        delivery_id: deliveryId,
        delivery_title: deliveryTitle,
        created_at: createdAt,
        integration_id: integrationId,
        comments: [], // Array vazio - comentários serão adicionados via endpoint separado
        approved: false, // Atividade reprovada não está aprovada
        approved_by: null // Ninguém aprovou uma atividade reprovada
        // updated_by será adicionado automaticamente pelo processAction com o e-mail do usuário atual
      };

      console.log('🔄 Reprovando atividade:', payload);
      const response = await this.processAction(payload);
      console.log('✅ Atividade reprovada:', response);
      return response;
    } catch (error) {
      console.error('Erro ao reprovar atividade:', error);
      throw error;
    }
  }

  // ===== MÉTODOS PARA AÇÕES DE DELIVERY =====

  /**
   * Cancela uma delivery
   * @param deliveryId ID da delivery
   * @returns Promise com a resposta da API
   */
  public async cancelarDelivery(deliveryId: string): Promise<any> {
    try {
      console.log('❌ Cancelando delivery:', deliveryId);
      const response = await this.api.post<any>(`/game/delivery/${deliveryId}/cancel`, {});
      console.log('✅ Delivery cancelada com sucesso');
      return response;
    } catch (error) {
      console.error('Erro ao cancelar delivery:', error);
      throw error;
    }
  }

  /**
   * Completa uma delivery
   * @param deliveryId ID da delivery
   * @returns Promise com a resposta da API
   */
  public async completarDelivery(deliveryId: string): Promise<any> {
    try {
      console.log('✅ Completando delivery:', deliveryId);
      const response = await this.api.post<any>(`/game/delivery/${deliveryId}/complete`, {});
      console.log('✅ Delivery completada com sucesso');
      return response;
    } catch (error) {
      console.error('Erro ao completar delivery:', error);
      throw error;
    }
  }

  /**
   * Desfaz uma delivery entregue
   * @param deliveryId ID da delivery
   * @returns Promise com a resposta da API
   */
  public async desfazerDelivery(deliveryId: string): Promise<any> {
    try {
      console.log('🔄 Desfazendo delivery:', deliveryId);
      const response = await this.api.post<any>(`/game/delivery/${deliveryId}/undeliver`, {});
      console.log('✅ Delivery desfeita com sucesso');
      return response;
    } catch (error) {
      console.error('Erro ao desfazer delivery:', error);
      throw error;
    }
  }

  /**
   * Restaura uma delivery cancelada
   * @param deliveryId ID da delivery
   * @returns Promise com a resposta da API
   */
  public async restaurarDelivery(deliveryId: string): Promise<any> {
    try {
      console.log('🔄 Restaurando delivery:', deliveryId);
      const response = await this.api.post<any>(`/game/delivery/${deliveryId}/restore`, {});
      console.log('✅ Delivery restaurada com sucesso');
      return response;
    } catch (error) {
      console.error('Erro ao restaurar delivery:', error);
      throw error;
    }
  }

  /**
   * Método de teste para verificar se os filtros estão funcionando corretamente
   * @param atividades Array de atividades para testar
   * @returns Objeto com os resultados dos filtros
   */
  public testarFiltros(atividades: AtividadeDetalhe[]): any {
    console.log('🧪 Testando filtros com', atividades.length, 'atividades');
    
    // Filtrar atividades aguardando aprovação (DONE com approved: false ou null)
    const aguardandoAprovacao = atividades.filter(atividade => 
      atividade.status === 'DONE' && (atividade.approved === false || atividade.approved === null)
    );
    
    // Filtrar atividades aprovadas (DELIVERED + DONE com approved: true)
    const aprovadas = atividades.filter(atividade => 
      atividade.status === 'DELIVERED' || (atividade.status === 'DONE' && atividade.approved === true)
    );
    
    // Filtrar apenas DONE aprovadas
    const doneAprovadas = atividades.filter(atividade => 
      atividade.status === 'DONE' && atividade.approved === true
    );
    
    // Filtrar apenas DELIVERED
    const delivered = atividades.filter(atividade => 
      atividade.status === 'DELIVERED'
    );
    
    // Filtrar atividades canceladas (CANCELLED + dismissed: true)
    const canceladas = atividades.filter(atividade => 
      atividade.status === 'CANCELLED' || atividade.dismissed === true
    );
    
    // Filtrar apenas CANCELLED
    const apenasCancelled = atividades.filter(atividade => 
      atividade.status === 'CANCELLED'
    );
    
    // Filtrar apenas dismissed: true
    const apenasDismissed = atividades.filter(atividade => 
      atividade.dismissed === true
    );
    
    const resultado = {
      total: atividades.length,
      aguardandoAprovacao: {
        count: aguardandoAprovacao.length,
        atividades: aguardandoAprovacao.map(a => ({ id: a.id, status: a.status, approved: a.approved }))
      },
      aprovadas: {
        count: aprovadas.length,
        doneAprovadas: {
          count: doneAprovadas.length,
          atividades: doneAprovadas.map(a => ({ id: a.id, status: a.status, approved: a.approved }))
        },
        delivered: {
          count: delivered.length,
          atividades: delivered.map(a => ({ id: a.id, status: a.status, approved: a.approved }))
        }
      },
      canceladas: {
        count: canceladas.length,
        apenasCancelled: {
          count: apenasCancelled.length,
          atividades: apenasCancelled.map(a => ({ id: a.id, status: a.status, approved: a.approved }))
        },
        apenasDismissed: {
          count: apenasDismissed.length,
          atividades: apenasDismissed.map(a => ({ id: a.id, status: a.status, approved: a.approved }))
        }
      }
    };
    
    console.log('�� Resultado dos testes:', resultado);
    return resultado;
  }

  /**
   * Método de teste específico para verificar o filtro de atividades aguardando aprovação
   * @param atividades Array de atividades para testar
   * @returns Objeto com os resultados do teste
   */
  public testarFiltroAguardandoAprovacao(atividades: AtividadeDetalhe[]): any {
    console.log('🧪 Testando filtro de atividades aguardando aprovação...');
    
    // Contar atividades por status
    const porStatus = atividades.reduce((acc, atividade) => {
      acc[atividade.status] = (acc[atividade.status] || 0) + 1;
      return acc;
    }, {} as any);
    
    // Contar atividades por approved
    const porApproved = atividades.reduce((acc, atividade) => {
      const key = atividade.approved === true ? 'approved: true' : 
                  atividade.approved === false ? 'approved: false' : 
                  atividade.approved === null ? 'approved: null' : 'approved: undefined';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as any);
    
    // Filtrar atividades que deveriam estar na aba aguardando aprovação
    const aguardandoAprovacao = atividades.filter(atividade => 
      atividade.status === 'DONE' && (atividade.approved === false || atividade.approved === null || atividade.approved === undefined)
    );
    
    // Filtrar atividades que NÃO deveriam estar na aba aguardando aprovação
    const naoDeveriamEstar = atividades.filter(atividade => 
      atividade.status !== 'DONE' || atividade.approved === true
    );
    
    const resultado = {
      total: atividades.length,
      porStatus,
      porApproved,
      aguardandoAprovacao: {
        count: aguardandoAprovacao.length,
        atividades: aguardandoAprovacao.map(a => ({ id: a.id, status: a.status, approved: a.approved }))
      },
      naoDeveriamEstar: {
        count: naoDeveriamEstar.length,
        atividades: naoDeveriamEstar.map(a => ({ id: a.id, status: a.status, approved: a.approved }))
      }
    };
    
    console.log('🧪 Resultado do teste de filtro aguardando aprovação:', resultado);
    
    if (resultado.naoDeveriamEstar.count > 0) {
      console.error('❌ PROBLEMA: Encontradas atividades que não deveriam estar na aba aguardando aprovação!');
    } else {
      console.log('✅ Filtro funcionando corretamente!');
    }
    
    return resultado;
  }

  /**
   * Método auxiliar para verificar se uma atividade está aprovada
   * @param atividade Atividade para verificar
   * @returns true se aprovada, false caso contrário
   */
  public isAtividadeAprovada(atividade: any): boolean {
    return atividade?.approved === true;
  }

  /**
   * Método auxiliar para verificar se uma atividade não está aprovada
   * @param atividade Atividade para verificar
   * @returns true se não aprovada (false ou null), false caso contrário
   */
  public isAtividadeNaoAprovada(atividade: any): boolean {
    return atividade?.approved === false || atividade?.approved === null;
  }

  /**
   * Método auxiliar para verificar se uma atividade está cancelada
   * @param atividade Atividade para verificar
   * @returns true se cancelada, false caso contrário
   */
  public isAtividadeCancelada(atividade: any): boolean {
    return atividade?.status === 'CANCELLED' || atividade?.dismissed === true;
  }

  /**
   * Adiciona um comentário a uma user action
   * @param userActionId ID da user action
   * @param comment Comentário a ser adicionado
   * @param userEmail Email do usuário que está comentando
   * @param commentType Tipo do comentário (CANCEL, BLOCK, FINISH, DENY, APPROVE)
   * @returns Promise com a resposta da API
   */
  public async adicionarComentario(
    userActionId: string,
    comment: string,
    userEmail: string,
    commentType: 'CANCEL' | 'BLOCK' | 'FINISH' | 'DENY' | 'APPROVE' = 'FINISH'
  ): Promise<any> {
    try {
      const payload = {
        message: comment,
        created_by: userEmail,
        type: commentType
      };

      console.log('💬 Adicionando comentário:', { userActionId, payload });
      
      const response = await this.api.post<any>(`/user-action/${userActionId}/comment`, payload);
      
      console.log('✅ Comentário adicionado:', response);
      return response;
    } catch (error) {
      console.error('Erro ao adicionar comentário:', error);
      throw error;
    }
  }

  /**
   * Faz upload de anexos para uma user action
   * @param userActionId ID da user action
   * @param files Array de arquivos para upload
   * @returns Promise com a resposta da API
   */
  public async uploadAnexos(
    userActionId: string,
    files: File[]
  ): Promise<any> {
    try {
      const formData = new FormData();
      
      // Usar 'files' (plural) como chave conforme documentação
      files.forEach((file, index) => {
        formData.append('files', file);
      });

      console.log('📎 Fazendo upload de anexos:', { userActionId, filesCount: files.length });
      
      // Para upload de arquivos, usar HttpClient diretamente para evitar headers padrão
      // que incluem Content-Type: application/json
      const url = `${environment.backend_url_base}/user-action/${userActionId}/attachment`;
      
      // Usar HttpClient diretamente para ter controle total sobre os headers
      const response = await firstValueFrom(this.http.put<any>(url, formData));
      
      console.log('✅ Anexos enviados:', response);
      return response;
    } catch (error: any) {
      console.error('Erro ao fazer upload de anexos:', error);
      
      // Tratar erros tipificados conforme documentação
      if (error?.error?.errorType) {
        const errorData = error.error;
        let message = 'Erro no upload';
        
        switch (errorData.errorType) {
          case 'FILE_TOO_LARGE':
            message = `Arquivo muito grande. Máximo: ${errorData.details?.maxSize || 'desconhecido'} bytes`;
            break;
          case 'INVALID_CONTENT_TYPE':
            message = 'Erro no envio do arquivo. Verifique o formato.';
            break;
          case 'UNAUTHORIZED':
            message = 'Sessão expirada. Faça login novamente.';
            break;
          default:
            message = errorData.message || message;
        }
        
        throw new Error(message);
      }
      
      throw error;
    }
  }

  /**
   * Busca anexos de uma user action
   * @param userActionId ID da user action
   * @returns Promise com a resposta da API
   */
  public async buscarAnexos(
    userActionId: string
  ): Promise<any> {
    try {
      console.log('📎 Buscando anexos:', { userActionId });
      
      const response = await this.api.get<any>(`/user-action/${userActionId}/attachment`);
      
      console.log('✅ Anexos encontrados:', response);
      
      // Log detalhado da estrutura dos anexos
      if (Array.isArray(response)) {
        response.forEach((anexo, index) => {
          console.log(`📋 Anexo ${index + 1}:`, {
            id: anexo.id,
            filename: anexo.filename,
            original_name: anexo.original_name,
            name: anexo.name,
            size: anexo.size,
            mime_type: anexo.mime_type,
            type: anexo.type,
            created_at: anexo.created_at,
            createdAt: anexo.createdAt
          });
        });
      }
      
      return response;
    } catch (error) {
      console.error('Erro ao buscar anexos:', error);
      throw error;
    }
  }

  /**
   * Obtém a URL de download de um anexo específico
   * @param attachmentId ID do anexo
   * @returns Promise com a URL do arquivo
   */
  public async getDownloadUrl(
    attachmentId: string
  ): Promise<string> {
    try {
      console.log('📥 Obtendo URL de download do anexo:', { attachmentId });
      
      const url = `${environment.backend_url_base}/user-action/download-attachment/${attachmentId}`;
      
      // Usar HttpClient diretamente para obter a resposta JSON
      const response = await firstValueFrom(
        this.http.get<DownloadUrlResponse>(url)
      );
      
      // Extrair a URL da propriedade download_url
      const downloadUrl = response?.download_url;
      
      if (!downloadUrl) {
        throw new Error('URL de download não encontrada na resposta');
      }
      
      console.log('✅ URL de download obtida:', downloadUrl);
      return downloadUrl;
    } catch (error) {
      console.error('Erro ao obter URL de download do anexo:', error);
      throw error;
    }
  }

  /**
   * Método de teste para simular os dados reais fornecidos
   */
  public testarComDadosReais() {
    console.log('🧪 TESTE COM DADOS REAIS - Iniciando...');
    
    // Simular os dados exatos fornecidos pelo usuário
    const dadosReais = [
      {
        "user_id": "0511ad9f-d3d3-4c3c-9a1c-55cb2dbd3118",
        "points": 125,
        "status": "DONE",
        "finished_at": "2025-07-24T17:59:00+00:00",
        "id": "fb2addff-ed19-4fbc-8736-72e8ec436a87",
        "action_template_id": "testeaitax",
        "delivery_id": "1234444",
        "created_at": "2025-07-24T17:59:52.304+00:00",
        "action_title": "tarefa alterada pelo césar",
        "delivery_title": "1234444",
        "user_email": "cesar.domingos@cidadania4u.com.br",
        "team_id": 13,
        "team_name": "Alpha",
        "client_id": "cidadania4u",
        "updated_at": "2025-07-24T17:59:53.495+00:00",
        "funifier_id": "688274997643362f7fa231a6",
        "integration_id": "1234444",
        "dismissed": false,
        "created_by": "cesar.domingos@cidadania4u.com.br",
        "finished_by": null,
        "comments": [],
        "approved": false,
        "approved_by": null
      },
      {
        "user_id": "0511ad9f-d3d3-4c3c-9a1c-55cb2dbd3118",
        "points": 900,
        "status": "DONE",
        "finished_at": "2025-07-24T18:08:51.02+00:00",
        "id": "58676eb4-7562-4d9b-8989-a19e01b0fa94",
        "action_template_id": "taxta47",
        "delivery_id": "azzzzaz",
        "created_at": "2025-07-24T18:08:51.126+00:00",
        "action_title": "TX | Elaborar Relatório (Compensação com Crédito Tributário - Rubrica da Folha)",
        "delivery_title": "azzzzaz",
        "user_email": "cesar.domingos@cidadania4u.com.br",
        "team_id": 13,
        "team_name": "Alpha",
        "client_id": "cidadania4u",
        "updated_at": "2025-07-24T18:26:22.997+00:00",
        "funifier_id": "688276b47643362f7fa2323d",
        "integration_id": "azzzzaz",
        "dismissed": false,
        "created_by": "cesar.domingos@cidadania4u.com.br",
        "finished_by": "cesar.domingos@cidadania4u.com.br",
        "comments": [],
        "approved": true,
        "approved_by": "cesar.domingos@cidadania4u.com.br"
      }
    ];
    
    console.log('📊 Dados reais fornecidos:', dadosReais);
    
    // Testar filtro para "aguardando aprovação"
    const aguardandoAprovacao = dadosReais.filter(atividade => {
      const isNotApproved = atividade.approved === false || atividade.approved === null;
      console.log(`🔍 TESTE - Atividade ${atividade.id}:`, {
        approved: atividade.approved,
        approved_type: typeof atividade.approved,
        isNotApproved: isNotApproved,
        action_title: atividade.action_title
      });
      return isNotApproved;
    });
    
    console.log('✅ TESTE - Atividades que deveriam estar em "aguardando aprovação":', aguardandoAprovacao.length);
    aguardandoAprovacao.forEach((atividade, index) => {
      console.log(`✅ TESTE - Incluída ${index + 1}:`, {
        id: atividade.id,
        approved: atividade.approved,
        action_title: atividade.action_title
      });
    });
    
    // Testar filtro para "aprovados"
    const aprovados = dadosReais.filter(atividade => {
      const isApproved = this.isAtividadeAprovada(atividade);
      console.log(`🔍 TESTE - Atividade ${atividade.id}:`, {
        approved: atividade.approved,
        approved_type: typeof atividade.approved,
        isApproved: isApproved,
        action_title: atividade.action_title
      });
      return isApproved;
    });
    
    console.log('✅ TESTE - Atividades que deveriam estar em "aprovados":', aprovados.length);
    aprovados.forEach((atividade, index) => {
      console.log(`✅ TESTE - Incluída ${index + 1}:`, {
        id: atividade.id,
        approved: atividade.approved,
        action_title: atividade.action_title
      });
    });
    
    console.log('🏁 TESTE COM DADOS REAIS - Finalizado');
  }
} 