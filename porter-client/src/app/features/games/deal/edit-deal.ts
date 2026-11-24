import { LiveAnnouncer } from '@angular/cdk/a11y';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, numberAttribute, signal, untracked, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PorterApi } from '../../../core/api/porter-api';
import { toProblem } from '../../../core/api/problem';
import { ToastService } from '../../../core/ui/toast.service';
import { ordinal, time } from '../../../core/util/format';
import { competitionRanks } from '../../../core/util/ranking';
import { Icon } from '../../../shared/ui/icon';
import { ErrorState, Skeleton } from '../../../shared/ui/states';
import { GameStore } from '../shared/game-store';
import { ScoreEntryForm } from '../shared/score-entry-form';
import { HasUnsavedChanges } from '../shared/unsaved.guard';

interface Impact {
  name: string;
  from: number;
  to: number;
  rankFrom: number;
  rankTo: number;
}

/** Correct a saved deal. Same form as play mode, plus a preview of what the change does before saving. */
@Component({
  selector: 'p-edit-deal-page',
  imports: [RouterLink, Icon, ScoreEntryForm, ErrorState, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-narrow pt-2 pb-48 md:pt-6">
      <header class="-ml-2 flex min-h-14 items-center gap-1">
        <a [routerLink]="backLink()" class="icon-btn" aria-label="Cancel editing"><p-icon name="close" /></a>
        <h1 class="flex-1 text-[17px] font-medium md:text-[22px]">Edit Deal {{ n() }}</h1>
        @if (deal(); as d) {
          <span class="t-small pr-2 text-ink-muted">Saved {{ time(d.updatedAt) }}</span>
        }
      </header>

      @if (store.error() && !game()) {
        <p-error-state [problem]="store.error()" (retry)="store.reload()" />
      } @else if (!game()) {
        <p-skeleton />
      } @else if (!deal()) {
        <p-error-state title="Deal {{ n() }} hasn't been played yet" [problem]="null" (retry)="store.reload()">
          <a [routerLink]="['/games', id()]" class="btn btn-secondary btn-sm">Back to the game</a>
        </p-error-state>
      } @else if (game(); as g) {
        <div class="flex flex-col gap-3.5">
          <div class="alert alert-info text-[13px] leading-[18px]"><p-icon name="info" [size]="16" />
            Wild card {{ deal()!.wildCard }}. Totals and rankings recalculate after you save.</div>
          @if (proposed()) {
            <div class="alert alert-warn text-[13px] leading-[18px]" role="status"><p-icon name="alert" [size]="16" />
              Showing the scores you entered on this device. Review them, then save to replace the saved deal.</div>
          }
          @if (conflict()) {
            <div class="alert alert-warn flex-col" role="alert">
              <p><b class="font-medium">Deal {{ n() }} changed while you were editing.</b> Reload to see the latest; your edits stay below.</p>
              <button type="button" class="btn btn-secondary btn-sm self-start" (click)="reload()"><p-icon name="refresh" [size]="16" />Reload</button>
            </div>
          }
          @if (error()) {
            <div class="alert alert-error" role="alert"><p-icon name="alert" [size]="18" />{{ error() }}</div>
          }

          <p-score-entry-form #scoreForm mode="edit" [players]="g.players" [dealNumber]="n()" [original]="originalScores()"
            [busy]="saving()" [serverErrors]="serverErrors()" (valuesChange)="serverErrors.set({}); error.set(null)" />

          @if (impact().length) {
            <section class="card flex flex-col gap-2 px-4 py-3.5" aria-labelledby="impact-heading">
              <h2 id="impact-heading" class="t-caption">Effect of this change</h2>
              @for (i of impact(); track i.name) {
                <div class="t-small tnum flex"><span class="flex-1">{{ i.name }}'s total</span>
                  <span class="text-ink-muted">{{ i.from }}</span><span class="mx-1.5 text-ink-muted" aria-hidden="true">→</span><span class="font-medium">{{ i.to }}</span></div>
                @if (i.rankFrom !== i.rankTo) {
                  <div class="t-small flex"><span class="flex-1">{{ i.name }}</span>
                    <span class="text-ink-muted">{{ ordinal(i.rankFrom) }}</span><span class="mx-1.5 text-ink-muted" aria-hidden="true">→</span><span class="font-medium">{{ ordinal(i.rankTo) }}</span></div>
                }
              }
              @if (!rankChanges()) {
                <div class="t-small flex"><span class="flex-1">Rankings</span><span class="font-medium">No change</span></div>
              }
            </section>
          }
        </div>

        <div class="fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2.5 border-t border-border bg-surface px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] md:static md:mt-4 md:border-0 md:bg-transparent md:p-0">
          <div class="t-small flex items-center" aria-live="polite">
            @if (changed() > 0) {
              <span class="mr-2 size-2 rounded-full bg-amber" aria-hidden="true"></span>
              <span class="flex-1">{{ changed() }} unsaved {{ changed() === 1 ? 'change' : 'changes' }}</span>
              <button type="button" class="btn btn-ghost btn-sm h-8 px-2" (click)="undo()">Undo</button>
            } @else {
              <span class="flex-1 text-ink-muted">No changes yet</span>
            }
          </div>
          <div class="flex gap-2">
            <a [routerLink]="backLink()" class="btn btn-secondary btn-lg flex-1 md:flex-none">Cancel</a>
            <button type="button" class="btn btn-primary btn-lg flex-[2]" [class.is-busy]="saving()" [disabled]="saving() || changed() === 0"
              (click)="save()" data-testid="save-correction">{{ saving() ? 'Saving…' : 'Save correction' }}</button>
          </div>
        </div>
      }
    </div>
  `,
})
export class EditDealPage implements HasUnsavedChanges {
  protected readonly store = inject(GameStore);
  private readonly api = inject(PorterApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly announcer = inject(LiveAnnouncer);

  readonly id = input.required<string>();
  readonly n = input.required({ transform: numberAttribute });
  /** Optional comma-separated scores proposed from a conflicted save on this device. */
  readonly values = input<string | null>(null);

  protected readonly ordinal = ordinal;
  protected readonly time = time;
  protected readonly form = viewChild<ScoreEntryForm>('scoreForm');
  protected readonly saving = signal(false);
  protected readonly conflict = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly serverErrors = signal<Record<number, string>>({});
  private saved = false;

  protected readonly game = computed(() => {
    const g = this.store.game();
    return g && g.id === this.id() ? g : null;
  });
  protected readonly deal = computed(() => this.game()?.deals.find((d) => d.number === this.n()) ?? null);
  protected readonly originalScores = computed(() => this.deal()?.scores.map((s) => s.score) ?? null);
  protected readonly proposed = computed(() => {
    const v = this.values()?.split(',');
    return v && v.length === this.game()?.players.length ? v : null;
  });
  protected readonly backLink = computed(() => ['/games', this.id(), 'progress']);
  protected readonly changed = computed(() => this.form()?.changedCount() ?? 0);

  /** Client-side preview only; the server recalculates authoritative standings on save. */
  protected readonly impact = computed<Impact[]>(() => {
    const g = this.game();
    const form = this.form();
    const original = this.originalScores();
    if (!g || !form || !original || !form.allValid()) return [];
    const next = form.scores()!;
    const oldTotals = g.players.map((p) => p.total);
    const newTotals = oldTotals.map((t, i) => t - original[i] + next[i]);
    const oldRanks = competitionRanks(oldTotals);
    const newRanks = competitionRanks(newTotals);
    return g.players
      .map((p, i) => ({ name: p.name, from: oldTotals[i], to: newTotals[i], rankFrom: oldRanks[i], rankTo: newRanks[i] }))
      .filter((x) => x.from !== x.to || x.rankFrom !== x.rankTo);
  });
  protected readonly rankChanges = computed(() => this.impact().some((i) => i.rankFrom !== i.rankTo));

  constructor() {
    effect(() => this.store.load(this.id()));
    effect(() => {
      const proposed = this.proposed();
      const form = this.form();
      if (proposed && form && this.deal()) untracked(() => queueMicrotask(() => form.setValues(proposed)));
    });
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (this.hasUnsavedChanges()) e.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('beforeunload', beforeUnload));
  }

  hasUnsavedChanges(): boolean {
    return !this.saved && this.changed() > 0;
  }

  unsavedDescription(): string {
    return `Your changes to Deal ${this.n()} haven't been saved.`;
  }

  protected undo(): void {
    const original = this.originalScores();
    if (original) this.form()?.setValues(original.map(String));
  }

  protected reload(): void {
    this.conflict.set(false);
    this.api.getGame(this.id()).subscribe({
      next: (g) => {
        const edits = this.form()?.values();
        this.store.set(g);
        // Keep the user's edits on top of the refreshed original.
        if (edits) queueMicrotask(() => this.form()?.setValues(edits));
      },
      error: (e: unknown) => this.error.set(toProblem(e).detail),
    });
  }

  protected save(): void {
    const g = this.game();
    const form = this.form();
    if (!g || !form || this.saving()) return;
    if (!form.validateForSave()) {
      this.error.set('Fix the highlighted scores. Nothing was saved.');
      return;
    }
    const impact = this.impact();
    this.saving.set(true);
    this.error.set(null);
    const scores = g.players.map((p, i) => ({ playerId: p.playerId, score: form.scores()![i] }));
    this.api.saveDeal(g.id, this.n(), scores, g.version).subscribe({
      next: (res) => {
        this.saved = true;
        this.store.set(res.game);
        const rankNote = impact.filter((i) => i.rankFrom !== i.rankTo).map((i) => `${i.name} is now ${ordinal(i.rankTo)}`).join(', ');
        this.toasts.success(`Deal ${this.n()} corrected${rankNote ? `. ${rankNote}` : ''}`);
        void this.announcer.announce(`Deal ${this.n()} corrected. Totals updated.`);
        void this.router.navigate(['/games', g.id, 'progress'], { queryParams: { highlight: this.n() } });
      },
      error: (err: unknown) => {
        this.saving.set(false);
        const p = toProblem(err);
        if (p.status === 409) this.conflict.set(true);
        else if (p.status === 400) {
          const rows: Record<number, string> = {};
          for (const [k, m] of Object.entries(p.fieldErrors)) {
            const match = /^scores\[(\d+)\]/.exec(k);
            if (match) rows[Number(match[1])] = m[0];
          }
          this.serverErrors.set(rows);
          this.error.set(p.detail);
        } else if (p.status !== 401) {
          this.error.set(p.status === 0 ? "Couldn't save the correction. Your changes are still here." : p.detail);
        }
      },
    });
  }
}
