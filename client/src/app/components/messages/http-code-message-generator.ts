import { CustomSnackBarComponent } from './custom-snack-bar.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Injectable, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

/** Translation keys of messages that replace the default message of a status code. */
export interface ReturnCodeMessages {
  e404?: string;
  e409?: string;
  e500?: string;
}

@Injectable({
  providedIn: 'root',
})
export class HttpCodeMessageGenerator {
  private readonly tl = inject(TranslocoService);

  constructor(private snackBar: MatSnackBar) {}

  public calculateReturnCodeMessage(httpCode: number, customMessages?: ReturnCodeMessages): void {
    let key: string;
    // ok, which component needs that message?
    switch (httpCode) {
      case 409:
        key = customMessages?.e409 ?? 'messages.http.conflict';
        break;
      case 404:
        key = customMessages?.e404 ?? 'messages.http.notFound';
        break;
      case 500:
        key = customMessages?.e500 ?? 'messages.http.serverError';
        break;
      default:
        key = 'messages.http.unknown';
        break;
    }
    const message = this.tl.translate(key);
    this.snackBar.openFromComponent(CustomSnackBarComponent, {
      panelClass: ['http-error-notification'],
      data: {
        message: message,
      },
      duration: message.length * 100,
    });
  }

  /** Shows a text as it is (e.g. an answer of the server). */
  public customMessage(message: string): void {
    this.snackBar.openFromComponent(CustomSnackBarComponent, {
      data: {
        message,
      },
      duration: message.length * 100,
    });
  }
}
