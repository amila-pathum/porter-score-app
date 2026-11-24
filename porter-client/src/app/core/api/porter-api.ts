import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Account,
  AvatarColor,
  Dashboard,
  GameList,
  GameListQuery,
  GameState,
  MyStats,
  Player,
  PlayerStats,
  SaveDealResult,
} from './models';

/** Typed HTTP client for the Porter REST API. All paths are same-origin (`/api`). */
@Injectable({ providedIn: 'root' })
export class PorterApi {
  private readonly http = inject(HttpClient);

  // Dashboard & statistics
  dashboard(): Observable<Dashboard> {
    return this.http.get<Dashboard>('/api/dashboard');
  }

  myStats(): Observable<MyStats> {
    return this.http.get<MyStats>('/api/statistics/me');
  }

  // Games
  listGames(query: GameListQuery): Observable<GameList> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<GameList>('/api/games', { params });
  }

  getGame(id: string): Observable<GameState> {
    return this.http.get<GameState>(`/api/games/${id}`);
  }

  createGame(body: { id: string; name: string | null; playerIds: string[]; start: boolean }): Observable<GameState> {
    return this.http.post<GameState>('/api/games', body);
  }

  updateGame(id: string, body: { name?: string; playerIds?: string[]; expectedVersion?: string }): Observable<GameState> {
    return this.http.patch<GameState>(`/api/games/${id}`, body);
  }

  startGame(id: string): Observable<GameState> {
    return this.http.post<GameState>(`/api/games/${id}/start`, {});
  }

  deleteGame(id: string): Observable<void> {
    return this.http.delete<void>(`/api/games/${id}`);
  }

  saveDeal(
    gameId: string,
    dealNumber: number,
    scores: { playerId: string; score: number }[],
    expectedVersion: string,
  ): Observable<SaveDealResult> {
    return this.http.put<SaveDealResult>(`/api/games/${gameId}/deals/${dealNumber}`, { scores, expectedVersion });
  }

  // Players
  listPlayers(q?: string): Observable<Player[]> {
    const params = q ? new HttpParams().set('q', q) : undefined;
    return this.http.get<Player[]>('/api/players', { params });
  }

  getPlayer(id: string): Observable<Player> {
    return this.http.get<Player>(`/api/players/${id}`);
  }

  playerStats(id: string): Observable<PlayerStats> {
    return this.http.get<PlayerStats>(`/api/players/${id}/stats`);
  }

  createPlayer(body: { id?: string; name: string; avatarColor?: AvatarColor }): Observable<Player> {
    return this.http.post<Player>('/api/players', body);
  }

  updatePlayer(id: string, body: { name?: string; avatarColor?: AvatarColor }): Observable<Player> {
    return this.http.patch<Player>(`/api/players/${id}`, body);
  }

  deletePlayer(id: string): Observable<void> {
    return this.http.delete<void>(`/api/players/${id}`);
  }

  // Account
  account(): Observable<Account> {
    return this.http.get<Account>('/api/account');
  }

  updateAccount(body: { displayName?: string; mePlayerId?: string; clearMePlayer?: boolean }): Observable<Account> {
    return this.http.patch<Account>('/api/account', body);
  }

  changePassword(body: { currentPassword: string; newPassword: string }): Observable<void> {
    return this.http.post<void>('/api/account/change-password', body);
  }

  deleteAccount(password: string): Observable<void> {
    return this.http.post<void>('/api/account/delete', { password });
  }
}
