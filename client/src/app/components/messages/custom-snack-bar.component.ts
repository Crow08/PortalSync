import { Component, Inject, ChangeDetectionStrategy, inject } from '@angular/core';
import { MAT_SNACK_BAR_DATA } from '@angular/material/snack-bar';
import { TranslocoService } from '@jsverse/transloco';

/** Messages with these values show a random text of the list under the translation key (one text in plain English). */
const RANDOM_MESSAGES: Record<string, string> = {
  successMessage: 'messages.saved',
  deleteMessage: 'messages.deleted',
};

@Component({
  selector: 'app-snack-bar-component-custom',
  template: `{{ message }}`,
  styles: [':host { display: block; }'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class CustomSnackBarComponent {
  message: string;

  constructor(@Inject(MAT_SNACK_BAR_DATA) { message }: { message: string }) {
    // set message at the start. message is always there
    const key = RANDOM_MESSAGES[message];
    if (!key) {
      this.message = message;
      return;
    }
    const texts: unknown = inject(TranslocoService).translateObject(key);
    const list = Array.isArray(texts) ? texts.filter((text): text is string => typeof text === 'string') : [];
    this.message = list.length > 0 ? list[Math.floor(Math.random() * list.length)] : '';
  }
}
