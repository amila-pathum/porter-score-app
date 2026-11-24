import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PorterApi } from '../../../core/api/porter-api';
import { toProblem } from '../../../core/api/problem';
import { ToastService } from '../../../core/ui/toast.service';
import { defaultGameName, duration, joinNames, longDate, time } from '../../../core/util/format';
import { Avatar, RankMarker } from '../../../shared/ui/game-bits';
import { Icon } from '../../../shared/ui/icon';
import { ErrorState, Skeleton } from '../../../shared/ui/states';
import { GameStore, screenFor } from '../shared/game-store';

/** Final results: winner(s), standings, summary and deal-by-deal breakdown. Calm, not celebratory. */
@Component({
  selector: 'p-results-page',
  imports: [RouterLink, CdkMenuTrigger, CdkMenu, CdkMenuItem, Avatar, RankMarker, Icon, ErrorState, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page pt-2 md:pt-6">
      <header class="-ml-2 mb-2 flex min-h-14 items-center gap-1">
        <a routerLink="/games" class="icon-btn" aria-label="Back to games"><p-icon name="back" /></a>
        <nav aria-label="Breadcrumb" class="t-small flex-1 text-ink-muted"><a routerLink="/games" class="text-ink-muted">Games</a> / Results</nav>
        @if (game()) {
          <button type="button" class="icon-btn" [cdkMenuTriggerFor]="menu" aria-label="Game options"><p-icon name="more" /></button>
        }
      </header>
      <ng-template #menu>
        <div cdkMenu class="min-w-52 rounded-lg border border-border bg-surface p-1 shadow-[var(--shadow-2)]">
          <a cdkMenuItem [routerLink]="['/games', id(), 'progress']" class="flex h-10 items-center gap-2 rounded-md px-3 text-ink no-underline hover:bg-surface-muted focus:bg-surface-muted">
            <p-icon name="edit" [size]="18" />Edit a deal</a>
        </div>
      </ng-template>

      @if (store.error() && !game()) {
        <p-error-state title="Couldn't load results" [problem]="store.error()" (retry)="store.reload()" />
      } @else if (!game()) {
        <p-skeleton />
      } @else if (game(); as g) {
        <div class="mb-6 flex flex-wrap items-end gap-4">
          <div class="flex flex-1 flex-col gap-1.5">
            <span class="badge badge-completed self-start">Completed · {{ g.completedDeals }} of {{ g.dealsPerGame }} deals</span>
            <h1 class="h-page" data-testid="results-title">{{ completed() ? 'Game complete' : g.name }}</h1>
            @if (completed()) { <p class="text-ink-muted">{{ g.name }}</p> }
          </div>
          <div class="flex flex-wrap gap-2">
            <a routerLink="/dashboard" class="btn btn-secondary">Dashboard</a>
            <button type="button" class="btn btn-primary" [class.is-busy]="replaying()" [disabled]="replaying()" (click)="playAgain()">
              {{ replaying() ? 'Starting…' : 'Play again' }}</button>
          </div>
        </div>

        <div class="mb-8 grid gap-4 lg:grid-cols-[1.2fr_1fr_0.8fr]">
          <section class="card flex items-center gap-4 border-amber-border bg-[#FFFDF8] p-5 md:p-7" aria-labelledby="winner-heading" data-testid="winner">
            <div class="flex">
              @for (w of winners(); track w.playerId; let first = $first) {
                <span class="rounded-full ring-2 ring-[#FFFDF8]" [class.-ml-4]="!first"><p-avatar [name]="w.name" [color]="w.avatarColor" size="xl" /></span>
              }
            </div>
            <div class="flex min-w-0 flex-1 flex-col">
              <h2 id="winner-heading" class="t-caption !text-amber-ink">{{ winners().length > 1 ? 'Joint winners' : 'Winner' }}</h2>
              <span class="text-[24px] leading-8 font-medium md:text-[28px] md:leading-9">{{ winnerNames() }}</span>
              <span class="t-small text-ink-muted">Lowest total after {{ g.dealsPerGame }} deals{{ winners().length > 1 ? ', tied' : '' }}</span>
            </div>
            <div class="flex flex-col items-end"><span class="t-display">{{ winners()[0]?.total }}</span><span class="t-small text-ink-muted">points</span></div>
          </section>

          <section class="card py-1" aria-labelledby="final-heading">
            <h2 id="final-heading" class="sr-only">Final standings</h2>
            <ol>
              @for (s of g.standings; track s.playerId) {
                <li class="row-item">
                  <p-rank [rank]="s.rank" [tied]="s.isTied" />
                  <p-avatar [name]="s.name" [color]="s.avatarColor" size="sm" />
                  <span class="flex-1" [class.font-medium]="s.rank === 1">{{ s.name }}</span>
                  @if (s.behindLeader > 0) { <span class="t-small tnum mr-2 text-ink-muted">+{{ s.behindLeader }}</span> }
                  <span class="t-score">{{ s.total }}</span>
                </li>
              }
            </ol>
          </section>

          <section class="panel flex flex-col gap-3 p-5" aria-labelledby="sum-heading">
            <h2 id="sum-heading" class="h-card">Summary</h2>
            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[14px]">
              <dt class="text-ink-muted">Date</dt><dd>{{ playedOn() }}</dd>
              @if (gameDuration()) { <dt class="text-ink-muted">Duration</dt><dd>{{ gameDuration() }}</dd> }
              <dt class="text-ink-muted">Finished</dt><dd>{{ finishedAt() }}</dd>
              <dt class="text-ink-muted">Deals</dt><dd class="tnum">{{ g.completedDeals }}</dd>
              <dt class="text-ink-muted">Players</dt><dd class="tnum">{{ g.players.length }}</dd>
            </dl>
          </section>
        </div>

        <section aria-labelledby="breakdown-heading" id="breakdown">
          <div class="mb-3 flex flex-wrap items-center gap-3">
            <h2 id="breakdown-heading" class="h-section flex-1">Score breakdown</h2>
            <div class="seg w-64" role="radiogroup" aria-label="Breakdown view">
              <button type="button" role="radio" class="seg-item" [attr.aria-checked]="!running()" [class.on]="!running()" (click)="running.set(false)">Per deal</button>
              <button type="button" role="radio" class="seg-item" [attr.aria-checked]="running()" [class.on]="running()" (click)="running.set(true)">Running total</button>
            </div>
          </div>

          <!-- Desktop: players as rows, 13 deal columns -->
          <div class="table-box hidden lg:block">
            <table class="tbl">
              <caption class="sr-only">Score breakdown, {{ running() ? 'running totals' : 'per deal' }}</caption>
              <thead><tr><th scope="col">Player</th>
                @for (d of g.deals; track d.number) { <th scope="col" class="num">{{ d.number }}</th> }
                <th scope="col" class="num !bg-surface-sunken">Total</th></tr></thead>
              <tbody>
                @for (row of byPlayer(); track row.playerId) {
                  <tr>
                    <th scope="row" class="!bg-transparent !text-[14px] !tracking-normal !normal-case !text-ink" [class.!font-medium]="row.rank === 1">
                      <span class="flex items-center gap-2"><p-rank [rank]="row.rank" [tied]="row.isTied" [px]="24" />{{ row.name }}</span></th>
                    @for (c of row.cells; track $index) { <td class="num" [class.zero]="!running() && c === 0">{{ c }}</td> }
                    <td class="num font-medium" [class]="row.rank === 1 ? '!bg-amber-soft !text-amber-ink' : '!bg-surface-muted'">{{ row.total }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Mobile & tablet: deals as rows, players (by rank) as columns -->
          <div class="table-box lg:hidden">
            <table class="tbl">
              <caption class="sr-only">Score breakdown by deal</caption>
              <thead><tr><th scope="col">Deal</th>
                @for (s of g.standings; track s.playerId) { <th scope="col" class="num !px-2" [attr.title]="s.name">{{ short(s.name) }}</th> }</tr></thead>
              <tbody>
                @for (d of g.deals; track d.number; let di = $index) {
                  <tr><th scope="row" class="!bg-transparent !py-1.5 text-left !text-[14px] !font-normal !tracking-normal !text-ink">{{ d.number }}</th>
                    @for (s of g.standings; track s.playerId) {
                      <td class="num !px-2 !py-1.5" [class.zero]="!running() && cell(s.playerId, di) === 0">{{ cell(s.playerId, di) }}</td>
                    }</tr>
                }
                <tr class="total"><th scope="row" class="!bg-transparent text-left !text-[14px] !tracking-normal !normal-case !text-ink">Total</th>
                  @for (s of g.standings; track s.playerId) { <td class="num !px-2" [class.!bg-amber-soft]="s.rank === 1">{{ s.total }}</td> }</tr>
                <tr><th scope="row" class="t-small !bg-transparent text-left !font-normal !tracking-normal !normal-case">Rank</th>
                  @for (s of g.standings; track s.playerId) { <td class="num !px-2" [class.font-medium]="s.rank === 1">{{ s.rank }}</td> }</tr>
              </tbody>
            </table>
          </div>
          <p class="t-small mt-2 text-ink-muted">Bold green = 0 for that deal. Results are read-only; use “Edit a deal” in the menu to correct a mistake.</p>
        </section>
      }
    </div>
  `,
})
export class ResultsPage {
  protected readonly store = inject(GameStore);
  private readonly api = inject(PorterApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  readonly id = input.required<string>();
  /** Set when arriving straight from saving Deal 13. */
  readonly completed = input(false, { transform: (v: unknown) => v === '1' || v === 1 || v === true });

  protected readonly running = signal(false);
  protected readonly replaying = signal(false);

  protected readonly game = computed(() => {
    const g = this.store.game();
    return g && g.id === this.id() && g.status === 'completed' ? g : null;
  });
  protected readonly winners = computed(() => this.game()?.standings.filter((s) => s.rank === 1) ?? []);
  protected readonly winnerNames = computed(() => joinNames(this.winners().map((w) => w.name)));
  protected readonly playedOn = computed(() => (this.game()?.startedAt ? longDate(new Date(this.game()!.startedAt!)) : ''));
  protected readonly finishedAt = computed(() => (this.game()?.completedAt ? time(this.game()!.completedAt!) : ''));
  protected readonly gameDuration = computed(() => duration(this.game()?.startedAt ?? null, this.game()?.completedAt ?? null));

  protected readonly byPlayer = computed(() => {
    const g = this.game();
    if (!g) return [];
    return g.standings.map((s) => {
      const seat = g.players.findIndex((p) => p.playerId === s.playerId);
      let acc = 0;
      const cells = g.deals.map((d) => (this.running() ? (acc += d.scores[seat].score) : d.scores[seat].score));
      return { ...s, cells };
    });
  });

  constructor() {
    effect(() => this.store.load(this.id()));
    effect(() => {
      const g = this.store.game();
      if (g && g.id === this.id() && g.status !== 'completed') void this.router.navigate(['/games', g.id, screenFor(g)], { replaceUrl: true });
    });
  }

  protected short(name: string): string {
    return name.length > 6 ? `${name.slice(0, 5)}.` : name;
  }

  protected cell(playerId: string, dealIndex: number): number {
    const g = this.game()!;
    const seat = g.players.findIndex((p) => p.playerId === playerId);
    if (!this.running()) return g.deals[dealIndex].scores[seat].score;
    return g.deals.slice(0, dealIndex + 1).reduce((sum, d) => sum + d.scores[seat].score, 0);
  }

  protected playAgain(): void {
    const g = this.game();
    if (!g) return;
    this.replaying.set(true);
    this.api.createGame({ id: crypto.randomUUID(), name: defaultGameName(), playerIds: g.players.map((p) => p.playerId), start: true }).subscribe({
      next: (created) => {
        this.store.set(created);
        void this.router.navigate(['/games', created.id, 'play']);
      },
      error: (e: unknown) => {
        this.replaying.set(false);
        this.toasts.error(toProblem(e).detail);
      },
    });
  }
}

/** `/games/:id`: sends the user to setup, play or results depending on the game's status. */
@Component({
  selector: 'p-game-redirect',
  imports: [ErrorState, Skeleton, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      @if (store.error()) {
        <p-error-state [problem]="store.error()" (retry)="store.reload()">
          <a routerLink="/games" class="btn btn-secondary btn-sm">Go to your games</a>
        </p-error-state>
      } @else {
        <p-skeleton />
      }
    </div>
  `,
})
export class GameRedirectPage {
  protected readonly store = inject(GameStore);
  private readonly router = inject(Router);
  readonly id = input.required<string>();

  constructor() {
    effect(() => this.store.load(this.id()));
    effect(() => {
      const g = this.store.game();
      if (g && g.id === this.id()) void this.router.navigate(['/games', g.id, screenFor(g)], { replaceUrl: true });
    });
  }
}
