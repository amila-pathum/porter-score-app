import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { fieldError, toProblem } from '../../core/api/problem';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/ui/toast.service';
import { controlMessage, passwordPolicy, passwordStrength } from '../../shared/forms';
import { Icon } from '../../shared/ui/icon';
import { AuthLayout } from './auth-layout';

type Field = 'displayName' | 'email' | 'password';

@Component({
  selector: 'p-register-page',
  imports: [ReactiveFormsModule, RouterLink, AuthLayout, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-auth-layout heading="Create your account" sub="Only the scorekeeper needs an account. Players are just names." backLink="/login">
      @if (error()) {
        <div class="alert alert-error mb-4" role="alert"><p-icon name="alert" [size]="18" /><span>{{ error() }}
          @if (emailTaken()) { <a routerLink="/login" [queryParams]="{ email: form.controls.email.value }" class="font-medium">Log in instead</a> }</span></div>
      }
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate class="flex flex-col gap-4">
        <div class="field">
          <label class="label" for="reg-name">Your name</label>
          <input id="reg-name" class="input" formControlName="displayName" autocomplete="name" maxlength="60"
            [attr.aria-invalid]="show('displayName') ? 'true' : null" [attr.aria-describedby]="show('displayName') ? 'reg-name-err' : null" />
          @if (show('displayName')) { <span id="reg-name-err" class="field-error">{{ msg('displayName') }}</span> }
        </div>
        <div class="field">
          <label class="label" for="reg-email">Email</label>
          <input id="reg-email" class="input" type="email" formControlName="email" autocomplete="email"
            [attr.aria-invalid]="show('email') ? 'true' : null" [attr.aria-describedby]="show('email') ? 'reg-email-err' : null" />
          @if (show('email')) { <span id="reg-email-err" class="field-error">{{ msg('email') }}</span> }
        </div>
        <div class="field">
          <label class="label" for="reg-password">Password</label>
          <div class="relative">
            <input id="reg-password" class="input pr-12" [type]="reveal() ? 'text' : 'password'" formControlName="password" autocomplete="new-password"
              [attr.aria-invalid]="show('password') ? 'true' : null" aria-describedby="reg-password-hint" />
            <button type="button" class="icon-btn absolute top-0 right-0 text-ink-muted" (click)="reveal.set(!reveal())"
              [attr.aria-label]="reveal() ? 'Hide password' : 'Show password'" [attr.aria-pressed]="reveal()">
              <p-icon [name]="reveal() ? 'eyeOff' : 'eye'" />
            </button>
          </div>
          @if (strength().level > 0) {
            <div class="mt-1 grid grid-cols-3 gap-1" aria-hidden="true">
              @for (i of [1, 2, 3]; track i) {
                <span class="h-1 rounded-full" [class]="i <= strength().level ? (strength().level === 1 ? 'bg-danger' : 'bg-primary') : 'bg-surface-sunken'"></span>
              }
            </div>
          }
          <span id="reg-password-hint" class="hint" [class.!text-danger]="show('password')">
            @if (strength().level > 0) { <b class="font-medium text-ink">{{ strength().label }}.</b> }
            {{ show('password') ? msg('password') : 'At least 8 characters, with a letter and a number.' }}
          </span>
        </div>
        <button type="submit" class="btn btn-primary btn-lg btn-block" [class.is-busy]="busy()" [disabled]="busy()">
          {{ busy() ? 'Creating account…' : 'Create account' }}
        </button>
      </form>
      <p class="t-small mt-6 text-center text-ink-muted">Already have an account? <a routerLink="/login" class="font-medium">Log in</a></p>
    </p-auth-layout>
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly form = inject(NonNullableFormBuilder).group({
    displayName: ['', [Validators.required, Validators.maxLength(60)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, passwordPolicy]],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly emailTaken = signal(false);
  protected readonly reveal = signal(false);
  private readonly submitted = signal(false);
  private readonly passwordValue = toSignal(this.form.controls.password.valueChanges, { initialValue: '' });
  protected readonly strength = computed(() => passwordStrength(this.passwordValue()));

  protected show(name: Field): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  protected msg(name: Field): string | null {
    return controlMessage(this.form.controls[name], {
      required: { displayName: 'Enter your name', email: 'Enter your email', password: 'Choose a password' }[name],
    });
  }

  protected submit(): void {
    this.submitted.set(true);
    this.error.set(null);
    this.emailTaken.set(false);
    if (this.form.invalid) {
      const first = (['displayName', 'email', 'password'] as Field[]).find((f) => this.form.controls[f].invalid);
      document.getElementById({ displayName: 'reg-name', email: 'reg-email', password: 'reg-password' }[first!])?.focus();
      return;
    }
    const { displayName, email, password } = this.form.getRawValue();
    this.busy.set(true);
    this.auth.register(displayName.trim(), email.trim(), password).subscribe({
      next: (user) => {
        this.toasts.success(`Account created. Welcome to Porter, ${user.displayName}.`);
        void this.router.navigateByUrl('/dashboard');
      },
      error: (err: unknown) => {
        this.busy.set(false);
        const p = toProblem(err);
        if (p.code === 'account.email_taken') this.emailTaken.set(true);
        for (const f of ['email', 'password', 'displayName'] as Field[]) {
          const m = fieldError(p, f);
          if (m) this.form.controls[f].setErrors({ server: m });
        }
        this.error.set(p.detail);
      },
    });
  }
}
