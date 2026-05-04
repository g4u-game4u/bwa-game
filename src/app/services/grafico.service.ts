import {Injectable} from '@angular/core';
import {Grafico} from '../model/grafico.model';
import {ApiProvider} from "../providers/api.provider";
import {TIPO_CONSULTA_TIME} from "@app/pages/dashboard/dashboard.component";
import {SessaoProvider} from '@providers/sessao/sessao.provider';

@Injectable({
  providedIn: 'root'
})
export class GraficoService {

  basePath = '/game/team-player-stats';

  constructor(
    private api: ApiProvider,
    private sessao: SessaoProvider
  ) {
  }

  public getDadosGraficoMesAtual(id: number, tipo: number, startDate: string, endDate: string): Promise<Grafico> {
    return this.getDadosGrafico(id, tipo, startDate, endDate);
  }

  public getDadosGrafico(
    id: number,
    tipo: number,
    startDate: string,
    endDate: string
  ): Promise<Grafico> {
    let url = this.basePath;
    let queryParams = `?start=${startDate}&end=${endDate}`;

    if (tipo === TIPO_CONSULTA_TIME) {
      url = '/game/team-charts-stats';
      queryParams += '&team=' + id;
      const ve = this.sessao.usuario?.email?.trim();
      if (ve) {
        queryParams += '&user=' + encodeURIComponent(ve);
      }
    } else {
      queryParams += '&user=' + id;
    }

    return this.api.get<Grafico>(url + queryParams);
  }
}
