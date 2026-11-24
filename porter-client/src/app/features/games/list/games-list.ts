import { ChangeDetectionStrategy, Component, computed, effect, inject, input, numberAttribute, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GameList, GameStatus, GameSummary } from '../../../core/api/models';
import { PorterApi } from '../../../core/api/porter-api';
import { ApiProblem, toProblem } from '../../../core/api/problem';
import { joinNames, relativeTime, shortDate } from '../../../core/util/format';
import { AvatarGroup, DealProgress, StatusBadge } from '../../../shared/ui/game-bits';
import { Icon } from '../../../shared/ui/icon';
import { EmptyState, ErrorState } from '../../../shared/ui/states';

type Sort = 'activity' | 'newest' | 'oldest' | 'name';
const PAGE_SIZE = 20;

/** All games with status filter, search and sort. Filter state lives in the URL so Back restores it. */
@Component({
  selector: 'p-games-list-page',
  imports: [FormsModule, RouterLink, Icon, AvatarGroup, DealProgress, StatusBadge, EmptyState, ErrorState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="mb-4 flex items-center gap-3">
        <div class="flex flex-1 flex-col"><h1 class="h-page">Games</h1>
          <p class="t-small hidden text-ink-muted md:block">Every game you've kept score for.</p></div>
        <a routerLink="/games/new" class="btn btn-primary btn-sm md:h-11 md:px-4 md:text-[15px]"><p-icon name="plus" [size]="18" />New game</a>
      </div>

      <div class="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div class="flex gap-1 overflow-x-auto" role="tablist" aria-label="Filter by status">
          @for (f of filters(); track f.value) {
            <button type="button" role="tab" class="chip" [attr.aria-selected]="(status() ?? null) === f.value" (click)="setStatus(f.value)"
              [class.!border-transparent]="(status() ?? null) !== f.value" [class.!bg-transparent]="(status() ?? null) !== f.value">
              {{ f.label }} <span class="tnum" [class.text-ink-muted]="(status() ?? null) !== f.value">{{ f.count }}</span></button>
          }
        </div>
        <span class="hidden flex-1 md:block"></span>
        <div class="flex gap-2">
          <div class="relative flex-1 md:w-72">
            <span class="pointer-events-none absolute top-3 left-3 text-ink-muted"><p-icon name="search" /></span>
            <input type="search" class="input pl-10" placeholder="Search games or players" aria-label="Search games or players"
              [ngModel]="search()" (ngModelChange)="onSearch($event)" />
          </div>
          <label class="sr-only" for="games-sort">Sort</label>
          <select id="games-sort" class="input w-auto pr-8" [ngModel]="sort() ?? 'activity'" (ngModelChange)="setSort($event)">
            <option value="activity">Last activity</option>
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>

      <p class="sr-only" aria-live="polite">{{ data() ? data()!.totalCount + ' games' : '' }}</p>

      @if (problem()) {
        <p-error-state [problem]="problem()" (retry)="load()" />
      } @else if (!data()) {
        <div class="flex flex-col gap-2" aria-busy="true"><span class="sr-only">Loading games…</span>
          @for (i of [1, 2, 3]; track i) { <div class="skel h-20 w-full"></div> }</div>
      } @else if (data()!.counts.all === 0 && !q()) {
        <p-empty-state title="Your score sheet is empty" body="Games you keep score for will appear here." icon="games">
          <a routerLink="/games/new" class="btn btn-primary btn-sm">Create a game</a>
        </p-empty-state>
      } @else if (!data()!.items.length) {
        <p-empty-state [title]="q() ? 'No games match “' + q() + '”' : 'No games here yet'" [body]="status() ? 'Searching ' + statusLabel() + ' games only.' : null" icon="search">
          @if (status()) { <button type="button" class="btn btn-secondary btn-sm" (click)="setStatus(null)">Search all games</button> }
          @if (q()) { <button type="button" class="btn btn-ghost btn-sm" (click)="onSearch('', true)">Clear search</button> }
        </p-empty-state>
      } @else {
        <!-- Mobile: cards -->
        <ul class="flex flex-col gap-2 md:hidden">
          @for (g of data()!.items; track g.id) {
            <li>
              <a [routerLink]="['/games', g.id]" class="card flex flex-col gap-2.5 p-3.5 text-ink no-underline">
                <div class="flex items-center gap-2"><span class="h-card flex-1 truncate">{{ g.name }}</span><p-status-badge [status]="g.status" /></div>
                <div class="flex items-center gap-2"><p-avatar-group [players]="g.players" />
                  <span class="t-small flex-1 text-ink-muted">{{ g.players.length }} players · {{ shortDate(g.createdAt) }}</span></div>
                @if (g.status === 'active') {
                  <div class="t-small flex items-center gap-2.5"><span class="tnum font-medium whitespace-nowrap">Deal {{ g.nextDealNumber }}/13</span>
                    <p-deal-progress class="flex-1" [completed]="g.completedDeals" /></div>
                } @else if (g.status === 'completed' && g.leader) {
                  <div class="t-small flex items-center gap-1.5"><span class="rank first size-[22px] text-[12px]">1</span>{{ leaderText(g) }}</div>
                }
              </a>
            </li>
          }
        </ul>

        <!-- Tablet & desktop: table -->
        <div class="table-box hidden md:block">
          <table class="tbl min-w-[860px]">
            <caption class="sr-only">Games</caption>
            <thead><tr><th scope="col">Game</th><th scope="col">Players</th><th scope="col" class="w-[20%]">Progress</th><th scope="col">Status</th>
              <th scope="col">Winner / leader</th><th scope="col">Last activity</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead>
            <tbody>
              @for (g of data()!.items; track g.id) {
                <tr [class.bg-[#FFFDF8]]="g.status === 'active'">
                  <td><div class="flex flex-col"><a [routerLink]="['/games', g.id]" class="font-medium text-ink no-underline hover:underline">{{ g.name }}</a>
                    <span class="t-small text-ink-muted">Created {{ shortDate(g.createdAt) }}</span></div></td>
                  <td><div class="flex items-center gap-2"><p-avatar-group [players]="g.players" /><span class="t-small text-ink-muted">{{ g.players.length }}</span></div></td>
                  <td>
                    @if (g.status === 'active') {
                      <div class="flex flex-col gap-1.5"><span class="t-small">Deal {{ g.nextDealNumber }} of 13</span><p-deal-progress [completed]="g.completedDeals" /></div>
                    } @else {
                      <span class="t-small text-ink-muted">{{ g.status === 'draft' ? 'Not started' : '13 of 13' }}</span>
                    }
                  </td>
                  <td><p-status-badge [status]="g.status" /></td>
                  <td class="t-small">{{ g.leader ? leaderText(g) : '—' }}</td>
                  <td class="t-small text-ink-muted">{{ relativeTime(g.updatedAt) }}</td>
                  <td class="num"><a [routerLink]="['/games', g.id]" class="btn btn-sm" [class]="g.status === 'completed' ? 'btn-secondary' : 'btn-primary'">
                    {{ g.status === 'active' ? 'Continue' : g.status === 'draft' ? 'Set up' : 'View' }}</a></td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (pages() > 1) {
          <nav class="t-small mt-4 flex items-center gap-3" aria-label="Pagination">
            <span class="tnum flex-1 text-ink-muted">Showing {{ rangeText() }} of {{ data()!.totalCount }} games</span>
            <button type="button" class="icon-btn bordered size-10" [disabled]="currentPage() <= 1" (click)="goPage(currentPage() - 1)" aria-label="Previous page"><p-icon name="back" [size]="16" /></button>
            <span class="tnum" aria-current="page">Page {{ currentPage() }} of {{ pages() }}</span>
            <button type="button" class="icon-btn bordered size-10" [disabled]="currentPage() >= pages()" (click)="goPage(currentPage() + 1)" aria-label="Next page"><p-icon name="next" [size]="16" /></button>
          </nav>
        }
      }
    </div>
  `,
})
export class GamesListPage {
  private readonly api = inject(PorterApi);
  private readonly router = inject(Router);

  // URL query parameters (bound by the router)
  readonly status = input<GameStatus | null>(null);
  readonly q = input<string | null>(null);
  readonly sort = input<Sort | null>(null);
  readonly page = input(1, { transform: (v: unknown) => (v == null ? 1 : numberAttribute(v, 1)) });

  protected readonly data = signal<GameList | null>(null);
  protected readonly problem = signal<ApiProblem | null>(null);
  protected readonly search = signal('');
  protected readonly shortDate = shortDate;
  protected readonly relativeTime = relativeTime;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly currentPage = computed(() => this.page());
  protected readonly pages = computed(() => Math.max(1, Math.ceil((this.data()?.totalCount ?? 0) / PAGE_SIZE)));
  protected readonly rangeText = computed(() => {
    const start = (this.currentPage() - 1) * PAGE_SIZE + 1;
    return `${start}–${Math.min(start + PAGE_SIZE - 1, this.data()?.totalCount ?? 0)}`;
  });
  protected readonly filters = computed(() => {
    const c = this.data()?.counts;
    return [
      { label: 'All', value: null, count: c?.all ?? '' },
      { label: 'Active', value: 'active' as const, count: c?.active ?? '' },
      { label: 'Setup', value: 'draft' as const, count: c?.draft ?? '' },
      { label: 'Completed', value: 'completed' as const, count: c?.completed ?? '' },
    ];
  });
  protected readonly statusLabel = computed(() => ({ draft: 'setup', active: 'active', completed: 'completed' })[this.status() ?? 'active']);

  constructor() {
    effect(() => {
      this.status();
      this.q();
      this.sort();
      this.page();
      untracked(() => {
        this.search.set(this.q() ?? '');
        this.load();
      });
    });
  }

  load(): void {
    this.problem.set(null);
    this.api.listGames({ status: this.status(), q: this.q(), sort: this.sort() ?? 'activity', page: this.page(), pageSize: PAGE_SIZE }).subscribe({
      next: (d) => this.data.set(d),
      error: (e: unknown) => this.problem.set(toProblem(e)),
    });
  }

  protected leaderText(g: GameSummary): string {
    if (!g.leader) return '';
    const names = joinNames(g.leader.names);
    if (g.status === 'completed') return g.leader.names.length > 1 ? `${names} tied · ${g.leader.total}` : `${names} · ${g.leader.total}`;
    return `${names} ${g.leader.names.length > 1 ? 'lead' : 'leads'} · ${g.leader.total}`;
  }

  protected setStatus(status: GameStatus | null): void {
    this.navigate({ status, page: null });
  }

  protected setSort(sort: Sort): void {
    this.navigate({ sort: sort === 'activity' ? null : sort, page: null });
  }

  protected goPage(page: number): void {
    this.navigate({ page: page === 1 ? null : page });
  }

  protected onSearch(value: string, immediate = false): void {
    this.search.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.navigate({ q: value.trim() || null, page: null }), immediate ? 0 : 300);
  }

  private navigate(params: Record<string, string | number | null>): void {
    void this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
