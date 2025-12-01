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
      
      // Map known KPI fields from cnpj_performance__c
      if ('nps' in apiResponses) {
        kpis.push({
          id: 'nps',
          label: 'NPS',
          current: apiResponses.nps || 0,
          target: 10, // Default target for NPS (0-10 scale)
          unit: 'pontos'
        });
      }
      
      if ('multas' in apiResponses) {
        kpis.push({
          id: 'multas',
          label: 'Multas',
          current: apiResponses.multas || 0,
          target: 0, // Target is 0 multas
          unit: 'multas'
        });
      }
      
      if ('eficiencia' in apiResponses) {
        kpis.push({
          id: 'eficiencia',
          label: 'Eficiência',
          current: apiResponses.eficiencia || 0,
          target: 10, // Default target
          unit: 'pontos'
        });
      }
      
      if ('prazo' in apiResponses) {
        kpis.push({
          id: 'prazo',
          label: 'Prazo',
          current: apiResponses.prazo || 0,
          target: 10, // Default target
          unit: 'pontos'
        });
      }
      
      return kpis;
    }
    
    return [];
  }
}
