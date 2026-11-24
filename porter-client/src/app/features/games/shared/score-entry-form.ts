import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, FormControl, ReactiveFormsModule } from '@angular/forms';
import { GamePlayerState } from '../../../core/api/models';
import { ordinal } from '../../../core/util/format';
import { HIGH_SCORE_HINT, ScoreIssue, scoreIssue, scoreIssueMessage } from '../../../core/util/ranking';
import { Avatar } from '../../../shared/ui/game-bits';
import { Icon } from '../../../shared/ui/icon';

interface RowView {
  index: number;
  player: GamePlayerState;
  control: FormControl<string>;
  issue: ScoreIssue;
  error: string | null;
  value: number | null;
  preview: number | null;
  original: number | null;
  delta: number | null;
}

/**
 * Score entry, Direction A ("compact rows"). One row per player in seat order: identity, last-saved
 * total and rank, the score input and a live new-total preview. Used for both new deals (`play`) and
 * corrections (`edit`). Rows never reorder; focus never moves on its own.
 */
@Component({
  selector: 'p-score-entry-form',
  imports: [ReactiveFormsModule, Avatar, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="list" [attr.aria-label]="'Scores for deal ' + dealNumber()">
      @for (row of rows(); track row.player.playerId) {
        <li class="row-item gap-3 py-2.5 pr-3 pl-3.5" [class.bg-[#FFFDF8]]="row.delta !== null && row.delta !== 0"
          [class.min-h-[76px]]="!large()" [class.min-h-[92px]]="large()">
          <p-avatar [name]="row.player.name" [color]="row.player.avatarColor" [size]="large() ? 'lg' : 'md'" />
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="truncate font-medium" [class.text-[18px]]="large()">{{ row.player.name }}</span>
            <span class="t-small tnum" [id]="metaId(row.index)"
              [class]="row.error ? 'text-danger' : row.delta ? 'text-amber-ink' : 'text-ink-muted'">
              @if (row.error) {
                {{ row.error }}
              } @else if (mode() === 'edit') {
                @if (row.delta) {
                  Was {{ row.original }} · <span class="font-medium">{{ row.delta > 0 ? '+' : '' }}{{ row.delta }}</span>
                } @else {
                  Unchanged
                }
              } @else {
                {{ row.player.total }} · {{ ordinal(row.player.rank) }}{{ row.player.isTied ? ' (tied)' : '' }}
              }
            </span>
          </div>
          @if (mode() === 'play' && large()) {
            <span class="t-small tnum w-12 text-right text-ink-muted" aria-hidden="true">{{ row.preview !== null ? '→ ' + row.preview : '' }}</span>
          }
          <div class="flex flex-col items-center gap-0.5">
            <input
              #scoreInput
              class="score-in"
              [class.lg-touch]="large()"
              [class.is-changed]="mode() === 'edit' && !!row.delta && !row.error"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
              maxlength="9"
              placeholder="–"
              [attr.enterkeyhint]="row.index === rows().length - 1 ? 'done' : 'next'"
              [formControl]="row.control"
              [readOnly]="busy()"
              [attr.aria-label]="ariaLabel(row)"
              [attr.aria-invalid]="row.error ? 'true' : null"
              [attr.aria-describedby]="metaId(row.index)"
              [attr.data-testid]="'score-' + row.index"
              (focus)="selectAll($event)"
              (keydown.enter)="onEnter(row.index, $event)"
            />
            @if (mode() === 'play' && !large()) {
              <span class="tnum h-3.5 text-[12px] leading-[14px] text-ink-muted" aria-hidden="true">{{ row.preview !== null ? '→ ' + row.preview : '' }}</span>
            }
          </div>
        </li>
      }
    </ul>

    @if (highScores().length) {
      <div class="alert alert-warn mt-2.5 text-[13px] leading-[18px]" role="status">
        <p-icon name="alert" [size]="16" />
        <span>{{ highScoreText() }} is unusually high. Double-check, but you can still save it.</span>
      </div>
    }
    @if (noZero()) {
      <div class="alert alert-warn mt-2.5 text-[13px] leading-[18px]" role="status">
        <p-icon name="info" [size]="16" />
        <span>No player has 0 this deal. You can still save if that's right.</span>
      </div>
    }
  `,
})
export class ScoreEntryForm {
  readonly players = input.required<GamePlayerState[]>();
  readonly dealNumber = input.required<number>();
  readonly mode = input<'play' | 'edit'>('play');
  /** Previously saved scores (edit mode), in seat order. */
  readonly original = input<number[] | null>(null);
  readonly busy = input(false);
  /** Server-side errors per row index, e.g. from a 400 response. */
  readonly serverErrors = input<Record<number, string>>({});
  /** Larger targets for tablets on the table. */
  readonly large = input(false);

  /** Fires (debounced by the caller) whenever any raw value changes. */
  readonly valuesChange = output<string[]>();
  /** Enter/Done on the last input: the parent focuses its save button. */
  readonly lastEnter = output<void>();

  protected readonly ordinal = ordinal;
  private readonly inputs = viewChildren<ElementRef<HTMLInputElement>>('scoreInput');

  readonly form = new FormArray<FormControl<string>>([]);
  private readonly rawValues = toSignal(this.form.valueChanges, { initialValue: [] as string[] });
  /** Missing scores are only flagged after a save attempt. */
  private readonly attempted = signal(false);
  private builtFor = '';

  constructor() {
    // Rebuild the controls when the participants or deal change (e.g. after a save advances the deal).
    effect(() => {
      const key = `${this.dealNumber()}|${this.players().map((p) => p.playerId).join()}`;
      if (key === this.builtFor) return;
      this.builtFor = key;
      untracked(() => {
        const initial = this.original()?.map(String);
        this.form.clear({ emitEvent: false });
        this.players().forEach((_, i) => this.form.push(new FormControl(initial?.[i] ?? '', { nonNullable: true }), { emitEvent: false }));
        this.attempted.set(false);
        this.form.updateValueAndValidity();
      });
    });
  }

  readonly values = computed<string[]>(() => {
    const raw = this.rawValues();
    return this.players().map((_, i) => raw[i] ?? '');
  });

  readonly rows = computed<RowView[]>(() => {
    const values = this.values();
    const original = this.original();
    const server = this.serverErrors();
    const attempted = this.attempted();
    return this.players().map((player, index) => {
      const raw = values[index] ?? '';
      const issue = scoreIssue(raw);
      const value = issue === null ? Number(raw.trim()) : null;
      const showIssue = issue !== null && (issue !== 'empty' || attempted);
      const orig = original?.[index] ?? null;
      return {
        index,
        player,
        control: this.form.at(index) ?? new FormControl('', { nonNullable: true }),
        issue,
        error: showIssue ? scoreIssueMessage(issue) : (server[index] ?? null),
        value,
        preview: value === null ? null : player.total + value,
        original: orig,
        delta: orig === null || value === null ? null : value - orig,
      };
    });
  });

  readonly enteredCount = computed(() => this.rows().filter((r) => r.issue !== 'empty').length);
  readonly allValid = computed(() => this.rows().length > 0 && this.rows().every((r) => r.issue === null));
  readonly scores = computed<number[] | null>(() => (this.allValid() ? this.rows().map((r) => r.value!) : null));
  readonly sum = computed(() => this.rows().reduce((s, r) => s + (r.value ?? 0), 0));
  readonly changedCount = computed(() => this.rows().filter((r) => r.delta !== null && r.delta !== 0).length);
  readonly hasInput = computed(() => this.values().some((v) => v.trim() !== ''));
  readonly missingCount = computed(() => this.rows().filter((r) => r.issue === 'empty').length);
  readonly invalidCount = computed(() => this.rows().filter((r) => r.issue !== null && r.issue !== 'empty').length);

  protected readonly highScores = computed(() => this.rows().filter((r) => r.value !== null && r.value >= HIGH_SCORE_HINT));
  protected readonly highScoreText = computed(() => this.highScores().map((r) => `${r.player.name}: ${r.value}`).join(', '));
  protected readonly noZero = computed(() => this.allValid() && !this.rows().some((r) => r.value === 0));

  private readonly emitValues = effect(() => {
    const v = this.values();
    untracked(() => this.valuesChange.emit(v));
  });

  /** Replace all values (draft restore, proposed correction). */
  setValues(values: string[]): void {
    values.forEach((v, i) => this.form.at(i)?.setValue(v, { emitEvent: false }));
    this.form.updateValueAndValidity();
  }

  /** Clear after a successful save. */
  clear(): void {
    this.attempted.set(false);
    this.form.controls.forEach((c) => c.setValue('', { emitEvent: false }));
    this.form.updateValueAndValidity();
  }

  /** Reveal "Enter a score" errors and focus the first problem. Returns true when valid. */
  validateForSave(): boolean {
    this.attempted.set(true);
    const first = this.rows().find((r) => r.issue !== null || r.error);
    if (first) this.inputs()[first.index]?.nativeElement.focus();
    return this.allValid();
  }

  focusRow(index: number): void {
    this.inputs()[index]?.nativeElement.focus();
  }

  protected metaId(i: number): string {
    return `score-meta-${this.dealNumber()}-${i}`;
  }

  protected ariaLabel(row: RowView): string {
    const base = `${row.player.name}, deal ${this.dealNumber()} score`;
    return this.mode() === 'edit' ? `${base}, was ${row.original}` : `${base}. Total so far ${row.player.total}`;
  }

  protected selectAll(event: FocusEvent): void {
    const el = event.target as HTMLInputElement;
    // Defer so mobile browsers don't immediately collapse the selection.
    setTimeout(() => el.select(), 0);
  }

  /** The keyboard's Next/Done key moves on only because the user pressed it. Never auto-advances. */
  protected onEnter(index: number, event: Event): void {
    event.preventDefault();
    if (index < this.rows().length - 1) this.focusRow(index + 1);
    else this.lastEnter.emit();
  }
}
