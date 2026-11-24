import { ChangeDetectionStrategy, Component, computed, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Player } from '../../../core/api/models';
import { PorterApi } from '../../../core/api/porter-api';
import { toProblem } from '../../../core/api/problem';
import { Avatar } from '../../../shared/ui/game-bits';
import { Icon } from '../../../shared/ui/icon';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;

/**
 * Pick 2–4 players in seat order. Search doubles as "add player": one tap creates and selects a new
 * player without leaving the form. Selected order = seat order = score-row order.
 */
@Component({
  selector: 'p-player-picker',
  imports: [FormsModule, Avatar, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="flex flex-col gap-3" [attr.aria-describedby]="'picker-count ' + (error() ? 'picker-error' : '')">
      <legend class="sr-only">Players</legend>
      <div class="flex items-baseline gap-1">
        <span class="label flex-1" aria-hidden="true">Players</span>
        <span id="picker-count" class="t-small tnum font-medium" [class]="countClass()">{{ selected().length }} of {{ max }}</span>
        <span class="t-small text-ink-muted">· {{ min }}–{{ max }} players</span>
      </div>

      @if (selectedPlayers().length) {
        <ol class="flex flex-col gap-1.5" aria-label="Selected players in seat order">
          @for (p of selectedPlayers(); track p.id; let i = $index; let first = $first; let last = $last) {
            <li class="card flex items-center gap-2.5 py-1.5 pr-1.5 pl-3">
              <span class="t-small tnum w-3.5 text-ink-muted" aria-hidden="true">{{ i + 1 }}</span>
              <p-avatar [name]="p.name" [color]="p.avatarColor" size="sm" />
              <span class="flex-1 truncate font-medium">{{ p.name }}<span class="sr-only">, seat {{ i + 1 }}</span></span>
              <button type="button" class="icon-btn" [disabled]="first" (click)="move(i, -1)" [attr.aria-label]="'Move ' + p.name + ' up'"><p-icon name="up" [size]="18" /></button>
              <button type="button" class="icon-btn" [disabled]="last" (click)="move(i, 1)" [attr.aria-label]="'Move ' + p.name + ' down'"><p-icon name="down" [size]="18" /></button>
              <button type="button" class="icon-btn" (click)="toggle(p)" [attr.aria-label]="'Remove ' + p.name"><p-icon name="close" [size]="18" /></button>
            </li>
          }
        </ol>
      }

      <div class="relative">
        <span class="pointer-events-none absolute top-3 left-3 text-ink-muted"><p-icon name="search" /></span>
        <input class="input pl-10" type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" (keydown.enter)="onEnterKey($event)"
          placeholder="Search or add a player" aria-label="Search or add a player" aria-controls="picker-results" maxlength="40" autocomplete="off" />
      </div>

      <ul id="picker-results" class="list" aria-label="Saved players">
        @if (canCreate()) {
          <li>
            <button type="button" class="row-item bg-[#FFFDF8]" (click)="create()" [disabled]="creating() || isFull()">
              <span class="inline-flex size-7 items-center justify-center rounded-full bg-primary-soft text-primary"><p-icon name="plus" [size]="16" /></span>
              <span class="flex-1">{{ creating() ? 'Adding…' : 'Add' }} <b class="font-medium">"{{ query().trim() }}"</b> as a new player</span>
            </button>
          </li>
        }
        @for (p of results(); track p.id) {
          <li>
            <button type="button" class="row-item min-h-12" (click)="toggle(p)" [attr.aria-pressed]="isSelected(p)"
              [disabled]="!isSelected(p) && isFull()">
              <span class="inline-flex size-5 shrink-0 items-center justify-center rounded border-[1.5px]"
                [class]="isSelected(p) ? 'border-primary bg-primary text-white' : 'border-border-strong'">
                @if (isSelected(p)) { <p-icon name="check" [size]="14" /> }
              </span>
              <p-avatar [name]="p.name" [color]="p.avatarColor" size="sm" />
              <span class="flex-1 truncate">{{ p.name }}</span>
              @if (isSelected(p)) {
                <span class="t-small text-ink-muted">Seat {{ selected().indexOf(p.id) + 1 }}</span>
              } @else if (isFull()) {
                <span class="t-small text-ink-muted">Game is full</span>
              }
            </button>
          </li>
        }
        @if (loading()) {
          <li class="row-item t-small text-ink-muted">Loading players…</li>
        } @else if (!results().length && !canCreate()) {
          <li class="row-item t-small text-ink-muted">{{ players().length ? 'No other players match.' : 'No saved players yet. Type a name to add one.' }}</li>
        }
      </ul>
      @if (error() || createError()) {
        <p id="picker-error" class="field-error" role="alert"><p-icon name="alert" [size]="16" />{{ createError() ?? error() }}</p>
      }
    </fieldset>
  `,
})
export class PlayerPicker {
  private readonly api = inject(PorterApi);

  /** Selected player ids in seat order (two-way bound). */
  readonly selected = model<string[]>([]);
  /** Validation message from the parent form (e.g. too few players on submit). */
  readonly error = input<string | null>(null);

  protected readonly min = MIN_PLAYERS;
  protected readonly max = MAX_PLAYERS;
  protected readonly players = signal<Player[]>([]);
  protected readonly loading = signal(true);
  protected readonly creating = signal(false);
  protected readonly query = signal('');
  readonly createError = signal<string | null>(null);

  constructor() {
    this.api.listPlayers().subscribe({
      next: (list) => {
        this.players.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected readonly selectedPlayers = computed(() => {
    const byId = new Map(this.players().map((p) => [p.id, p]));
    return this.selected().map((id) => byId.get(id)).filter((p): p is Player => !!p);
  });

  protected readonly results = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.players()
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .slice(0, q ? 20 : 12);
  });

  protected readonly canCreate = computed(() => {
    const q = this.query().trim();
    return q.length > 0 && q.length <= 40 && !this.players().some((p) => p.name.toLowerCase() === q.toLowerCase());
  });

  protected readonly isFull = computed(() => this.selected().length >= MAX_PLAYERS);
  protected readonly countClass = computed(() =>
    this.error() ? 'text-danger' : this.selected().length >= MIN_PLAYERS ? 'text-primary' : 'text-ink-muted',
  );

  protected isSelected(p: Player): boolean {
    return this.selected().includes(p.id);
  }

  protected toggle(p: Player): void {
    if (this.isSelected(p)) this.selected.update((ids) => ids.filter((id) => id !== p.id));
    else if (!this.isFull()) this.selected.update((ids) => [...ids, p.id]);
  }

  protected move(index: number, delta: number): void {
    this.selected.update((ids) => {
      const next = [...ids];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  }

  protected onEnterKey(event: Event): void {
    event.preventDefault();
    if (this.canCreate()) this.create();
    else if (this.results().length === 1) this.toggle(this.results()[0]);
  }

  protected create(): void {
    const name = this.query().trim();
    if (!name || this.isFull()) return;
    this.creating.set(true);
    this.createError.set(null);
    this.api.createPlayer({ id: crypto.randomUUID(), name }).subscribe({
      next: (player) => {
        this.players.update((list) => [...list, player]);
        this.selected.update((ids) => [...ids, player.id]);
        this.query.set('');
        this.creating.set(false);
      },
      error: (err: unknown) => {
        this.creating.set(false);
        const p = toProblem(err);
        this.createError.set(p.detail);
        // Name already taken (e.g. created on another device): refresh the list so it can be picked.
        if (p.code === 'player.duplicate_name') this.api.listPlayers().subscribe((list) => this.players.set(list));
      },
    });
  }
}
