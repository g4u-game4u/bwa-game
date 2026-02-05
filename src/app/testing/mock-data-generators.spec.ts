/**
 * Test for mock data generators
 */

import {
  createMockPlayerStatus,
  createMockPointWallet,
  createMockSeasonProgress,
  createMockKPIData,
  createMockCompany,
  createMockTask,
  createMockProcess,
  createMockActivityMetrics,
  createMockProcessMetrics,
  generateMockArray,
  randomInt,
  randomItem
} from './mock-data-generators';

describe('Mock Data Generators', () => {
  describe('createMockPlayerStatus', () => {
    it('should create default player status', () => {
      const player = createMockPlayerStatus();
      expect(player._id).toBe('player-123');
      expect(player.name).toBe('João Silva');
      expect(player.seasonLevel).toBe(3);
    });

    it('should override default values', () => {
      const player = createMockPlayerStatus({ name: 'Maria Santos', seasonLevel: 5 });
      expect(player.name).toBe('Maria Santos');
      expect(player.seasonLevel).toBe(5);
    });
  });

  describe('createMockPointWallet', () => {
    it('should create default point wallet', () => {
      const wallet = createMockPointWallet();
      expect(wallet.bloqueados).toBe(1000);
      expect(wallet.desbloqueados).toBe(500);
      expect(wallet.moedas).toBe(250);
    });

    it('should override default values', () => {
      const wallet = createMockPointWallet({ bloqueados: 2000 });
      expect(wallet.bloqueados).toBe(2000);
    });
  });

  describe('createMockSeasonProgress', () => {
    it('should create default season progress', () => {
      const progress = createMockSeasonProgress();
      expect(progress.metas.current).toBe(15);
      expect(progress.metas.target).toBe(50);
      expect(progress.clientes).toBe(8);
    });
  });

  describe('createMockKPIData', () => {
    it('should create default KPI data', () => {
      const kpi = createMockKPIData();
      expect(kpi.id).toBe('kpi-1');
      expect(kpi.current).toBe(30);
      expect(kpi.target).toBe(50);
    });
  });

  describe('createMockCompany', () => {
    it('should create default company', () => {
      const company = createMockCompany();
      expect(company.id).toBe('company-1');
      expect(company.name).toBe('Empresa Exemplo LTDA');
      expect(company.kpi1).toBeDefined();
      expect(company.kpi2).toBeDefined();
      expect(company.kpi3).toBeDefined();
    });
  });

  describe('createMockTask', () => {
    it('should create default task', () => {
      const task = createMockTask();
      expect(task.id).toBe('task-1');
      expect(task.status).toBe('in-progress');
    });
  });

  describe('createMockProcess', () => {
    it('should create default process with tasks', () => {
      const process = createMockProcess();
      expect(process.id).toBe('process-1');
      expect(process.tasks.length).toBe(2);
    });
  });

  describe('createMockActivityMetrics', () => {
    it('should create default activity metrics', () => {
      const metrics = createMockActivityMetrics();
      expect(metrics.pendentes).toBe(5);
      expect(metrics.finalizadas).toBe(42);
    });
  });

  describe('createMockProcessMetrics', () => {
    it('should create default process metrics', () => {
      const metrics = createMockProcessMetrics();
      expect(metrics.pendentes).toBe(2);
      expect(metrics.finalizadas).toBe(8);
    });
  });

  describe('generateMockArray', () => {
    it('should generate array of mock data', () => {
      const array = generateMockArray((i) => ({ id: i, name: `Item ${i}` }), 5);
      expect(array.length).toBe(5);
      expect(array[0].id).toBe(0);
      expect(array[4].id).toBe(4);
    });
  });

  describe('randomInt', () => {
    it('should generate random integer within range', () => {
      const value = randomInt(1, 10);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(10);
    });
  });

  describe('randomItem', () => {
    it('should pick random item from array', () => {
      const array = ['a', 'b', 'c'];
      const item = randomItem(array);
      expect(array).toContain(item);
    });
  });
});
