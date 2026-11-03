import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-snack-bar-component-upload-error',
  template: `<mat-icon aria-hidden="true">error</mat-icon><span>Something went wrong</span>`,
  styles: [
    `
      :host {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      mat-icon {
        flex: none;
        color: var(--ps-danger);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ServerResultErrorSnackBarComponent {}
