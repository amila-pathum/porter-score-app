import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { fieldError, toProblem } from '../../core/api/problem';
import { AuthService } from '../../core/auth/auth.service';
import { controlMessage, passwordPolicy } from '../../shared/forms';
import { Icon } from '../../shared/ui/icon';
import { AuthLayout } from './auth-layout';

@Component({
  selector: 'p-reset-password-page',
  imports: [ReactiveFormsModule, RouterLink, AuthLayout, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-auth-layout heading="Choose a new password" [sub]="email() ? 'For ' + email() : null" backLink="/login">
      @if (!email() || !token()) {
        <div class="alert alert-error" role="alert"><p-icon name="alert" [size]="18" />
          <span>This reset link is incomplete. <a routerLink="/forgot-password" class="font-medium">Send a new one</a>.</span></div>
      } @else {
        @if (expired()) {
          <div class="alert alert-error mb-4" role="alert"><p-icon name="alert" [size]="18" />
            <span>This reset link has expired or was already used. <a routerLink="/forgot-password" class="font-medium">Send a new one</a>.</span></div>
        } @else if (error()) {
          <div class="alert alert-error mb-4" role="alert"><p-icon name="alert" [size]="18" />{{ error() }}</div>
        }
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex flex-col gap-4">
          <div class="field">
            <label class="label" for="rp-password">New password</label>
            <input id="rp-password" class="input" [type]="reveal() ? 'text' : 'password'" formControlName="password" autocomplete="new-password"
              [attr.aria-invalid]="showError() ? 'true' : null" aria-describedby="rp-hint" />
            <span id="rp-hint" class="hint" [class.!text-danger]="showError()">{{ showError() ? message() : 'At least 8 characters, with a letter and a number.' }}</span>
          </div>
          <label class="flex min-h-11 items-center gap-2 text-[14px]"><input type="checkbox" class="size-5 accent-[#1E5E57]" [checked]="reveal()" (change)="reveal.set(!reveal())" />Show password</label>
          <button type="submit" class="btn btn-primary btn-lg btn-block" [class.is-busy]="busy()" [disabled]="busy()">
            {{ busy() ? 'Saving…' : 'Set new password' }}
          </button>
        </form>
      }
    </p-auth-layout>
  `,
})
export class ResetPasswordPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly email = input<string | null>(null);
  readonly token = input<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({ password: ['', [Validators.required, passwordPolicy]] });
  protected readonly busy = signal(false);
  protected readonly reveal = signal(false);
  protected readonly expired = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly submitted = signal(false);

  protected showError(): boolean {
    const c = this.form.controls.password;
    return c.invalid && (c.touched || this.submitted());
  }

  protected message(): string | null {
    return controlMessage(this.form.controls.password, { required: 'Choose a new password' });
  }

  protected submit(): void {
    this.submitted.set(true);
    this.error.set(null);
    if (this.form.invalid) return;
    this.busy.set(true);
    this.auth.resetPassword(this.email()!, this.token()!, this.form.controls.password.value).subscribe({
      next: () => void this.router.navigate(['/login'], { queryParams: { email: this.email(), reason: 'reset' } }),
      error: (err: unknown) => {
        this.busy.set(false);
        const p = toProblem(err);
        if (fieldError(p, 'token')) this.expired.set(true);
        else if (fieldError(p, 'password')) this.form.controls.password.setErrors({ server: fieldError(p, 'password') });
        else this.error.set(p.detail);
      },
    });
  }
}
