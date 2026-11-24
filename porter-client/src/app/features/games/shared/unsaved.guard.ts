import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { Observable, of } from 'rxjs';
import { ConfirmService } from '../../../core/ui/confirm.service';

export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
  unsavedDescription(): string;
}

/** Asks before leaving a screen with unsaved edits. Focus starts on "Keep editing". */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component): Observable<boolean> => {
  if (!component.hasUnsavedChanges()) return of(true);
  return inject(ConfirmService).ask({
    title: 'Discard your changes?',
    body: component.unsavedDescription(),
    confirmLabel: 'Discard',
    cancelLabel: 'Keep editing',
    destructive: true,
  });
};
