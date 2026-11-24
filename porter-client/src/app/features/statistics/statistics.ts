import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MyStats, Player } from '../../core/api/models';
import { PorterApi } from '../../core/api/porter-api';
import { ApiProblem, toProblem } from '../../core/api/problem';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/ui/toast.service';
import { Avatar } from '../../shared/ui/game-bits';
import { EmptyState, ErrorState, Skeleton } from '../../shared/ui/states';
import { PlayerStatsView } from '../players/player-stats-view';

/** The signed-in user's statistics, via the player they've marked as "This is me". */
@Component({
  selector: 'p-statistics-page',
  imports: [FormsModule, RouterLink, Avatar, EmptyState, ErrorState, Skeleton, PlayerStatsView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <h1 class="h-page mb-1">Statistics</h1>
      @if (problem()) {
        <p-error-state [problem]="problem()" (retry)="load()" />
      } @else if (!data()) {
        <p-skeleton />
      } @else if (data()!.mePlayer && data()!.stats; as stats) {
        <p class="t-small mb-5 flex items-center gap-2 text-ink-muted">
          <p-avatar [name]="data()!.mePlayer!.name" [color]="data()!.mePlayer!.avatarColor" size="sm" />
          As {{ data()!.mePlayer!.name }} · completed games only ·
          <a routerLink="/profile" class="font-medium">Change</a></p>
        @if (stats.gamesPlayed === 0) {
          <p-empty-state title="Statistics start after your first game" body="Finish a game to see wins, averages and trends." icon="chart">
            <a routerLink="/games/new" class="btn btn-primary btn-sm">Start a game</a>
          </p-empty-state>
        } @else {
          <p-player-stats-view [stats]="stats" />
        }
      } @else {
        <div class="card mt-4 flex max-w-lg flex-col gap-4 p-5">
          <div><h2 class="h-card">Which player is you?</h2>
            <p class="t-small mt-1 text-ink-muted">Porter tracks players, not accounts. Pick the player you play as and your statistics will appear here.</p></div>
          @if (players().length) {
            <div class="field">
              <label class="label" for="me-player">This is me</label>
              <select id="me-player" class="input" [(ngModel)]="choice">
                <option value="" disabled>Choose a player</option>
                @for (p of players(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
              </select>
            </div>
            <button type="button" class="btn btn-primary self-start" [disabled]="!choice || saving()" (click)="link()">{{ saving() ? 'Saving…' : 'Show my statistics' }}</button>
          } @else {
            <a routerLink="/players" class="btn btn-primary self-start">Add yourself as a player</a>
          }
        </div>
      }
    </div>
  `,
})
export class StatisticsPage {
  private readonly api = inject(PorterApi);
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(ToastService);

  protected readonly data = signal<MyStats | null>(null);
  protected readonly problem = signal<ApiProblem | null>(null);
  protected readonly players = signal<Player[]>([]);
  protected readonly saving = signal(false);
  protected choice = '';

  constructor() {
    this.load();
  }

  load(): void {
    this.problem.set(null);
    this.api.myStats().subscribe({
      next: (d) => {
        this.data.set(d);
        if (!d.mePlayer) this.api.listPlayers().subscribe((p) => this.players.set(p));
      },
      error: (e: unknown) => this.problem.set(toProblem(e)),
    });
  }

  protected link(): void {
    this.saving.set(true);
    this.api.updateAccount({ mePlayerId: this.choice }).subscribe({
      next: (account) => {
        this.auth.updateUser(account);
        this.saving.set(false);
        this.load();
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.toasts.error(toProblem(e).detail);
      },
    });
  }
}
