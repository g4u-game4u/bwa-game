import { Injectable } from '@angular/core';
import { KPIData } from '@model/gamification-dashboard.model';

@Injectable({
  providedIn: 'root'
})
export class KPIMapper {
  /**
   * Map API response to KPIData model
   */
  toKPIData(apiResponse: any, defaultLabel: string = 'KPI'): KPIData {
    return {
      id: apiResponse._id || apiResponse.id || '',
      label: apiResponse.label || apiResponse.name || defaultLabel,
      current: apiResponse.current || apiResponse.value || 0,
      target: apiResponse.target || apiResponse.goal || 0,
      unit: apiResponse.unit || undefined
    };
  }

  /**
   * Map array of KPI responses or object with KPI fields
   */
  toKPIDataArray(apiResponses: any[] | any): KPIData[] {
    // If it's an array, map each item
    if (Array.isArray(apiResponses)) {
      return apiResponses.map((response, index) => 
        this.toKPIData(response, `KPI ${index + 1}`)
      );
    }
    
    // If it's an object (from cnpj_performance__c), extract KPI fields
    if (typeof apiResponses === 'object' && apiResponses !== null) {
      const kpis: KPIData[] = [];
      
      // Map KPI fields from cnpj_performance__c
      // The collection may have kpi1, kpi2, kpi3 or specific named fields
      
      // Check for numbered KPIs first (kpi1, kpi2, kpi3)
      if ('kpi1' in apiResponses || 'kpi_1' in apiResponses) {
        const kpi1Data = apiResponses.kpi1 || apiResponses.kpi_1;
        if (typeof kpi1Data === 'object') {
          kpis.push({
            id: 'kpi1',
            label: kpi1Data.label || 'KPI 1',
            current: kpi1Data.current || kpi1Data.value || 0,
            target: kpi1Data.target || 10,
            unit: kpi1Data.unit || ''
          });
        } else {
          kpis.push({
            id: 'kpi1',
            label: 'KPI 1',
            current: kpi1Data || 0,
            target: 10,
            unit: ''
          });
        }
      }
      
      if ('kpi2' in apiResponses || 'kpi_2' in apiResponses) {
        const kpi2Data = apiResponses.kpi2 || apiResponses.kpi_2;
        if (typeof kpi2Data === 'object') {
          kpis.push({
            id: 'kpi2',
            label: kpi2Data.label || 'KPI 2',
            current: kpi2Data.current || kpi2Data.value || 0,
            target: kpi2Data.target || 10,
            unit: kpi2Data.unit || ''
          });
        } else {
          kpis.push({
            id: 'kpi2',
            label: 'KPI 2',
            current: kpi2Data || 0,
            target: 10,
            unit: ''
          });
        }
      }
      
      if ('kpi3' in apiResponses || 'kpi_3' in apiResponses) {
        const kpi3Data = apiResponses.kpi3 || apiResponses.kpi_3;
        if (typeof kpi3Data === 'object') {
          kpis.push({
            id: 'kpi3',
            label: kpi3Data.label || 'KPI 3',
            current: kpi3Data.current || kpi3Data.value || 0,
            target: kpi3Data.target || 10,
            unit: kpi3Data.unit || ''
          });
        } else {
          kpis.push({
            id: 'kpi3',
            label: 'KPI 3',
            current: kpi3Data || 0,
            target: 10,
            unit: ''
          });
        }
      }
      
      // If no numbered KPIs found, check for named KPIs
      if (kpis.length === 0) {
        if ('nps' in apiResponses) {
          kpis.push({
            id: 'nps',
            label: 'NPS',
            current: apiResponses.nps || 0,
            target: 10,
            unit: 'pontos'
          });
        }
        
        if ('multas' in apiResponses) {
          kpis.push({
            id: 'multas',
            label: 'Multas',
            current: apiResponses.multas || 0,
            target: 0,
            unit: 'multas'
          });
        }
        
        if ('eficiencia' in apiResponses) {
          kpis.push({
            id: 'eficiencia',
            label: 'Eficiência',
            current: apiResponses.eficiencia || 0,
            target: 10,
            unit: 'pontos'
          });
        }
        
        if ('prazo' in apiResponses) {
          kpis.push({
            id: 'prazo',
            label: 'Prazo',
            current: apiResponses.prazo || 0,
            target: 10,
            unit: 'pontos'
          });
        }
      }
      
      // If still no KPIs, create default 3 KPIs
      if (kpis.length === 0) {
        kpis.push(
          { id: 'kpi1', label: 'KPI 1', current: 0, target: 10, unit: '' },
          { id: 'kpi2', label: 'KPI 2', current: 0, target: 10, unit: '' },
          { id: 'kpi3', label: 'KPI 3', current: 0, target: 10, unit: '' }
        );
      }
      
      return kpis;
    }
    
    return [];
  }
}
