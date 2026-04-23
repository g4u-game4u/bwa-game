import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { PlayerService } from './player.service';
import { FunifierApiService } from './funifier-api.service';
import { PlayerMapper } from './player-mapper.service';
import { Game4uApiService } from './game4u-api.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { of, throwError } from 'rxjs';
import { PlayerStatus, PointWallet, SeasonProgress } from '@model/gamification-dashboard.model';
import { environment } from '../../environments/environment';

describe('PlayerService', () => {
  let service: PlayerService;
  let funifierApiSpy: jasmine.SpyObj<FunifierApiService>;
  let mapperSpy: jasmine.SpyObj<PlayerMapper>;
  let game4uSpy: jasmine.SpyObj<Game4uApiService>;
  let savedUseGame4uApi: boolean | undefined;

  beforeEach(() => {
    savedUseGame4uApi = environment.useGame4uApi;
    environment.useGame4uApi = false;

    const apiSpy = jasmine.createSpyObj('FunifierApiService', ['get']);
    const playerMapperSpy = jasmine.createSpyObj('PlayerMapper', [
      'toPlayerStatus',
      'toPointWallet',
      'toSeasonProgress'
    ]);
    game4uSpy = jasmine.createSpyObj('Game4uApiService', ['getGameStats', 'toQueryRange', 'isConfigured']);
    game4uSpy.isConfigured.and.returnValue(true);
    game4uSpy.toQueryRange.and.returnValue({
      start: '2000-01-01T00:00:00.000Z',
      end: '2099-12-31T23:59:59.999Z'
    });

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        PlayerService,
        { provide: FunifierApiService, useValue: apiSpy },
        { provide: PlayerMapper, useValue: playerMapperSpy },
        { provide: Game4uApiService, useValue: game4uSpy },
        { provide: SessaoProvider, useValue: { usuario: { email: 'john@example.com' } } }
      ]
    });

    service = TestBed.inject(PlayerService);
    funifierApiSpy = TestBed.inject(FunifierApiService) as jasmine.SpyObj<FunifierApiService>;
    mapperSpy = TestBed.inject(PlayerMapper) as jasmine.SpyObj<PlayerMapper>;
  });

  afterEach(() => {
    if (savedUseGame4uApi !== undefined) {
      environment.useGame4uApi = savedUseGame4uApi;
    }
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getPlayerStatus', () => {
    it('should fetch and map player status correctly', (done) => {
      const mockApiResponse = {
        _id: 'player123',
        name: 'John Doe',
        email: 'john@example.com',
        level: 5,
        extra: { seasonLevel: 10, area: 'Sales', time: 'Team A', squad: 'Squad 1' }
      };

      const mockPlayerStatus: PlayerStatus = {
        _id: 'player123',
        name: 'John Doe',
        email: 'john@example.com',
        level: 5,
        seasonLevel: 10,
        metadata: { area: 'Sales', time: 'Team A', squad: 'Squad 1' },
        created: Date.now(),
        updated: Date.now()
      };

      funifierApiSpy.get.and.returnValue(of(mockApiResponse));
      mapperSpy.toPlayerStatus.and.returnValue(mockPlayerStatus);

      service.getPlayerStatus('player123').subscribe(result => {
        expect(result).toEqual(mockPlayerStatus);
        expect(funifierApiSpy.get).toHaveBeenCalledWith('/v3/player/player123/status');
        expect(mapperSpy.toPlayerStatus).toHaveBeenCalledWith(mockApiResponse);
        done();
      });
    });

    it('should use cached data on subsequent calls', (done) => {
      const mockApiResponse = { _id: 'player123', name: 'John Doe' };
      const mockPlayerStatus: PlayerStatus = {
        _id: 'player123',
        name: 'John Doe',
        email: 'john@example.com',
        level: 5,
        seasonLevel: 10,
        metadata: { area: '', time: '', squad: '' },
        created: Date.now(),
        updated: Date.now()
      };

      funifierApiSpy.get.and.returnValue(of(mockApiResponse));
      mapperSpy.toPlayerStatus.and.returnValue(mockPlayerStatus);

      // First call
      service.getPlayerStatus('player123').subscribe(() => {
        // Second call should use cache
        service.getPlayerStatus('player123').subscribe(result => {
          expect(result).toEqual(mockPlayerStatus);
          expect(funifierApiSpy.get).toHaveBeenCalledTimes(1);
          done();
        });
      });
    });

    it('should fallback to cached data on error', (done) => {
      const mockPlayerStatus: PlayerStatus = {
        _id: 'player123',
        name: 'John Doe',
        email: 'john@example.com',
        level: 5,
        seasonLevel: 10,
        metadata: { area: '', time: '', squad: '' },
        created: Date.now(),
        updated: Date.now()
      };

      // First successful call
      funifierApiSpy.get.and.returnValue(of({ _id: 'player123' }));
      mapperSpy.toPlayerStatus.and.returnValue(mockPlayerStatus);

      service.getPlayerStatus('player123').subscribe(() => {
        // Clear cache to force new request
        service.clearCache();

        // Second call fails
        funifierApiSpy.get.and.returnValue(throwError(() => new Error('Network error')));

        service.getPlayerStatus('player123').subscribe(result => {
          expect(result).toEqual(mockPlayerStatus);
          done();
        });
      });
    });
  });

  describe('getPlayerPoints', () => {
    it('should fetch and map player points correctly', (done) => {
      const mockApiResponse = {
        point_categories: {
          bloqueados: 1000,
          desbloqueados: 2000,
          moedas: 500
        }
      };

      const mockPointWallet: PointWallet = {
        bloqueados: 1000,
        desbloqueados: 2000,
        moedas: 500
      };

      funifierApiSpy.get.and.returnValue(of(mockApiResponse));
      mapperSpy.toPointWallet.and.returnValue(mockPointWallet);

      service.getPlayerPoints('player123').subscribe(result => {
        expect(result).toEqual(mockPointWallet);
        expect(funifierApiSpy.get).toHaveBeenCalledWith('/v3/player/player123/status');
        expect(mapperSpy.toPointWallet).toHaveBeenCalledWith(mockApiResponse);
        done();
      });
    });

    it('should handle error with fallback', (done) => {
      const mockPointWallet: PointWallet = {
        bloqueados: 1000,
        desbloqueados: 2000,
        moedas: 500
      };

      // First successful call
      funifierApiSpy.get.and.returnValue(of({ point_categories: {} }));
      mapperSpy.toPointWallet.and.returnValue(mockPointWallet);

      service.getPlayerPoints('player123').subscribe(() => {
        service.clearCache();

        // Second call fails
        funifierApiSpy.get.and.returnValue(throwError(() => new Error('API error')));

        service.getPlayerPoints('player123').subscribe(result => {
          expect(result).toEqual(mockPointWallet);
          done();
        });
      });
    });

    it('should map wallet from Game4U stats when enabled', done => {
      environment.useGame4uApi = true;
      game4uSpy.getGameStats.and.returnValue(
        of({
          stats: [],
          total_actions: 0,
          total_points: 42,
          total_blocked_points: 5
        })
      );

      service.getPlayerPoints('me').subscribe(result => {
        expect(result).toEqual({ bloqueados: 5, desbloqueados: 42, moedas: 0 });
        expect(game4uSpy.getGameStats).toHaveBeenCalled();
        expect(funifierApiSpy.get).not.toHaveBeenCalled();
        done();
      });
    });
  });

  describe('getSeasonProgress', () => {
    it('should fetch and map season progress correctly', (done) => {
      const seasonDates = {
        start: new Date('2023-01-01'),
        end: new Date('2023-12-31')
      };

      const mockApiResponse = {
        progress: {
          metas: { current: 5, target: 10 },
          clientes: 20,
          tarefasFinalizadas: 50
        }
      };

      const mockProgress: SeasonProgress = {
        metas: { current: 5, target: 10 },
        clientes: 20,
        tarefasFinalizadas: 50,
        seasonDates
      };

      funifierApiSpy.get.and.returnValue(of(mockApiResponse));
      mapperSpy.toSeasonProgress.and.returnValue(mockProgress);

      service.getSeasonProgress('player123', seasonDates).subscribe(result => {
        expect(result).toEqual(mockProgress);
        expect(funifierApiSpy.get).toHaveBeenCalledWith('/v3/player/player123/progress', {
          start_date: seasonDates.start.toISOString(),
          end_date: seasonDates.end.toISOString()
        });
        done();
      });
    });
  });

  describe('Cache Management', () => {
    it('should clear all caches', () => {
      service.clearCache();
      // Cache should be empty, so next call should hit API
      expect(service).toBeTruthy();
    });

    it('should clear cache for specific player', (done) => {
      const mockApiResponse = { _id: 'player123' };
      const mockPlayerStatus: PlayerStatus = {
        _id: 'player123',
        name: 'John Doe',
        email: 'john@example.com',
        level: 5,
        seasonLevel: 10,
        metadata: { area: '', time: '', squad: '' },
        created: Date.now(),
        updated: Date.now()
      };

      funifierApiSpy.get.and.returnValue(of(mockApiResponse));
      mapperSpy.toPlayerStatus.and.returnValue(mockPlayerStatus);

      service.getPlayerStatus('player123').subscribe(() => {
        service.clearPlayerCache('player123');

        // Next call should hit API again
        service.getPlayerStatus('player123').subscribe(() => {
          expect(funifierApiSpy.get).toHaveBeenCalledTimes(2);
          done();
        });
      });
    });
  });
});
