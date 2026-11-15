import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { SpotifyLoginDialogComponent } from '../components/dialog/spotify-login-dialog/spotify-login-dialog.component';
import { SpotifyLoginPrompt } from './spotify-login-prompt';

/** Offers the Spotify login in a dialog. Provided as SpotifyLoginPrompt in app.module.ts. */
@Injectable()
export class SpotifyLoginDialogPrompt extends SpotifyLoginPrompt {
  constructor(private dialog: MatDialog) {
    super();
  }

  open(): void {
    this.dialog.open(SpotifyLoginDialogComponent);
  }
}
