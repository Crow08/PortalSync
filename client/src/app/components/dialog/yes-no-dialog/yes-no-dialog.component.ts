import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Component, Inject, ChangeDetectionStrategy, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

export interface DialogData {
  title: string;
  message: string;
  yesButton: string;
  noButton: string;
}

@Component({
    selector: 'app-yes-no-dialog',
    templateUrl: './yes-no-dialog.component.html',
    styleUrls: ['./yes-no-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class YesNoDialogComponent {
  protected readonly tl = inject(TranslocoService);
  yesButton: string;
  noButton: string;

  /** The texts are already translated by the caller; the buttons default to Yes and No. */
  constructor(public dialogRef: MatDialogRef<YesNoDialogComponent>, @Inject(MAT_DIALOG_DATA) public data: DialogData) {
    this.yesButton = this.tl.translate('common.yes');
    this.noButton = this.tl.translate('common.no');
    if (data.yesButton) {
      this.yesButton = data.yesButton;
    }
    if (data.noButton) {
      this.noButton = data.noButton;
    }
  }

  onConfirm(): void {
    // Close the dialog, return true
    this.dialogRef.close(true);
  }

  onDismiss(): void {
    // Close the dialog, return false
    this.dialogRef.close(false);
  }
}
