/**
 * Mock Data Generators
 * Utilities for generating test data for the gamification dashboard
 */

/**
 * Player Status Mock Data
 */
export interface MockPlayerStatus {
  _id: string;
  name: string;
  email: string;
  level: number;
  seasonLevel: number;
  metadata: {
    area: string;
    time: string;
    squad: string;
  };
  created: number;
  updated: number;
}

export function createMockPlayerStatus(overrides?: Partial<MockPlayerStatus>): MockPlayerStatus {
  return {
    _id: 'player-123',
    name: 'João Silva',
    email: 'joao.silva@example.com',
    level: 5,
    seasonLevel: 3,
    metadata: {
      area: 'Vendas',
      time: 'Time Alpha',
      squad: 'Squad 1'
    },
    created: Date.now() - 86400000,
    updated: Date.now(),
    ...overrides
  };
}

/**
 * Point Wallet Mock Data
 */
export interface MockPointWallet {
  bloqueados: number;
  desbloqueados: number;
  moedas: number;
}

export function createMockPointWallet(overrides?: Partial<MockPointWallet>): MockPointWallet {
  return {
    bloqueados: 1000,
    desbloqueados: 500,
    moedas: 250,
    ...overrides
  };
}

/**
 * Season Progress Mock Data
 */
export interface MockSeasonProgress {
  metas: { current: number; target: number };
  clientes: number;
  tarefasFinalizadas: number;
  seasonDates: {
    start: Date;
    end: Date;
  };
}

export function createMockSeasonProgress(overrides?: Partial<MockSeasonProgress>): MockSeasonProgress {
  return {
    metas: { current: 15, target: 50 },
    clientes: 8,
    tarefasFinalizadas: 42,
    seasonDates: {
      start: new Date('2023-04-01'),
      end: new Date('2023-09-30')
    },
    ...overrides
  };
}

/**
 * KPI Data Mock
 */
export interface MockKPIData {
  id: string;
  label: string;
  current: number;
  target: number;
  unit?: string;
}

export function createMockKPIData(overrides?: Partial<MockKPIData>): MockKPIData {
  return {
    id: 'kpi-1',
    label: 'KPI 1',
    current: 30,
    target: 50,
    unit: 'pontos',
    ...overrides
  };
}

/**
 * Company Mock Data
 */
export interface MockCompany {
  id: string;
  name: string;
  cnpj: string;
  healthScore: number;
  kpis: MockKPIData[]; // Dynamic array of KPIs
  kpi1: MockKPIData;
  kpi2: MockKPIData;
  kpi3: MockKPIData;
}

export function createMockCompany(overrides?: Partial<MockCompany>): MockCompany {
  const kpi1 = createMockKPIData({ id: 'kpi-1', label: 'KPI 1', current: 30, target: 50 });
  const kpi2 = createMockKPIData({ id: 'kpi-2', label: 'KPI 2', current: 40, target: 50 });
  const kpi3 = createMockKPIData({ id: 'kpi-3', label: 'KPI 3', current: 45, target: 50 });
  
  return {
    id: 'company-1',
    name: 'Empresa Exemplo LTDA',
    cnpj: '12.345.678/0001-90',
    healthScore: 85,
    kpis: [kpi1, kpi2, kpi3], // Array of KPIs
    kpi1,
    kpi2,
    kpi3,
    ...overrides
  };
}

/**
 * Task Mock Data
 */
export interface MockTask {
  id: string;
  name: string;
  responsible: string;
  status: 'pending' | 'in-progress' | 'completed';
  dueDate?: Date;
}

export function createMockTask(overrides?: Partial<MockTask>): MockTask {
  return {
    id: 'task-1',
    name: 'Tarefa Exemplo',
    responsible: 'Maria Santos',
    status: 'in-progress',
    dueDate: new Date(Date.now() + 86400000 * 7),
    ...overrides
  };
}

/**
 * Process Mock Data
 */
export interface MockProcess {
  id: string;
  name: string;
  status: 'pending' | 'in-progress' | 'completed' | 'blocked';
  tasks: MockTask[];
  expanded?: boolean;
}

export function createMockProcess(overrides?: Partial<MockProcess>): MockProcess {
  return {
    id: 'process-1',
    name: 'Processo Exemplo',
    status: 'in-progress',
    tasks: [
      createMockTask({ id: 'task-1', name: 'Tarefa 1' }),
      createMockTask({ id: 'task-2', name: 'Tarefa 2', status: 'completed' })
    ],
    expanded: false,
    ...overrides
  };
}

/**
 * Activity Metrics Mock Data
 */
export interface MockActivityMetrics {
  pendentes: number;
  emExecucao: number;
  finalizadas: number;
  pontos: number;
}

export function createMockActivityMetrics(overrides?: Partial<MockActivityMetrics>): MockActivityMetrics {
  return {
    pendentes: 5,
    emExecucao: 3,
    finalizadas: 42,
    pontos: 1250,
    ...overrides
  };
}

/**
 * Macro Metrics Mock Data
 */
export interface MockMacroMetrics {
  pendentes: number;
  incompletas: number;
  finalizadas: number;
}

export function createMockMacroMetrics(overrides?: Partial<MockMacroMetrics>): MockMacroMetrics {
  return {
    pendentes: 2,
    incompletas: 1,
    finalizadas: 8,
    ...overrides
  };
}

/**
 * Generate array of mock data
 */
export function generateMockArray<T>(
  generator: (index: number) => T,
  count: number
): T[] {
  return Array.from({ length: count }, (_, index) => generator(index));
}

/**
 * Generate random number within range
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate random date within range
 */
export function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

/**
 * Pick random item from array
 */
export function randomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Generate multiple companies
 */
export function createMockCompanies(count: number): MockCompany[] {
  return generateMockArray((index) => createMockCompany({
    id: `company-${index + 1}`,
    name: `Empresa ${index + 1} LTDA`,
    cnpj: `${10000000 + index}.000/0001-${String(index).padStart(2, '0')}`,
    healthScore: randomInt(50, 100)
  }), count);
}

/**
 * Alias functions for consistency with test imports
 */
export const generateCompany = createMockCompany;
export const generateProcess = createMockProcess;
export const generateTask = createMockTask;
export const generateKPIData = createMockKPIData;
export const generatePlayerStatus = createMockPlayerStatus;
export const generatePointWallet = createMockPointWallet;
export const generateSeasonProgress = createMockSeasonProgress;
export const generateMockCompanies = createMockCompanies;
export const generateMockPlayerStatus = createMockPlayerStatus;
