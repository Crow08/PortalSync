import { Component, ChangeDetectionStrategy } from '@angular/core';
import { AbstractControl, UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { Playlist } from '../../../models/playlist';
import { Router } from '@angular/router';
import { HttpHelperService } from '../../../services/http-helper.service';
import { SessionService } from '../../../services/session.service';
import { AuthenticationService } from '../../../services/authentication.service';

@Component({
    selector: 'app-session-creator',
    templateUrl: './session-creator.component.html',
    styleUrls: ['./session-creator.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class SessionCreatorComponent {
  sessionForm: UntypedFormGroup;
  loading = false;
  submitted = false;
  error = '';

  playlists: Playlist[] = [];

  constructor(
    private router: Router,
    private formBuilder: UntypedFormBuilder,
    private httpHelperService: HttpHelperService,
    private sessionService: SessionService,
    private authenticationService: AuthenticationService
  ) {
    this.sessionForm = this.formBuilder.group({
      // empty: the name of the chosen playlist is used, without a playlist the name of the user
      name: [''],
      // empty: the lobby starts without a playlist
      playlist: [''],
    });

    this.httpHelperService
      .getArray('/api/v1/playlists/all', Playlist)
      .then((value) => (this.playlists = value.filter((playlist) => playlist.id > 1)))
      .catch(console.error);
  }

  get startWithPlaylist(): boolean {
    return this.getField['playlist'].value !== '';
  }

  /** The name of the chosen playlist, empty when the lobby starts without one. */
  get playlistName(): string {
    const id = this.getField['playlist'].value;
    return this.playlists.find((playlist) => playlist.id === id)?.name ?? '';
  }

  /** The name used when none is typed in: the name of the chosen playlist, else the name of the user. */
  get defaultName(): string {
    return this.playlistName || this.authenticationService.currentUserValue?.username || '';
  }

  /** The name typed in, else the default name. */
  private get lobbyName(): string {
    return String(this.getField['name'].value ?? '').trim() || this.defaultName;
  }

  // convenience getter for easy access to form fields
  get getField(): { [key: string]: AbstractControl } {
    return this.sessionForm.controls;
  }

  onSubmit(): void {
    this.submitted = true;
    this.error = '';

    // stop here without a name: neither typed in nor a default
    if (!this.lobbyName) {
      this.error = 'Enter a name for the lobby.';
      return;
    }

    this.loading = true;

    this.httpHelperService
      .post('/api/v1/sessions/', this.lobbyName)
      .then((sessionId) => (this.startWithPlaylist ? this.addSongs(Number(sessionId)) : this.finished(Number(sessionId))))
      .catch((error) => this.failed(error));
  }

  private failed(error: unknown): void {
    console.error(error);
    this.error = 'Creating the lobby failed.';
    this.loading = false;
  }

  private addSongs(sessionId: number): void {
    this.httpHelperService
      .put(`/api/v1/sessions/${sessionId}/addpl`, this.getField['playlist'].value)
      .then(() => this.finished(sessionId))
      .catch((error) => this.failed(error));
  }

  private finished(sessionId: number) {
    this.router.navigateByUrl(`/sessions/${sessionId}/lobby`).catch(console.error);
  }
}
