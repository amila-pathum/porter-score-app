import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Player } from '../../core/api/models';
import { PorterApi } from '../../core/api/porter-api';
import { toProblem } from '../../core/api/problem';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/ui/toast.service';
import { Avatar } from '../../shared/ui/game-bits';
import { Icon } from '../../shared/ui/icon';

/** Account details, the "This is me" link, and shortcuts. On mobile this is the Profile tab. */
@Component({
  selector: 'p-profile-page',
  imports: [FormsModule, RouterLink, Avatar, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-narrow">
      <h1 class="h-page mb-4">Profile</h1>
      @if (auth.user(); as u) {
        <section class="card mb-4 flex flex-wrap items-center gap-3 px-4 py-3.5" aria-label="Account">
          <p-avatar [name]="u.displayName" size="lg" />
          @if (editing()) {
            <form class="flex min-w-0 flex-1 gap-2" (ngSubmit)="saveName()">
              <label for="display-name" class="sr-only">Your name</label>
              <input id="display-name" name="displayName" class="input" [(ngModel)]="nameDraft" maxlength="60" required />
              <button type="submit" class="btn btn-primary" [disabled]="!nameDraft.trim() || busy()">Save</button>
            </form>
          } @else {
            <div class="flex min-w-0 flex-1 flex-col"><span class="truncate font-medium">{{ u.displayName }}</span>
              <span class="t-small truncate text-ink-muted">{{ u.email }}</span></div>
            <button type="button" class="btn btn-secondary btn-sm" (click)="startEdit()">Edit</button>
          }
        </section>

        <section class="mb-4" aria-labelledby="me-heading">
          <h2 id="me-heading" class="t-caption mb-2">This is me</h2>
          <div class="card flex flex-col gap-3 px-4 py-3.5">
            <p class="t-small text-ink-muted">Your dashboard record and Statistics page are calculated from this player.</p>
            <label for="me-select" class="sr-only">Player that represents you</label>
            <select id="me-select" class="input" [ngModel]="u.mePlayerId ?? ''" (ngModelChange)="setMe($event)" [disabled]="busy()">
              <option value="">Not set</option>
              @for (p of players(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }
            </select>
          </div>
        </section>

        <nav class="list mb-4" aria-label="More">
          <a routerLink="/statistics" class="row-item"><p-icon name="chart" class="text-primary" /><span class="flex-1 font-medium">Statistics</span><p-icon name="next" class="text-ink-muted" /></a>
          <a routerLink="/settings" class="row-item"><p-icon name="settings" class="text-primary" /><span class="flex-1 font-medium">Settings</span><p-icon name="next" class="text-ink-muted" /></a>
          <button type="button" class="row-item" (click)="logout()"><p-icon name="logout" /><span class="flex-1">Log out</span></button>
        </nav>
      }
    </div>
  `,
})
export class ProfilePage {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(PorterApi);
  private readonly toasts = inject(ToastService);

  protected readonly players = signal<Player[]>([]);
  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected nameDraft = '';

  constructor() {
    this.api.listPlayers().subscribe((p) => this.players.set(p));
  }

  protected startEdit(): void {
    this.nameDraft = this.auth.user()?.displayName ?? '';
    this.editing.set(true);
  }

  protected saveName(): void {
    this.update({ displayName: this.nameDraft.trim() }, 'Name updated', () => this.editing.set(false));
  }

  protected setMe(playerId: string): void {
    this.update(playerId ? { mePlayerId: playerId } : { clearMePlayer: true }, playerId ? '“This is me” updated' : '“This is me” cleared');
  }

  protected logout(): void {
    this.auth.logout().subscribe();
  }

  private update(body: { displayName?: string; mePlayerId?: string; clearMePlayer?: boolean }, message: string, done?: () => void): void {
    this.busy.set(true);
    this.api.updateAccount(body).subscribe({
      next: (account) => {
        this.auth.updateUser(account);
        this.busy.set(false);
        this.toasts.success(message);
        done?.();
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.toasts.error(toProblem(e).detail);
      },
    });
  }
}
