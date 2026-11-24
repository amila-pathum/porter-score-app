import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PorterApi } from '../../core/api/porter-api';
import { fieldError, toProblem } from '../../core/api/problem';
import { AuthService } from '../../core/auth/auth.service';
import { PreferencesService } from '../../core/ui/browser.services';
import { ToastService } from '../../core/ui/toast.service';
import { controlMessage, passwordPolicy } from '../../shared/forms';
import { Icon } from '../../shared/ui/icon';

@Component({
  selector: 'p-settings-page',
  imports: [ReactiveFormsModule, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-narrow">
      <header class="-ml-2 mb-2 flex min-h-11 items-center gap-1 md:hidden">
        <a routerLink="/profile" class="icon-btn" aria-label="Back to profile"><p-icon name="back" /></a>
      </header>
      <h1 class="h-page mb-5">Settings</h1>

      <section class="mb-6" aria-labelledby="prefs-heading">
        <h2 id="prefs-heading" class="t-caption mb-2">Preferences</h2>
        <div class="list">
          <label class="row-item cursor-pointer">
            <div class="flex flex-1 flex-col"><span>Keep screen on during games</span>
              <span class="t-small text-ink-muted">Stops the phone locking between deals (where the browser supports it)</span></div>
            <input type="checkbox" role="switch" class="size-6 accent-[#1E5E57]" [checked]="prefs.keepScreenOn()"
              (change)="prefs.setKeepScreenOn($any($event.target).checked)" aria-label="Keep screen on during games" />
          </label>
          <div class="row-item"><div class="flex flex-1 flex-col"><span>Theme</span><span class="t-small text-ink-muted">A dark theme may come later</span></div>
            <span class="t-small text-ink-muted">Light</span></div>
        </div>
      </section>

      <section class="mb-6" aria-labelledby="pw-heading">
        <h2 id="pw-heading" class="t-caption mb-2">Security</h2>
        <form [formGroup]="pw" (ngSubmit)="changePassword()" novalidate class="card flex flex-col gap-4 p-4">
          <h3 class="h-card">Change password</h3>
          <div class="field">
            <label class="label" for="current-password">Current password</label>
            <input id="current-password" type="password" class="input" formControlName="currentPassword" autocomplete="current-password"
              [attr.aria-invalid]="showPw('currentPassword') ? 'true' : null" aria-describedby="current-password-err" />
            @if (showPw('currentPassword')) { <span id="current-password-err" class="field-error">{{ pwMsg('currentPassword') }}</span> }
          </div>
          <div class="field">
            <label class="label" for="new-password">New password</label>
            <input id="new-password" type="password" class="input" formControlName="newPassword" autocomplete="new-password"
              [attr.aria-invalid]="showPw('newPassword') ? 'true' : null" aria-describedby="new-password-hint" />
            <span id="new-password-hint" class="hint" [class.!text-danger]="showPw('newPassword')">
              {{ showPw('newPassword') ? pwMsg('newPassword') : 'At least 8 characters, with a letter and a number.' }}</span>
          </div>
          <button type="submit" class="btn btn-secondary self-start" [disabled]="pwBusy()">{{ pwBusy() ? 'Saving…' : 'Update password' }}</button>
        </form>
      </section>

      <section aria-labelledby="danger-heading">
        <h2 id="danger-heading" class="t-caption mb-2">Account</h2>
        <div class="card flex flex-col gap-3 p-4">
          <button type="button" class="btn btn-secondary self-start" (click)="logout()"><p-icon name="logout" [size]="18" />Log out</button>
          <div class="h-px bg-border"></div>
          @if (!confirmingDelete()) {
            <div><h3 class="h-card">Delete account</h3>
              <p class="t-small mt-1 text-ink-muted">Permanently deletes your account, games and players.</p></div>
            <button type="button" class="btn btn-danger-outline self-start" (click)="confirmingDelete.set(true)">Delete account…</button>
          } @else {
            <form [formGroup]="del" (ngSubmit)="deleteAccount()" novalidate class="flex flex-col gap-3" role="alert">
              <p class="t-small font-medium text-danger">This deletes every game and player on your account. It can't be undone.</p>
              <div class="field">
                <label class="label" for="delete-password">Enter your password to confirm</label>
                <input id="delete-password" type="password" class="input" formControlName="password" autocomplete="current-password"
                  [attr.aria-invalid]="delError() ? 'true' : null" aria-describedby="delete-err" />
                @if (delError()) { <span id="delete-err" class="field-error">{{ delError() }}</span> }
              </div>
              <div class="flex gap-2">
                <button type="button" class="btn btn-secondary" (click)="confirmingDelete.set(false)">Cancel</button>
                <button type="submit" class="btn btn-danger" [disabled]="delBusy()">{{ delBusy() ? 'Deleting…' : 'Delete my account' }}</button>
              </div>
            </form>
          }
        </div>
      </section>
    </div>
  `,
})
export class SettingsPage {
  protected readonly prefs = inject(PreferencesService);
  private readonly api = inject(PorterApi);
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(ToastService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly pw = this.fb.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, passwordPolicy]],
  });
  protected readonly del = this.fb.group({ password: ['', Validators.required] });
  protected readonly pwBusy = signal(false);
  protected readonly pwAttempted = signal(false);
  protected readonly confirmingDelete = signal(false);
  protected readonly delBusy = signal(false);
  protected readonly delError = signal<string | null>(null);

  protected showPw(name: 'currentPassword' | 'newPassword'): boolean {
    const c = this.pw.controls[name];
    return c.invalid && (c.touched || this.pwAttempted());
  }

  protected pwMsg(name: 'currentPassword' | 'newPassword'): string | null {
    return controlMessage(this.pw.controls[name], { required: name === 'currentPassword' ? 'Enter your current password' : 'Choose a new password' });
  }

  protected changePassword(): void {
    this.pwAttempted.set(true);
    if (this.pw.invalid) return;
    this.pwBusy.set(true);
    this.api.changePassword(this.pw.getRawValue()).subscribe({
      next: () => {
        this.pwBusy.set(false);
        this.pw.reset();
        this.pwAttempted.set(false);
        this.toasts.success('Password updated');
      },
      error: (e: unknown) => {
        this.pwBusy.set(false);
        const p = toProblem(e);
        const current = fieldError(p, 'currentPassword');
        const next = fieldError(p, 'newPassword');
        if (current) this.pw.controls.currentPassword.setErrors({ server: current });
        if (next) this.pw.controls.newPassword.setErrors({ server: next });
        if (!current && !next) this.toasts.error(p.detail);
      },
    });
  }

  protected deleteAccount(): void {
    if (this.del.invalid) {
      this.delError.set('Enter your password');
      return;
    }
    this.delBusy.set(true);
    this.delError.set(null);
    this.api.deleteAccount(this.del.controls.password.value).subscribe({
      next: () => {
        this.auth.clear();
        void this.router.navigateByUrl('/login');
      },
      error: (e: unknown) => {
        this.delBusy.set(false);
        const p = toProblem(e);
        this.delError.set(fieldError(p, 'password') ?? p.detail);
      },
    });
  }

  protected logout(): void {
    this.auth.logout().subscribe();
  }
}
