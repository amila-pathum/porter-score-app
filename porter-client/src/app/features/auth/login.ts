import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { toProblem } from '../../core/api/problem';
import { AuthService } from '../../core/auth/auth.service';
import { safeReturnUrl } from '../../core/auth/auth.guards';
import { controlMessage } from '../../shared/forms';
import { Icon } from '../../shared/ui/icon';
import { AuthLayout } from './auth-layout';

@Component({
  selector: 'p-login-page',
  imports: [ReactiveFormsModule, RouterLink, AuthLayout, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-auth-layout heading="Welcome back" sub="Log in to keep score for your Porter games.">
      @if (reason() === 'expired' && !error()) {
        <div class="alert alert-info mb-4" role="status"><p-icon name="info" [size]="18" />Your session ended. Log in again to continue. Unsaved scores are kept on this device.</div>
      }
      @if (reason() === 'reset' && !error()) {
        <div class="alert alert-ok mb-4" role="status"><p-icon name="check" [size]="18" />Password updated. Log in with your new password.</div>
      }
      @if (error()) {
        <div class="alert alert-error mb-4" role="alert"><p-icon name="alert" [size]="18" />{{ error() }}</div>
      }
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex flex-col gap-4">
        <div class="field">
          <label class="label" for="login-email">Email</label>
          <input id="login-email" class="input" type="email" formControlName="email" autocomplete="email"
            [attr.aria-invalid]="showError('email') ? 'true' : null" [attr.aria-describedby]="showError('email') ? 'login-email-err' : null" />
          @if (showError('email')) {
            <span id="login-email-err" class="field-error">{{ message('email') }}</span>
          }
        </div>
        <div class="field">
          <label class="label" for="login-password">Password</label>
          <div class="relative">
            <input id="login-password" class="input pr-12" [type]="reveal() ? 'text' : 'password'" formControlName="password"
              autocomplete="current-password" [attr.aria-invalid]="showError('password') ? 'true' : null"
              [attr.aria-describedby]="showError('password') ? 'login-password-err' : null" />
            <button type="button" class="icon-btn absolute top-0 right-0 text-ink-muted" (click)="reveal.set(!reveal())"
              [attr.aria-label]="reveal() ? 'Hide password' : 'Show password'" [attr.aria-pressed]="reveal()">
              <p-icon [name]="reveal() ? 'eyeOff' : 'eye'" />
            </button>
          </div>
          @if (showError('password')) {
            <span id="login-password-err" class="field-error">{{ message('password') }}</span>
          }
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <label class="flex min-h-11 items-center gap-2 text-[14px]">
            <input type="checkbox" formControlName="rememberMe" class="size-5 accent-[#1E5E57]" />Keep me logged in
          </label>
          <span class="flex-1"></span>
          <a routerLink="/forgot-password" class="text-[14px] font-medium">Forgot password?</a>
        </div>
        <button type="submit" class="btn btn-primary btn-lg btn-block" [class.is-busy]="busy()" [disabled]="busy()">
          {{ busy() ? 'Logging in…' : 'Log in' }}
        </button>
      </form>
      <p class="t-small mt-6 text-center text-ink-muted">New to Porter? <a routerLink="/register" class="font-medium">Create an account</a></p>
    </p-auth-layout>
  `,
})
export class LoginPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly returnUrl = input<string | null>(null);
  readonly reason = input<string | null>(null);
  readonly email = input<string | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    rememberMe: [true],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly reveal = signal(false);
  private readonly submitted = signal(false);

  ngOnInit(): void {
    if (this.email()) this.form.controls.email.setValue(this.email()!);
  }

  protected showError(name: 'email' | 'password'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  protected message(name: 'email' | 'password'): string | null {
    return controlMessage(this.form.controls[name], { required: name === 'email' ? 'Enter your email' : 'Enter your password' });
  }

  protected submit(): void {
    this.submitted.set(true);
    this.error.set(null);
    if (this.form.invalid) {
      document.getElementById(this.form.controls.email.invalid ? 'login-email' : 'login-password')?.focus();
      return;
    }
    const { email, password, rememberMe } = this.form.getRawValue();
    this.busy.set(true);
    this.auth.login(email.trim(), password, rememberMe).subscribe({
      next: () => void this.router.navigateByUrl(safeReturnUrl(this.returnUrl())),
      error: (err: unknown) => {
        this.busy.set(false);
        const p = toProblem(err);
        this.error.set(p.status === 401 ? "That email and password don't match. Check both and try again." : p.detail);
      },
    });
  }
}
