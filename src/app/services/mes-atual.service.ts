import {Injectable} from '@angular/core';
import {ApiProvider} from "../providers/api.provider";
import {ResumoMes} from "../model/resumoMes.model";
import {TIPO_CONSULTA_TIME} from "@app/pages/dashboard/dashboard.component";
import {HttpClient} from '@angular/common/http';
import {environment} from '../../environments/environment';
import {DetalheAtividade} from '../model/detalheAtividade.model';
import {DetalheMacro} from '../model/detalheMacro.model';

@Injectable({
    providedIn: 'root'
})
export class MesAtualService {

    basePath = '/game/stats';
    today = new Date();
    firstDayOfMonth = new Date(this.today.getFullYear(), this.today.getMonth(), 1);
    lastDayOfMonth = new Date(this.today.getFullYear(), this.today.getMonth() + 1, 0);

    constructor(
        private api: ApiProvider, 
        private http: HttpClient
    ) {
    }

    public async getDadosMesAtualDashboard(id: number, tipo: number): Promise<ResumoMes> {
        // Check if backend_url_base is configured - if not, return empty data
        if (!environment.backend_url_base || environment.backend_url_base === 'http://localhost') {
            console.warn('⚠️ MesAtualService: backend_url_base not configured, returning empty data');
            return this.getEmptyResumoMes();
        }

        try {
            let url = this.basePath;

            // Usar primeiro e último dia do mês atual
            this.firstDayOfMonth.setUTCHours(0, 0, 0, 0);
            this.lastDayOfMonth.setUTCHours(23, 59, 59, 999);

            let queryParams = '?start=' + this.firstDayOfMonth.toISOString() +
                             '&end=' + this.lastDayOfMonth.toISOString();

            if (tipo === TIPO_CONSULTA_TIME) {
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
            console.error('❌ MesAtualService: Error fetching current month data:', error);
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

    getGameActions(status: string, page: number, pageSize: number, id?: string, tipo?: number) {
        // Usar primeiro e último dia do mês atual
        this.firstDayOfMonth.setUTCHours(0, 0, 0, 0);
        this.lastDayOfMonth.setUTCHours(23, 59, 59, 999);

        const baseUrl = tipo === TIPO_CONSULTA_TIME
        ? `${environment.backend_url_base}/game/team-actions`
        : `${environment.backend_url_base}/game/actions`;

        const params: any = {
            status: status,
            start: this.firstDayOfMonth.toISOString(),
            end: this.lastDayOfMonth.toISOString()
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

    getGameDeliveries(status: string, page: number, pageSize: number, id?: string, tipo?: number) {
        // Usar primeiro e último dia do mês atual
        this.firstDayOfMonth.setUTCHours(0, 0, 0, 0);
        this.lastDayOfMonth.setUTCHours(23, 59, 59, 999);

        const baseUrl = tipo === TIPO_CONSULTA_TIME
        ? `${environment.backend_url_base}/game/team-deliveries`
        : `${environment.backend_url_base}/game/deliveries`;

        const params: any = {
            status: status,
            start: this.firstDayOfMonth.toISOString(),
            end: this.lastDayOfMonth.toISOString()
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
