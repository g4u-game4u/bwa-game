import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Game4uApiService } from './game4u-api.service';
import { environment } from '../../environments/environment';

describe('Game4uApiService', () => {
  let service: Game4uApiService;
  let httpMock: HttpTestingController;
  let baseUrl: string;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [Game4uApiService]
    });
    service = TestBed.inject(Game4uApiService);
    httpMock = TestBed.inject(HttpTestingController);
    baseUrl = (environment.game4uApiUrl || '').replace(/\/$/, '');
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
});
