import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Player, PlayerStats } from '../../core/api/models';
import { PorterApi } from '../../core/api/porter-api';
import { ApiProblem, toProblem } from '../../core/api/problem';
import { AuthService } from '../../core/auth/auth.service';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';
import { shortDate } from '../../core/util/format';
import { Avatar } from '../../shared/ui/game-bits';
import { Icon } from '../../shared/ui/icon';
import { EmptyState, ErrorState, Skeleton } from '../../shared/ui/states';
import { PlayerFormLauncher } from './player-form-dialog';
import { PlayerStatsView } from './player-stats-view';

@Component({
  selector: 'p-players-page',
  imports: [FormsModule, RouterLink, Avatar, Icon, EmptyState, ErrorState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="mb-4 flex items-center gap-3">
        <div class="flex flex-1 flex-col"><h1 class="h-page">Players</h1>
          <p class="t-small hidden text-ink-muted md:block">The people you keep score for. They don't need accounts.</p></div>
        <button type="button" class="btn btn-primary btn-sm md:h-11 md:px-4" (click)="add()"><p-icon name="plus" [size]="18" />New player</button>
      </div>

      @if (problem()) {
        <p-error-state [problem]="problem()" (retry)="load()" />
      } @else if (!players()) {
        <div class="flex flex-col gap-2" aria-busy="true"><span class="sr-only">Loading players…</span>
          @for (i of [1, 2, 3, 4]; track i) { <div class="skel h-14 w-full"></div> }</div>
      } @else if (!players()!.length) {
        <p-empty-state title="No players yet" body="Add the people you usually play with. You can also add them while creating a game." icon="users">
          <button type="button" class="btn btn-primary btn-sm" (click)="add()">Add a player</button>
        </p-empty-state>
      } @else {
        <div class="relative mb-3 md:max-w-sm">
          <span class="pointer-events-none absolute top-3 left-3 text-ink-muted"><p-icon name="search" /></span>
          <input type="search" class="input pl-10" placeholder="Search players" aria-label="Search players" [ngModel]="q()" (ngModelChange)="q.set($event)" />
        </div>
        <p class="t-small mb-2 text-ink-muted" aria-live="polite">{{ filtered().length }} {{ filtered().length === 1 ? 'player' : 'players' }} · sorted by games played</p>
        @if (!filtered().length) {
          <p-empty-state [title]="'No players match “' + q() + '”'" icon="search">
            <button type="button" class="btn btn-ghost btn-sm" (click)="q.set('')">Clear search</button>
          </p-empty-state>
        } @else {
          <ul class="list md:grid md:grid-cols-2 md:gap-px md:bg-border lg:grid-cols-3">
            @for (p of filtered(); track p.id) {
              <li class="md:bg-surface"><a [routerLink]="['/players', p.id]" class="row-item md:!border-0">
                <p-avatar [name]="p.name" [color]="p.avatarColor" />
                <div class="flex min-w-0 flex-1 flex-col">
                  <span class="truncate font-medium">{{ p.name }} @if (p.isMe) { <span class="badge badge-draft badge-plain ml-1 h-5">You</span> }</span>
                  <span class="t-small tnum text-ink-muted">{{ p.gamesPlayed }} {{ p.gamesPlayed === 1 ? 'game' : 'games' }} · {{ p.wins }} {{ p.wins === 1 ? 'win' : 'wins' }}</span>
                </div>
                <p-icon name="next" class="text-ink-muted" /></a></li>
            }
          </ul>
        }
      }
    </div>
  `,
})
export class PlayersPage implements OnInit {
  private readonly api = inject(PorterApi);
  private readonly launcher = inject(PlayerFormLauncher);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);

  /** `/players/new` opens the add dialog over the list. */
  readonly openNew = input(false);

  protected readonly players = signal<Player[] | null>(null);
  protected readonly problem = signal<ApiProblem | null>(null);
  protected readonly q = signal('');
  protected readonly filtered = computed(() => {
    const q = this.q().trim().toLowerCase();
    return (this.players() ?? []).filter((p) => !q || p.name.toLowerCase().includes(q));
  });

  constructor() {
    this.load();
  }

  ngOnInit(): void {
    if (this.openNew()) this.add(true);
  }

  load(): void {
    this.problem.set(null);
    this.api.listPlayers().subscribe({ next: (p) => this.players.set(p), error: (e: unknown) => this.problem.set(toProblem(e)) });
  }

  protected add(fromRoute = false): void {
    this.launcher.open().subscribe((player) => {
      if (fromRoute) void this.router.navigateByUrl('/players', { replaceUrl: true });
      if (!player) return;
      this.toasts.success(`${player.name} added`);
      this.load();
    });
  }
}

@Component({
  selector: 'p-player-profile-page',
  imports: [RouterLink, Avatar, Icon, ErrorState, Skeleton, PlayerStatsView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page pt-2 md:pt-6">
      <header class="-ml-2 mb-2 flex min-h-14 items-center gap-1">
        <a routerLink="/players" class="icon-btn" aria-label="Back to players"><p-icon name="back" /></a>
        <nav aria-label="Breadcrumb" class="t-small flex-1 text-ink-muted"><a routerLink="/players" class="text-ink-muted">Players</a></nav>
      </header>
      @if (problem()) {
        <p-error-state [problem]="problem()" (retry)="load()"><a routerLink="/players" class="btn btn-secondary btn-sm">All players</a></p-error-state>
      } @else if (!player()) {
        <p-skeleton />
      } @else if (player(); as p) {
        <div class="mb-6 flex flex-wrap items-center gap-4">
          <p-avatar [name]="p.name" [color]="p.avatarColor" size="xl" />
          <div class="flex min-w-0 flex-1 flex-col">
            <h1 class="h-page">{{ p.name }} @if (p.isMe) { <span class="badge badge-draft badge-plain ml-1 align-middle">You</span> }</h1>
            <p class="t-small text-ink-muted">Player since {{ shortDate(p.createdAt) }}</p>
          </div>
          <div class="flex flex-wrap gap-2">
            @if (!p.isMe) { <button type="button" class="btn btn-ghost btn-sm" (click)="setMe()">This is me</button> }
            <button type="button" class="btn btn-secondary btn-sm" (click)="edit()"><p-icon name="edit" [size]="16" />Edit</button>
            @if (p.canDelete) {
              <button type="button" class="btn btn-danger-outline btn-sm" (click)="remove()"><p-icon name="trash" [size]="16" />Delete</button>
            }
          </div>
        </div>
        @if (stats(); as s) {
          @if (s.gamesPlayed === 0) {
            <div class="card t-small mb-4 px-4 py-5 text-ink-muted">No completed games yet. Statistics appear after {{ p.name }} finishes a game.</div>
          }
          <p-player-stats-view [stats]="s" />
        } @else {
          <div class="skel h-24 w-full"></div>
        }
        @if (!p.canDelete) {
          <p class="t-small mt-6 text-ink-muted">{{ p.name }} is part of saved games, so they can be renamed but not deleted.</p>
        }
      }
    </div>
  `,
})
export class PlayerProfilePage {
  private readonly api = inject(PorterApi);
  private readonly launcher = inject(PlayerFormLauncher);
  private readonly confirm = inject(ConfirmService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly id = input.required<string>();
  protected readonly shortDate = shortDate;
  protected readonly player = signal<Player | null>(null);
  protected readonly stats = signal<PlayerStats | null>(null);
  protected readonly problem = signal<ApiProblem | null>(null);

  constructor() {
    // Reload when navigating from one profile to another (the component is reused).
    effect(() => {
      this.id();
      untracked(() => {
        this.player.set(null);
        this.stats.set(null);
        this.load();
      });
    });
  }

  load(): void {
    this.problem.set(null);
    this.api.getPlayer(this.id()).subscribe({ next: (p) => this.player.set(p), error: (e: unknown) => this.problem.set(toProblem(e)) });
    this.api.playerStats(this.id()).subscribe({ next: (s) => this.stats.set(s), error: () => undefined });
  }

  protected edit(): void {
    const p = this.player();
    if (!p) return;
    this.launcher.open(p).subscribe((updated) => {
      if (updated) {
        this.player.set(updated);
        this.toasts.success('Player updated');
      }
    });
  }

  protected setMe(): void {
    this.api.updateAccount({ mePlayerId: this.id() }).subscribe({
      next: (account) => {
        this.auth.updateUser(account);
        this.player.update((p) => (p ? { ...p, isMe: true } : p));
        this.toasts.success(`Your statistics now follow ${this.player()?.name}`);
      },
      error: (e: unknown) => this.toasts.error(toProblem(e).detail),
    });
  }

  protected remove(): void {
    const p = this.player();
    if (!p) return;
    this.confirm.ask({ title: `Delete ${p.name}?`, body: `${p.name} hasn't played any games. This can't be undone.`, confirmLabel: 'Delete player', destructive: true })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.deletePlayer(p.id).subscribe({
          next: () => {
            this.toasts.success(`${p.name} deleted`);
            void this.router.navigateByUrl('/players');
          },
          error: (e: unknown) => this.toasts.error(toProblem(e).detail),
        });
      });
  }
}
