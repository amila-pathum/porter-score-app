import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlayerStats } from '../../core/api/models';
import { ordinal, shortDate } from '../../core/util/format';
import { Avatar, RankMarker } from '../../shared/ui/game-bits';

/** Averages are hidden below this many completed games, so one game isn't presented as a trend. */
const MIN_GAMES_FOR_AVERAGE = 3;

/**
 * Player statistics from completed games only. Two charts, each answering one question:
 * "Am I improving?" (final scores, lower is better) and "Where do I usually finish?".
 */
@Component({
  selector: 'p-player-stats-view',
  imports: [RouterLink, Avatar, RankMarker, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = stats();
    <div class="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
      <div class="card px-4 py-3"><span class="t-small text-ink-muted">Games played</span><div class="t-score-lg">{{ s.gamesPlayed }}</div>
        <span class="t-small text-ink-muted">completed</span></div>
      <div class="card px-4 py-3"><span class="t-small text-ink-muted">Wins</span><div class="t-score-lg">{{ s.wins }}</div>
        <span class="t-small text-ink-muted">{{ s.winRate !== null ? (s.winRate * 100 | number: '1.0-0') + '% of games' : '—' }}</span></div>
      <div class="card px-4 py-3"><span class="t-small text-ink-muted">Average final score</span>
        <div class="t-score-lg">{{ showAverage() ? (s.averageFinalScore | number: '1.0-1') : '—' }}</div>
        <span class="t-small text-ink-muted">{{ showAverage() ? 'lower is better' : 'after ' + minGames + ' games' }}</span></div>
      <div class="card px-4 py-3"><span class="t-small text-ink-muted">Best final score</span><div class="t-score-lg">{{ s.bestFinalScore ?? '—' }}</div>
        <span class="t-small text-ink-muted">lowest total</span></div>
    </div>

    @if (s.gamesPlayed > 0) {
      <div class="mt-6 flex flex-wrap gap-6">
        <section class="card flex min-w-0 flex-[2_1_480px] flex-col gap-4 px-5 py-4" aria-labelledby="trend-heading">
          <div class="flex flex-wrap items-baseline gap-2"><h2 id="trend-heading" class="h-card flex-1">Final score, last {{ s.trend.length }} {{ s.trend.length === 1 ? 'game' : 'games' }}</h2>
            <span class="t-small text-ink-muted">Lower is better</span></div>
          <div class="flex h-48 items-end gap-2 border-b border-border-strong px-1 md:gap-3.5" role="img" [attr.aria-label]="trendLabel()">
            @for (t of s.trend; track t.gameId) {
              <div class="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5 self-stretch">
                <span class="t-small tnum" [class.font-semibold]="t.won">{{ t.total }}</span>
                <div class="w-full max-w-12 rounded-t" [style.height.%]="barHeight(t.total)" [class]="t.won ? 'bg-primary' : 'bg-[#C8DAD5]'"></div>
              </div>
            }
          </div>
          <div class="t-small flex gap-2 px-1 text-center md:gap-3.5" aria-hidden="true">
            @for (t of s.trend; track t.gameId) {
              <span class="min-w-0 flex-1 truncate" [class]="t.won ? 'font-medium text-primary' : 'text-ink-muted'">{{ ordinal(t.rank) }}</span>
            }
          </div>
          <div class="t-small flex gap-4 text-ink-muted"><span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm bg-primary"></span>Won</span>
            <span class="flex items-center gap-1.5"><span class="size-2.5 rounded-sm bg-[#C8DAD5]"></span>Other finish</span></div>
        </section>

        <section class="card flex min-w-0 flex-[1_1_260px] flex-col gap-3 px-5 py-4" aria-labelledby="finish-heading">
          <h2 id="finish-heading" class="h-card">Finishing positions</h2>
          @for (f of s.finishes; track f.position) {
            @if (f.count > 0 || f.position <= 2) {
              <div class="flex items-center gap-3">
                <p-rank [rank]="f.position" />
                <div class="h-3 flex-1 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                  <div class="h-full bg-primary" [style.width.%]="(f.count / s.gamesPlayed) * 100"></div></div>
                <span class="t-small tnum w-16 text-right">{{ f.count }} {{ f.count === 1 ? 'game' : 'games' }}</span>
              </div>
            }
          }
          <p class="t-small text-ink-muted">Scored 0 in {{ s.zeroScoreDeals }} of {{ s.dealsPlayed }} deals.</p>
        </section>
      </div>

      <div class="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="recent-results">
          <h2 id="recent-results" class="h-section mb-2">Recent games</h2>
          <ul class="list">
            @for (g of s.recentGames; track g.gameId) {
              <li><a [routerLink]="['/games', g.gameId, 'results']" class="row-item">
                <p-rank [rank]="g.rank" [tied]="g.isTied" />
                <div class="flex min-w-0 flex-1 flex-col"><span class="truncate font-medium">{{ g.gameName }}</span>
                  <span class="t-small text-ink-muted">{{ shortDate(g.completedAt) }} · {{ g.playerCount }} players{{ g.isTied ? ' · tied' : '' }}</span></div>
                <span class="t-score">{{ g.total }}</span></a></li>
            }
          </ul>
        </section>
        @if (s.playedWith.length) {
          <section aria-labelledby="played-with">
            <h2 id="played-with" class="h-section mb-2">Most played with</h2>
            <ul class="list">
              @for (p of s.playedWith; track p.playerId) {
                <li><a [routerLink]="['/players', p.playerId]" class="row-item min-h-12">
                  <p-avatar [name]="p.name" [color]="p.avatarColor" size="sm" /><span class="flex-1">{{ p.name }}</span>
                  <span class="t-small tnum text-ink-muted">{{ p.games }} {{ p.games === 1 ? 'game' : 'games' }}</span></a></li>
              }
            </ul>
          </section>
        }
      </div>
    }
  `,
})
export class PlayerStatsView {
  readonly stats = input.required<PlayerStats>();
  protected readonly ordinal = ordinal;
  protected readonly shortDate = shortDate;
  protected readonly minGames = MIN_GAMES_FOR_AVERAGE;

  protected readonly showAverage = computed(() => this.stats().gamesPlayed >= MIN_GAMES_FOR_AVERAGE && this.stats().averageFinalScore !== null);
  private readonly maxTotal = computed(() => Math.max(1, ...this.stats().trend.map((t) => t.total)));
  protected barHeight(total: number): number {
    return Math.max(4, (total / this.maxTotal()) * 78);
  }
  protected readonly trendLabel = computed(() =>
    'Final scores, oldest to newest: ' + this.stats().trend.map((t) => `${t.total} (${ordinal(t.rank)}${t.won ? ', won' : ''})`).join(', '),
  );
}
