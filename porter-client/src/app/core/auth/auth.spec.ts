import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authGuard, guestGuard } from './auth.guards';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const user = { id: 'u1', email: 'k@test.local', displayName: 'Kasun', mePlayerId: null };
const auth = (token: string) => ({ accessToken: token, expiresAt: '2099-01-01T00:00:00Z', user });

describe('AuthService + authInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let service: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    service = TestBed.inject(AuthService);
  });

  async function login(token = 'T1') {
    const done = firstValueFrom(service.login('k@test.local', 'Password1', true));
    ctrl.expectOne('/api/auth/login').flush(auth(token));
    await done;
  }

  it('keeps the access token in memory and attaches it to API calls', async () => {
    await login('T1');
    expect(service.isAuthenticated()).toBe(true);
    expect(localStorage.getItem('accessToken')).toBeNull();

    const req = firstValueFrom(http.get('/api/games'));
    const call = ctrl.expectOne('/api/games');
    expect(call.request.headers.get('Authorization')).toBe('Bearer T1');
    call.flush({ ok: true });
    await req;
  });

  it('never sends the bearer token to auth endpoints', async () => {
    await login();
    const p = firstValueFrom(service.forgotPassword('k@test.local'));
    const call = ctrl.expectOne('/api/auth/forgot-password');
    expect(call.request.headers.has('Authorization')).toBe(false);
    call.flush(null);
    await p;
  });

  it('on 401 refreshes once and retries with the new token', async () => {
    await login('OLD');
    const result = firstValueFrom(http.get<{ ok: boolean }>('/api/games'));

    ctrl.expectOne('/api/games').flush(null, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne('/api/auth/refresh').flush(auth('NEW'));
    const retry = ctrl.expectOne('/api/games');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer NEW');
    retry.flush({ ok: true });

    expect(await result).toEqual({ ok: true });
  });

  it('concurrent 401s share a single refresh request', async () => {
    await login('OLD');
    const a = firstValueFrom(http.get('/api/a'));
    const b = firstValueFrom(http.get('/api/b'));
    ctrl.expectOne('/api/a').flush(null, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne('/api/b').flush(null, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne('/api/auth/refresh').flush(auth('NEW'));
    ctrl.expectOne('/api/a').flush({});
    ctrl.expectOne('/api/b').flush({});
    await Promise.all([a, b]);
    ctrl.verify();
  });

  it('when refresh fails, the session ends and the user goes to login with a return URL', async () => {
    await login('OLD');
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const result = firstValueFrom(http.get('/api/games')).catch((e) => e);
    ctrl.expectOne('/api/games').flush(null, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne('/api/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect((await result).status).toBe(401);
    expect(service.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login'], expect.objectContaining({ queryParams: expect.objectContaining({ reason: 'expired' }) }));
  });

  it('restoreSession without a cookie leaves the user anonymous', async () => {
    const p = service.restoreSession();
    ctrl.expectOne('/api/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });
    await p;
    expect(service.status()).toBe('anonymous');
  });
});

describe('route guards', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
  });

  it('authGuard redirects anonymous users to login with returnUrl', () => {
    const result = TestBed.runInInjectionContext(() => authGuard({} as never, { url: '/games/1/play' } as never));
    expect(TestBed.inject(Router).serializeUrl(result as never)).toBe('/login?returnUrl=%2Fgames%2F1%2Fplay');
  });

  it('guestGuard lets anonymous users see login', () => {
    expect(TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never))).toBe(true);
  });
});
