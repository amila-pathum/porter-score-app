import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toProblem } from '../../core/api/problem';
import { AuthService } from '../../core/auth/auth.service';
import { controlMessage } from '../../shared/forms';
import { Icon } from '../../shared/ui/icon';
import { AuthLayout } from './auth-layout';

const RESEND_SECONDS = 45;

@Component({
  selector: 'p-forgot-password-page',
  imports: [ReactiveFormsModule, RouterLink, AuthLayout, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-auth-layout heading="Reset your password" sub="We'll email you a link to choose a new one." backLink="/login">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex flex-col gap-4">
        <div class="field">
          <label class="label" for="fp-email">Email</label>
          <input id="fp-email" class="input" type="email" formControlName="email" autocomplete="email"
            [attr.aria-invalid]="showError() ? 'true' : null" [attr.aria-describedby]="showError() ? 'fp-email-err' : null" />
          @if (showError()) { <span id="fp-email-err" class="field-error">{{ message() }}</span> }
        </div>
        @if (error()) {
          <div class="alert alert-error" role="alert"><p-icon name="alert" [size]="18" />{{ error() }}</div>
        }
        @if (sentTo()) {
          <div class="card flex flex-col gap-2 border-[#B8D5C1] bg-[#F4F9F6] p-5" role="status">
            <div class="flex items-center gap-2"><span class="inline-flex size-8 items-center justify-center rounded-full bg-success-soft text-success"><p-icon name="check" [size]="16" /></span>
              <span class="h-card">Check your email</span></div>
            <p class="t-small text-ink-muted">If an account exists for {{ sentTo() }}, a reset link is on its way. It expires in 30 minutes.</p>
          </div>
          <button type="submit" class="btn btn-secondary btn-lg btn-block" [disabled]="countdown() > 0 || busy()">
            {{ countdown() > 0 ? 'Resend link in 0:' + pad(countdown()) : 'Resend link' }}
          </button>
        } @else {
          <button type="submit" class="btn btn-primary btn-lg btn-block" [class.is-busy]="busy()" [disabled]="busy()">
            {{ busy() ? 'Sending…' : 'Send reset link' }}
          </button>
        }
        <a routerLink="/login" class="btn btn-ghost btn-block">Back to log in</a>
      </form>
    </p-auth-layout>
  `,
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);
  protected readonly form = inject(NonNullableFormBuilder).group({ email: ['', [Validators.required, Validators.email]] });
  protected readonly busy = signal(false);
  protected readonly sentTo = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly countdown = signal(0);
  private readonly submitted = signal(false);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.timer && clearInterval(this.timer));
  }

  protected showError(): boolean {
    const c = this.form.controls.email;
    return c.invalid && (c.touched || this.submitted());
  }

  protected message(): string | null {
    return controlMessage(this.form.controls.email, { required: 'Enter your email' });
  }

  protected pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  protected submit(): void {
    this.submitted.set(true);
    this.error.set(null);
    if (this.form.invalid) return;
    const email = this.form.controls.email.value.trim();
    this.busy.set(true);
    this.auth.forgotPassword(email).subscribe({
      next: () => {
        this.busy.set(false);
        this.sentTo.set(email);
        this.startCountdown();
      },
      error: (err: unknown) => {
        this.busy.set(false);
        this.error.set(toProblem(err).detail);
      },
    });
  }

  private startCountdown(): void {
    this.countdown.set(RESEND_SECONDS);
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.countdown.update((n) => Math.max(0, n - 1));
      if (this.countdown() === 0 && this.timer) clearInterval(this.timer);
    }, 1000);
  }
}
