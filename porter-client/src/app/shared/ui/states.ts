import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { ApiProblem } from '../../core/api/problem';
import { Icon, IconName } from './icon';

@Component({
  selector: 'p-empty-state',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <span class="text-ink-subtle"><p-icon [name]="icon()" [size]="28" /></span>
      <h2 class="h-card">{{ title() }}</h2>
      @if (body()) {
        <p class="t-small max-w-sm text-ink-muted">{{ body() }}</p>
      }
      <div class="mt-2 flex flex-wrap justify-center gap-2"><ng-content /></div>
    </div>
  `,
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly body = input<string | null>(null);
  readonly icon = input<IconName>('list');
}

/** Page-level load failure: plain cause, reassurance, one action. */
@Component({
  selector: 'p-error-state',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card flex flex-col items-center gap-2 px-6 py-10 text-center" role="alert">
      <span class="text-danger"><p-icon [name]="problem()?.status === 0 ? 'wifiOff' : 'alert'" [size]="28" /></span>
      @if (problem()?.status === 404) {
        <span class="tnum text-[28px] font-medium text-ink-subtle">404</span>
      }
      <h2 class="h-card">{{ title() ?? problem()?.title ?? 'Something went wrong' }}</h2>
      <p class="t-small max-w-sm text-ink-muted">{{ problem()?.detail }}</p>
      <div class="mt-2 flex flex-wrap justify-center gap-2">
        @if (problem()?.status !== 404) {
          <button type="button" class="btn btn-secondary btn-sm" (click)="retry.emit()">
            <p-icon name="refresh" [size]="16" />Try again
          </button>
        }
        <ng-content />
      </div>
    </div>
  `,
})
export class ErrorState {
  readonly problem = input<ApiProblem | null>(null);
  readonly title = input<string | null>(null);
  readonly retry = output<void>();
}

@Component({
  selector: 'p-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3" aria-busy="true" aria-live="polite">
      <span class="sr-only">Loading…</span>
      <div class="skel h-7 w-2/5"></div>
      <div class="skel h-1.5 w-full"></div>
      @for (r of rowsArray(); track $index) {
        <div class="flex items-center gap-3">
          <div class="skel size-9 rounded-full"></div>
          <div class="skel h-3 flex-1"></div>
          <div class="skel h-11 w-16"></div>
        </div>
      }
    </div>
  `,
})
export class Skeleton {
  readonly rows = input(4);
  protected rowsArray() {
    return Array.from({ length: this.rows() });
  }
}

export interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}

@Component({
  selector: 'p-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dialog-surface flex flex-col gap-4">
      <h2 id="confirm-title" class="h-section">{{ data.title }}</h2>
      <p id="confirm-body" class="text-ink-muted">{{ data.body }}</p>
      <div class="flex flex-wrap justify-end gap-2">
        <button type="button" class="btn btn-secondary confirm-safe" (click)="ref.close(false)">{{ data.cancelLabel ?? 'Cancel' }}</button>
        <button type="button" class="btn" [class]="data.destructive ? 'btn-danger' : 'btn-primary'" (click)="ref.close(true)">
          {{ data.confirmLabel }}
        </button>
      </div>
    </div>
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmOptions>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
}
