import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-snack-bar-component-upload-success',
  template: `<mat-icon aria-hidden="true">check_circle</mat-icon><span>Success</span>`,
  styles: [
    `
      :host {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      mat-icon {
        flex: none;
        color: var(--ps-ok);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class ServerResultSuccessSnackBarComponent {}
