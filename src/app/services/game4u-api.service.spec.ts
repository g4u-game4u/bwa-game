import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Game4uApiService } from './game4u-api.service';
import { Game4uSupabaseFallbackService } from './game4u-supabase-fallback.service';
import { SeasonDatesService } from './season-dates.service';
import { environment } from '../../environments/environment';

describe('Game4uApiService', () => {
  let service: Game4uApiService;
  let httpMock: HttpTestingController;
  let baseUrl: string;

  beforeEach(() => {
    const fb = jasmine.createSpyObj('Game4uSupabaseFallbackService', ['isAvailable', 'getGameStats']);
    fb.isAvailable.and.returnValue(false);

    const seasonDates = jasmine.createSpyObj('SeasonDatesService', ['getSeasonDates', 'getCachedSeasonBounds']);
    seasonDates.getSeasonDates.and.returnValue(
      Promise.resolve({
        start: new Date('2024-03-01T03:00:00.000Z'),
        end: new Date('2024-06-30T03:00:00.000Z')
      })
    );
    seasonDates.getCachedSeasonBounds.and.returnValue(null);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        Game4uApiService,
        { provide: Game4uSupabaseFallbackService, useValue: fb },
        { provide: SeasonDatesService, useValue: seasonDates }
      ]
    });
    service = TestBed.inject(Game4uApiService);
    httpMock = TestBed.inject(HttpTestingController);
    baseUrl = (environment.backend_url_base || '').trim().replace(/\/$/, '');
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getGameStats builds query params and client_id header', done => {
    service
      .getGameStats({
        user: 'u@example.com',
        start: '2024-01-01T00:00:00.000Z',
        end: '2024-01-31T23:59:59.999Z'
      })
      .subscribe(res => {
        expect(res.total_points).toBe(5);
        done();
      });

    const req = httpMock.expectOne(
      r =>
        !!(
          r.url === `${baseUrl}/game/stats` &&
          r.params.get('user') === 'u@example.com' &&
          (r.params.get('start') ?? '').startsWith('2024-01-01') &&
          !!r.params.get('end')
        )
    );
    expect(req.request.headers.get('client_id')).toBeTruthy();
    req.flush({ stats: [], total_actions: 0, total_points: 5, total_blocked_points: 0 });
  });

  it('getGameTeamStats omits user query param (API agrega só por team + intervalo)', done => {
    service
      .getGameTeamStats({
        team: '26',
        user: 'gestor@example.com',
        start: '2026-04-01T03:00:00.000Z',
        end: '2026-05-01T02:59:59.999Z'
      })
      .subscribe(res => {
        expect(res.total_points).toBe(2);
        done();
      });

    const req = httpMock.expectOne(
      r =>
        r.url === `${baseUrl}/game/team-stats` &&
        r.params.get('team') === '26' &&
        r.params.get('user') == null
    );
    req.flush({ stats: [], total_actions: 0, total_points: 2, total_blocked_points: 0 });
  });

  it('getGameStats sends user but omits team_id (API rejeita team_id com user em /game/stats)', done => {
    service
      .getGameStats({
        user: 'colab@example.com',
        start: '2026-04-01T03:00:00.000Z',
        end: '2026-05-01T02:59:59.999Z',
        team_id: '26'
      })
      .subscribe(res => {
        expect(res.total_points).toBe(1);
        done();
      });

    const req = httpMock.expectOne(
      r =>
        r.url === `${baseUrl}/game/stats` &&
        r.params.get('user') === 'colab@example.com' &&
        r.params.get('team_id') == null
    );
    req.flush({ stats: [], total_actions: 0, total_points: 1, total_blocked_points: 0 });
  });

  it('toIsoRange returns ISO strings', () => {
    const a = new Date('2024-02-01T10:00:00.000Z');
    const b = new Date('2024-02-28T10:00:00.000Z');
    const r = service.toIsoRange(a, b);
    expect(r.start).toBe(a.toISOString());
    expect(r.end).toBe(b.toISOString());
  });

  it('toDtPrazoMonthRange returns first day and first day of next month', () => {
    const r = service.toDtPrazoMonthRange(new Date(2026, 3, 15));
    expect(r.start).toBe('2026-04-01');
    expect(r.end).toBe('2026-05-01');
  });

  it('toDtPrazoMonthRangeForUserActions returns first and last day of month', () => {
    const april = service.toDtPrazoMonthRangeForUserActions(new Date(2026, 3, 15));
    expect(april.start).toBe('2026-04-01');
    expect(april.end).toBe('2026-04-30');

    const february = service.toDtPrazoMonthRangeForUserActions(new Date(2024, 1, 10));
    expect(february.start).toBe('2024-02-01');
    expect(february.end).toBe('2024-02-29');
  });

  it('getGameReportsFinishedSummary builds email and finished_at params', done => {
    service
      .getGameReportsFinishedSummary({
        email: 'u@example.com',
        finished_at_start: '2026-04-01T00:00:00.000Z',
        finished_at_end: '2026-04-30T23:59:59.999Z'
      })
      .subscribe(res => {
        expect(res.tasks_count).toBe(3);
        expect(res.points_sum).toBe(40);
        expect(res.deliveries_count).toBe(2);
        done();
      });

    const req = httpMock.expectOne(
      r =>
        r.url === `${baseUrl}/game/reports/finished/summary` &&
        r.params.get('email') === 'u@example.com' &&
        r.params.get('finished_at_start') === '2026-04-01T00:00:00.000Z' &&
        r.params.get('finished_at_end') === '2026-04-30T23:59:59.999Z'
    );
    expect(req.request.headers.get('client_id')).toBeTruthy();
    req.flush({ tasks_count: 3, points_sum: 40, deliveries_count: 2 });
  });

  it('getGameReportsFinishedSummary builds team_id without email (consolidado equipe)', done => {
    service
      .getGameReportsFinishedSummary({
        team_id: '42',
        finished_at_start: '2026-04-01T00:00:00.000Z',
        finished_at_end: '2026-04-30T23:59:59.999Z'
      })
      .subscribe(res => {
        expect(res.tasks_count).toBe(10);
        done();
      });

    const req = httpMock.expectOne(
      r =>
        r.url === `${baseUrl}/game/reports/finished/summary` &&
        r.params.get('team_id') === '42' &&
        r.params.get('finished_at_start') === '2026-04-01T00:00:00.000Z' &&
        r.params.keys().indexOf('email') === -1
    );
    req.flush({ tasks_count: 10, points_sum: 100, deliveries_count: 5 });
  });

  it('getGameReportsOpenSummary builds email and dt_prazo params (no finished_at)', done => {
    service
      .getGameReportsOpenSummary({
        email: 'u@example.com',
        dt_prazo_start: '2026-04-01',
        dt_prazo_end: '2026-05-01'
      })
      .subscribe(res => {
        expect(res.tasks_count).toBe(5);
        expect(res.points_sum).toBe(12);
        expect(res.delivery_count).toBe(3);
        done();
      });

    const req = httpMock.expectOne(
      r =>
        r.url === `${baseUrl}/game/reports/open/summary` &&
        r.params.get('email') === 'u@example.com' &&
        r.params.get('dt_prazo_start') === '2026-04-01' &&
        r.params.get('dt_prazo_end') === '2026-05-01'
    );
    expect(req.request.params.keys().filter(k => k === 'finished_at_start' || k === 'finished_at_end').length).toBe(
      0
    );
    req.flush({ tasks_count: 5, points_sum: 12, delivery_count: 3 });
  });

  it('getGameReportsFinishedDeliveries normalizes legacy string array', done => {
    service
      .getGameReportsFinishedDeliveries({
        email: 'u@example.com',
        finished_at_start: '2026-04-01T00:00:00.000Z',
        finished_at_end: '2026-04-30T23:59:59.999Z'
      })
      .subscribe(res => {
        expect(res).toEqual([{ delivery_title: 'A' }, { delivery_title: 'B' }]);
        done();
      });
    const req = httpMock.expectOne(`${baseUrl}/game/reports/finished/deliveries`);
    req.flush(['A', 'B']);
  });

  it('getGameReportsFinishedDeliveries maps delivery_id + delivery_title for gamificação EmpID', done => {
    service
      .getGameReportsFinishedDeliveries({
        email: 'u@example.com',
        finished_at_start: '2026-03-01T00:00:00.000Z',
        finished_at_end: '2026-03-31T23:59:59.999Z'
      })
      .subscribe(res => {
        expect(res).toEqual([
          { delivery_title: 'Empresa X', delivery_id: '41355-2026-03-01' }
        ]);
        done();
      });
    const req = httpMock.expectOne(`${baseUrl}/game/reports/finished/deliveries`);
    req.flush([{ delivery_id: '41355-2026-03-01', delivery_title: 'Empresa X' }]);
  });

  it('getGameReportsFinishedActionsByDelivery passes delivery_title without pagination params', done => {
    service
      .getGameReportsFinishedActionsByDelivery({
        email: 'u@example.com',
        finished_at_start: '2026-04-01T00:00:00.000Z',
        finished_at_end: '2026-04-30T23:59:59.999Z',
        delivery_title: 'Cliente X',
        offset: 0,
        limit: 10
      })
      .subscribe(res => {
        expect(res.items.length).toBe(1);
        expect(res.total).toBe(42);
        expect(res.items[0].id).toBe('a1');
        done();
      });
    const req = httpMock.expectOne(r => r.url === `${baseUrl}/game/reports/finished/actions-by-delivery`);
    expect(req.request.params.get('delivery_title')).toBe('Cliente X');
    expect(req.request.params.get('delivery_id')).toBeNull();
    expect(req.request.params.get('offset')).toBeNull();
    expect(req.request.params.get('limit')).toBeNull();
    req.flush({
      items: [{ id: 'a1', points: 1, status: 'DONE', created_at: '2026-04-02T00:00:00.000Z' }],
      total: 42
    });
  });

  it('getGameReportsFinishedActionsByDelivery accepts legacy array body', done => {
    service
      .getGameReportsFinishedActionsByDelivery({
        email: 'u@example.com',
        finished_at_start: '2026-04-01T00:00:00.000Z',
        finished_at_end: '2026-04-30T23:59:59.999Z',
        delivery_title: 'Y',
        offset: 0,
        limit: 5
      })
      .subscribe(res => {
        expect(res.items.length).toBe(1);
        expect(res.total).toBe(1);
        done();
      });
    const req = httpMock.expectOne(r => r.url === `${baseUrl}/game/reports/finished/actions-by-delivery`);
    req.flush([{ id: 'x', points: 0, status: 'DONE', created_at: '2026-04-02T00:00:00.000Z' }]);
  });

  it('getGameReportsUserActions passes email, status list, finished_at pair without pagination params', done => {
    service
      .getGameReportsUserActions({
        email: 'u@example.com',
        status: ['DONE', 'DELIVERED'],
        finished_at_start: '2026-04-01T00:00:00.000Z',
        finished_at_end: '2026-04-30T23:59:59.999Z',
        offset: 0,
        limit: 25
      })
      .subscribe(res => {
        expect(res.items.length).toBe(1);
        expect(res.offset).toBe(0);
        expect(res.limit).toBe(25);
        expect(res.items[0].id).toBe('ua1');
        done();
      });
    const req = httpMock.expectOne(r => r.url === `${baseUrl}/game/reports/user-actions`);
    expect(req.request.params.get('email')).toBe('u@example.com');
    expect(req.request.params.getAll('status')).toEqual(['DONE', 'DELIVERED']);
    expect(req.request.params.get('finished_at_start')).toBe('2026-04-01T00:00:00.000Z');
    expect(req.request.params.get('finished_at_end')).toBe('2026-04-30T23:59:59.999Z');
    expect(req.request.params.get('offset')).toBeNull();
    expect(req.request.params.get('limit')).toBeNull();
    expect(req.request.headers.get('client_id')).toBeTruthy();
    req.flush({
      offset: 0,
      limit: 25,
      items: [{ id: 'ua1', points: 2, status: 'DONE', created_at: '2026-04-02T00:00:00.000Z' }]
    });
  });

  it('getGameReportsUserActions passes dt_prazo pair when no finished_at', done => {
    service
      .getGameReportsUserActions({
        email: 'u@example.com',
        status: ['PENDING', 'DOING'],
        dt_prazo_start: '2026-04-01',
        dt_prazo_end: '2026-05-01',
        offset: 0,
        limit: 100
      })
      .subscribe(() => done());
    const req = httpMock.expectOne(r => r.url === `${baseUrl}/game/reports/user-actions`);
    expect(req.request.params.get('dt_prazo_start')).toBe('2026-04-01');
    expect(req.request.params.get('dt_prazo_end')).toBe('2026-05-01');
    expect(req.request.params.get('created_at_start')).toBeNull();
    req.flush({ offset: 0, limit: 100, items: [] });
  });

  it('getGameReportsDashboardCached builds email and month params', done => {
    service
      .getGameReportsDashboardCached({
        email: 'player@bwa.global',
        month: '2026-05'
      })
      .subscribe(res => {
        expect(res.season_points_total).toBe(1840);
        expect(res.month_goal_points).toBe(450);
        done();
      });
    const req = httpMock.expectOne(
      r =>
        r.url === `${baseUrl}/game/reports/dashboard/cached` &&
        r.params.get('email') === 'player@bwa.global' &&
        r.params.get('month') === '2026-05'
    );
    req.flush({
      refreshed_at: '2026-05-20T19:59:15.123Z',
      params: {
        cache_month: '2026-05-01',
        season_start: '2026-03-01',
        season_end: '2026-06-30',
        month_start: '2026-05-01',
        month_end: '2026-05-31'
      },
      season_points_total: 1840,
      season_clients_total: 22,
      season_tasks_finished_total: 95,
      month_points_done_delivered: 320,
      month_goal_points: 450,
      month_pending_tasks_count: 12,
      month_finished_tasks_count: 28,
      month_clients_served: 8,
      month_on_time_delivery_pct: 92.5,
      refresh_error: null
    });
  });

  it('getGameReportsSupervisionDashboardCached builds team_id and month params', done => {
    service
      .getGameReportsSupervisionDashboardCached({
        team_id: '26',
        month: '2026-05'
      })
      .subscribe(res => {
        expect(res.team_id).toBe(26);
        expect(res.team_name).toBe('Equipe Alpha');
        expect(res.month_clients_served).toBe(8);
        done();
      });
    const req = httpMock.expectOne(
      r =>
        r.url === `${baseUrl}/game/reports/supervision/dashboard/cached` &&
        r.params.get('team_id') === '26' &&
        r.params.get('month') === '2026-05'
    );
    req.flush({
      refreshed_at: '2026-05-20T19:59:15.123Z',
      team_id: 26,
      team_name: 'Equipe Alpha',
      players_count: 5,
      params: {
        cache_month: '2026-05-01',
        season_start: '2026-03-01',
        season_end: '2026-06-30',
        month_start: '2026-05-01',
        month_end: '2026-05-31'
      },
      season_points_total: 4200,
      season_clients_total: 40,
      season_tasks_finished_total: 180,
      month_points_done_delivered: 900,
      month_goal_points: 1200,
      month_pending_tasks_count: 15,
      month_finished_tasks_count: 55,
      month_clients_served: 8,
      month_on_time_delivery_pct: 88,
      refresh_error: null
    });
  });

  it('getGameReportsManagementDashboardCachedOverview builds month param', done => {
    service
      .getGameReportsManagementDashboardCachedOverview({ month: '2026-05' })
      .subscribe(res => {
        expect(res.manager.user_role).toBe('GERENTE');
        expect(res.manager.month_clients_served).toBe(40);
        expect(res.teams.length).toBe(1);
        done();
      });
    const req = httpMock.expectOne(
      r =>
        r.url === `${baseUrl}/game/reports/management/dashboard/cached/overview` &&
        r.params.get('month') === '2026-05'
    );
    req.flush({
      manager: {
        refreshed_at: '2026-05-20T18:00:00.000Z',
        user_id: 'u1',
        user_email: 'gerente@bwa.global',
        user_role: 'GERENTE',
        teams_count: 1,
        team_ids: [37],
        teams: [{ team_id: 37, team_name: 'Time Norte' }],
        players_count: 12,
        params: {
          cache_month: '2026-05-01',
          season_start: '2026-03-01',
          season_end: '2026-06-30',
          month_start: '2026-05-01',
          month_end: '2026-05-31'
        },
        season_points_total: 4800,
        season_clients_total: 120,
        season_tasks_finished_total: 320,
        month_points_done_delivered: 900,
        month_goal_points: 1100,
        month_pending_tasks_count: 45,
        month_finished_tasks_count: 88,
        month_clients_served: 40,
        month_on_time_delivery_pct: 82.5,
        refresh_error: null
      },
      teams: [
        {
          refreshed_at: '2026-05-20T18:00:00.000Z',
          team_id: 37,
          team_name: 'Time Norte',
          players_count: 12,
          params: {
            cache_month: '2026-05-01',
            season_start: '2026-03-01',
            season_end: '2026-06-30',
            month_start: '2026-05-01',
            month_end: '2026-05-31'
          },
          season_points_total: 2400,
          season_clients_total: 60,
          season_tasks_finished_total: 160,
          month_points_done_delivered: 450,
          month_goal_points: 550,
          month_pending_tasks_count: 22,
          month_finished_tasks_count: 44,
          month_clients_served: 20,
          month_on_time_delivery_pct: 80,
          refresh_error: null
        }
      ],
      organizational_tier: null
    });
  });

  it('getGameReportsSupervisionDashboardCachedList builds month param', done => {
    service
      .getGameReportsSupervisionDashboardCachedList({ month: '2026-05' })
      .subscribe(res => {
        expect(res.teams.length).toBe(1);
        expect(res.teams[0].team_id).toBe(26);
        done();
      });
    const req = httpMock.expectOne(
      r =>
        r.url === `${baseUrl}/game/reports/supervision/dashboard/cached/list` &&
        r.params.get('month') === '2026-05'
    );
    req.flush({
      teams: [
        {
          refreshed_at: '2026-05-20T19:59:15.123Z',
          team_id: 26,
          team_name: 'Equipe Alpha',
          players_count: 5,
          params: {
            cache_month: '2026-05-01',
            season_start: '2026-03-01',
            season_end: '2026-06-30',
            month_start: '2026-05-01',
            month_end: '2026-05-31'
          },
          season_points_total: 4200,
          season_clients_total: 40,
          season_tasks_finished_total: 180,
          month_points_done_delivered: 900,
          month_goal_points: 1200,
          month_pending_tasks_count: 15,
          month_finished_tasks_count: 55,
          month_clients_served: 8,
          month_on_time_delivery_pct: 88,
          refresh_error: null
        }
      ]
    });
  });

  it('getGameReportsFinishedDeliveriesCached builds team_id, month and pagination', done => {
    service
      .getGameReportsFinishedDeliveriesCached({
        team_id: '26',
        month: '2026-05',
        offset: 0,
        limit: 50
      })
      .subscribe(res => {
        expect(res.items[0].delivery_title).toBe('Cliente Equipe');
        expect(res.items[0].on_time_pct).toBe(91);
        expect(res.total).toBe(1);
        done();
      });
    const req = httpMock.expectOne(
      r =>
        r.url === `${baseUrl}/game/reports/finished/deliveries/cached` &&
        r.params.get('team_id') === '26' &&
        r.params.get('month') === '2026-05' &&
        r.params.get('offset') === '0' &&
        r.params.get('limit') === '50' &&
        r.params.get('email') == null
    );
    req.flush({
      refreshed_at: '2026-05-20T12:00:00.000Z',
      offset: 0,
      limit: 50,
      total: 1,
      items: [{ delivery_title: 'Cliente Equipe', tasks_total: 3, on_time_pct: 91 }]
    });
  });

  it('getGameReportsFinishedDeliveriesCached builds email, month and pagination', done => {
    service
      .getGameReportsFinishedDeliveriesCached({
        email: 'player@bwa.global',
        month: '2026-05',
        offset: 0,
        limit: 30
      })
      .subscribe(res => {
        expect(res.items[0].delivery_title).toBe('Cliente A');
        expect(res.items[0].on_time_pct).toBe(88);
        expect(res.total).toBe(1);
        done();
      });
    const req = httpMock.expectOne(
      r =>
        r.url === `${baseUrl}/game/reports/finished/deliveries/cached` &&
        r.params.get('email') === 'player@bwa.global' &&
        r.params.get('month') === '2026-05' &&
        r.params.get('offset') === '0' &&
        r.params.get('limit') === '30'
    );
    expect(req.request.params.has('finished_at_start')).toBe(false);
    req.flush({
      refreshed_at: '2026-05-20T12:00:00.000Z',
      params: {
        cache_month: '2026-05-01',
        season_start: '2026-03-01',
        season_end: '2026-06-30',
        month_start: '2026-05-01',
        month_end: '2026-05-31'
      },
      offset: 0,
      limit: 30,
      total: 1,
      items: [
        {
          delivery_title: 'Cliente A',
          emp_id: 41355,
          on_time_pct: 88,
          tasks_total: 10,
          tasks_on_time: 8
        },
      ]
    });
  });

  it('getGameReportsManagementFinishedDeliveriesCached builds month + pagination (no email/team_id)', done => {
    service
      .getGameReportsManagementFinishedDeliveriesCached({
        month: '2026-05',
        offset: 0,
        limit: 30
      })
      .subscribe(res => {
        expect(res.items[0].delivery_title).toBe('Cliente Manager');
        expect(res.items[0].on_time_pct).toBe(82);
        expect(res.total).toBe(1);
        done();
      });
    const req = httpMock.expectOne(
      r =>
        r.url === `${baseUrl}/game/reports/management/finished/deliveries/cached` &&
        r.params.get('month') === '2026-05' &&
        r.params.get('offset') === '0' &&
        r.params.get('limit') === '30' &&
        r.params.get('email') == null &&
        r.params.get('team_id') == null &&
        r.params.get('user_id') == null
    );
    req.flush({
      refreshed_at: '2026-05-20T12:00:00.000Z',
      offset: 0,
      limit: 30,
      total: 1,
      items: [
        {
          delivery_title: 'Cliente Manager',
          on_time_pct: 82,
          tasks_total: 12,
          tasks_on_time: 10
        }
      ]
    });
  });

  it('getGameReportsManagementFinishedDeliveriesCached forwards user_id (ADMIN/SERVICE)', done => {
    service
      .getGameReportsManagementFinishedDeliveriesCached({
        month: '2026-05',
        user_id: 'mgr-uuid-1'
      })
      .subscribe(() => done());
    const req = httpMock.expectOne(
      r =>
        r.url === `${baseUrl}/game/reports/management/finished/deliveries/cached` &&
        r.params.get('month') === '2026-05' &&
        r.params.get('user_id') === 'mgr-uuid-1'
    );
    req.flush({ offset: 0, limit: 30, items: [] });
  });

  it('getGameReportsGoalMonthSummary builds dt_prazo params', done => {
    service
      .getGameReportsGoalMonthSummary({
        email: 'u@example.com',
        dt_prazo_start: '2026-04-01',
        dt_prazo_end: '2026-05-01'
      })
      .subscribe(res => {
        expect(res.points_sum).toBe(100);
        done();
      });
    const req = httpMock.expectOne(`${baseUrl}/game/reports/goal/month/summary`);
    expect(req.request.params.get('dt_prazo_start')).toBe('2026-04-01');
    expect(req.request.params.get('dt_prazo_end')).toBe('2026-05-01');
    req.flush({ points_sum: 100 });
  });
});
