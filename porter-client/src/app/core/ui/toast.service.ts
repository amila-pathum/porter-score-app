import { LiveAnnouncer } from '@angular/cdk/a11y';
import { Injectable, inject, signal } from '@angular/core';

export interface ToastAction {
  label: string;
  /** Router link for navigation actions. */
  link?: string;
  run?: () => void;
}

export interface Toast {
  id: number;
  message: string;
  kind: 'success' | 'error' | 'info';
  action?: ToastAction;
}

/** Transient confirmations. Each toast is also announced to screen readers. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly announcer = inject(LiveAnnouncer);
  private readonly _toasts = signal<Toast[]>([]);
  private nextId = 1;

  readonly toasts = this._toasts.asReadonly();

  show(message: string, options: { kind?: Toast['kind']; action?: ToastAction; durationMs?: number; announce?: string } = {}): number {
    const id = this.nextId++;
    const toast: Toast = { id, message, kind: options.kind ?? 'success', action: options.action };
    this._toasts.update((list) => [...list.slice(-2), toast]);
    void this.announcer.announce(options.announce ?? message, toast.kind === 'error' ? 'assertive' : 'polite');
    const duration = options.durationMs ?? (toast.kind === 'error' ? 8000 : options.action ? 6000 : 4000);
    setTimeout(() => this.dismiss(id), duration);
    return id;
  }

  success(message: string, action?: ToastAction, announce?: string): number {
    return this.show(message, { kind: 'success', action, announce });
  }

  error(message: string, action?: ToastAction): number {
    return this.show(message, { kind: 'error', action });
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
