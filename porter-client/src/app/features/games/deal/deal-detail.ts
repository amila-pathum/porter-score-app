import { ChangeDetectionStrategy, Component, computed, effect, inject, input, numberAttribute } from '@angular/core';
import { RouterLink } from '@angular/router';
import { shortDate, time } from '../../../core/util/format';
import { Avatar } from '../../../shared/ui/game-bits';
import { Icon } from '../../../shared/ui/icon';
import { ErrorState, Skeleton } from '../../../shared/ui/states';
import { GameStore } from '../shared/game-store';

/** Read view of one deal: scores and each player's running total after it. */
@Component({
  selector: 'p-deal-detail-page',
  imports: [RouterLink, Avatar, Icon, ErrorState, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-narrow pt-2 md:pt-6">
      <header class="-ml-2 flex min-h-14 items-center gap-1">
        <a [routerLink]="['/games', id(), 'progress']" class="icon-btn" aria-label="Back to progress"><p-icon name="back" /></a>
        <span class="t-small flex-1 truncate text-ink-muted">{{ game()?.name }}</span>
      </header>
      @if (store.error() && !game()) {
        <p-error-state [problem]="store.error()" (retry)="store.reload()" />
      } @else if (!game()) {
        <p-skeleton />
      } @else if (!deal()) {
        <p-error-state [title]="'Deal ' + n() + ' hasn\\'t been played yet'" [problem]="null" (retry)="store.reload()">
          <a [routerLink]="['/games', id()]" class="btn btn-secondary btn-sm">Back to the game</a>
        </p-error-state>
      } @else if (deal(); as d) {
        <div class="mb-5 flex flex-wrap items-end gap-3">
          <div class="flex flex-1 flex-col gap-1">
            <h1 class="h-page">Deal {{ d.number }}</h1>
            <p class="t-small text-ink-muted">Wild card {{ d.wildCard }} · saved {{ shortDate(d.createdAt) }}, {{ time(d.createdAt) }}
              @if (d.isEdited) { · edited {{ time(d.updatedAt) }} }</p>
          </div>
          <a [routerLink]="['/games', id(), 'deals', d.number, 'edit']" class="btn btn-secondary"><p-icon name="edit" [size]="16" />Edit scores</a>
        </div>
        <div class="table-box">
          <table class="tbl">
            <caption class="sr-only">Scores for deal {{ d.number }}</caption>
            <thead><tr><th scope="col">Player</th><th scope="col" class="num">Deal {{ d.number }}</th><th scope="col" class="num">Total after</th></tr></thead>
            <tbody>
              @for (row of rows(); track row.playerId) {
                <tr>
                  <th scope="row" class="!bg-transparent !text-[15px] !font-normal !tracking-normal !normal-case !text-ink">
                    <span class="flex items-center gap-2.5"><p-avatar [name]="row.name" [color]="row.color" size="sm" />{{ row.name }}</span></th>
                  <td class="num t-score" [class.zero]="row.score === 0">{{ row.score }}</td>
                  <td class="num text-ink-muted">{{ row.runningTotal }}</td>
                </tr>
              }
              <tr class="total"><th scope="row" class="!bg-transparent !text-[14px] !tracking-normal !normal-case !text-ink">Deal sum</th><td class="num">{{ d.sum }}</td><td></td></tr>
            </tbody>
          </table>
        </div>
        <nav class="mt-5 flex justify-between" aria-label="Other deals">
          @if (d.number > 1) {
            <a [routerLink]="['/games', id(), 'deals', d.number - 1]" class="btn btn-ghost"><p-icon name="back" [size]="16" />Deal {{ d.number - 1 }}</a>
          } @else { <span></span> }
          @if (d.number < (game()?.completedDeals ?? 0)) {
            <a [routerLink]="['/games', id(), 'deals', d.number + 1]" class="btn btn-ghost">Deal {{ d.number + 1 }}<p-icon name="next" [size]="16" /></a>
          }
        </nav>
      }
    </div>
  `,
})
export class DealDetailPage {
  protected readonly store = inject(GameStore);
  readonly id = input.required<string>();
  readonly n = input.required({ transform: numberAttribute });
  protected readonly shortDate = shortDate;
  protected readonly time = time;

  protected readonly game = computed(() => {
    const g = this.store.game();
    return g && g.id === this.id() ? g : null;
  });
  protected readonly deal = computed(() => this.game()?.deals.find((d) => d.number === this.n()) ?? null);
  protected readonly rows = computed(() => {
    const g = this.game();
    const d = this.deal();
    if (!g || !d) return [];
    return g.players.map((p, i) => ({
      playerId: p.playerId,
      name: p.name,
      color: p.avatarColor,
      score: d.scores[i].score,
      runningTotal: g.deals.filter((x) => x.number <= d.number).reduce((sum, x) => sum + x.scores[i].score, 0),
    }));
  });

  constructor() {
    effect(() => this.store.load(this.id()));
  }
}
