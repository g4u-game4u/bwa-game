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
   * Dynamically extracts all KPIs from the API response
   */
  toKPIDataArray(apiResponses: any[] | any): KPIData[] {
    console.log('📊 KPI Mapper - Input:', apiResponses);
    console.log('📊 KPI Mapper - Keys:', apiResponses ? Object.keys(apiResponses) : []);
    
    // If it's an array, map each item
    if (Array.isArray(apiResponses)) {
      return apiResponses.map((response, index) => 
        this.toKPIData(response, `KPI ${index + 1}`)
      );
    }
    
    // If it's an object (from cnpj_performance__c), extract KPI fields
    if (typeof apiResponses === 'object' && apiResponses !== null) {
      const kpis: KPIData[] = [];
      const addedIds = new Set<string>();
      
      // Named KPIs to look for (check these first as they have meaningful labels)
      // Based on cnpj_performance__c structure: nps, multas, eficiencia, extra, prazo
      const namedKpis = ['nps', 'multas', 'eficiencia', 'extra', 'prazo', 'qualidade', 'produtividade', 'satisfacao', 'saude'];
      const namedKpiLabels: { [key: string]: string } = {
        nps: 'NPS',
        multas: 'Multas',
        eficiencia: 'Eficiência',
        extra: 'Extra',
        prazo: 'Prazo',
        qualidade: 'Qualidade',
        produtividade: 'Produtividade',
        satisfacao: 'Satisfação',
        saude: 'Saúde'
      };
      
      // First, check for named KPIs (these have meaningful labels)
      for (const kpiName of namedKpis) {
        if (kpiName in apiResponses && !addedIds.has(kpiName)) {
          const kpiData = apiResponses[kpiName];
          console.log(`📊 Found named KPI '${kpiName}':`, kpiData);
          addedIds.add(kpiName);
          
          if (typeof kpiData === 'object' && kpiData !== null) {
            kpis.push({
              id: kpiName,
              label: kpiData.label || namedKpiLabels[kpiName] || kpiName,
              current: kpiData.current || kpiData.value || 0,
              target: kpiData.target || 10,
              unit: kpiData.unit || ''
            });
          } else if (kpiData !== undefined && kpiData !== null) {
            kpis.push({
              id: kpiName,
              label: namedKpiLabels[kpiName] || kpiName,
              current: typeof kpiData === 'number' ? kpiData : 0,
              target: 10,
              unit: ''
            });
          }
        }
      }
      
      // Then, find all numbered KPIs (kpi1, kpi2, kpi3, kpi4, etc.)
      const numberedKpiKeys = Object.keys(apiResponses)
        .filter(key => /^kpi[_]?\d+$/i.test(key))
        .sort((a, b) => {
          const numA = parseInt(a.replace(/\D/g, ''), 10);
          const numB = parseInt(b.replace(/\D/g, ''), 10);
          return numA - numB;
        });
      
      console.log('📊 Found numbered KPI keys:', numberedKpiKeys);
      
      for (const key of numberedKpiKeys) {
        if (addedIds.has(key)) continue;
        
        const kpiData = apiResponses[key];
        const kpiNum = key.replace(/\D/g, '');
        addedIds.add(key);
        
        if (typeof kpiData === 'object' && kpiData !== null) {
          kpis.push({
            id: key,
            label: kpiData.label || `KPI ${kpiNum}`,
            current: kpiData.current || kpiData.value || 0,
            target: kpiData.target || 10,
            unit: kpiData.unit || ''
          });
        } else if (kpiData !== undefined && kpiData !== null) {
          kpis.push({
            id: key,
            label: `KPI ${kpiNum}`,
            current: typeof kpiData === 'number' ? kpiData : 0,
            target: 10,
            unit: ''
          });
        }
      }
      
      // If still no KPIs, create default 3 KPIs
      if (kpis.length === 0) {
        console.log('📊 No KPIs found, using defaults');
        kpis.push(
          { id: 'kpi1', label: 'KPI 1', current: 0, target: 10, unit: '' },
          { id: 'kpi2', label: 'KPI 2', current: 0, target: 10, unit: '' },
          { id: 'kpi3', label: 'KPI 3', current: 0, target: 10, unit: '' }
        );
      }
      
      console.log('📊 Final KPIs extracted:', kpis.map(k => k.label));
      return kpis;
    }
    
    return [];
  }
}
