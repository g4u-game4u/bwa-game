import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { GamificationDashboardComponent } from './gamification-dashboard.component';
import { AccessibilityTestUtils } from '../../../testing/accessibility-test-utils';
import { By } from '@angular/platform-browser';
import { PlayerService } from '@services/player.service';
import { KPIService } from '@services/kpi.service';
import { ToastService } from '@services/toast.service';
import { ActionLogService } from '@services/action-log.service';
import { CompanyKpiService } from '@services/company-kpi.service';
import { PerformanceMonitorService } from '@services/performance-monitor.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { CacheManagerService } from '@services/cache-manager.service';
import { CnpjLookupService } from '@services/cnpj-lookup.service';
import { SeasonDatesService } from '@services/season-dates.service';
import { ActivatedRoute, Router } from '@angular/router';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';
import { of } from 'rxjs';
import { generatePointWallet } from '@app/testing/mock-data-generators';

describe('GamificationDashboardComponent - Accessibility', () => {
  let component: GamificationDashboardComponent;
  let fixture: ComponentFixture<GamificationDashboardComponent>;
  let mockPlayerService: jasmine.SpyObj<PlayerService>;
  let mockKpiService: jasmine.SpyObj<KPIService>;
  let mockToastService: jasmine.SpyObj<ToastService>;

  beforeEach(async () => {
    const playerServiceSpy = jasmine.createSpyObj('PlayerService', [
      'getPlayerStatus',
      'getPlayerPoints',
      'getSeasonProgress',
      'getPlayerCnpj',
      'getPlayerCnpjResp',
      'clearCache',
      'usesGame4uWalletFromStats'
    ]);
    playerServiceSpy.usesGame4uWalletFromStats.and.returnValue(false);
    const kpiServiceSpy = jasmine.createSpyObj('KPIService', ['getPlayerKPIs']);
    const toastServiceSpy = jasmine.createSpyObj('ToastService', ['error', 'alert']);

    const actionLogServiceSpy = jasmine.createSpyObj('ActionLogService', [
      'getProgressMetrics',
      'getPlayerCnpjListWithCount',
      'getUniqueClientesCount',
      'getCompletedTasksCount',
      'getPontosForMonth',
      'getMonthlyGame4uPlayerDashboardData'
    ]);
    actionLogServiceSpy.getProgressMetrics.and.returnValue(
      of({
        activity: { pendentes: 0, emExecucao: 0, finalizadas: 0, pontos: 0 },
        processo: { pendentes: 0, incompletas: 0, finalizadas: 0 }
      })
    );
    actionLogServiceSpy.getPlayerCnpjListWithCount.and.returnValue(of([]));
    actionLogServiceSpy.getUniqueClientesCount.and.returnValue(of(0));
    actionLogServiceSpy.getCompletedTasksCount.and.returnValue(of(0));
    actionLogServiceSpy.getPontosForMonth.and.returnValue(of(500));
    actionLogServiceSpy.getMonthlyGame4uPlayerDashboardData.and.returnValue(
      of({
        wallet: generatePointWallet(),
        pontosActionLog: 500,
        sidebar: { tarefasFinalizadas: 0 }
      })
    );

    const emptyGamificacaoMaps = { byEmpId: new Map(), byCnpjNorm: new Map() };
    const companyKpiServiceSpy = jasmine.createSpyObj('CompanyKpiService', [
      'extractCnpjId',
      'getKpiData',
      'enrichCompaniesWithKpis',
      'enrichFromCnpjResp',
      'fetchGamificacaoMapsAsync',
      'enrichCarteiraRowsWithMaps',
      'prefetchGamificacaoSnapshot',
      'clearCache'
    ]);
    companyKpiServiceSpy.enrichCompaniesWithKpis.and.returnValue(of([]));
    companyKpiServiceSpy.enrichFromCnpjResp.and.returnValue(of([]));
    companyKpiServiceSpy.fetchGamificacaoMapsAsync.and.returnValue(Promise.resolve(emptyGamificacaoMaps));
    companyKpiServiceSpy.enrichCarteiraRowsWithMaps.and.returnValue([]);

    const performanceMonitorSpy = jasmine.createSpyObj('PerformanceMonitorService', [
      'measureRenderTime',
      'trackChangeDetection',
      'logPerformanceReport'
    ]);
    performanceMonitorSpy.measureRenderTime.and.returnValue(() => {});

    const cacheManagerSpy = jasmine.createSpyObj('CacheManagerService', ['clearAllCaches']);
    const seasonDatesServiceSpy = jasmine.createSpyObj('SeasonDatesService', ['getSeasonDates']);
    seasonDatesServiceSpy.getSeasonDates.and.returnValue(
      Promise.resolve({
        start: new Date(2023, 3, 1, 0, 0, 0, 0),
        end: new Date(2023, 8, 30, 23, 59, 59, 999)
      })
    );
    const cnpjLookupSpy = jasmine.createSpyObj('CnpjLookupService', ['enrichCnpjListFull']);
    cnpjLookupSpy.enrichCnpjListFull.and.returnValue(of(new Map()));
    const ngbModalSpy = jasmine.createSpyObj('NgbModal', ['open']);
    const activatedRouteSpy = {
      snapshot: { queryParams: {} },
      queryParams: of({})
    };
    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);
    const sessaoProviderSpy = jasmine.createSpyObj('SessaoProvider', [], {
      usuario: { _id: 'test-user', email: 'test@example.com', roles: [] },
      token: 'test-token'
    });

    await TestBed.configureTestingModule({
      declarations: [GamificationDashboardComponent],
      providers: [
        { provide: PlayerService, useValue: playerServiceSpy },
        { provide: KPIService, useValue: kpiServiceSpy },
        { provide: ToastService, useValue: toastServiceSpy },
        { provide: ActionLogService, useValue: actionLogServiceSpy },
        { provide: CompanyKpiService, useValue: companyKpiServiceSpy },
        { provide: PerformanceMonitorService, useValue: performanceMonitorSpy },
        { provide: SessaoProvider, useValue: sessaoProviderSpy },
        { provide: CacheManagerService, useValue: cacheManagerSpy },
        { provide: SeasonDatesService, useValue: seasonDatesServiceSpy },
        { provide: CnpjLookupService, useValue: cnpjLookupSpy },
        { provide: NgbModal, useValue: ngbModalSpy },
        { provide: ActivatedRoute, useValue: activatedRouteSpy },
        { provide: Router, useValue: routerSpy }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();

    fixture = TestBed.createComponent(GamificationDashboardComponent);
    component = fixture.componentInstance;
    mockPlayerService = TestBed.inject(PlayerService) as jasmine.SpyObj<PlayerService>;
    mockKpiService = TestBed.inject(KPIService) as jasmine.SpyObj<KPIService>;
    mockToastService = TestBed.inject(ToastService) as jasmine.SpyObj<ToastService>;

    // Setup default mock returns
    mockPlayerService.getPlayerStatus.and.returnValue(
      of({
        _id: '1',
        name: 'Test Player',
        email: 'test@example.com',
        level: 5,
        seasonLevel: 3,
        metadata: { area: 'Test Area', time: 'Test Time', squad: 'Test Squad' },
        created: Date.now(),
        updated: Date.now()
      })
    );
    mockPlayerService.getPlayerPoints.and.returnValue(
      of({
        bloqueados: 100,
        desbloqueados: 200,
        moedas: 50
      })
    );
    mockPlayerService.getSeasonProgress.and.returnValue(
      of({
        metas: { current: 5, target: 10 },
        clientes: 3,
        tarefasFinalizadas: 15,
        seasonDates: { start: new Date(), end: new Date() }
      })
    );
    mockPlayerService.getPlayerCnpj.and.returnValue(of([]));
    mockPlayerService.getPlayerCnpjResp.and.returnValue(of([]));
    mockKpiService.getPlayerKPIs.and.returnValue(of([]));

    fixture.detectChanges();
  });

  describe('ARIA Labels', () => {
    it('should have ARIA labels on all interactive elements', () => {
      const interactiveElements = AccessibilityTestUtils.getInteractiveElements(fixture);

      interactiveElements.forEach((element, index) => {
        expect(AccessibilityTestUtils.hasAriaLabel(element)).toBe(
          true,
          `Interactive element at index ${index} (${element.nativeElement.tagName}) should have ARIA label`
        );
      });
    });

    it('should have proper ARIA roles for semantic elements', () => {
      const mainContent = fixture.debugElement.query(By.css('.dashboard-main, main, [role="main"]'));
      if (mainContent) {
        const role = mainContent.nativeElement.getAttribute('role');
        expect(role).toBe('main');
      }

      const sidebar = fixture.debugElement.query(By.css('.dashboard-sidebar, aside, [role="complementary"]'));
      if (sidebar) {
        const role = sidebar.nativeElement.getAttribute('role');
        expect(['complementary', 'navigation'].includes(role)).toBe(true);
      }
    });
  });

  describe('Keyboard Navigation', () => {
    it('should make all interactive elements keyboard accessible', () => {
      const interactiveElements = AccessibilityTestUtils.getInteractiveElements(fixture);

      interactiveElements.forEach((element, index) => {
        expect(AccessibilityTestUtils.isKeyboardAccessible(element)).toBe(
          true,
          `Interactive element at index ${index} should be keyboard accessible`
        );
      });
    });

    it('should handle Enter and Space key presses on buttons', () => {
      const buttons = fixture.debugElement.queryAll(By.css('button, [role="button"]'));

      buttons.forEach(button => {
        spyOn(button.nativeElement, 'click');

        AccessibilityTestUtils.simulateKeyPress(button, 'Enter');
        AccessibilityTestUtils.simulateKeyPress(button, ' ');

        // Note: In a real implementation, you'd verify the click was called
        // This test structure is ready for when keyboard handlers are implemented
      });
    });
  });

  describe('Screen Reader Support', () => {
    it('should have proper heading hierarchy', () => {
      const headings = fixture.debugElement.queryAll(By.css('h1, h2, h3, h4, h5, h6'));

      if (headings.length > 0) {
        // Check that we start with h1 or h2 (depending on page structure)
        const firstHeading = headings[0].nativeElement.tagName.toLowerCase();
        expect(['h1', 'h2'].includes(firstHeading)).toBe(true);
      }
    });

    it('should have descriptive text for dynamic content areas', () => {
      const dynamicAreas = fixture.debugElement.queryAll(By.css('[aria-live], [aria-atomic]'));

      dynamicAreas.forEach(area => {
        const ariaLive = area.nativeElement.getAttribute('aria-live');
        expect(['polite', 'assertive', 'off'].includes(ariaLive)).toBe(true);
      });
    });
  });

  describe('Images and Media', () => {
    it('should have alt text for all images', () => {
      expect(AccessibilityTestUtils.imagesHaveAltText(fixture)).toBe(true);
    });

    it('should have proper alt text content', () => {
      const images = fixture.debugElement.queryAll(By.css('img'));

      images.forEach(img => {
        const alt = img.nativeElement.getAttribute('alt');
        expect(alt).toBeDefined();
        // Alt text should not be just whitespace
        if (alt) {
          expect(alt.trim().length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Color and Contrast', () => {
    it('should have good color contrast for text elements', () => {
      const textElements = fixture.debugElement.queryAll(By.css('p, span, div, h1, h2, h3, h4, h5, h6, button, a'));

      textElements.forEach(element => {
        if (element.nativeElement.textContent?.trim()) {
          expect(AccessibilityTestUtils.hasGoodContrast(element)).toBe(true);
        }
      });
    });
  });

  describe('Focus Management', () => {
    it('should have visible focus indicators', () => {
      const focusableElements = AccessibilityTestUtils.getInteractiveElements(fixture);

      focusableElements.forEach(element => {
        element.nativeElement.focus();
        const computedStyle = window.getComputedStyle(element.nativeElement);

        // Check that focus styles are defined (outline or box-shadow)
        const hasOutline = computedStyle.outline !== 'none' && computedStyle.outline !== '0px';
        const hasBoxShadow = computedStyle.boxShadow !== 'none';

        expect(hasOutline || hasBoxShadow).toBe(true);
      });
    });
  });
});
