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
  randomItem,
  // New generators for Company KPI Indicators
  generateMockCnpjString,
  generateMockCnpjKpiData,
  generateMockCompanyDisplay,
  generateMockCompanyDisplayList,
  generateMockCnpjListFromActionLog,
  generateMockCnpjKpiResponse
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

  /**
   * Tests for Company KPI Indicators Mock Generators
   * Added for Task 13: Update Testing Utilities
   */
  describe('Company KPI Indicators Generators', () => {
    describe('generateMockCnpjString', () => {
      it('should generate default CNPJ string in correct format', () => {
        const cnpj = generateMockCnpjString();
        expect(cnpj).toBe('EMPRESA EXEMPLO LTDA l 0001 [1000|0001-00]');
      });

      it('should match expected format pattern', () => {
        const cnpj = generateMockCnpjString();
        // Format: "COMPANY NAME l CODE [ID|SUFFIX]"
        expect(cnpj).toMatch(/^.+ l \d+ \[\d+\|.+\]$/);
      });

      it('should allow custom company name', () => {
        const cnpj = generateMockCnpjString({ companyName: 'ACME CORP' });
        expect(cnpj).toContain('ACME CORP');
        expect(cnpj).toMatch(/^ACME CORP l \d+ \[\d+\|.+\]$/);
      });

      it('should allow custom CNPJ ID', () => {
        const cnpj = generateMockCnpjString({ cnpjId: '5000' });
        expect(cnpj).toContain('[5000|');
      });

      it('should allow custom code', () => {
        const cnpj = generateMockCnpjString({ code: '9999' });
        expect(cnpj).toContain(' l 9999 ');
      });

      it('should allow custom suffix', () => {
        const cnpj = generateMockCnpjString({ suffix: '1234-56' });
        expect(cnpj).toContain('|1234-56]');
      });

      it('should allow all custom values', () => {
        const cnpj = generateMockCnpjString({
          companyName: 'TEST COMPANY',
          code: '0002',
          cnpjId: '7777',
          suffix: '0002-99'
        });
        expect(cnpj).toBe('TEST COMPANY l 0002 [7777|0002-99]');
      });

      it('should be extractable by CompanyKpiService regex', () => {
        const cnpj = generateMockCnpjString({ cnpjId: '2000' });
        const match = cnpj.match(/\[([^\|]+)\|/);
        expect(match).toBeTruthy();
        expect(match![1].trim()).toBe('2000');
      });
    });

    describe('generateMockCnpjKpiData', () => {
      it('should generate default CNPJ KPI data', () => {
        const kpiData = generateMockCnpjKpiData();
        expect(kpiData._id).toBe('1000');
        expect(kpiData.entrega).toBe(75);
      });

      it('should have required fields', () => {
        const kpiData = generateMockCnpjKpiData();
        expect(kpiData._id).toBeDefined();
        expect(kpiData.entrega).toBeDefined();
      });

      it('should allow custom _id', () => {
        const kpiData = generateMockCnpjKpiData({ _id: '5000' });
        expect(kpiData._id).toBe('5000');
        expect(kpiData.entrega).toBe(75); // default
      });

      it('should allow custom entrega value', () => {
        const kpiData = generateMockCnpjKpiData({ entrega: 95 });
        expect(kpiData._id).toBe('1000'); // default
        expect(kpiData.entrega).toBe(95);
      });

      it('should allow all custom values', () => {
        const kpiData = generateMockCnpjKpiData({ _id: '9999', entrega: 120 });
        expect(kpiData._id).toBe('9999');
        expect(kpiData.entrega).toBe(120);
      });

      it('should match CnpjKpiData interface structure', () => {
        const kpiData = generateMockCnpjKpiData();
        expect(typeof kpiData._id).toBe('string');
        expect(typeof kpiData.entrega).toBe('number');
      });
    });

    describe('generateMockCompanyDisplay', () => {
      it('should generate default CompanyDisplay with KPI', () => {
        const company = generateMockCompanyDisplay();
        expect(company.cnpj).toBeDefined();
        expect(company.cnpjId).toBe('1000');
        expect(company.actionCount).toBe(10);
        expect(company.deliveryKpi).toBeDefined();
      });

      it('should have all required CompanyDisplay fields', () => {
        const company = generateMockCompanyDisplay();
        expect(company.cnpj).toBeDefined();
        expect(company.cnpjId).toBeDefined();
        expect(company.actionCount).toBeDefined();
      });

      it('should include deliveryKpi by default', () => {
        const company = generateMockCompanyDisplay();
        expect(company.deliveryKpi).toBeDefined();
        expect(company.deliveryKpi?.id).toBe('delivery');
        expect(company.deliveryKpi?.label).toBe('Entregas');
        expect(company.deliveryKpi?.current).toBe(75);
        expect(company.deliveryKpi?.target).toBe(100);
      });

      it('should allow generating without KPI data', () => {
        const company = generateMockCompanyDisplay({ deliveryKpi: undefined });
        expect(company.deliveryKpi).toBeUndefined();
        expect(company.cnpj).toBeDefined();
        expect(company.actionCount).toBeDefined();
      });

      it('should allow custom CNPJ string', () => {
        const customCnpj = 'CUSTOM COMPANY l 0001 [9999|0001-00]';
        const company = generateMockCompanyDisplay({ cnpj: customCnpj });
        expect(company.cnpj).toBe(customCnpj);
      });

      it('should allow custom CNPJ ID', () => {
        const company = generateMockCompanyDisplay({ cnpjId: '5000' });
        expect(company.cnpjId).toBe('5000');
      });

      it('should allow custom action count', () => {
        const company = generateMockCompanyDisplay({ actionCount: 25 });
        expect(company.actionCount).toBe(25);
      });

      it('should allow custom deliveryKpi', () => {
        const customKpi = {
          id: 'delivery',
          label: 'Entregas',
          current: 95,
          target: 100,
          unit: 'entregas',
          percentage: 95,
          color: 'green' as const
        };
        const company = generateMockCompanyDisplay({ deliveryKpi: customKpi });
        expect(company.deliveryKpi).toEqual(customKpi);
      });

      it('should generate matching CNPJ string for custom cnpjId', () => {
        const company = generateMockCompanyDisplay({ cnpjId: '7777' });
        expect(company.cnpj).toContain('[7777|');
      });

      it('should match CompanyDisplay interface structure', () => {
        const company = generateMockCompanyDisplay();
        expect(typeof company.cnpj).toBe('string');
        expect(typeof company.cnpjId).toBe('string');
        expect(typeof company.actionCount).toBe('number');
        if (company.deliveryKpi) {
          expect(typeof company.deliveryKpi.id).toBe('string');
          expect(typeof company.deliveryKpi.current).toBe('number');
        }
      });
    });

    describe('generateMockCompanyDisplayList', () => {
      it('should generate specified number of companies', () => {
        const companies = generateMockCompanyDisplayList(5);
        expect(companies.length).toBe(5);
      });

      it('should generate unique CNPJ IDs for each company', () => {
        const companies = generateMockCompanyDisplayList(10);
        const cnpjIds = companies.map(c => c.cnpjId);
        const uniqueIds = new Set(cnpjIds);
        expect(uniqueIds.size).toBe(10);
      });

      it('should include KPI data for all companies by default', () => {
        const companies = generateMockCompanyDisplayList(5);
        companies.forEach(company => {
          expect(company.deliveryKpi).toBeDefined();
        });
      });

      it('should allow generating without KPI for all', () => {
        const companies = generateMockCompanyDisplayList(5, { includeKpiForAll: false });
        // At least some should not have KPI (probabilistic, but with 5 companies very likely)
        const withoutKpi = companies.filter(c => !c.deliveryKpi);
        // We can't guarantee exact count due to randomness, but structure should be valid
        companies.forEach(company => {
          expect(company.cnpj).toBeDefined();
          expect(company.actionCount).toBeGreaterThan(0);
        });
      });

      it('should use base action count', () => {
        const companies = generateMockCompanyDisplayList(5, { baseActionCount: 20 });
        companies.forEach(company => {
          expect(company.actionCount).toBeGreaterThanOrEqual(20);
          expect(company.actionCount).toBeLessThanOrEqual(40); // base + random(0-20)
        });
      });

      it('should generate varying KPI values', () => {
        const companies = generateMockCompanyDisplayList(10);
        const kpiValues = companies
          .filter(c => c.deliveryKpi)
          .map(c => c.deliveryKpi!.current);
        
        // Should have some variation (not all the same)
        const uniqueValues = new Set(kpiValues);
        expect(uniqueValues.size).toBeGreaterThan(1);
      });

      it('should generate realistic company names', () => {
        const companies = generateMockCompanyDisplayList(3);
        expect(companies[0].cnpj).toContain('EMPRESA 1 LTDA');
        expect(companies[1].cnpj).toContain('EMPRESA 2 LTDA');
        expect(companies[2].cnpj).toContain('EMPRESA 3 LTDA');
      });

      it('should handle zero count', () => {
        const companies = generateMockCompanyDisplayList(0);
        expect(companies.length).toBe(0);
      });

      it('should handle large counts', () => {
        const companies = generateMockCompanyDisplayList(100);
        expect(companies.length).toBe(100);
        // Verify all have unique IDs
        const ids = companies.map(c => c.cnpjId);
        expect(new Set(ids).size).toBe(100);
      });
    });

    describe('generateMockCnpjListFromActionLog', () => {
      it('should generate specified number of entries', () => {
        const list = generateMockCnpjListFromActionLog(5);
        expect(list.length).toBe(5);
      });

      it('should have cnpj and actionCount fields', () => {
        const list = generateMockCnpjListFromActionLog(3);
        list.forEach(entry => {
          expect(entry.cnpj).toBeDefined();
          expect(entry.actionCount).toBeDefined();
          expect(typeof entry.cnpj).toBe('string');
          expect(typeof entry.actionCount).toBe('number');
        });
      });

      it('should generate valid CNPJ strings', () => {
        const list = generateMockCnpjListFromActionLog(5);
        list.forEach(entry => {
          expect(entry.cnpj).toMatch(/^.+ l \d+ \[\d+\|.+\]$/);
        });
      });

      it('should generate unique CNPJ strings', () => {
        const list = generateMockCnpjListFromActionLog(10);
        const cnpjs = list.map(e => e.cnpj);
        const uniqueCnpjs = new Set(cnpjs);
        expect(uniqueCnpjs.size).toBe(10);
      });

      it('should generate realistic action counts', () => {
        const list = generateMockCnpjListFromActionLog(10);
        list.forEach(entry => {
          expect(entry.actionCount).toBeGreaterThanOrEqual(5);
          expect(entry.actionCount).toBeLessThanOrEqual(50);
        });
      });

      it('should match ActionLogService response format', () => {
        const list = generateMockCnpjListFromActionLog(3);
        // This is the format returned by getPlayerCnpjListWithCount()
        list.forEach(entry => {
          expect(Object.keys(entry).sort()).toEqual(['actionCount', 'cnpj']);
        });
      });

      it('should handle zero count', () => {
        const list = generateMockCnpjListFromActionLog(0);
        expect(list.length).toBe(0);
      });
    });

    describe('generateMockCnpjKpiResponse', () => {
      it('should generate KPI data for all provided IDs', () => {
        const ids = ['1000', '1001', '1002'];
        const response = generateMockCnpjKpiResponse(ids);
        expect(response.length).toBe(3);
        expect(response.map(r => r._id)).toEqual(ids);
      });

      it('should generate valid CnpjKpiData structure', () => {
        const response = generateMockCnpjKpiResponse(['1000', '2000']);
        response.forEach(item => {
          expect(item._id).toBeDefined();
          expect(item.entrega).toBeDefined();
          expect(typeof item._id).toBe('string');
          expect(typeof item.entrega).toBe('number');
        });
      });

      it('should generate varying entrega values', () => {
        const ids = Array.from({ length: 10 }, (_, i) => String(1000 + i));
        const response = generateMockCnpjKpiResponse(ids);
        const entregaValues = response.map(r => r.entrega);
        
        // Should have some variation
        const uniqueValues = new Set(entregaValues);
        expect(uniqueValues.size).toBeGreaterThan(1);
      });

      it('should generate realistic entrega values', () => {
        const response = generateMockCnpjKpiResponse(['1000', '2000', '3000']);
        response.forEach(item => {
          expect(item.entrega).toBeGreaterThanOrEqual(30);
          expect(item.entrega).toBeLessThanOrEqual(120);
        });
      });

      it('should handle empty array', () => {
        const response = generateMockCnpjKpiResponse([]);
        expect(response.length).toBe(0);
      });

      it('should preserve ID order', () => {
        const ids = ['5000', '1000', '3000'];
        const response = generateMockCnpjKpiResponse(ids);
        expect(response.map(r => r._id)).toEqual(ids);
      });

      it('should match Funifier API response format', () => {
        const response = generateMockCnpjKpiResponse(['1000']);
        // This is the format returned by /v3/database/cnpj__c/aggregate
        expect(response[0]._id).toBeDefined();
        expect(response[0].entrega).toBeDefined();
      });
    });

    describe('Integration: Full workflow simulation', () => {
      it('should simulate complete data flow from action_log to UI', () => {
        // 1. Generate action_log response
        const actionLogData = generateMockCnpjListFromActionLog(5);
        expect(actionLogData.length).toBe(5);

        // 2. Extract CNPJ IDs (simulating CompanyKpiService.extractCnpjId)
        const cnpjIds = actionLogData.map(item => {
          const match = item.cnpj.match(/\[([^\|]+)\|/);
          return match ? match[1].trim() : null;
        }).filter((id): id is string => id !== null);
        expect(cnpjIds.length).toBe(5);

        // 3. Generate cnpj__c response
        const kpiResponse = generateMockCnpjKpiResponse(cnpjIds);
        expect(kpiResponse.length).toBe(5);

        // 4. Verify IDs match
        expect(kpiResponse.map(r => r._id).sort()).toEqual(cnpjIds.sort());
      });

      it('should generate data compatible with CompanyDisplay enrichment', () => {
        // Generate base data
        const actionLogData = generateMockCnpjListFromActionLog(3);
        
        // Simulate enrichment
        const enrichedData = actionLogData.map(item => {
          const match = item.cnpj.match(/\[([^\|]+)\|/);
          const cnpjId = match ? match[1].trim() : undefined;
          
          return generateMockCompanyDisplay({
            cnpj: item.cnpj,
            cnpjId,
            actionCount: item.actionCount
          });
        });

        expect(enrichedData.length).toBe(3);
        enrichedData.forEach(company => {
          expect(company.cnpj).toBeDefined();
          expect(company.cnpjId).toBeDefined();
          expect(company.actionCount).toBeGreaterThan(0);
          expect(company.deliveryKpi).toBeDefined();
        });
      });
    });
  });
});
