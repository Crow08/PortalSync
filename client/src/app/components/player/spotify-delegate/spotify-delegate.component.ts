import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SPOTIFY_RETURN_URL_KEY, SpotifyService } from '../../../services/spotify.service';

/**
 * Target of the Spotify redirect: exchanges the authorization code for a token and goes back to the page the login
 * started from (the settings by default).
 */
@Component({
  selector: 'app-spotify-delegate',
  template: '<p class="info">Connecting to Spotify…</p>',
  styles: [':host { display: block; padding: 24px; color: var(--ps-muted); font-family: var(--ps-font); }'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class SpotifyDelegateComponent {
  constructor(route: ActivatedRoute, router: Router, spotifyService: SpotifyService) {
    route.queryParams.subscribe((urlQueryParams) => {
      if (router.url.startsWith(spotifyService.redirectPath) && !!urlQueryParams?.['code']) {
        spotifyService
          .exchangeAuthCodeForToken(urlQueryParams['code'])
          .catch(console.error)
          .finally(() => router.navigateByUrl(SpotifyDelegateComponent.takeReturnUrl()).catch(console.error));
      }
    });
  }

  /** The page that asked for the login; only paths of the app are accepted. */
  private static takeReturnUrl(): string {
    try {
      const url = sessionStorage.getItem(SPOTIFY_RETURN_URL_KEY);
      sessionStorage.removeItem(SPOTIFY_RETURN_URL_KEY);
      if (url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/spotify/redirect')) {
        return url;
      }
    } catch {
      // no storage: the settings
    }
    return '/settings';
  }
}
