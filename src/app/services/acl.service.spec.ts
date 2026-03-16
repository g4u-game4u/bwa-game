import { TestBed } from '@angular/core/testing';
import { ACLService, CatalogItems, AclMetadata } from './acl.service';
import { FunifierApiService } from './funifier-api.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { ToastService } from './toast.service';
import { of, throwError } from 'rxjs';

describe('ACLService', () => {
  let service: ACLService;
  let funifierApiSpy: jasmine.SpyObj<FunifierApiService>;
  let sessaoSpy: jasmine.SpyObj<SessaoProvider>;
  let toastSpy: jasmine.SpyObj<ToastService>;

  beforeEach(() => {
    const apiSpy = jasmine.createSpyObj('FunifierApiService', ['get', 'post']);
    const sessSpy = jasmine.createSpyObj('SessaoProvider', [], { usuario: { _id: 'player1' } });
    const tSpy = jasmine.createSpyObj('ToastService', ['error', 'success', 'alert']);

    TestBed.configureTestingModule({
      providers: [
        ACLService,
        { provide: FunifierApiService, useValue: apiSpy },
        { provide: SessaoProvider, useValue: sessSpy },
        { provide: ToastService, useValue: tSpy }
      ]
    });

    service = TestBed.inject(ACLService);
    funifierApiSpy = TestBed.inject(FunifierApiService) as jasmine.SpyObj<FunifierApiService>;
    sessaoSpy = TestBed.inject(SessaoProvider) as jasmine.SpyObj<SessaoProvider>;
    toastSpy = TestBed.inject(ToastService) as jasmine.SpyObj<ToastService>;
  });

  afterEach(() => {
    service.clearCache();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── getPlayerCatalogItems ─────────────────────────────────────

  describe('getPlayerCatalogItems', () => {
    it('should extract catalog_items from player status response', (done) => {
      const mockResponse = {
        _id: 'player1',
        catalog_items: {
          'TEAM_A': { quantity: 1, item: 'TEAM_A' },
          'TEAM_B': { quantity: 0, item: 'TEAM_B' }
        }
      };
      funifierApiSpy.get.and.returnValue(of(mockResponse));

      service.getPlayerCatalogItems('player1').subscribe(result => {
        expect(result).toEqual(mockResponse.catalog_items);
        expect(funifierApiSpy.get).toHaveBeenCalledWith('/v3/player/player1/status');
        done();
      });
    });

    it('should return empty record when catalog_items is missing', (done) => {
      funifierApiSpy.get.and.returnValue(of({ _id: 'player1' }));

      service.getPlayerCatalogItems('player1').subscribe(result => {
        expect(result).toEqual({});
        done();
      });
    });

    it('should return empty record when response is null', (done) => {
      funifierApiSpy.get.and.returnValue(of(null));

      service.getPlayerCatalogItems('player1').subscribe(result => {
        expect(result).toEqual({});
        done();
      });
    });

    it('should return empty record on API failure', (done) => {
      funifierApiSpy.get.and.returnValue(throwError(() => new Error('Network error')));

      service.getPlayerCatalogItems('player1').subscribe(result => {
        expect(result).toEqual({});
        done();
      });
    });

    it('should show toast notification on API failure', (done) => {
      funifierApiSpy.get.and.returnValue(throwError(() => new Error('Network error')));

      service.getPlayerCatalogItems('player1').subscribe(() => {
        expect(toastSpy.error).toHaveBeenCalledWith(
          'Não foi possível carregar dados de permissão. Exibindo dashboard padrão.',
          false
        );
        done();
      });
    });

    it('should NOT show toast when catalog_items is missing (only logs warning)', (done) => {
      funifierApiSpy.get.and.returnValue(of({ _id: 'player1' }));

      service.getPlayerCatalogItems('player1').subscribe(() => {
        expect(toastSpy.error).not.toHaveBeenCalled();
        done();
      });
    });

    it('should return empty record when catalog_items is an array', (done) => {
      funifierApiSpy.get.and.returnValue(of({ catalog_items: [] }));

      service.getPlayerCatalogItems('player1').subscribe(result => {
        expect(result).toEqual({});
        done();
      });
    });

    it('should cache results and reuse within TTL', (done) => {
      const mockResponse = {
        catalog_items: { 'TEAM_A': { quantity: 1, item: 'TEAM_A' } }
      };
      funifierApiSpy.get.and.returnValue(of(mockResponse));

      service.getPlayerCatalogItems('player1').subscribe(() => {
        // Second call should use cache
        service.getPlayerCatalogItems('player1').subscribe(result => {
          expect(result).toEqual(mockResponse.catalog_items);
          expect(funifierApiSpy.get).toHaveBeenCalledTimes(1);
          done();
        });
      });
    });
  });

  // ── getAccessibleTeamIds ──────────────────────────────────────

  describe('getAccessibleTeamIds', () => {
    it('should return IDs where quantity > 0', (done) => {
      funifierApiSpy.get.and.returnValue(of({
        catalog_items: {
          'TEAM_A': { quantity: 1, item: 'TEAM_A' },
          'TEAM_B': { quantity: 0, item: 'TEAM_B' },
          'TEAM_C': { quantity: 5, item: 'TEAM_C' },
          'TEAM_D': { quantity: -1, item: 'TEAM_D' }
        }
      }));

      service.getAccessibleTeamIds('player1').subscribe(result => {
        expect(result).toEqual(['TEAM_A', 'TEAM_C']);
        done();
      });
    });

    it('should return empty array when no items have quantity > 0', (done) => {
      funifierApiSpy.get.and.returnValue(of({
        catalog_items: {
          'TEAM_A': { quantity: 0, item: 'TEAM_A' },
          'TEAM_B': { quantity: -1, item: 'TEAM_B' }
        }
      }));

      service.getAccessibleTeamIds('player1').subscribe(result => {
        expect(result).toEqual([]);
        done();
      });
    });

    it('should return empty array when catalog_items is empty', (done) => {
      funifierApiSpy.get.and.returnValue(of({ catalog_items: {} }));

      service.getAccessibleTeamIds('player1').subscribe(result => {
        expect(result).toEqual([]);
        done();
      });
    });

    it('should return empty array on API failure', (done) => {
      funifierApiSpy.get.and.returnValue(throwError(() => new Error('fail')));

      service.getAccessibleTeamIds('player1').subscribe(result => {
        expect(result).toEqual([]);
        done();
      });
    });

    it('should treat IDs as case-sensitive', (done) => {
      funifierApiSpy.get.and.returnValue(of({
        catalog_items: {
          'ABC123': { quantity: 1, item: 'ABC123' },
          'abc123': { quantity: 0, item: 'abc123' }
        }
      }));

      service.getAccessibleTeamIds('player1').subscribe(result => {
        expect(result).toEqual(['ABC123']);
        expect(result).not.toContain('abc123');
        done();
      });
    });
  });

  // ── hasTeamAccess ─────────────────────────────────────────────

  describe('hasTeamAccess', () => {
    beforeEach(() => {
      funifierApiSpy.get.and.returnValue(of({
        catalog_items: {
          'TEAM_A': { quantity: 1, item: 'TEAM_A' },
          'TEAM_B': { quantity: 0, item: 'TEAM_B' }
        }
      }));
    });

    it('should return true when quantity > 0', (done) => {
      service.hasTeamAccess('player1', 'TEAM_A').subscribe(result => {
        expect(result).toBeTrue();
        done();
      });
    });

    it('should return false when quantity is 0', (done) => {
      service.hasTeamAccess('player1', 'TEAM_B').subscribe(result => {
        expect(result).toBeFalse();
        done();
      });
    });

    it('should return false when team ID is absent', (done) => {
      service.hasTeamAccess('player1', 'TEAM_MISSING').subscribe(result => {
        expect(result).toBeFalse();
        done();
      });
    });

    it('should be case-sensitive', (done) => {
      service.hasTeamAccess('player1', 'team_a').subscribe(result => {
        expect(result).toBeFalse();
        done();
      });
    });
  });

  // ── Cache behaviour ───────────────────────────────────────────

  describe('Cache', () => {
    it('should clear cache for a specific player', (done) => {
      funifierApiSpy.get.and.returnValue(of({
        catalog_items: { 'T1': { quantity: 1, item: 'T1' } }
      }));

      service.getPlayerCatalogItems('player1').subscribe(() => {
        service.clearCache('player1');

        service.getPlayerCatalogItems('player1').subscribe(() => {
          expect(funifierApiSpy.get).toHaveBeenCalledTimes(2);
          done();
        });
      });
    });

    it('should clear entire cache', (done) => {
      funifierApiSpy.get.and.returnValue(of({
        catalog_items: { 'T1': { quantity: 1, item: 'T1' } }
      }));

      service.getPlayerCatalogItems('player1').subscribe(() => {
        service.clearCache();

        service.getPlayerCatalogItems('player1').subscribe(() => {
          expect(funifierApiSpy.get).toHaveBeenCalledTimes(2);
          done();
        });
      });
    });

    it('should not use stale cache after API failure', (done) => {
      // First call succeeds
      funifierApiSpy.get.and.returnValue(of({
        catalog_items: { 'T1': { quantity: 1, item: 'T1' } }
      }));

      service.getPlayerCatalogItems('player1').subscribe(() => {
        service.clearCache();

        // Second call fails
        funifierApiSpy.get.and.returnValue(throwError(() => new Error('fail')));

        service.getPlayerCatalogItems('player1').subscribe(result => {
          // Should return empty, not stale data
          expect(result).toEqual({});
          done();
        });
      });
    });

    it('should clear metadata cache on full clearCache()', (done) => {
      const mockMetadata: AclMetadata[] = [
        { team_name: 'Team A', team_id: 'A1', virtual_good_name: 'VG A', virtual_good_id: 'A1' }
      ];
      funifierApiSpy.post.and.returnValue(of(mockMetadata));

      service.getAclMetadata().subscribe(() => {
        service.clearCache();

        // After clearing, a new call should hit the API again
        service.getAclMetadata().subscribe(() => {
          expect(funifierApiSpy.post).toHaveBeenCalledTimes(2);
          done();
        });
      });
    });

    it('should NOT clear metadata cache when clearing for a specific player', (done) => {
      const mockMetadata: AclMetadata[] = [
        { team_name: 'Team A', team_id: 'A1', virtual_good_name: 'VG A', virtual_good_id: 'A1' }
      ];
      funifierApiSpy.post.and.returnValue(of(mockMetadata));

      service.getAclMetadata().subscribe(() => {
        service.clearCache('player1');

        // Metadata cache should still be intact — no new API call
        service.getAclMetadata().subscribe(() => {
          expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);
          done();
        });
      });
    });
  });

  // ── getAclMetadata ────────────────────────────────────────────

  describe('getAclMetadata', () => {
    it('should fetch metadata from acl__c collection', (done) => {
      const mockMetadata: AclMetadata[] = [
        { team_name: 'Departamento Pessoal', team_id: 'ABC123', virtual_good_name: 'ACL - Departamento Pessoal', virtual_good_id: 'ABC123' },
        { team_name: 'Financeiro', team_id: 'DEF456', virtual_good_name: 'ACL - Financeiro', virtual_good_id: 'DEF456' }
      ];
      funifierApiSpy.post.and.returnValue(of(mockMetadata));

      service.getAclMetadata().subscribe(result => {
        expect(result).toEqual(mockMetadata);
        expect(funifierApiSpy.post).toHaveBeenCalledWith(
          '/v3/database/acl__c/aggregate?strict=true',
          [{ $sort: { team_name: 1 } }]
        );
        done();
      });
    });

    it('should cache metadata indefinitely per session', (done) => {
      const mockMetadata: AclMetadata[] = [
        { team_name: 'Team A', team_id: 'A1', virtual_good_name: 'VG A', virtual_good_id: 'A1' }
      ];
      funifierApiSpy.post.and.returnValue(of(mockMetadata));

      service.getAclMetadata().subscribe(() => {
        // Second call should use cache
        service.getAclMetadata().subscribe(result => {
          expect(result).toEqual(mockMetadata);
          expect(funifierApiSpy.post).toHaveBeenCalledTimes(1);
          done();
        });
      });
    });

    it('should return empty array on API failure', (done) => {
      funifierApiSpy.post.and.returnValue(throwError(() => new Error('Network error')));

      service.getAclMetadata().subscribe(result => {
        expect(result).toEqual([]);
        done();
      });
    });

    it('should show toast notification on acl__c API failure', (done) => {
      funifierApiSpy.post.and.returnValue(throwError(() => new Error('Network error')));

      service.getAclMetadata().subscribe(() => {
        expect(toastSpy.error).toHaveBeenCalledWith(
          'Não foi possível carregar dados de permissão. Exibindo dashboard padrão.',
          false
        );
        done();
      });
    });

    it('should NOT show toast when response is non-array (only logs warning)', (done) => {
      funifierApiSpy.post.and.returnValue(of({ unexpected: 'object' } as any));

      service.getAclMetadata().subscribe(result => {
        expect(result).toEqual([]);
        expect(toastSpy.error).not.toHaveBeenCalled();
        done();
      });
    });
  });

  // ── getTeamDisplayName ────────────────────────────────────────

  describe('getTeamDisplayName', () => {
    it('should return team_name when metadata entry exists', (done) => {
      const mockMetadata: AclMetadata[] = [
        { team_name: 'Departamento Pessoal', team_id: 'ABC123', virtual_good_name: 'ACL - DP', virtual_good_id: 'ABC123' }
      ];
      funifierApiSpy.post.and.returnValue(of(mockMetadata));

      service.getTeamDisplayName('ABC123').subscribe(result => {
        expect(result).toBe('Departamento Pessoal');
        done();
      });
    });

    it('should fall back to raw teamId when no metadata entry matches', (done) => {
      const mockMetadata: AclMetadata[] = [
        { team_name: 'Team A', team_id: 'A1', virtual_good_name: 'VG A', virtual_good_id: 'A1' }
      ];
      funifierApiSpy.post.and.returnValue(of(mockMetadata));

      service.getTeamDisplayName('UNKNOWN_ID').subscribe(result => {
        expect(result).toBe('UNKNOWN_ID');
        done();
      });
    });

    it('should fall back to raw teamId when metadata fetch fails', (done) => {
      funifierApiSpy.post.and.returnValue(throwError(() => new Error('fail')));

      service.getTeamDisplayName('SOME_ID').subscribe(result => {
        expect(result).toBe('SOME_ID');
        done();
      });
    });
  });
});
