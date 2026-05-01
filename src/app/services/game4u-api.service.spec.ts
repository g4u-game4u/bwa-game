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

  it('getGameReportsFinishedActionsByDelivery passes delivery_title and pagination', done => {
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
    expect(req.request.params.get('offset')).toBe('0');
    expect(req.request.params.get('limit')).toBe('10');
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

  it('getGameReportsUserActions passes email, status list, finished_at pair, pagination', done => {
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
    expect(req.request.params.get('offset')).toBe('0');
    expect(req.request.params.get('limit')).toBe('25');
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
