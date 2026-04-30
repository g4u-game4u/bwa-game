import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { PlayerService } from './player.service';
import { PlayerMapper } from './player-mapper.service';
import { Game4uApiService } from './game4u-api.service';
import { SessaoProvider } from '@providers/sessao/sessao.provider';
import { of } from 'rxjs';
import { PlayerStatus, PointWallet, SeasonProgress } from '@model/gamification-dashboard.model';
import { environment } from '../../environments/environment';
import { joinApiPath } from '../../environments/backend-url';

describe('PlayerService', () => {
  let service: PlayerService;
  let httpMock: HttpTestingController;
  let mapperSpy: jasmine.SpyObj<PlayerMapper>;
  let game4uSpy: jasmine.SpyObj<Game4uApiService>;
  let savedUseGame4uApi: boolean | undefined;
  let savedBackendUrl: string;

  function profileUrl(playerId: string): string {
    const base = (environment.backend_url_base || '').trim().replace(/\/+$/, '');
    return joinApiPath(base, `player/${encodeURIComponent(playerId)}`);
  }

  beforeEach(() => {
    savedUseGame4uApi = environment.useGame4uApi;
    savedBackendUrl = environment.backend_url_base;
    environment.useGame4uApi = false;
    environment.backend_url_base = 'https://api.test';

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
        { provide: PlayerMapper, useValue: playerMapperSpy },
        { provide: Game4uApiService, useValue: game4uSpy },
        { provide: SessaoProvider, useValue: { usuario: { email: 'john@example.com' } } }
      ]
    });

    service = TestBed.inject(PlayerService);
    httpMock = TestBed.inject(HttpTestingController);
    mapperSpy = TestBed.inject(PlayerMapper) as jasmine.SpyObj<PlayerMapper>;
  });

  afterEach(() => {
    httpMock.verify();
    if (savedUseGame4uApi !== undefined) {
      environment.useGame4uApi = savedUseGame4uApi;
    }
    environment.backend_url_base = savedBackendUrl;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getPlayerStatus should use /auth/user when playerId is the session email', done => {
    const mockApiResponse = {
      _id: 'john@example.com',
      name: 'John Doe',
      email: 'john@example.com',
      extra: { seasonLevel: 3 }
    };
    const mockPlayerStatus: PlayerStatus = {
      _id: 'john@example.com',
      name: 'John Doe',
      email: 'john@example.com',
      level: 0,
      seasonLevel: 3,
      metadata: { area: '', time: '', squad: '' },
      created: Date.now(),
      updated: Date.now()
    };
    mapperSpy.toPlayerStatus.and.returnValue(mockPlayerStatus);

    service.getPlayerStatus('john@example.com').subscribe(result => {
      expect(result).toEqual(mockPlayerStatus);
      done();
    });

    const req = httpMock.expectOne(r => r.url === 'https://api.test/auth/user' && r.method === 'GET');
    req.flush(mockApiResponse);
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

      mapperSpy.toPlayerStatus.and.returnValue(mockPlayerStatus);

      service.getPlayerStatus('player123').subscribe(result => {
        expect(result).toEqual(mockPlayerStatus);
        expect(mapperSpy.toPlayerStatus).toHaveBeenCalledWith(mockApiResponse);
        done();
      });

      const req = httpMock.expectOne(r => r.url === profileUrl('player123') && r.method === 'GET');
      req.flush(mockApiResponse);
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

      mapperSpy.toPlayerStatus.and.returnValue(mockPlayerStatus);

      service.getPlayerStatus('player123').subscribe(() => {
        service.getPlayerStatus('player123').subscribe(result => {
          expect(result).toEqual(mockPlayerStatus);
          done();
        });
      });

      const req = httpMock.expectOne(r => r.url === profileUrl('player123'));
      req.flush(mockApiResponse);
    });

    it('should propagate error after cache clear and failed request', (done) => {
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

      mapperSpy.toPlayerStatus.and.returnValue(mockPlayerStatus);

      service.getPlayerStatus('player123').subscribe(() => {
        service.clearCache();
        service.getPlayerStatus('player123').subscribe({
          error: () => {
            done();
          }
        });
        const req2 = httpMock.expectOne(r => r.url === profileUrl('player123'));
        req2.flush('Network error', { status: 500, statusText: 'Server Error' });
      });

      const req1 = httpMock.expectOne(r => r.url === profileUrl('player123'));
      req1.flush({ _id: 'player123' });
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

      mapperSpy.toPointWallet.and.returnValue(mockPointWallet);

      service.getPlayerPoints('player123').subscribe(result => {
        expect(result).toEqual(mockPointWallet);
        expect(mapperSpy.toPointWallet).toHaveBeenCalledWith(mockApiResponse);
        done();
      });

      const req = httpMock.expectOne(r => r.url === profileUrl('player123'));
      req.flush(mockApiResponse);
    });

    it('should propagate error after cache clear and failed request', (done) => {
      const mockPointWallet: PointWallet = {
        bloqueados: 1000,
        desbloqueados: 2000,
        moedas: 500
      };

      mapperSpy.toPointWallet.and.returnValue(mockPointWallet);

      service.getPlayerPoints('player123').subscribe(() => {
        service.clearCache();
        service.getPlayerPoints('player123').subscribe({
          error: () => {
            done();
          }
        });
        const req2 = httpMock.expectOne(r => r.url === profileUrl('player123'));
        req2.flush('API error', { status: 500, statusText: 'Server Error' });
      });

      const req1 = httpMock.expectOne(r => r.url === profileUrl('player123'));
      req1.flush({ point_categories: {} });
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
        expect(game4uSpy.toQueryRange).toHaveBeenCalledWith(undefined);
        expect(game4uSpy.getGameStats).toHaveBeenCalled();
        done();
      });
    });

    it('should pass selected month into toQueryRange for Game4U /game/stats', done => {
      environment.useGame4uApi = true;
      const month = new Date(2026, 2, 15);
      game4uSpy.toQueryRange.calls.reset();
      game4uSpy.toQueryRange.and.returnValue({
        start: '2026-03-01T03:00:00.000Z',
        end: '2026-03-31T02:59:59.999Z'
      });
      game4uSpy.getGameStats.and.returnValue(
        of({
          stats: [],
          total_actions: 0,
          total_points: 1,
          total_blocked_points: 0
        })
      );

      service.getPlayerPoints('me', month).subscribe(() => {
        expect(game4uSpy.toQueryRange).toHaveBeenCalledWith(month);
        expect(game4uSpy.getGameStats).toHaveBeenCalledWith({
          user: 'john@example.com',
          start: '2026-03-01T03:00:00.000Z',
          end: '2026-03-31T02:59:59.999Z'
        });
        done();
      });
    });
  });

  describe('getSeasonProgress', () => {
    it('should map season shell without calling /status', (done) => {
      const seasonDates = {
        start: new Date('2023-01-01'),
        end: new Date('2023-12-31')
      };

      const mockProgress: SeasonProgress = {
        metas: { current: 0, target: 0 },
        clientes: 0,
        tarefasFinalizadas: 0,
        seasonDates
      };

      mapperSpy.toSeasonProgress.and.returnValue(mockProgress);

      service.getSeasonProgress('player123', seasonDates).subscribe(result => {
        expect(result).toEqual(mockProgress);
        expect(mapperSpy.toSeasonProgress).toHaveBeenCalledWith({}, seasonDates);
        done();
      });
    });
  });

  describe('Cache Management', () => {
    it('should clear all caches', () => {
      service.clearCache();
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

      mapperSpy.toPlayerStatus.and.returnValue(mockPlayerStatus);

      service.getPlayerStatus('player123').subscribe(() => {
        service.clearPlayerCache('player123');

        service.getPlayerStatus('player123').subscribe(() => {
          done();
        });
        const req2 = httpMock.expectOne(r => r.url === profileUrl('player123'));
        req2.flush(mockApiResponse);
      });

      const req1 = httpMock.expectOne(r => r.url === profileUrl('player123'));
      req1.flush(mockApiResponse);
    });
  });
});
