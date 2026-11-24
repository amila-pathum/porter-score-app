import { LiveAnnouncer } from '@angular/cdk/a11y';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { GameState } from '../../../core/api/models';
import { PorterApi } from '../../../core/api/porter-api';
import { ApiProblem, toProblem } from '../../../core/api/problem';
import { useWakeLock } from '../../../core/ui/browser.services';
import { ConfirmService } from '../../../core/ui/confirm.service';
import { DraftService } from '../../../core/ui/draft.service';
import { ToastService } from '../../../core/ui/toast.service';
import { joinNames, time } from '../../../core/util/format';
import { DealProgress, DealTimeline, StandingsList } from '../../../shared/ui/game-bits';
import { Icon } from '../../../shared/ui/icon';
import { ErrorState, Skeleton } from '../../../shared/ui/states';
import { DealHistory } from '../shared/deal-history';
import { GameStore, screenFor } from '../shared/game-store';
import { ScoreEntryForm } from '../shared/score-entry-form';

type View = 'score' | 'standings' | 'history';

interface LostDeal {
  dealNumber: number;
  values: string[];
}

/**
 * The core screen: enter one score per player for the current deal and save it.
 * Mobile: tabs (Score / Standings / History) with a sticky save bar.
 * Tablet & desktop: score entry and large standings side by side.
 */
@Component({
  selector: 'p-play-page',
  imports: [RouterLink, CdkMenuTrigger, CdkMenu, CdkMenuItem, Icon, ScoreEntryForm, StandingsList, DealProgress, DealTimeline, DealHistory, ErrorState, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto w-full max-w-[1200px] px-4 pt-2 pb-48 md:px-6 md:pt-6 md:pb-12">
      <header class="-ml-2 flex min-h-14 items-center gap-1">
        <a routerLink="/games" class="icon-btn" aria-label="Back to games"><p-icon name="back" /></a>
        <h1 class="min-w-0 flex-1 truncate text-[17px] font-medium md:text-[22px]">{{ game()?.name ?? 'Game' }}</h1>
        @if (game()) {
          <button type="button" class="icon-btn" [cdkMenuTriggerFor]="menu" aria-label="Game options"><p-icon name="more" /></button>
        }
      </header>
      <ng-template #menu>
        <div cdkMenu class="min-w-52 rounded-lg border border-border bg-surface p-1 shadow-[var(--shadow-2)]">
          <a cdkMenuItem [routerLink]="['/games', id(), 'progress']" class="flex h-10 items-center gap-2 rounded-md px-3 text-ink no-underline hover:bg-surface-muted focus:bg-surface-muted">
            <p-icon name="list" [size]="18" />Progress & history</a>
          <button cdkMenuItem type="button" (click)="deleteGame()" class="flex h-10 w-full items-center gap-2 rounded-md px-3 text-left text-danger hover:bg-danger-soft focus:bg-danger-soft">
            <p-icon name="trash" [size]="18" />Delete game</button>
        </div>
      </ng-template>

      @if (store.error() && !game()) {
        <p-error-state [problem]="store.error()" (retry)="store.reload()">
          <a routerLink="/games" class="btn btn-secondary btn-sm">Go to your games</a>
        </p-error-state>
      } @else if (!game()) {
        <p-skeleton />
      } @else if (game(); as g) {
        <section class="mb-4 flex flex-col gap-2.5" aria-labelledby="deal-heading">
          <div class="flex items-center gap-3">
            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
              <h2 id="deal-heading" class="flex items-baseline gap-2">
                <span class="t-caption">Deal</span>
                <span class="tnum text-[34px] leading-9 font-medium md:text-[40px] md:leading-[44px]" data-testid="deal-number">{{ dealNumber() }}</span>
                <span class="text-ink-muted">of {{ g.dealsPerGame }}</span>
              </h2>
              <span class="t-small tnum text-ink-muted">{{ g.completedDeals }} done · {{ g.dealsPerGame - g.completedDeals }} to go</span>
            </div>
            @if (g.nextWildCard) {
              <div class="flex min-w-[92px] flex-col items-center justify-center rounded-[12px] border border-amber-border bg-amber-soft px-4 py-2 text-amber-ink md:min-w-[120px] md:py-2.5"
                role="group" [attr.aria-label]="'Wild card for deal ' + dealNumber() + ': ' + g.nextWildCard" data-testid="wild-card">
                <span class="text-[11px] leading-4 font-medium tracking-[0.06em] uppercase" aria-hidden="true">Wild card</span>
                <span class="text-[26px] leading-8 font-semibold md:text-[32px] md:leading-10" aria-hidden="true">{{ g.nextWildCard }}</span>
              </div>
            }
          </div>
          <p-deal-progress [completed]="g.completedDeals" [total]="g.dealsPerGame" />
        </section>

        <div class="seg mb-4 md:hidden" role="tablist" aria-label="Game views">
          @for (v of views; track v.id) {
            <button type="button" role="tab" class="seg-item" [attr.aria-selected]="view() === v.id" [attr.aria-controls]="'panel-' + v.id"
              (click)="view.set(v.id)">{{ v.label }}</button>
          }
        </div>

        <div class="md:grid md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] md:items-start md:gap-8">
          <section id="panel-score" role="tabpanel" aria-labelledby="deal-heading" [class.hidden]="view() !== 'score'" class="md:!block">
            <div class="flex flex-col gap-3">
              @if (restoredAt()) {
                <div class="alert alert-info" role="status">
                  <p-icon name="clock" [size]="18" /><span class="flex-1">Restored unsaved scores from {{ restoredAt() }}.</span>
                  <button type="button" class="font-medium underline-offset-2 hover:underline" (click)="discardDraft()">Discard</button>
                </div>
              }
              @if (lostDeal(); as lost) {
                <div class="alert alert-warn flex-col" role="alert">
                  <p><b class="font-medium">Deal {{ lost.dealNumber }} was already saved on another device.</b> Your scores weren't saved: {{ lostSummary() }}.</p>
                  <div class="flex flex-wrap gap-2">
                    <a class="btn btn-secondary btn-sm" [routerLink]="['/games', id(), 'deals', lost.dealNumber, 'edit']" [queryParams]="{ values: lost.values.join(',') }">Compare &amp; use mine</a>
                    <button type="button" class="btn btn-ghost btn-sm" (click)="lostDeal.set(null)">Keep theirs</button>
                  </div>
                </div>
              }
              @if (conflict()) {
                <div class="alert alert-warn flex-col" role="alert">
                  <p><b class="font-medium">This game changed on another device.</b> Load the latest scores; what you typed stays here.</p>
                  <button type="button" class="btn btn-secondary btn-sm self-start" (click)="reloadAfterConflict()"><p-icon name="refresh" [size]="16" />Load latest</button>
                </div>
              }
              @if (formSummaryError()) {
                <div class="alert alert-error" role="alert"><p-icon name="alert" [size]="18" />{{ formSummaryError() }}</div>
              }

              <p-score-entry-form
                #scoreForm
                [players]="g.players"
                [dealNumber]="dealNumber()"
                [busy]="saving()"
                [serverErrors]="serverErrors()"
                [large]="isLarge()"
                (valuesChange)="onValuesChange($event)"
                (lastEnter)="saveButton()?.nativeElement?.focus()"
              />
              <p class="t-small flex items-center gap-1.5 px-1 text-ink-muted"><p-icon name="clock" [size]="16" />Unsaved scores are kept on this device.</p>
            <div class="fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2.5 border-t border-border bg-surface px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]
                md:static md:mt-1 md:border-0 md:bg-transparent md:p-0">
              <div class="t-small tnum flex text-ink-muted" aria-live="polite">
                <span class="flex-1">{{ form()?.enteredCount() ?? 0 }} of {{ g.players.length }} scores entered</span>
                @if (form()?.allValid()) { <span>Deal sum {{ form()?.sum() }}</span> }
              </div>
              <button #saveBtn type="button" class="btn btn-primary btn-lg btn-block" [class.is-busy]="saving()" [disabled]="saving()"
                (click)="save()" data-testid="save-deal">
                {{ saving() ? 'Saving Deal ' + dealNumber() + '…' : 'Save Deal ' + dealNumber() }}
              </button>
            </div>
            </div>
          </section>

          <section id="panel-standings" role="tabpanel" [class.hidden]="view() !== 'standings'" class="md:!block md:rounded-[12px] md:bg-[#FBFAF7] md:p-5"
            aria-labelledby="standings-heading">
            <div class="mb-2 flex items-baseline">
              <h2 id="standings-heading" class="h-section flex-1">{{ g.completedDeals ? 'Standings after Deal ' + g.completedDeals : 'Standings' }}</h2>
              <span class="t-small text-ink-muted">Lower is better</span>
            </div>
            <p-standings [standings]="g.standings" [size]="isLarge() ? 'lg' : 'md'" [hasDeals]="g.completedDeals > 0" caption="Current standings" />
            <div class="mt-5 hidden flex-col gap-2 md:flex">
              <div class="t-small flex"><span class="flex-1 font-medium">Progress</span>
                <a [routerLink]="['/games', id(), 'progress']" class="font-medium">History</a></div>
              <p-deal-timeline [gameId]="g.id" [completed]="g.completedDeals" />
            </div>
          </section>

          <section id="panel-history" role="tabpanel" [class.hidden]="view() !== 'history'" class="md:!hidden" aria-label="Deal history">
            <p-deal-history [game]="g" />
          </section>
        </div>

      }
    </div>
  `,
})
export class PlayPage {
  protected readonly store = inject(GameStore);
  private readonly api = inject(PorterApi);
  private readonly drafts = inject(DraftService);
  private readonly toasts = inject(ToastService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly views: { id: View; label: string }[] = [
    { id: 'score', label: 'Score' },
    { id: 'standings', label: 'Standings' },
    { id: 'history', label: 'History' },
  ];
  protected readonly view = signal<View>('score');
  protected readonly saving = signal(false);
  protected readonly conflict = signal(false);
  protected readonly lostDeal = signal<LostDeal | null>(null);
  protected readonly restoredAt = signal<string | null>(null);
  protected readonly serverErrors = signal<Record<number, string>>({});
  protected readonly formSummaryError = signal<string | null>(null);
  protected readonly isLarge = signal(typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches);

  protected readonly form = viewChild<ScoreEntryForm>('scoreForm');
  protected readonly saveButton = viewChild<ElementRef<HTMLButtonElement>>('saveBtn');

  protected readonly game = computed(() => {
    const g = this.store.game();
    return g && g.id === this.id() ? g : null;
  });
  protected readonly dealNumber = computed(() => this.game()?.nextDealNumber ?? 1);
  protected readonly lostSummary = computed(() => {
    const lost = this.lostDeal();
    const g = this.game();
    if (!lost || !g) return '';
    return g.players.map((p, i) => `${p.name} ${lost.values[i] || '–'}`).join(', ');
  });

  private draftCheckedFor = '';
  private completing = false;

  constructor() {
    useWakeLock();
    if (typeof window !== 'undefined') {
      const mq = window.matchMedia('(min-width: 768px)');
      mq.addEventListener('change', (e) => this.isLarge.set(e.matches));
    }

    effect(() => this.store.load(this.id()));

    // Draft games go to setup, completed games to results.
    effect(() => {
      const g = this.game();
      // (Skipped right after saving Deal 13: announceSaved() opens the completion view itself.)
      if (g && g.status !== 'active' && !this.completing) void this.router.navigate(['/games', g.id, screenFor(g)], { replaceUrl: true });
    });

    // Restore a saved draft once per (game, deal), after the form has been built.
    effect(() => {
      const g = this.game();
      const form = this.form();
      if (!g || !form || g.status !== 'active') return;
      const key = `${g.id}:${this.dealNumber()}`;
      if (key === this.draftCheckedFor) return;
      this.draftCheckedFor = key;
      untracked(() => {
        const draft = this.drafts.load(g.id, this.dealNumber(), g.players.map((p) => p.playerId));
        this.restoredAt.set(null);
        if (draft) {
          queueMicrotask(() => form.setValues(draft.values));
          this.restoredAt.set(time(draft.savedAt));
        }
      });
    });
  }

  private draftTimer: ReturnType<typeof setTimeout> | null = null;

  protected onValuesChange(values: string[]): void {
    const g = this.game();
    if (!g || g.status !== 'active') return;
    this.serverErrors.set({});
    this.formSummaryError.set(null);
    const dealNumber = this.dealNumber();
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => this.drafts.save(g.id, dealNumber, g.players.map((p) => p.playerId), values), 250);
  }

  protected discardDraft(): void {
    const g = this.game();
    if (!g) return;
    this.drafts.clear(g.id, this.dealNumber());
    this.form()?.clear();
    this.restoredAt.set(null);
  }

  protected save(): void {
    const g = this.game();
    const form = this.form();
    if (!g || !form || this.saving()) return;
    this.view.set('score');
    this.formSummaryError.set(null);

    if (!form.validateForSave()) {
      const parts = [];
      if (form.missingCount()) parts.push(`${form.missingCount()} ${form.missingCount() === 1 ? 'score is' : 'scores are'} missing`);
      if (form.invalidCount()) parts.push(`${form.invalidCount()} ${form.invalidCount() === 1 ? 'score needs' : 'scores need'} fixing`);
      this.formSummaryError.set(`${parts.join(' · ')}. Nothing was saved.`);
      return;
    }

    const dealNumber = this.dealNumber();
    const values = form.values();
    const scores = g.players.map((p, i) => ({ playerId: p.playerId, score: form.scores()![i] }));
    this.saving.set(true);
    this.conflict.set(false);

    this.api.saveDeal(g.id, dealNumber, scores, g.version).subscribe({
      next: (res) => {
        this.saving.set(false);
        this.completing = res.game.status === 'completed';
        this.drafts.clear(g.id, dealNumber);
        this.restoredAt.set(null);
        this.store.set(res.game);
        form.clear();
        this.announceSaved(res.game, dealNumber);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.handleSaveError(toProblem(err), dealNumber, values);
      },
    });
  }

  protected reloadAfterConflict(): void {
    const g = this.game();
    if (!g) return;
    const dealNumber = this.dealNumber();
    const values = this.form()?.values() ?? [];
    this.conflict.set(false);
    this.api.getGame(g.id).subscribe({
      next: (latest) => {
        if (latest.nextDealNumber !== dealNumber) {
          // Someone saved this deal meanwhile: keep the user's scores visible for comparison.
          this.drafts.clear(g.id, dealNumber);
          this.lostDeal.set({ dealNumber, values });
        }
        this.store.set(latest);
      },
      error: (e: unknown) => this.toasts.error(toProblem(e).detail),
    });
  }

  protected deleteGame(): void {
    const g = this.game();
    if (!g) return;
    this.confirm
      .ask({
        title: `Delete ${g.name}?`,
        body: `${g.completedDeals} saved ${g.completedDeals === 1 ? 'deal' : 'deals'} will be deleted. This can't be undone.`,
        confirmLabel: 'Delete game',
        destructive: true,
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.deleteGame(g.id).subscribe({
          next: () => {
            this.toasts.success(`${g.name} deleted`);
            void this.router.navigateByUrl('/games');
          },
          error: (e: unknown) => this.toasts.error(toProblem(e).detail),
        });
      });
  }

  private announceSaved(game: GameState, dealNumber: number): void {
    const leaders = game.standings.filter((s) => s.rank === 1);
    const leaderText = `${joinNames(leaders.map((l) => l.name))} ${leaders.length > 1 ? 'lead' : 'leads'} with ${leaders[0]?.total}`;
    if (game.status === 'completed') {
      void this.announcer.announce(`Game complete. ${leaderText}.`);
      void this.router.navigate(['/games', game.id, 'results'], { queryParams: { completed: 1 } });
      return;
    }
    this.toasts.success(`Deal ${dealNumber} saved`, { label: 'Edit', link: `/games/${game.id}/deals/${dealNumber}/edit` },
      `Deal ${dealNumber} saved. ${leaderText}. Deal ${game.nextDealNumber} is next.`);
  }

  private handleSaveError(p: ApiProblem, dealNumber: number, values: string[]): void {
    if (p.status === 400) {
      const rowErrors: Record<number, string> = {};
      for (const [key, messages] of Object.entries(p.fieldErrors)) {
        const m = /^scores\[(\d+)\]/.exec(key);
        if (m) rowErrors[Number(m[1])] = messages[0];
      }
      this.serverErrors.set(rowErrors);
      this.formSummaryError.set(`${p.detail} Nothing was saved.`);
      return;
    }
    if (p.status === 409) {
      if (p.code === 'game.version_conflict' || p.code === 'deal.out_of_sequence' || p.code === 'game.completed') {
        this.conflict.set(true);
      } else {
        this.formSummaryError.set(p.detail);
      }
      return;
    }
    if (p.status === 401) return; // session expired: the interceptor redirects; the draft is kept.
    const retry = { label: 'Retry', run: () => this.save() };
    this.toasts.error(p.status === 0 ? `Couldn't save Deal ${dealNumber}. Your scores are kept.` : `${p.detail} Your scores are kept.`, retry);
    // Make sure the typed values survive a reload even if the debounce hadn't fired.
    const g = this.game();
    if (g) this.drafts.save(g.id, dealNumber, g.players.map((pl) => pl.playerId), values);
  }
}
