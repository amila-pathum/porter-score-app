import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Activity, Dashboard, GameSummary } from '../../core/api/models';
import { PorterApi } from '../../core/api/porter-api';
import { ApiProblem, toProblem } from '../../core/api/problem';
import { AuthService } from '../../core/auth/auth.service';
import { greeting, joinNames, longDate, relativeTime, shortDate } from '../../core/util/format';
import { AvatarGroup, DealProgress, StatusBadge } from '../../shared/ui/game-bits';
import { Icon, IconName, Logo } from '../../shared/ui/icon';
import { ErrorState } from '../../shared/ui/states';

/**
 * Home. New users get a short explainer and one action; returning users see the game in progress first,
 * then their record, recent games and activity. All numbers come from the API.
 */
@Component({
  selector: 'p-dashboard-page',
  imports: [RouterLink, Icon, Logo, AvatarGroup, DealProgress, StatusBadge, ErrorState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="mb-2 flex items-center md:hidden"><p-logo /><span class="flex-1"></span>
        <a routerLink="/games/new" class="icon-btn" aria-label="New game"><p-icon name="plus" /></a></div>

      @if (problem()) {
        <p-error-state [problem]="problem()" (retry)="load()" />
      } @else if (!data()) {
        <div class="flex flex-col gap-4" aria-busy="true"><span class="sr-only">Loading your dashboard…</span>
          <div class="skel h-8 w-64"></div><div class="skel h-44 w-full"></div><div class="skel h-24 w-full"></div></div>
      } @else if (data(); as d) {
        @if (isNew()) {
          <section class="mx-auto flex max-w-xl flex-col gap-6 md:pt-6" aria-labelledby="welcome">
            <div class="flex flex-col gap-1.5">
              <h1 id="welcome" class="h-page">Welcome, {{ name() }}</h1>
              <p class="text-ink-muted">Porter is your score sheet for Porter nights. You play the cards; Porter adds up the scores.</p>
            </div>
            <ol class="card flex flex-col bg-[#FFFEFA] px-5 py-2">
              @for (s of steps; track s.n) {
                <li class="flex items-center gap-3 border-b border-dashed border-border py-2.5 last:border-0">
                  <span class="rank" [class]="s.n === '13' ? 'first' : '!bg-primary-soft !text-primary'">{{ s.n }}</span>
                  <div class="flex flex-col"><span class="font-medium">{{ s.title }}</span><span class="t-small text-ink-muted">{{ s.body }}</span></div>
                </li>
              }
            </ol>
            <div class="flex flex-col gap-2">
              <a routerLink="/games/new" class="btn btn-primary btn-lg btn-block"><p-icon name="plus" />Create your first game</a>
              <a routerLink="/players" class="btn btn-ghost btn-block">Or add your regular players first</a>
            </div>
          </section>
        } @else {
          <div class="mb-6 flex flex-wrap items-end gap-3">
            <div class="flex flex-1 flex-col"><h1 class="h-page">{{ greetingText }}, {{ name() }}</h1><p class="t-small text-ink-muted">{{ today }}</p></div>
            <a routerLink="/games/new" class="btn hidden md:inline-flex" [class]="hero() ? 'btn-secondary' : 'btn-primary'"><p-icon name="plus" [size]="18" />New game</a>
          </div>

          <div class="flex flex-wrap items-start gap-6">
            <div class="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
              @if (hero(); as g) {
                <section class="card flex flex-col gap-4 border-amber-border bg-[#FFFDF8] p-4 md:p-6" aria-labelledby="hero-name">
                  <div class="flex flex-wrap items-center gap-3">
                    <div class="flex min-w-0 flex-1 flex-col">
                      <span class="t-caption !text-amber-ink">In progress · {{ relativeTime(g.updatedAt) }}</span>
                      <h2 id="hero-name" class="h-section md:text-[22px]">{{ g.name }}</h2>
                      <div class="mt-1 flex items-center gap-2"><p-avatar-group [players]="g.players" />
                        @if (g.leader) { <span class="t-small text-ink-muted">{{ leaderText(g) }}</span> }</div>
                    </div>
                    <a [routerLink]="['/games', g.id, 'play']" class="btn btn-primary btn-lg hidden md:inline-flex">Continue · Deal {{ g.nextDealNumber }}</a>
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <div class="t-small flex"><span class="flex-1 font-medium">Deal {{ g.nextDealNumber }} of 13</span><span class="tnum text-ink-muted">{{ g.completedDeals }} done</span></div>
                    <p-deal-progress [completed]="g.completedDeals" />
                  </div>
                  <a [routerLink]="['/games', g.id, 'play']" class="btn btn-primary btn-lg btn-block md:hidden">Continue · Deal {{ g.nextDealNumber }}</a>
                </section>
              }
              <a routerLink="/games/new" class="btn btn-lg btn-block md:hidden" [class]="hero() ? 'btn-secondary' : 'btn-primary'"><p-icon name="plus" />New game</a>

              @if (otherOpen().length) {
                <section aria-labelledby="open-heading">
                  <h2 id="open-heading" class="h-card mb-2">{{ hero() ? 'Other open games' : 'Open games' }}</h2>
                  <ul class="list">
                    @for (g of otherOpen(); track g.id) {
                      <li><a [routerLink]="['/games', g.id]" class="row-item">
                        <div class="flex min-w-0 flex-1 flex-col"><span class="truncate font-medium">{{ g.name }}</span>
                          <span class="t-small text-ink-muted">{{ g.status === 'draft' ? 'Not started' : 'Deal ' + g.nextDealNumber + ' of 13' }} · {{ relativeTime(g.updatedAt) }}</span></div>
                        <p-status-badge [status]="g.status" /></a></li>
                    }
                  </ul>
                </section>
              }

              <section aria-labelledby="recent-heading">
                <div class="mb-2 flex items-baseline"><h2 id="recent-heading" class="h-card flex-1 md:text-[18px]">Recent games</h2>
                  <a routerLink="/games" class="t-small font-medium">See all</a></div>
                @if (d.recentGames.length) {
                  <ul class="list">
                    @for (g of d.recentGames; track g.id) {
                      <li><a [routerLink]="['/games', g.id, 'results']" class="row-item">
                        <div class="flex min-w-0 flex-1 flex-col"><span class="truncate font-medium">{{ g.name }}</span>
                          <span class="t-small text-ink-muted">{{ shortDate(g.completedAt) }} · {{ winnerText(g) }}</span></div>
                        <span class="hidden md:inline-flex"><p-avatar-group [players]="g.players" /></span>
                        <p-icon name="next" class="text-ink-muted" /></a></li>
                    }
                  </ul>
                } @else {
                  <p class="t-small card px-4 py-5 text-ink-muted">Finished games will show up here with their winners.</p>
                }
              </section>
            </div>

            <aside class="flex min-w-0 flex-[1_1_300px] flex-col gap-6" aria-label="Your record and activity">
              <section aria-labelledby="record-heading">
                <div class="mb-2 flex items-baseline"><h2 id="record-heading" class="h-card flex-1 md:text-[18px]">Your record</h2>
                  <a routerLink="/statistics" class="t-small font-medium">Statistics</a></div>
                @if (d.my.stats; as s) {
                  <div class="grid grid-cols-2 gap-2">
                    <div class="card px-4 py-3"><span class="t-small text-ink-muted">Games played</span><div class="t-score-lg">{{ s.gamesPlayed }}</div></div>
                    <div class="card px-4 py-3"><span class="t-small text-ink-muted">Wins</span><div class="t-score-lg">{{ s.wins }}
                      @if (s.winRate !== null) { <span class="t-small font-normal text-ink-muted">· {{ pct(s.winRate) }}</span> }</div></div>
                    <div class="card px-4 py-3"><span class="t-small text-ink-muted">Avg final score</span><div class="t-score-lg">{{ s.gamesPlayed >= 3 && s.averageFinalScore !== null ? s.averageFinalScore : '—' }}</div></div>
                    <div class="card px-4 py-3"><span class="t-small text-ink-muted">Best final score</span><div class="t-score-lg">{{ s.bestFinalScore ?? '—' }}</div></div>
                  </div>
                  <p class="t-small mt-2 text-ink-muted">As {{ d.my.mePlayer?.name }} · completed games only</p>
                } @else {
                  <div class="card t-small flex flex-col gap-2 px-4 py-4 text-ink-muted">
                    <span>Pick which player is you to see your wins and averages.</span>
                    <a routerLink="/profile" class="font-medium">Choose “This is me”</a></div>
                }
              </section>
              <section class="hidden md:block" aria-labelledby="activity-heading">
                <h2 id="activity-heading" class="h-card mb-2 md:text-[18px]">Recent activity</h2>
                @if (d.activity.length) {
                  <ol class="list">
                    @for (a of d.activity; track $index) {
                      <li class="row-item items-start">
                        <span class="inline-flex size-7 shrink-0 items-center justify-center rounded-md" [class]="activityStyle(a).cls"><p-icon [name]="activityStyle(a).icon" [size]="16" /></span>
                        <div class="flex flex-col"><span class="t-small">{{ activityText(a) }}</span><span class="t-small text-ink-muted">{{ relativeTime(a.at) }}</span></div>
                      </li>
                    }
                  </ol>
                } @else {
                  <p class="t-small card px-4 py-5 text-ink-muted">Nothing yet.</p>
                }
              </section>
            </aside>
          </div>
        }
      }
    </div>
  `,
})
export class DashboardPage {
  private readonly api = inject(PorterApi);
  private readonly auth = inject(AuthService);

  protected readonly data = signal<Dashboard | null>(null);
  protected readonly problem = signal<ApiProblem | null>(null);
  protected readonly greetingText = greeting();
  protected readonly today = longDate();
  protected readonly relativeTime = relativeTime;
  protected readonly shortDate = shortDate;
  protected readonly steps = [
    { n: '1', title: 'Name the game, pick 2–4 players', body: 'Players are just names. No accounts needed.' },
    { n: '2', title: 'Play a deal with real cards', body: 'Porter waits while you play.' },
    { n: '3', title: "Enter each player's score", body: 'Totals and rankings update instantly.' },
    { n: '13', title: 'After 13 deals, lowest total wins', body: 'Every game is saved to your history.' },
  ];

  protected readonly name = computed(() => this.data()?.displayName || this.auth.user()?.displayName || '');
  protected readonly isNew = computed(() => this.data()?.totalGames === 0);
  protected readonly hero = computed<GameSummary | null>(() => this.data()?.activeGames[0] ?? null);
  protected readonly otherOpen = computed(() => {
    const d = this.data();
    return d ? [...d.activeGames.slice(1), ...d.draftGames] : [];
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.problem.set(null);
    this.api.dashboard().subscribe({ next: (d) => this.data.set(d), error: (e: unknown) => this.problem.set(toProblem(e)) });
  }

  protected pct(rate: number): string {
    return `${Math.round(rate * 100)}%`;
  }

  protected leaderText(g: GameSummary): string {
    return g.leader ? `${joinNames(g.leader.names)} ${g.leader.names.length > 1 ? 'lead' : 'leads'} with ${g.leader.total}` : '';
  }

  protected winnerText(g: GameSummary): string {
    if (!g.leader) return '';
    return g.leader.names.length > 1 ? `${joinNames(g.leader.names)} tied on ${g.leader.total}` : `${g.leader.names[0]} won with ${g.leader.total}`;
  }

  protected activityText(a: Activity): string {
    switch (a.kind) {
      case 'deal_saved': return `Deal ${a.dealNumber} saved in ${a.gameName}`;
      case 'deal_corrected': return `Deal ${a.dealNumber} corrected in ${a.gameName}`;
      case 'game_started': return `${a.gameName} started`;
      case 'game_completed': return `${a.gameName} completed`;
      case 'game_created': return `${a.gameName} created`;
      case 'player_added': return `New player ${a.playerName} added`;
    }
  }

  protected activityStyle(a: Activity): { icon: IconName; cls: string } {
    switch (a.kind) {
      case 'deal_saved': return { icon: 'check', cls: 'bg-primary-soft text-primary' };
      case 'deal_corrected': return { icon: 'edit', cls: 'bg-amber-soft text-amber-ink' };
      case 'game_completed': return { icon: 'award', cls: 'bg-success-soft text-success' };
      case 'player_added': return { icon: 'plus', cls: 'bg-sage-soft text-sage-ink' };
      default: return { icon: 'play', cls: 'bg-surface-muted text-ink-muted' };
    }
  }
}
