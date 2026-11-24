import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, firstValueFrom, map, of, shareReplay, tap } from 'rxjs';
import { Account, AuthResponse } from '../api/models';

export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

/**
 * Session state. The access token lives only in memory; the refresh token is an HttpOnly cookie the
 * browser sends to /api/auth/refresh. A page reload restores the session through that refresh call.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly accessToken = signal<string | null>(null);
  private readonly _user = signal<Account | null>(null);
  private readonly _status = signal<AuthStatus>('unknown');
  private refreshInFlight: Observable<string | null> | null = null;

  readonly user = this._user.asReadonly();
  readonly status = this._status.asReadonly();
  readonly isAuthenticated = computed(() => this._status() === 'authenticated');

  token(): string | null {
    return this.accessToken();
  }

  /** Called once at startup: restores a session from the refresh cookie if one exists. */
  async restoreSession(): Promise<void> {
    await firstValueFrom(this.refresh());
  }

  login(email: string, password: string, rememberMe: boolean): Observable<Account> {
    return this.http
      .post<AuthResponse>('/api/auth/login', { email, password, rememberMe })
      .pipe(map((res) => this.accept(res)));
  }

  register(displayName: string, email: string, password: string): Observable<Account> {
    return this.http
      .post<AuthResponse>('/api/auth/register', { displayName, email, password })
      .pipe(map((res) => this.accept(res)));
  }

  forgotPassword(email: string): Observable<void> {
    return this.http.post<void>('/api/auth/forgot-password', { email });
  }

  resetPassword(email: string, token: string, password: string): Observable<void> {
    return this.http.post<void>('/api/auth/reset-password', { email, token, password });
  }

  /**
   * Exchanges the refresh cookie for a new access token. Concurrent callers share one request, so a burst
   * of 401s triggers a single refresh (refresh tokens rotate, and reusing one revokes the session).
   */
  refresh(): Observable<string | null> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.http.post<AuthResponse>('/api/auth/refresh', {}).pipe(
        map((res) => {
          this.accept(res);
          return res.accessToken;
        }),
        catchError(() => {
          this.clear();
          return of(null);
        }),
        finalize(() => (this.refreshInFlight = null)),
        shareReplay(1),
      );
    }
    return this.refreshInFlight;
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', {}).pipe(
      catchError(() => of(undefined)),
      tap(() => {
        this.clear();
        void this.router.navigateByUrl('/login');
      }),
      map(() => undefined),
    );
  }

  /** The refresh token is gone or expired: send the user to login and come back afterwards. */
  expireSession(returnUrl: string): void {
    this.clear();
    void this.router.navigate(['/login'], { queryParams: { returnUrl, reason: 'expired' } });
  }

  updateUser(account: Account): void {
    this._user.set(account);
  }

  /** Clears local session state without calling the API (used after account deletion). */
  clear(): void {
    this.accessToken.set(null);
    this._user.set(null);
    this._status.set('anonymous');
  }

  private accept(res: AuthResponse): Account {
    this.accessToken.set(res.accessToken);
    this._user.set(res.user);
    this._status.set('authenticated');
    return res.user;
  }
}
