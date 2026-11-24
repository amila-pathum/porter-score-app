import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AvatarColor, GameStatus, PlayerRef, Standing } from '../../core/api/models';
import { AVATAR_CLASSES, initial, ordinal } from '../../core/util/format';

/** Player initial on a tint. The letter is always shown so players are never identified by color alone. */
@Component({
  selector: 'p-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0' },
  template: `
    <span
      class="inline-flex items-center justify-center rounded-full font-medium"
      [class]="classes()"
      [style.width.px]="px()"
      [style.height.px]="px()"
      [style.font-size.px]="fontPx()"
      aria-hidden="true"
      >{{ letter() }}</span
    >
  `,
})
export class Avatar {
  readonly name = input.required<string>();
  readonly color = input<AvatarColor>('teal');
  readonly size = input<'sm' | 'md' | 'lg' | 'xl'>('md');
  protected readonly letter = computed(() => initial(this.name()));
  protected readonly classes = computed(() => AVATAR_CLASSES[this.color()] ?? AVATAR_CLASSES.teal);
  protected readonly px = computed(() => ({ sm: 28, md: 36, lg: 56, xl: 72 })[this.size()]);
  protected readonly fontPx = computed(() => ({ sm: 12, md: 14, lg: 20, xl: 26 })[this.size()]);
}

@Component({
  selector: 'p-avatar-group',
  imports: [Avatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="flex" [attr.aria-label]="label()" role="img">
      @for (p of players(); track p.id; let first = $first) {
        <span class="rounded-full ring-2 ring-surface" [class.-ml-2]="!first"><p-avatar [name]="p.name" [color]="p.avatarColor" size="sm" /></span>
      }
    </span>
  `,
})
export class AvatarGroup {
  readonly players = input.required<PlayerRef[]>();
  protected readonly label = computed(() => this.players().map((p) => p.name).join(', '));
}

@Component({
  selector: 'p-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [class]="'badge-' + status()">{{ text() }}</span>`,
})
export class StatusBadge {
  readonly status = input.required<GameStatus>();
  protected readonly text = computed(() => ({ draft: 'Setup', active: 'Active', completed: 'Completed' })[this.status()]);
}

@Component({
  selector: 'p-rank',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="rank" [class.first]="rank() === 1" [style.width.px]="px()" [style.height.px]="px()"
    [attr.aria-label]="'Rank ' + rank() + (tied() ? ', tied' : '')">{{ rank() }}</span>`,
})
export class RankMarker {
  readonly rank = input.required<number>();
  readonly tied = input(false);
  readonly px = input(28);
}

/** Compact 13-segment progress bar. */
@Component({
  selector: 'p-deal-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dp" role="img" [attr.aria-label]="label()">
      @for (s of segments(); track $index) {
        <span class="dp-seg" [class.done]="s === 'done'" [class.cur]="s === 'cur'"></span>
      }
    </div>
  `,
})
export class DealProgress {
  readonly completed = input.required<number>();
  readonly total = input(13);
  readonly active = input(true);
  protected readonly segments = computed(() =>
    Array.from({ length: this.total() }, (_, i) =>
      i < this.completed() ? 'done' : i === this.completed() && this.active() ? 'cur' : 'todo',
    ),
  );
  protected readonly label = computed(
    () => `${this.completed()} of ${this.total()} deals completed` +
      (this.active() && this.completed() < this.total() ? `, deal ${this.completed() + 1} in progress` : ''),
  );
}

/** Numbered 13-cell timeline; completed deals link to their detail page. */
@Component({
  selector: 'p-deal-timeline',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="dt" aria-label="Deals">
      @for (n of numbers; track n) {
        <li class="contents">
          @if (n <= completed()) {
            <a class="dt-cell done" [routerLink]="['/games', gameId(), 'deals', n]" [attr.aria-label]="'Deal ' + n + ', completed. View scores'"
              [class.ring-2]="n === highlight()" [class.ring-primary]="n === highlight()">{{ n }}</a>
          } @else if (n === completed() + 1 && active()) {
            <span class="dt-cell cur" [attr.aria-label]="'Deal ' + n + ', current'" aria-current="step">{{ n }}</span>
          } @else {
            <span class="dt-cell" [attr.aria-label]="'Deal ' + n + ', not played yet'">{{ n }}</span>
          }
        </li>
      }
    </ol>
  `,
})
export class DealTimeline {
  readonly gameId = input.required<string>();
  readonly completed = input.required<number>();
  readonly active = input(true);
  readonly highlight = input<number | null>(null);
  protected readonly numbers = Array.from({ length: 13 }, (_, i) => i + 1);
}

/** Standings in rank order (competition ranking from the API). `lg` is the readable-across-the-table tablet size. */
@Component({
  selector: 'p-standings',
  imports: [Avatar, RankMarker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="list" [attr.aria-label]="caption()">
      @for (s of standings(); track s.playerId) {
        <li class="row-item" [class.min-h-[72px]]="size() === 'lg'" data-testid="standing" [attr.data-rank]="s.rank" [attr.data-name]="s.name" [attr.data-total]="s.total">
          <p-rank [rank]="s.rank" [tied]="s.isTied" [px]="size() === 'lg' ? 40 : 28" />
          @if (size() !== 'lg') {
            <p-avatar [name]="s.name" [color]="s.avatarColor" size="sm" />
          }
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="truncate" [class.font-medium]="s.rank === 1" [class.text-[22px]]="size() === 'lg'">{{ s.name }}</span>
            @if (showGap()) {
              <span class="t-small tnum text-ink-muted">{{ gapText(s) }}</span>
            }
          </div>
          <span class="tnum font-medium" [class]="size() === 'lg' ? 'text-[36px] leading-[40px]' : 't-score'">
            {{ s.total }}<span class="sr-only"> points</span>
          </span>
        </li>
      }
    </ol>
  `,
})
export class StandingsList {
  readonly standings = input.required<Standing[]>();
  readonly size = input<'md' | 'lg'>('md');
  readonly showGap = input(true);
  readonly caption = input('Standings');
  readonly hasDeals = input(true);

  protected gapText(s: Standing): string {
    if (!this.hasDeals()) return 'No deals yet';
    if (s.behindLeader === 0) return s.isTied ? 'Tied for the lead' : 'Leading';
    return `+${s.behindLeader} behind · ${ordinal(s.rank)}`;
  }
}
