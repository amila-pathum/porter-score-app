import { Dialog } from '@angular/cdk/dialog';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ConfirmDialog, ConfirmOptions } from '../../shared/ui/states';

/** Confirmation for destructive or irreversible actions only. Labels must say what happens. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = inject(Dialog);

  ask(options: ConfirmOptions): Observable<boolean> {
    const ref = this.dialog.open<boolean>(ConfirmDialog, {
      data: options,
      role: 'alertdialog',
      ariaLabelledBy: 'confirm-title',
      ariaDescribedBy: 'confirm-body',
      backdropClass: 'porter-dialog-backdrop',
      panelClass: 'porter-dialog-panel',
      autoFocus: '.confirm-safe',
      restoreFocus: true,
    });
    return ref.closed.pipe(map((result) => result === true));
  }
}
