import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PorterApi } from '../../../core/api/porter-api';
import { fieldError, toProblem } from '../../../core/api/problem';
import { ToastService } from '../../../core/ui/toast.service';
import { defaultGameName } from '../../../core/util/format';
import { Icon } from '../../../shared/ui/icon';
import { MAX_PLAYERS, MIN_PLAYERS, PlayerPicker } from '../shared/player-picker';

/** One screen, no wizard. "Create & start" is the fast path; "Save for later" creates a draft for setup. */
@Component({
  selector: 'p-create-game-page',
  imports: [FormsModule, RouterLink, Icon, PlayerPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-narrow pt-2 pb-48 md:pt-6">
      <header class="-ml-2 mb-2 flex min-h-14 items-center gap-1">
        <a routerLink="/dashboard" class="icon-btn" aria-label="Close"><p-icon name="close" /></a>
        <h1 class="text-[17px] font-medium md:text-[22px]">New game</h1>
      </header>

      <form (ngSubmit)="create(true)" novalidate class="flex flex-col gap-6">
        <div class="field">
          <label class="label" for="game-name">Game name</label>
          <input id="game-name" name="name" class="input" [(ngModel)]="name" maxlength="60" [placeholder]="placeholder" autocomplete="off"
            [attr.aria-invalid]="nameError() ? 'true' : null" aria-describedby="game-name-hint" />
          <span id="game-name-hint" class="hint" [class.!text-danger]="nameError()">{{ nameError() ?? 'Defaults to “' + placeholder + '” if you leave it blank.' }}</span>
        </div>

        <p-player-picker [(selected)]="playerIds" [error]="playersError()" />

        @if (error()) {
          <div class="alert alert-error" role="alert"><p-icon name="alert" [size]="18" />
            <span class="flex-1">{{ error() }}</span></div>
        }

        <div class="fixed inset-x-0 bottom-0 z-20 flex flex-col gap-1 border-t border-border bg-surface px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] md:static md:border-0 md:bg-transparent md:p-0">
          <button type="submit" class="btn btn-primary btn-lg btn-block" [class.is-busy]="busy() === 'start'" [disabled]="!!busy()" data-testid="create-start">
            {{ busy() === 'start' ? 'Creating…' : error() ? 'Try again' : 'Create & start' }}</button>
          <button type="button" class="btn btn-ghost btn-block" [disabled]="!!busy()" (click)="create(false)">
            {{ busy() === 'draft' ? 'Saving…' : 'Save for later' }}</button>
        </div>
      </form>
    </div>
  `,
})
export class CreateGamePage {
  private readonly api = inject(PorterApi);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly placeholder = defaultGameName();
  protected name = '';
  protected readonly playerIds = signal<string[]>([]);
  protected readonly busy = signal<'start' | 'draft' | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly nameError = signal<string | null>(null);
  private readonly attempted = signal(false);
  /** One id per form session: retries after a network failure can't create a duplicate game. */
  private readonly clientId = crypto.randomUUID();

  protected playersError(): string | null {
    const count = this.playerIds().length;
    if (!this.attempted() || count >= MIN_PLAYERS) return null;
    return `Add at least ${MIN_PLAYERS - count} more ${MIN_PLAYERS - count === 1 ? 'player' : 'players'}. Games need ${MIN_PLAYERS}–${MAX_PLAYERS}.`;
  }

  protected create(start: boolean): void {
    this.attempted.set(true);
    this.error.set(null);
    this.nameError.set(null);
    if (this.playersError()) return;

    this.busy.set(start ? 'start' : 'draft');
    this.api.createGame({ id: this.clientId, name: this.name.trim() || this.placeholder, playerIds: this.playerIds(), start }).subscribe({
      next: (game) => {
        if (!start) this.toasts.success(`${game.name} saved. Start it when you're ready.`);
        void this.router.navigate(['/games', game.id, start ? 'play' : 'setup']);
      },
      error: (err: unknown) => {
        this.busy.set(null);
        const p = toProblem(err);
        this.nameError.set(fieldError(p, 'name'));
        this.error.set(p.status === 0 ? "Couldn't create the game. Check your connection and try again." : p.detail);
      },
    });
  }
}
