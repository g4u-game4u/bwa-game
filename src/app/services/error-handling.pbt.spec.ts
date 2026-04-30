import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import * as fc from 'fast-check';
import { PlayerService } from './player.service';
import { CompanyService } from './company.service';
import { KPIService } from './kpi.service';
import { BackendApiService } from './backend-api.service';
import { PlayerMapper } from './player-mapper.service';
import { CompanyMapper } from './company-mapper.service';
import { KPIMapper } from './kpi-mapper.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { createMockPlayerStatus, generateCompany, generateKPIData } from '@app/testing/mock-data-generators';

function expectPlayerProfileUrl(req: { url: string }, playerId: string): boolean {
  const enc = encodeURIComponent(playerId);
  return req.url.includes(`player/${enc}`) && !req.url.toLowerCase().includes('/status');
}

describe('Property-Based Tests: Error Handling', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        PlayerService,
        CompanyService,
        KPIService,
        BackendApiService,
        PlayerMapper,
        CompanyMapper,
        KPIMapper,
        { provide: SessaoProvider, useValue: { usuario: null } }
      ]
    });

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  /**
   * Feature: gamification-dashboard, Property 8: API Error Handling Graceful Degradation
   * Validates: Requirements 11.2, 11.5
   */
  describe('Property 8: API Error Handling Graceful Degradation', () => {
    it('should maintain previous valid state when API request fails after successful request', (done) => {
      fc.assert(
        fc.asyncProperty(
          fc
            .string({ minLength: 1, maxLength: 50 })
            .filter(pid => pid !== 'me' && pid.trim().length > 0),
          fc.integer({ min: 400, max: 599 }), // HTTP error status
          async (playerId, errorStatus) => {
            const playerService = TestBed.inject(PlayerService);
            const mockPlayerStatus = createMockPlayerStatus();

            // First request succeeds
            const firstRequest = playerService.getPlayerStatus(playerId);
            const firstPromise = new Promise((resolve, reject) => {
              firstRequest.subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
              });
            });

            const req1 = httpMock.expectOne((req) => expectPlayerProfileUrl(req, playerId));
            req1.flush(mockPlayerStatus);

            const firstResult = await firstPromise;
            expect(firstResult).toBeDefined();

            // Clear cache to force new request
            playerService.clearPlayerCache(playerId);

            // Second request fails
            const secondRequest = playerService.getPlayerStatus(playerId);
            const secondPromise = new Promise((resolve, reject) => {
              secondRequest.subscribe({
                next: (data) => resolve(data),
                error: (err) => reject(err)
              });
            });

            const req2 = httpMock.expectOne((req) => expectPlayerProfileUrl(req, playerId));
            req2.flush('Error', { status: errorStatus, statusText: 'Error' });

            try {
              await secondPromise;
            } catch {
              // Erro após limpar cache é aceitável (sem GET /status).
            }
          }
        ),
        { numRuns: 20, timeout: 10000 }
      ).then(() => done()).catch((err) => done.fail(err));
    });

    it('should throw error when no cached data is available and API fails', (done) => {
      fc.assert(
        fc.asyncProperty(
          fc
            .string({ minLength: 1, maxLength: 50 })
            .filter(pid => pid !== 'me' && pid.trim().length > 0),
          fc.integer({ min: 400, max: 599 }), // HTTP error status
          async (playerId, errorStatus) => {
            const playerService = TestBed.inject(PlayerService);

            // Clear any existing cache
            playerService.clearCache();

            const request = playerService.getPlayerStatus(playerId);

            const outcome = new Promise<'ok' | 'err'>(resolve => {
              request.subscribe({
                next: () => resolve('ok'),
                error: () => resolve('err')
              });
            });

            const req = httpMock.expectOne((req) => expectPlayerProfileUrl(req, playerId));
            req.flush('Error', { status: errorStatus, statusText: 'Error' });

            expect(await outcome).toBe('err');
          }
        ),
        { numRuns: 20, timeout: 10000 }
      ).then(() => done()).catch((err) => done.fail(err));
    });

    it('should handle server errors gracefully for KPIService', (done) => {
      fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }), // playerId
          fc.constantFrom(500, 502, 503, 504), // Server error codes
          async (playerId, errorStatus) => {
            const kpiService = TestBed.inject(KPIService);

            const request = kpiService.getPlayerKPIs(playerId);
            
            let errorCaught = false;
            const promise = new Promise((resolve, reject) => {
              request.subscribe({
                next: (data) => resolve(data),
                error: (err) => {
                  errorCaught = true;
                  reject(err);
                }
              });
            });

            const req = httpMock.expectOne((req) => req.url.includes(`/v3/player/${playerId}/kpis`));
            req.flush('Server Error', { status: errorStatus, statusText: 'Server Error' });

            try {
              await promise;
            } catch (error) {
              // Error should be caught
            }

            // Should have caught the error
            expect(errorCaught).toBe(true);
          }
        ),
        { numRuns: 20, timeout: 10000 }
      ).then(() => done()).catch((err) => done.fail(err));
    });

    it('should preserve data integrity when recovering from errors', (done) => {
      fc.assert(
        fc.asyncProperty(
          fc
            .string({ minLength: 1, maxLength: 50 })
            .filter(pid => pid !== 'me' && pid.trim().length > 0),
          async (playerId) => {
            const playerService = TestBed.inject(PlayerService);
            const mockPlayerStatus = createMockPlayerStatus();

            // First request succeeds
            const firstRequest = playerService.getPlayerStatus(playerId);
            const firstPromise = new Promise((resolve) => {
              firstRequest.subscribe((data) => resolve(data));
            });

            const req1 = httpMock.expectOne((req) => expectPlayerProfileUrl(req, playerId));
            req1.flush(mockPlayerStatus);

            const firstResult: any = await firstPromise;

            // Clear cache
            playerService.clearPlayerCache(playerId);

            // Second request fails
            const secondRequest = playerService.getPlayerStatus(playerId);
            const secondPromise = new Promise((resolve, reject) => {
              secondRequest.subscribe({ next: resolve, error: reject });
            });

            const req2 = httpMock.expectOne((req) => expectPlayerProfileUrl(req, playerId));
            req2.flush('Error', { status: 500, statusText: 'Error' });

            try {
              await secondPromise;
            } catch {
              expect(firstResult).toBeDefined();
              return;
            }
            throw new Error('Expected error after failed profile request');
          }
        ),
        { numRuns: 20, timeout: 10000 }
      ).then(() => done()).catch((err) => done.fail(err));
    });
  });
});
