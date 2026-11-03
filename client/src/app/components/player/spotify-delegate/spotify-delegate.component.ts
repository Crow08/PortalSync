import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SpotifyService } from '../../../services/spotify.service';

/** Target of the Spotify redirect: exchanges the authorization code for a token and goes on to the settings. */
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
        spotifyService.exchangeAuthCodeForToken(urlQueryParams['code']).catch(console.error);
        router.navigateByUrl('/settings').catch(console.error);
      }
    });
  }
}
