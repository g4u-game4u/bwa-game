import {Injectable} from '@angular/core';
import {ApiProvider} from "../providers/api.provider";
import {ResumoMes} from "../model/resumoMes.model";
import {TIPO_CONSULTA_TIME} from "@app/pages/dashboard/dashboard.component";
import { DetalheAtividade } from '@model/detalheAtividade.model';
import { environment } from 'src/environments/environment';
import { HttpClient } from '@angular/common/http';
import { DetalheMacro } from '@model/detalheMacro.model';

@Injectable({
  providedIn: 'root'
})
export class MesAnteriorService {

  basePath = '/game/stats';

  constructor(private api: ApiProvider, private http: HttpClient) {
  }

  public async getDadosMesAnteriorDashboard(id: number, tipo: number, mesesAnteriores: number): Promise<ResumoMes> {
    // Check if backend_url_base is configured - if not, return empty data
    if (!environment.backend_url_base || environment.backend_url_base === 'http://localhost') {
      console.warn('⚠️ MesAnteriorService: backend_url_base not configured, returning empty data');
      return this.getEmptyResumoMes();
    }

    try {
      let url = this.basePath;
      let mes = new Date();

      // Calcular o mês anterior baseado no parâmetro mesesAnteriores
      const firstDayOfMonth = new Date(mes.getFullYear(), mes.getMonth() - mesesAnteriores, 1);
      const lastDayOfMonth = new Date(mes.getFullYear(), mes.getMonth() - mesesAnteriores + 1, 0);

      // Ajustar para incluir timezone
      firstDayOfMonth.setUTCHours(0, 0, 0, 0);
      lastDayOfMonth.setUTCHours(23, 59, 59, 999);

      let queryParams = '?start=' + firstDayOfMonth.toISOString() +
                        '&end=' + lastDayOfMonth.toISOString();

      if (tipo == TIPO_CONSULTA_TIME) {
        url = '/game/team-stats';
        queryParams += '&team=' + id;
      } else {
          queryParams += '&user=' + id;
      }

      const response = await this.api.get<any>(url + queryParams);

      return <ResumoMes>{
        pontos: (response?.action_stats?.total_points || 0) + (response?.action_stats?.total_blocked_points || 0),
        pendingTasks: response?.action_stats?.PENDING?.count || 0,
        doingTasks: response?.action_stats?.DOING?.count || 0,
        completedTasks: response?.action_stats?.DONE?.count || 0,
        deliveredTasks: response?.action_stats?.DELIVERED?.count || 0,
        pendingDeliveries: response?.delivery_stats?.PENDING || 0,
        incompleteDeliveries: response?.delivery_stats?.INCOMPLETE || 0,
        completedDeliveries: response?.delivery_stats?.DELIVERED || 0,
      };
    } catch (error) {
      console.error('❌ MesAnteriorService: Error fetching previous month data:', error);
      return this.getEmptyResumoMes();
    }
  }

  private getEmptyResumoMes(): ResumoMes {
    return {
      pontos: 0,
      pendingTasks: 0,
      doingTasks: 0,
      completedTasks: 0,
      deliveredTasks: 0,
      pendingDeliveries: 0,
      incompleteDeliveries: 0,
      completedDeliveries: 0,
    };
  }

  getGameActions(status: string, page: number, pageSize: number, mesesAnteriores: number, id?: string, tipo?: number) {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth() - mesesAnteriores, 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() - mesesAnteriores + 1, 0);

    // Ajustar para incluir timezone
    firstDayOfMonth.setUTCHours(0, 0, 0, 0);
    lastDayOfMonth.setUTCHours(23, 59, 59, 999);

    const baseUrl = tipo === TIPO_CONSULTA_TIME
    ? `${environment.backend_url_base}/game/team-actions`
    : `${environment.backend_url_base}/game/actions`;

    const params: any = {
        status: status,
        start: firstDayOfMonth.toISOString(),
        end: lastDayOfMonth.toISOString()
    };

    if (tipo === TIPO_CONSULTA_TIME) {
        params.team = id;
    } else if (id) {
        params.user = id;
    }

    return this.http.get<DetalheAtividade | DetalheMacro>(
        baseUrl,
        { params }
    ).toPromise();
  }

  getGameDeliveries(status: string, page: number, pageSize: number, mesesAnteriores: number, id?: string, tipo?: number) {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth() - mesesAnteriores, 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() - mesesAnteriores + 1, 0);

    // Ajustar para incluir timezone
    firstDayOfMonth.setUTCHours(0, 0, 0, 0);
    lastDayOfMonth.setUTCHours(23, 59, 59, 999);

    const baseUrl = tipo === TIPO_CONSULTA_TIME
    ? `${environment.backend_url_base}/game/team-deliveries`
    : `${environment.backend_url_base}/game/deliveries`;

    const params: any = {
        status: status,
        start: firstDayOfMonth.toISOString(),
        end: lastDayOfMonth.toISOString()
    };

    if (tipo === TIPO_CONSULTA_TIME) {
        params.team = id;
    } else if (id) {
        params.user = id;
    }

    return this.http.get<DetalheAtividade | DetalheMacro>(
        baseUrl,
        { params }
    ).toPromise();
  }

}
