/**
 * Offers the Spotify login to the user. The playback (PlayerEngineService) only says that the login is needed: how it
 * is offered (a dialog, see SpotifyLoginDialogPrompt, provided in app.module.ts) is not its business, so it does not
 * depend on the components of the app and can be tested without them.
 */
export abstract class SpotifyLoginPrompt {
  abstract open(): void;
}
