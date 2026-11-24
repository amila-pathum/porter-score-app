import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'p-not-found-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page-narrow flex flex-col items-center gap-3 pt-16 text-center">
      <span class="tnum text-[40px] font-medium text-ink-subtle">404</span>
      <h1 class="h-page">We can't find that page</h1>
      <p class="text-ink-muted">The link may be wrong, or the page was moved.</p>
      <div class="mt-2 flex gap-2">
        <a routerLink="/dashboard" class="btn btn-primary">Go to dashboard</a>
        <a routerLink="/games" class="btn btn-secondary">Your games</a>
      </div>
    </div>
  `,
})
export class NotFoundPage {}
