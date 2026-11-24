import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PorterApi } from '../../../core/api/porter-api';
import { toProblem } from '../../../core/api/problem';
import { ConfirmService } from '../../../core/ui/confirm.service';
import { ToastService } from '../../../core/ui/toast.service';
import { shortDate, time } from '../../../core/util/format';
import { Avatar } from '../../../shared/ui/game-bits';
import { Icon } from '../../../shared/ui/icon';
import { ErrorState, Skeleton } from '../../../shared/ui/states';
import { GameStore, screenFor } from '../shared/game-store';
import { MIN_PLAYERS, PlayerPicker } from '../shared/player-picker';

/** A game saved for later: check seats, rename, change players, then start. Players lock at start. */
@Component({
  selector: 'p-setup-page',
  imports: [FormsModule, RouterLink, Avatar, Icon, PlayerPicker, ErrorState, Skeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-narrow pt-2 pb-40 md:pt-6">
      <header class="-ml-2 flex min-h-14 items-center gap-1">
        <a routerLink="/games" class="icon-btn" aria-label="Back to games"><p-icon name="back" /></a>
        <span class="flex-1"></span>
        @if (game()) {
          <button type="button" class="btn btn-danger-outline btn-sm" (click)="remove()"><p-icon name="trash" [size]="16" />Delete</button>
        }
      </header>

      @if (store.error() && !game()) {
        <p-error-state [problem]="store.error()" (retry)="store.reload()" />
      } @else if (!game()) {
        <p-skeleton />
      } @else if (game(); as g) {
        <div class="mb-6 flex flex-col gap-1.5">
          <span class="badge badge-draft self-start">Setup</span>
          @if (renaming()) {
            <form class="flex gap-2" (ngSubmit)="saveName()">
              <label for="setup-name" class="sr-only">Game name</label>
              <input id="setup-name" name="name" class="input" [(ngModel)]="nameDraft" maxlength="60" required />
              <button class="btn btn-primary" type="submit" [disabled]="!nameDraft.trim()">Save</button>
              <button class="btn btn-secondary" type="button" (click)="renaming.set(false)">Cancel</button>
            </form>
          } @else {
            <div class="flex items-center gap-1">
              <h1 class="h-page">{{ g.name }}</h1>
              <button type="button" class="icon-btn" aria-label="Rename game" (click)="startRename()"><p-icon name="edit" [size]="18" /></button>
            </div>
          }
          <p class="t-small text-ink-muted">Created {{ shortDate(g.createdAt) }}, {{ time(g.createdAt) }} · {{ g.players.length }} players</p>
        </div>

        @if (editingPlayers()) {
          <div class="mb-6 flex flex-col gap-3">
            <p-player-picker [(selected)]="seatDraft" [error]="seatError()" />
            <div class="flex gap-2">
              <button type="button" class="btn btn-primary" (click)="savePlayers()" [disabled]="busy()">Save seats</button>
              <button type="button" class="btn btn-secondary" (click)="editingPlayers.set(false)">Cancel</button>
            </div>
          </div>
        } @else {
          <section class="mb-6" aria-labelledby="seats-heading">
            <div class="mb-2 flex items-center"><h2 id="seats-heading" class="h-card flex-1">Seats</h2>
              <button type="button" class="btn btn-ghost btn-sm" (click)="startEditPlayers()">Edit players</button></div>
            <ol class="list">
              @for (p of g.players; track p.playerId) {
                <li class="row-item"><span class="t-small tnum w-3.5 text-ink-muted">{{ p.seat }}</span>
                  <p-avatar [name]="p.name" [color]="p.avatarColor" /><span class="flex-1 font-medium">{{ p.name }}</span></li>
              }
            </ol>
            <p class="t-small mt-2 text-ink-muted">Seat order is the order of the score rows. Players can't change once the game starts.</p>
          </section>
        }

        <section class="panel flex flex-col gap-2.5 p-4" aria-labelledby="rules-heading">
          <h2 id="rules-heading" class="h-card">How Porter keeps score</h2>
          <div class="t-small flex items-center gap-2.5"><span class="rank bg-surface">13</span>deals per game. It ends automatically after Deal 13.</div>
          <div class="t-small flex items-center gap-2.5"><span class="rank bg-surface">0+</span>one whole-number score per player, every deal</div>
          <div class="t-small flex items-center gap-2.5"><span class="rank first">↓</span>lowest total wins. Tied totals share a rank.</div>
          <div class="t-small flex items-center gap-2.5"><span class="rank bg-surface">A</span>wild card goes Ace, 2–10, Jack, Queen, King. Shown for reference.</div>
        </section>

        @if (error()) {
          <div class="alert alert-error mt-4" role="alert"><p-icon name="alert" [size]="18" />{{ error() }}</div>
        }

        <div class="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))] md:static md:mt-6 md:border-0 md:bg-transparent md:p-0">
          <button type="button" class="btn btn-primary btn-lg btn-block" [class.is-busy]="busy()" [disabled]="busy() || editingPlayers() || g.players.length < min"
            (click)="start()">{{ busy() ? 'Starting…' : 'Start game · Deal 1' }}</button>
        </div>
      }
    </div>
  `,
})
export class SetupPage {
  protected readonly store = inject(GameStore);
  private readonly api = inject(PorterApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly id = input.required<string>();
  protected readonly min = MIN_PLAYERS;
  protected readonly shortDate = shortDate;
  protected readonly time = time;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly renaming = signal(false);
  protected readonly editingPlayers = signal(false);
  protected readonly seatDraft = signal<string[]>([]);
  protected nameDraft = '';

  protected readonly game = computed(() => {
    const g = this.store.game();
    return g && g.id === this.id() ? g : null;
  });
  protected readonly seatError = computed(() =>
    this.seatDraft().length < MIN_PLAYERS ? `Games need at least ${MIN_PLAYERS} players.` : null,
  );

  constructor() {
    effect(() => this.store.load(this.id()));
    effect(() => {
      const g = this.game();
      if (g && g.status !== 'draft') void this.router.navigate(['/games', g.id, screenFor(g)], { replaceUrl: true });
    });
  }

  protected startRename(): void {
    this.nameDraft = this.game()?.name ?? '';
    this.renaming.set(true);
  }

  protected saveName(): void {
    this.patch({ name: this.nameDraft.trim() }, () => this.renaming.set(false));
  }

  protected startEditPlayers(): void {
    this.seatDraft.set(this.game()?.players.map((p) => p.playerId) ?? []);
    this.editingPlayers.set(true);
  }

  protected savePlayers(): void {
    if (this.seatError()) return;
    this.patch({ playerIds: this.seatDraft() }, () => this.editingPlayers.set(false));
  }

  protected start(): void {
    const g = this.game();
    if (!g) return;
    this.busy.set(true);
    this.api.startGame(g.id).subscribe({
      next: (started) => {
        this.store.set(started);
        void this.router.navigate(['/games', g.id, 'play']);
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(toProblem(e).detail);
      },
    });
  }

  protected remove(): void {
    const g = this.game();
    if (!g) return;
    this.confirm.ask({ title: `Delete ${g.name}?`, body: "This game hasn't started. It will be removed.", confirmLabel: 'Delete game', destructive: true })
      .subscribe((ok) => {
        if (!ok) return;
        this.api.deleteGame(g.id).subscribe({
          next: () => {
            this.toasts.success(`${g.name} deleted`);
            void this.router.navigateByUrl('/games');
          },
          error: (e: unknown) => this.error.set(toProblem(e).detail),
        });
      });
  }

  private patch(body: { name?: string; playerIds?: string[] }, done: () => void): void {
    const g = this.game();
    if (!g) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.updateGame(g.id, { ...body, expectedVersion: g.version }).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.store.set(updated);
        done();
      },
      error: (e: unknown) => {
        this.busy.set(false);
        const p = toProblem(e);
        this.error.set(p.status === 409 ? 'This game changed on another device. Reload and try again.' : p.detail);
      },
    });
  }
}
