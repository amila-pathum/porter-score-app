import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GameState } from '../../../core/api/models';
import { initial } from '../../../core/util/format';
import { EmptyState } from '../../../shared/ui/states';
import { Icon } from '../../../shared/ui/icon';

/** Deal-by-deal scores. Cards below 768px (no sideways scrolling), a table above. Newest first. */
@Component({
  selector: 'p-deal-history',
  imports: [RouterLink, EmptyState, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!game().deals.length) {
      <p-empty-state title="No deals saved yet" body="Scores appear here after you save Deal 1." icon="games" />
    } @else {
      <!-- Mobile: deal cards -->
      <ol class="flex flex-col gap-2 md:hidden" aria-label="Deal history">
        @for (d of dealsDesc(); track d.number) {
          <li class="card flex flex-col gap-2 px-3.5 py-3" [class.!border-primary]="d.number === highlight()">
            <div class="flex items-center gap-2">
              <a class="font-medium text-ink no-underline" [routerLink]="['/games', game().id, 'deals', d.number]">Deal {{ d.number }}</a>
              <span class="t-small text-ink-muted">· Wild {{ d.wildCard }}</span>
              @if (d.isEdited) { <span class="badge badge-draft badge-plain h-5">Edited</span> }
              <span class="flex-1"></span>
              @if (editable()) {
                <a class="btn btn-ghost btn-sm px-2" [routerLink]="['/games', game().id, 'deals', d.number, 'edit']" [attr.aria-label]="'Edit deal ' + d.number">
                  <p-icon name="edit" [size]="16" />Edit</a>
              }
            </div>
            <div class="t-small tnum grid gap-1.5" [style.grid-template-columns]="'repeat(' + game().players.length + ', minmax(0, 1fr))'">
              @for (s of d.scores; track s.playerId; let i = $index) {
                <span [class.text-success]="s.score === 0" [class.font-semibold]="s.score === 0">
                  <span class="font-normal text-ink-muted" [attr.title]="game().players[i].name">{{ initials()[i] }}</span>&nbsp;{{ s.score }}
                  <span class="sr-only"> for {{ game().players[i].name }}</span>
                </span>
              }
            </div>
          </li>
        }
      </ol>

      <!-- Tablet & desktop: table -->
      <div class="table-box hidden md:block">
        <table class="tbl">
          <caption class="sr-only">Deal history, {{ game().name }}</caption>
          <thead>
            <tr>
              <th scope="col">Deal</th>
              @for (p of game().players; track p.playerId) { <th scope="col" class="num">{{ p.name }}</th> }
              <th scope="col" class="num">Sum</th>
              @if (editable()) { <th scope="col"><span class="sr-only">Actions</span></th> }
            </tr>
          </thead>
          <tbody>
            @for (d of game().deals; track d.number) {
              <tr [class.bg-primary-soft]="d.number === highlight()">
                <th scope="row" class="!bg-transparent text-left !text-[14px] !font-medium !tracking-normal !normal-case !text-ink">
                  <a [routerLink]="['/games', game().id, 'deals', d.number]" class="text-ink no-underline hover:underline">{{ d.number }}</a>
                  <span class="t-small ml-1 font-normal text-ink-muted">{{ d.wildCard }}</span>
                  @if (d.isEdited) { <span class="badge badge-draft badge-plain ml-1 h-5">Edited</span> }
                </th>
                @for (s of d.scores; track s.playerId) {
                  <td class="num" [class.zero]="s.score === 0">{{ s.score }}</td>
                }
                <td class="num text-ink-muted">{{ d.sum }}</td>
                @if (editable()) {
                  <td class="w-12 !py-1 text-right">
                    <a class="icon-btn size-9 text-ink-muted" [routerLink]="['/games', game().id, 'deals', d.number, 'edit']" [attr.aria-label]="'Edit deal ' + d.number">
                      <p-icon name="edit" [size]="16" /></a>
                  </td>
                }
              </tr>
            }
            <tr class="total">
              <th scope="row" class="!bg-transparent text-left !text-[14px] !font-medium !tracking-normal !normal-case !text-ink">Total</th>
              @for (p of game().players; track p.playerId) { <td class="num">{{ p.total }}</td> }
              <td></td>
              @if (editable()) { <td></td> }
            </tr>
          </tbody>
        </table>
      </div>
    }
  `,
})
export class DealHistory {
  readonly game = input.required<GameState>();
  readonly editable = input(true);
  readonly highlight = input<number | null>(null);
  protected readonly dealsDesc = computed(() => [...this.game().deals].reverse());
  protected readonly initials = computed(() => this.game().players.map((p) => initial(p.name)));
}
