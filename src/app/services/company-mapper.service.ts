import { Injectable } from '@angular/core';
import { Company, CompanyDetails, Process, Task, Activity, ProcessStatus, TaskStatus } from '@model/gamification-dashboard.model';
import { KPIMapper } from './kpi-mapper.service';

@Injectable({
  providedIn: 'root'
})
export class CompanyMapper {
  constructor(private kpiMapper: KPIMapper) {}

  /**
   * Map Funifier API response to Company model
   * Data comes from player status extra.companies or cnpj_performance__c
   */
  toCompany(apiResponse: any): Company {
    // Extract KPIs from the response
    const kpis = this.kpiMapper.toKPIDataArray(apiResponse);
    
    // Calculate health score as average of KPIs (if available)
    let healthScore = apiResponse.healthScore || apiResponse.health || 0;
    if (kpis.length > 0 && healthScore === 0) {
      const avgScore = kpis.reduce((sum, kpi) => {
        const percentage = kpi.target > 0 ? (kpi.current / kpi.target) * 100 : 0;
        return sum + percentage;
      }, 0) / kpis.length;
      healthScore = Math.round(avgScore);
    }
    
    return {
      id: apiResponse._id || apiResponse.id || apiResponse.cnpj || '',
      name: apiResponse.name || `CNPJ ${apiResponse._id || apiResponse.cnpj || ''}`,
      cnpj: apiResponse.cnpj || apiResponse._id || '',
      healthScore,
      kpis: kpis, // Dynamic array of all KPIs
      // Legacy support
      kpi1: kpis[0] || this.kpiMapper.toKPIData({}, 'KPI 1'),
      kpi2: kpis[1] || this.kpiMapper.toKPIData({}, 'KPI 2'),
      kpi3: kpis[2] || this.kpiMapper.toKPIData({}, 'KPI 3')
    };
  }

  /**
   * Map Funifier API response to CompanyDetails model
   * For now, processes/activities/macros are empty as they're not in cnpj_performance__c
   */
  toCompanyDetails(apiResponse: any): CompanyDetails {
    const company = this.toCompany(apiResponse);
    
    return {
      ...company,
      processes: this.mapProcesses(apiResponse.processes || []),
      activities: this.mapActivities(apiResponse.activities || []),
      processos: this.mapMacros(apiResponse.macros || [])
    };
  }

  /**
   * Map processes from API response
   */
  private mapProcesses(processes: any[]): Process[] {
    return processes.map(process => ({
      id: process._id || process.id || '',
      name: process.name || '',
      status: this.mapProcessStatus(process.status),
      tasks: this.mapTasks(process.tasks || []),
      expanded: false
    }));
  }

  /**
   * Map tasks from API response
   */
  private mapTasks(tasks: any[]): Task[] {
    return tasks.map(task => ({
      id: task._id || task.id || '',
      name: task.name || '',
      responsible: task.responsible || task.assignee || '',
      status: this.mapTaskStatus(task.status),
      dueDate: task.dueDate ? new Date(task.dueDate) : undefined
    }));
  }

  /**
   * Map activities from API response
   */
  private mapActivities(activities: any[]): Activity[] {
    return activities.map(activity => ({
      id: activity._id || activity.id || '',
      name: activity.name || '',
      points: activity.points || 0,
      completedDate: new Date(activity.completedDate || activity.completed_at || Date.now())
    }));
  }

  /**
   * Map macros from API response (now called processos)
   */
  private mapMacros(macros: any[]): Process[] {
    return macros.map(macro => ({
      id: macro._id || macro.id || '',
      name: macro.name || '',
      status: this.mapProcessStatus(macro.status),
      completedDate: macro.completedDate ? new Date(macro.completedDate) : undefined
    }));
  }

  /**
   * Map process status from API
   */
  private mapProcessStatus(status: string): ProcessStatus {
    const statusLower = (status || '').toLowerCase();
    
    if (statusLower.includes('complete') || statusLower.includes('finalizado')) {
      return 'completed';
    } else if (statusLower.includes('progress') || statusLower.includes('execu')) {
      return 'in-progress';
    } else if (statusLower.includes('block') || statusLower.includes('bloqueado')) {
      return 'blocked';
    }
    
    return 'pending';
  }

  /**
   * Map task status from API
   */
  private mapTaskStatus(status: string): TaskStatus {
    const statusLower = (status || '').toLowerCase();
    
    if (statusLower.includes('complete') || statusLower.includes('finalizado')) {
      return 'completed';
    } else if (statusLower.includes('progress') || statusLower.includes('execu')) {
      return 'in-progress';
    }
    
    return 'pending';
  }
}
