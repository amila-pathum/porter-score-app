import { ChangeDetectionStrategy, Component, computed, effect, inject, input, numberAttribute } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DealTimeline, StandingsList, StatusBadge } from '../../../shared/ui/game-bits';
import { Icon } from '../../../shared/ui/icon';
import { ErrorState, Skeleton } from '../../../shared/ui/states';
import { DealHistory } from '../shared/deal-history';
import { GameStore } from '../shared/game-store';

/** Deal 1–13 timeline, standings and full deal history in one place. */
@Component({
  selector: 'p-progress-page',
  imports: [RouterLink, Icon, DealTimeline, StandingsList, StatusBadge, DealHistory, ErrorState, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page pt-2 md:pt-6">
      <header class="-ml-2 mb-2 flex min-h-14 items-center gap-1">
        <a [routerLink]="['/games', id()]" class="icon-btn" aria-label="Back to the game"><p-icon name="back" /></a>
        <span class="t-small flex-1 truncate text-ink-muted">Games</span>
      </header>
      @if (store.error() && !game()) {
        <p-error-state [problem]="store.error()" (retry)="store.reload()" />
      } @else if (!game()) {
        <p-skeleton />
      } @else if (game(); as g) {
        <div class="mb-6 flex flex-wrap items-end gap-3">
          <div class="flex flex-1 flex-col gap-1.5">
            <p-status-badge [status]="g.status" class="self-start" />
            <h1 class="h-page">{{ g.name }}</h1>
            <p class="t-small text-ink-muted">{{ g.completedDeals }} of {{ g.dealsPerGame }} deals
              @if (g.nextDealNumber) { · Deal {{ g.nextDealNumber }} next (wild card {{ g.nextWildCard }}) }</p>
          </div>
          @if (g.status === 'active') {
            <a [routerLink]="['/games', g.id, 'play']" class="btn btn-primary">Continue · Deal {{ g.nextDealNumber }}</a>
          } @else if (g.status === 'completed') {
            <a [routerLink]="['/games', g.id, 'results']" class="btn btn-primary">Final results</a>
          }
        </div>

        <section class="mb-8" aria-labelledby="tl-heading">
          <h2 id="tl-heading" class="sr-only">Deal timeline</h2>
          <p-deal-timeline [gameId]="g.id" [completed]="g.completedDeals" [active]="g.status === 'active'" [highlight]="highlight() ?? null" />
          <div class="t-small mt-2 flex flex-wrap gap-4 text-ink-muted" aria-hidden="true">
            <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-[3px] bg-primary-soft"></span>Done (tap to view)</span>
            <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-[3px] border-[1.5px] border-amber bg-amber-soft"></span>Current</span>
            <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-[3px] border border-border"></span>To play</span>
          </div>
        </section>

        <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <section aria-labelledby="st-heading">
            <div class="mb-2 flex items-baseline">
              <h2 id="st-heading" class="h-section flex-1">Standings</h2><span class="t-small text-ink-muted">Lower is better</span>
            </div>
            <p-standings [standings]="g.standings" [hasDeals]="g.completedDeals > 0" />
          </section>
          <section aria-labelledby="hist-heading">
            <h2 id="hist-heading" class="h-section mb-2">Deal history</h2>
            <p-deal-history [game]="g" [highlight]="highlight() ?? null" />
          </section>
        </div>
      }
    </div>
  `,
})
export class ProgressPage {
  protected readonly store = inject(GameStore);
  readonly id = input.required<string>();
  readonly highlight = input(undefined, { transform: (v: unknown) => (v == null ? undefined : numberAttribute(v)) });
  protected readonly game = computed(() => {
    const g = this.store.game();
    return g && g.id === this.id() ? g : null;
  });

  constructor() {
    effect(() => this.store.load(this.id()));
  }
}
