import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { AVATAR_COLORS, AvatarColor, Player } from '../../core/api/models';
import { PorterApi } from '../../core/api/porter-api';
import { fieldError, toProblem } from '../../core/api/problem';
import { AVATAR_CLASSES, initial } from '../../core/util/format';
import { Icon } from '../../shared/ui/icon';

export interface PlayerFormData {
  player?: Player;
}

/** Add or rename a player. Centered dialog on tablet/desktop, bottom sheet on phones. */
@Component({
  selector: 'p-player-form-dialog',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="dialog-surface flex flex-col gap-5" (ngSubmit)="save()" novalidate>
      <div class="mx-auto mt-1 h-1 w-9 rounded-full bg-border-strong md:hidden" aria-hidden="true"></div>
      <div class="flex items-center">
        <h2 id="player-form-title" class="h-section flex-1">{{ editing ? 'Edit player' : 'New player' }}</h2>
        <button type="button" class="icon-btn -mr-2" aria-label="Close" (click)="ref.close()"><p-icon name="close" /></button>
      </div>
      <div class="field">
        <label class="label" for="player-name">Name</label>
        <input id="player-name" name="name" class="input" [(ngModel)]="name" maxlength="40" autocomplete="off" required
          [attr.aria-invalid]="error() ? 'true' : null" aria-describedby="player-name-hint" />
        <span id="player-name-hint" class="hint" [class.!text-danger]="error()">{{ error() ?? 'First name or nickname. Shown on score rows and results.' }}</span>
      </div>
      <fieldset class="flex flex-col gap-2">
        <legend class="label mb-2">Avatar colour <span class="font-normal text-ink-muted">· optional</span></legend>
        <div class="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Avatar colour">
          @for (c of colors; track c) {
            <button type="button" role="radio" [attr.aria-checked]="color() === c" [attr.aria-label]="c"
              class="inline-flex size-10 items-center justify-center rounded-full font-medium" [class]="classes[c]"
              [class.ring-2]="color() === c" [class.ring-primary]="color() === c" [class.ring-offset-2]="color() === c"
              (click)="color.set(c)">{{ letter() }}</button>
          }
        </div>
      </fieldset>
      <button type="submit" class="btn btn-primary btn-lg btn-block" [class.is-busy]="busy()" [disabled]="busy()">
        {{ busy() ? 'Saving…' : editing ? 'Save changes' : 'Save player' }}</button>
    </form>
  `,
})
export class PlayerFormDialog {
  private readonly api = inject(PorterApi);
  protected readonly ref = inject<DialogRef<Player>>(DialogRef);
  private readonly data = inject<PlayerFormData>(DIALOG_DATA);

  protected readonly editing = !!this.data.player;
  protected readonly colors = AVATAR_COLORS;
  protected readonly classes = AVATAR_CLASSES;
  protected name = this.data.player?.name ?? '';
  protected readonly color = signal<AvatarColor>(this.data.player?.avatarColor ?? 'teal');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Client id so a retried create can't make a duplicate. */
  private readonly clientId = crypto.randomUUID();

  protected letter(): string {
    return initial(this.name || '?');
  }

  protected save(): void {
    const name = this.name.trim();
    if (!name) {
      this.error.set('Enter a name');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const request = this.data.player
      ? this.api.updatePlayer(this.data.player.id, { name, avatarColor: this.color() })
      : this.api.createPlayer({ id: this.clientId, name, avatarColor: this.color() });
    request.subscribe({
      next: (player) => this.ref.close(player),
      error: (e: unknown) => {
        this.busy.set(false);
        const p = toProblem(e);
        this.error.set(fieldError(p, 'name') ?? p.detail);
      },
    });
  }
}

@Injectable({ providedIn: 'root' })
export class PlayerFormLauncher {
  private readonly dialog = inject(Dialog);

  open(player?: Player): Observable<Player | undefined> {
    return this.dialog.open<Player>(PlayerFormDialog, {
      data: { player } satisfies PlayerFormData,
      ariaLabelledBy: 'player-form-title',
      backdropClass: 'porter-dialog-backdrop',
      panelClass: ['porter-dialog-panel', 'as-sheet'],
      autoFocus: '#player-name',
      restoreFocus: true,
    }).closed;
  }
}
