import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon, Logo } from '../../shared/ui/icon';

/** One calm column on mobile; a centered 420px card from tablet up. */
@Component({
  selector: 'p-auth-layout',
  imports: [Logo, Icon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="flex min-h-dvh items-start justify-center md:items-center md:py-12">
      <div class="w-full max-w-[440px] px-6 pt-6 pb-10 md:rounded-[16px] md:border md:border-border md:bg-surface md:px-10 md:py-10">
        @if (backLink()) {
          <a [routerLink]="backLink()" class="icon-btn -ml-3 mb-2" [attr.aria-label]="backLabel()"><p-icon name="back" /></a>
        } @else {
          <div class="mb-6 pt-8 md:pt-0"><p-logo [size]="40" [showName]="false" /></div>
        }
        <h1 class="h-page">{{ heading() }}</h1>
        @if (sub()) {
          <p class="mt-1 text-ink-muted">{{ sub() }}</p>
        }
        <div class="mt-6"><ng-content /></div>
      </div>
    </main>
  `,
})
export class AuthLayout {
  readonly heading = input.required<string>();
  readonly sub = input<string | null>(null);
  readonly backLink = input<string | null>(null);
  readonly backLabel = input('Back to log in');
}
