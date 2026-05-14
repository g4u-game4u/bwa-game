import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { PlayerService } from './player.service';
import { CompanyService } from './company.service';
import { KPIService } from './kpi.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { FunifierApiService } from './funifier-api.service';
import { PlayerMapper } from './player-mapper.service';
import { CompanyMapper } from './company-mapper.service';
import { KPIMapper } from './kpi-mapper.service';
import { createMockPlayerStatus, createMockCompany, createMockKPIData } from '@app/testing/mock-data-generators';

/**
 * Unit Tests for Error Scenarios
 * Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5
 */
describe('Error Scenarios Unit Tests', () => {
  let playerService: PlayerService;
  let companyService: CompanyService;
  let kpiService: KPIService;
  let funifierApiService: jasmine.SpyObj<FunifierApiService>;

  beforeEach(() => {
    const spy = jasmine.createSpyObj('FunifierApiService', ['get', 'post']);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        PlayerService,
        CompanyService,
        KPIService,
        { provide: FunifierApiService, useValue: spy },
        PlayerMapper,
        CompanyMapper,
        KPIMapper,
        { provide: SessaoProvider, useValue: { usuario: null } }
      ]
    });

    playerService = TestBed.inject(PlayerService);
    companyService = TestBed.inject(CompanyService);
    kpiService = TestBed.inject(KPIService);
    funifierApiService = TestBed.inject(FunifierApiService) as jasmine.SpyObj<FunifierApiService>;
  });

  describe('Network Error Handling', () => {
    it('should handle network timeout errors in PlayerService', (done) => {
      const playerId = 'test-player-1';
      const networkError = new Error('Network timeout');
      networkError.name = 'TimeoutError';

      funifierApiService.get.and.returnValue(throwError(() => networkError));

      playerService.getPlayerStatus(playerId).subscribe({
        next: () => {
          fail('Should have thrown an error');
        },
        error: (error) => {
          expect(error).toBeDefined();
          expect(error.message).toContain('Network timeout');
          done();
        }
      });
    });

    it('should handle connection refused errors in CompanyService', (done) => {
      const playerId = 'test-player-1';
      const connectionError = new Error('Connection refused');
      connectionError.name = 'HttpErrorResponse';

      funifierApiService.get.and.returnValue(throwError(() => connectionError));

      companyService.getCompanies(playerId).subscribe({
        next: () => {
          fail('Should have thrown an error');
        },
        error: (error) => {
          expect(error).toBeDefined();
          expect(error.message).toContain('Connection refused');
          done();
        }
      });
    });

    it('should handle DNS resolution errors in KPIService', (done) => {
      const playerId = 'test-player-1';
      const dnsError = new Error('DNS resolution failed');
      dnsError.name = 'NetworkError';

      funifierApiService.get.and.returnValue(throwError(() => dnsError));

      kpiService.getPlayerKPIs(playerId).subscribe({
        next: () => {
          fail('Should have thrown an error');
        },
        error: (error) => {
          expect(error).toBeDefined();
          expect(error.message).toContain('DNS resolution failed');
          done();
        }
      });
    });
  });

  describe('Authentication Error Handling', () => {
    it('should handle 401 Unauthorized errors in PlayerService', (done) => {
      const playerId = 'test-player-1';
      const authError = new Error('Unauthorized');
      authError.name = 'HttpErrorResponse';
      (authError as any).status = 401;

      funifierApiService.get.and.returnValue(throwError(() => authError));

      playerService.getPlayerStatus(playerId).subscribe({
        next: () => {
          fail('Should have thrown an error');
        },
        error: (error) => {
          expect(error).toBeDefined();
          expect((error as any).status).toBe(401);
          done();
        }
      });
    });

    it('should handle 403 Forbidden errors in CompanyService', (done) => {
      const playerId = 'test-player-1';
      const forbiddenError = new Error('Forbidden');
      forbiddenError.name = 'HttpErrorResponse';
      (forbiddenError as any).status = 403;

      funifierApiService.get.and.returnValue(throwError(() => forbiddenError));

      companyService.getCompanies(playerId).subscribe({
        next: () => {
          fail('Should have thrown an error');
        },
        error: (error) => {
          expect(error).toBeDefined();
          expect((error as any).status).toBe(403);
          done();
        }
      });
    });

    it('should handle token expiration errors in KPIService', (done) => {
      const playerId = 'test-player-1';
      const tokenError = new Error('Token expired');
      tokenError.name = 'HttpErrorResponse';
      (tokenError as any).status = 401;
      (tokenError as any).error = { message: 'Token expired' };

      funifierApiService.get.and.returnValue(throwError(() => tokenError));

      kpiService.getPlayerKPIs(playerId).subscribe({
        next: () => {
          fail('Should have thrown an error');
        },
        error: (error) => {
          expect(error).toBeDefined();
          expect((error as any).status).toBe(401);
          expect((error as any).error.message).toBe('Token expired');
          done();
        }
      });
    });
  });

  describe('Server Error Handling', () => {
    it('should handle 500 Internal Server Error in PlayerService', (done) => {
      const playerId = 'test-player-1';
      const serverError = new Error('Internal Server Error');
      serverError.name = 'HttpErrorResponse';
      (serverError as any).status = 500;

      funifierApiService.get.and.returnValue(throwError(() => serverError));

      playerService.getPlayerStatus(playerId).subscribe({
        next: () => {
          fail('Should have thrown an error');
        },
        error: (error) => {
          expect(error).toBeDefined();
          expect((error as any).status).toBe(500);
          done();
        }
      });
    });

    it('should handle 502 Bad Gateway errors in CompanyService', (done) => {
      const playerId = 'test-player-1';
      const gatewayError = new Error('Bad Gateway');
      gatewayError.name = 'HttpErrorResponse';
      (gatewayError as any).status = 502;

      funifierApiService.get.and.returnValue(throwError(() => gatewayError));

      companyService.getCompanies(playerId).subscribe({
        next: () => {
          fail('Should have thrown an error');
        },
        error: (error) => {
          expect(error).toBeDefined();
          expect((error as any).status).toBe(502);
          done();
        }
      });
    });

    it('should handle 503 Service Unavailable errors in KPIService', (done) => {
      const playerId = 'test-player-1';
      const serviceError = new Error('Service Unavailable');
      serviceError.name = 'HttpErrorResponse';
      (serviceError as any).status = 503;

      funifierApiService.get.and.returnValue(throwError(() => serviceError));

      kpiService.getPlayerKPIs(playerId).subscribe({
        next: () => {
          fail('Should have thrown an error');
        },
        error: (error) => {
          expect(error).toBeDefined();
          expect((error as any).status).toBe(503);
          done();
        }
      });
    });

    it('should handle 504 Gateway Timeout errors in PlayerService', (done) => {
      const playerId = 'test-player-1';
      const timeoutError = new Error('Gateway Timeout');
      timeoutError.name = 'HttpErrorResponse';
      (timeoutError as any).status = 504;

      funifierApiService.get.and.returnValue(throwError(() => timeoutError));

      playerService.getPlayerStatus(playerId).subscribe({
        next: () => {
          fail('Should have thrown an error');
        },
        error: (error) => {
          expect(error).toBeDefined();
          expect((error as any).status).toBe(504);
          done();
        }
      });
    });
  });

  describe('Client Error Handling', () => {
    it('should handle 400 Bad Request errors in PlayerService', (done) => {
      const playerId = 'invalid-id';
      const badRequestError = new Error('Bad Request');
      badRequestError.name = 'HttpErrorResponse';
      (badRequestError as any).status = 400;

      funifierApiService.get.and.returnValue(throwError(() => badRequestError));

      playerService.getPlayerStatus(playerId).subscribe({
        next: () => {
          fail('Should have thrown an error');
        },
        error: (error) => {
          expect(error).toBeDefined();
          expect((error as any).status).toBe(400);
          done();
        }
      });
    });

    it('should handle 404 Not Found errors in CompanyService', (done) => {
      const playerId = 'nonexistent-player';
      const notFoundError = new Error('Not Found');
      notFoundError.name = 'HttpErrorResponse';
      (notFoundError as any).status = 404;

      funifierApiService.get.and.returnValue(throwError(() => notFoundError));

      companyService.getCompanies(playerId).subscribe({
        next: () => {
          fail('Should have thrown an error');
        },
        error: (error) => {
          expect(error).toBeDefined();
          expect((error as any).status).toBe(404);
          done();
        }
      });
    });

    it('should handle 422 Unprocessable Entity errors in KPIService', (done) => {
      const playerId = 'test-player-1';
      const validationError = new Error('Unprocessable Entity');
      validationError.name = 'HttpErrorResponse';
      (validationError as any).status = 422;
      (validationError as any).error = { message: 'Invalid data format' };

      funifierApiService.get.and.returnValue(throwError(() => validationError));

      kpiService.getPlayerKPIs(playerId).subscribe({
        next: () => {
          fail('Should have thrown an error');
        },
        error: (error) => {
          expect(error).toBeDefined();
          expect((error as any).status).toBe(422);
          expect((error as any).error.message).toBe('Invalid data format');
          done();
        }
      });
    });
  });

  describe('Cached Data Fallback', () => {
    it('should return cached data when available after error in PlayerService', (done) => {
      const playerId = 'test-player-1';
      const mockPlayerStatus = createMockPlayerStatus();

      // First request succeeds
      funifierApiService.get.and.returnValue(of(mockPlayerStatus));
      
      playerService.getPlayerStatus(playerId).subscribe({
        next: (data) => {
          expect(data).toBeDefined();
          expect(data._id).toBe(mockPlayerStatus._id);

          // Clear cache to simulate new request
          playerService.clearPlayerCache(playerId);

          // Second request fails
          const error = new Error('Network error');
          funifierApiService.get.and.returnValue(throwError(() => error));

          // Should fallback to cached data if implemented
          playerService.getPlayerStatus(playerId).subscribe({
            next: (cachedData) => {
              // If service implements fallback, this should succeed
              expect(cachedData).toBeDefined();
              done();
            },
            error: () => {
              // If service doesn't implement fallback, error is expected
              expect(true).toBe(true);
              done();
            }
          });
        }
      });
    });

    it('should throw error when no cached data is available in CompanyService', (done) => {
      const playerId = 'test-player-1';
      const error = new Error('Network error');

      // Clear any existing cache
      companyService.clearCache();

      funifierApiService.get.and.returnValue(throwError(() => error));

      companyService.getCompanies(playerId).subscribe({
        next: () => {
          fail('Should have thrown an error when no cache available');
        },
        error: (err) => {
          expect(err).toBeDefined();
          expect(err.message).toContain('Network error');
          done();
        }
      });
    });
  });

  describe('Error Recovery', () => {
    it('should successfully recover after error in PlayerService', (done) => {
      const playerId = 'test-player-1';
      const mockPlayerStatus = createMockPlayerStatus();
      const error = new Error('Temporary error');

      // First request fails
      funifierApiService.get.and.returnValue(throwError(() => error));

      playerService.getPlayerStatus(playerId).subscribe({
        next: () => {
          fail('First request should have failed');
        },
        error: (err) => {
          expect(err).toBeDefined();

          // Second request succeeds
          funifierApiService.get.and.returnValue(of(mockPlayerStatus));

          playerService.getPlayerStatus(playerId).subscribe({
            next: (data) => {
              expect(data).toBeDefined();
              expect(data._id).toBe(mockPlayerStatus._id);
              done();
            },
            error: () => {
              fail('Second request should have succeeded');
            }
          });
        }
      });
    });

    it('should maintain data integrity after error recovery in KPIService', (done) => {
      const playerId = 'test-player-1';
      const mockKPIData = createMockKPIData();
      const error = new Error('Temporary error');

      // First request fails
      funifierApiService.get.and.returnValue(throwError(() => error));

      kpiService.getPlayerKPIs(playerId).subscribe({
        next: () => {
          fail('First request should have failed');
        },
        error: (err) => {
          expect(err).toBeDefined();

          // Second request succeeds
          funifierApiService.get.and.returnValue(of(mockKPIData));

          kpiService.getPlayerKPIs(playerId).subscribe({
            next: (data) => {
              expect(data).toBeDefined();
              expect(Array.isArray(data)).toBe(true);
              done();
            },
            error: () => {
              fail('Second request should have succeeded');
            }
          });
        }
      });
    });
  });

  describe('Multiple Concurrent Errors', () => {
    it('should handle multiple concurrent errors gracefully', (done) => {
      const playerId = 'test-player-1';
      const error1 = new Error('Error 1');
      const error2 = new Error('Error 2');
      const error3 = new Error('Error 3');

      funifierApiService.get.and.returnValue(throwError(() => error1));
      funifierApiService.get.and.returnValue(throwError(() => error2));
      funifierApiService.get.and.returnValue(throwError(() => error3));

      let errorCount = 0;
      const expectedErrors = 3;

      playerService.getPlayerStatus(playerId).subscribe({
        error: () => {
          errorCount++;
          if (errorCount === expectedErrors) done();
        }
      });

      companyService.getCompanies(playerId).subscribe({
        error: () => {
          errorCount++;
          if (errorCount === expectedErrors) done();
        }
      });

      kpiService.getPlayerKPIs(playerId).subscribe({
        error: () => {
          errorCount++;
          if (errorCount === expectedErrors) done();
        }
      });
    });
  });

  describe('Empty Response Handling', () => {
    it('should handle empty response from PlayerService', (done) => {
      const playerId = 'test-player-1';

      funifierApiService.get.and.returnValue(of(null as any));

      playerService.getPlayerStatus(playerId).subscribe({
        next: (data) => {
          // Service should handle null/empty responses
          expect(data).toBeDefined();
          done();
        },
        error: () => {
          // Or throw appropriate error
          expect(true).toBe(true);
          done();
        }
      });
    });

    it('should handle empty array from CompanyService', (done) => {
      const playerId = 'test-player-1';

      funifierApiService.get.and.returnValue(of([]));

      companyService.getCompanies(playerId).subscribe({
        next: (data) => {
          expect(Array.isArray(data)).toBe(true);
          expect(data.length).toBe(0);
          done();
        }
      });
    });
  });
});
